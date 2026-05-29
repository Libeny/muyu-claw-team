import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Chapter, ImageAsset, ImportedBook, Page, SourceType } from '../domain/book.js';
import { nowIso, stableId } from './ids.js';

const PAGE_SIZE = 1800;

export interface ImportTextBookInput {
  title: string;
  author?: string;
  language?: string;
  content: string;
  sourceType?: Extract<SourceType, 'text' | 'markdown'>;
}

export interface ImportPdfBookOptions {
  title: string;
  author?: string;
  language?: string;
}

export function importTextBook(input: ImportTextBookInput): ImportedBook {
  const createdAt = nowIso();
  const bookId = stableId('book', [input.title, input.author || '', input.content.slice(0, 500)]);
  const chapterInputs = splitIntoChapters(input.content);
  const chapters: Chapter[] = chapterInputs.map((chapter, index) => {
    const id = stableId('chapter', [bookId, String(index), chapter.title, chapter.text.slice(0, 200)]);
    return {
      id,
      bookId,
      title: chapter.title,
      order: index,
      text: chapter.text,
      pages: paginate(chapter.text),
    };
  });

  return {
    manifest: {
      id: bookId,
      title: input.title.trim() || '未命名书籍',
      author: input.author?.trim() || '',
      language: input.language?.trim() || 'unknown',
      sourceType: input.sourceType || 'text',
      createdAt,
      updatedAt: createdAt,
      chapterIds: chapters.map((chapter) => chapter.id),
    },
    chapters,
  };
}

export async function importEpubBook(buffer: Buffer): Promise<ImportedBook> {
  const zip = await JSZip.loadAsync(buffer);
  return importEpubArchive({
    readText: (filePath) => readZipText(zip, filePath),
  });
}

export async function importEpubDirectory(rootDir: string): Promise<ImportedBook> {
  return importEpubArchive({
    readText: async (filePath) => readFile(path.join(rootDir, filePath), 'utf-8'),
  });
}

interface EpubArchive {
  readText(filePath: string): Promise<string>;
}

async function importEpubArchive(archive: EpubArchive): Promise<ImportedBook> {
  const opfPath = await resolveOpfPath(archive);
  const opf = await archive.readText(opfPath);
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const metadata = parseEpubMetadata(opf);
  const manifest = parseManifest(opf);
  const spine = parseSpine(opf);
  const tocEntries = await readTocEntries(archive, opf, manifest, baseDir);
  const tocByPath = groupTocEntriesByPath(tocEntries);
  const chapterFiles = spine
    .map((idref) => manifest.get(idref))
    .filter((href): href is string => Boolean(href))
    .map((href) => normalizeZipPath(`${baseDir}${href}`));
  const chapters: ChapterInput[] = [];

  for (const chapterPath of chapterFiles) {
    const html = await archive.readText(chapterPath);
    chapters.push(...extractHtmlChapters(html, chapterPath, tocByPath.get(chapterPath) || []));
  }

  const readableChapters = chapters.filter(isReadableChapter);
  return buildImportedBook({
    title: metadata.title || '未命名 EPUB',
    author: metadata.author,
    language: metadata.language || 'unknown',
    sourceType: 'epub',
    chapters: readableChapters.length ? readableChapters : [{ title: '正文', text: '' }],
  });
}

export function importPdfBook(buffer: Buffer, options: ImportPdfBookOptions): ImportedBook {
  const text = extractPdfText(buffer);
  return buildImportedBook({
    title: options.title,
    author: options.author,
    language: options.language || 'unknown',
    sourceType: 'pdf',
    chapters: [{ title: 'PDF 文本', text: text || '未能从该 PDF 中提取文本。' }],
  });
}

interface ChapterInput {
  title: string;
  text: string;
  images?: Array<Omit<ImageAsset, 'id' | 'bookId' | 'chapterId'>>;
}

function buildImportedBook(input: {
  title: string;
  author?: string;
  language?: string;
  sourceType: SourceType;
  chapters: ChapterInput[];
}): ImportedBook {
  const createdAt = nowIso();
  const bookId = stableId('book', [
    input.title,
    input.author || '',
    input.sourceType,
    input.chapters.map((chapter) => `${chapter.title}:${chapter.text.slice(0, 120)}`).join('\n'),
  ]);
  const chapters: Chapter[] = input.chapters.map((chapter, index) => {
    const id = stableId('chapter', [bookId, String(index), chapter.title, chapter.text.slice(0, 200)]);
    return {
      id,
      bookId,
      title: chapter.title || `第 ${index + 1} 章`,
      order: index,
      text: chapter.text,
      pages: paginate(chapter.text),
      images: (chapter.images || []).map((image, imageIndex) => ({
        ...image,
        id: stableId('image', [bookId, id, String(imageIndex), image.sourcePath, image.altText, image.caption]),
        bookId,
        chapterId: id,
      })),
    };
  });

  return {
    manifest: {
      id: bookId,
      title: input.title.trim() || '未命名书籍',
      author: input.author?.trim() || '',
      language: input.language?.trim() || 'unknown',
      sourceType: input.sourceType,
      createdAt,
      updatedAt: createdAt,
      chapterIds: chapters.map((chapter) => chapter.id),
    },
    chapters,
  };
}

function splitIntoChapters(content: string): Array<{ title: string; text: string }> {
  const lines = normalizeText(content).split('\n');
  const chapters: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = /^#\s+(.+)$/.exec(line.trim());
    if (match) {
      if (current) chapters.push(current);
      current = { title: match[1]!.trim(), lines: [] };
      continue;
    }
    if (!current) current = { title: '正文', lines: [] };
    current.lines.push(line);
  }

  if (current) chapters.push(current);
  return chapters
    .map((chapter) => ({ title: chapter.title, text: chapter.lines.join('\n').trim() }))
    .filter((chapter) => chapter.text || chapter.title);
}

function paginate(text: string): Page[] {
  const pages: Page[] = [];
  const normalized = text.trim();
  if (!normalized) {
    return [{ index: 0, text: '', startOffset: 0, endOffset: 0 }];
  }

  for (let start = 0; start < normalized.length; start += PAGE_SIZE) {
    const end = Math.min(start + PAGE_SIZE, normalized.length);
    pages.push({
      index: pages.length,
      text: normalized.slice(start, end),
      startOffset: start,
      endOffset: end,
    });
  }
  return pages;
}

function normalizeText(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

async function resolveOpfPath(archive: EpubArchive): Promise<string> {
  const container = await archive.readText('META-INF/container.xml');
  const fullPath = /full-path=["']([^"']+)["']/i.exec(container)?.[1];
  if (!fullPath) throw new Error('EPUB 缺少 OPF 根文件声明。');
  return normalizeZipPath(fullPath);
}

async function readZipText(zip: JSZip, filePath: string): Promise<string> {
  const file = zip.file(filePath);
  if (!file) throw new Error(`EPUB 文件缺失：${filePath}`);
  return file.async('text');
}

function parseEpubMetadata(opf: string): { title: string; author: string; language: string } {
  return {
    title: decodeEntities(extractXmlText(opf, 'dc:title') || extractXmlText(opf, 'title')),
    author: decodeEntities(extractXmlText(opf, 'dc:creator') || extractXmlText(opf, 'creator')),
    language: decodeEntities(extractXmlText(opf, 'dc:language') || extractXmlText(opf, 'language')),
  };
}

function parseManifest(opf: string): Map<string, string> {
  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(/<item\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1] || '');
    if (attrs.id && attrs.href) manifest.set(attrs.id, attrs.href);
  }
  return manifest;
}

interface TocEntry {
  title: string;
  path: string;
  fragment?: string;
  order: number;
}

async function readTocEntries(
  archive: EpubArchive,
  opf: string,
  manifest: Map<string, string>,
  baseDir: string,
): Promise<TocEntry[]> {
  const spineAttrs = /<spine\b([^>]*)>/i.exec(opf)?.[1] || '';
  const tocId = parseAttrs(spineAttrs).toc;
  const tocHref = (tocId && manifest.get(tocId)) || [...manifest.values()].find((href) => /\.ncx$/i.test(href));
  if (!tocHref) return [];

  try {
    const tocPath = normalizeZipPath(`${baseDir}${tocHref}`);
    const toc = await archive.readText(tocPath);
    return parseNcxToc(toc, tocPath);
  } catch {
    return [];
  }
}

function parseNcxToc(ncx: string, tocPath: string): TocEntry[] {
  const tocDir = tocPath.includes('/') ? tocPath.slice(0, tocPath.lastIndexOf('/') + 1) : '';
  return [
    ...ncx.matchAll(
      /<navPoint\b[^>]*>[\s\S]*?<navLabel\b[^>]*>[\s\S]*?<text(?:\s[^>]*)?>([\s\S]*?)<\/text>[\s\S]*?<\/navLabel>[\s\S]*?<content\b([^>]*)\/?>/gi,
    ),
  ]
    .map((match, index): TocEntry | null => {
      const title = decodeEntities(stripTags(match[1] || ''));
      const src = parseAttrs(match[2] || '').src;
      if (!title || !src) return null;
      const [rawPath, fragment] = src.split('#');
      const entry: TocEntry = {
        title,
        path: normalizeZipPath(`${tocDir}${rawPath || ''}`),
        order: index,
      };
      if (fragment) entry.fragment = fragment;
      return entry;
    })
    .filter((entry): entry is TocEntry => Boolean(entry));
}

function groupTocEntriesByPath(entries: TocEntry[]): Map<string, TocEntry[]> {
  const grouped = new Map<string, TocEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.path) || [];
    existing.push(entry);
    grouped.set(entry.path, existing);
  }
  for (const [filePath, values] of grouped) {
    grouped.set(filePath, values.sort((left, right) => left.order - right.order));
  }
  return grouped;
}

function parseSpine(opf: string): string[] {
  return [...opf.matchAll(/<itemref\b([^>]+)>/gi)]
    .map((match) => parseAttrs(match[1] || '').idref)
    .filter((value): value is string => Boolean(value));
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1]!] = match[2]!;
  }
  return attrs;
}

function extractXmlText(xml: string, tag: string): string {
  const pattern = new RegExp(`<${escapeRegex(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`, 'i');
  return stripTags(pattern.exec(xml)?.[1] || '').trim();
}

function extractHtmlChapters(html: string, fallbackPath: string, tocEntries: TocEntry[]): ChapterInput[] {
  const anchors = tocEntries
    .map((entry) => ({
      entry,
      offset: entry.fragment ? findElementOffsetById(html, entry.fragment) : -1,
    }))
    .filter((item) => item.offset >= 0)
    .sort((left, right) => left.offset - right.offset);

  if (!anchors.length) return [extractHtmlChapter(html, fallbackPath)];

  const chapters: ChapterInput[] = [];
  const leadingHtml = html.slice(0, anchors[0]!.offset);
  const leadingChapter = extractHtmlChapter(leadingHtml, fallbackPath);
  if (leadingChapter.text.length > 80) chapters.push(leadingChapter);

  for (let index = 0; index < anchors.length; index += 1) {
    const current = anchors[index]!;
    const next = anchors[index + 1];
    const chunk = html.slice(current.offset, next?.offset ?? html.length);
    const chapter = extractHtmlChapter(chunk, fallbackPath, current.entry.title);
    if (chapter.text || (chapter.images?.length || 0) > 0) chapters.push(chapter);
  }

  return chapters;
}

function findElementOffsetById(html: string, id: string): number {
  const escaped = escapeRegex(id);
  const pattern = new RegExp(`<[^>]+\\b(?:id|name)\\s*=\\s*["']${escaped}["'][^>]*>`, 'i');
  const match = pattern.exec(html);
  return match?.index ?? -1;
}

function extractHtmlChapter(html: string, fallbackPath: string, preferredTitle?: string): ChapterInput {
  const title =
    preferredTitle ||
    stripTags(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '') ||
    stripTags(/<h2(?:\s[^>]*)?>([\s\S]*?)<\/h2>/i.exec(html)?.[1] || '') ||
    stripTags(/<h3(?:\s[^>]*)?>([\s\S]*?)<\/h3>/i.exec(html)?.[1] || '') ||
    stripTags(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '') ||
    fallbackPath.split('/').pop()?.replace(/\.[^.]+$/, '') ||
    '章节';
  return {
    title: decodeEntities(title.trim()),
    images: extractImages(html),
    text: decodeEntities(
      stripTags(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<br\b[^>]*\/?>/gi, '\n')
          .replace(/<\/(p|div|section|article|h1|h2|h3|li)>/gi, '\n'),
      ),
    ),
  };
}

function extractImages(html: string): ChapterInput['images'] {
  const images: NonNullable<ChapterInput['images']> = [];
  for (const figure of html.matchAll(/<figure(?:\s[^>]*)?>([\s\S]*?)<\/figure>/gi)) {
    const body = figure[1] || '';
    const image = extractImageFromHtml(body);
    if (!image) continue;
    const imageContext = {
      ...image,
      caption: decodeEntities(stripTags(/<figcaption(?:\s[^>]*)?>([\s\S]*?)<\/figcaption>/i.exec(body)?.[1] || '')),
      contextText: decodeEntities(stripTags(body)),
    };
    if (hasMeaningfulImageContext(imageContext)) images.push(imageContext);
  }

  for (const image of html.matchAll(/<img\b([^>]+)>/gi)) {
    const attrs = parseAttrs(image[1] || '');
    if (!attrs.src || images.some((existing) => existing.sourcePath === attrs.src)) continue;
    const imageContext = {
      sourcePath: attrs.src,
      altText: decodeEntities(attrs.alt || ''),
      caption: '',
      contextText: decodeEntities(attrs.alt || ''),
    };
    if (hasMeaningfulImageContext(imageContext)) images.push(imageContext);
  }

  return images;
}

function hasMeaningfulImageContext(image: Omit<ImageAsset, 'id' | 'bookId' | 'chapterId'>): boolean {
  return [image.altText, image.caption, image.contextText].some((value) => isMeaningfulImageText(value || ''));
}

function isMeaningfulImageText(value: string): boolean {
  const normalized = decodeEntities(stripTags(value)).replace(/\s+/g, ' ').trim().toLowerCase();
  return Boolean(normalized && !['image', 'img', 'picture', 'photo', 'graphic', 'figure'].includes(normalized));
}

function extractImageFromHtml(html: string): Omit<ImageAsset, 'id' | 'bookId' | 'chapterId'> | null {
  const match = /<img\b([^>]+)>/i.exec(html);
  if (!match) return null;
  const attrs = parseAttrs(match[1] || '');
  if (!attrs.src) return null;
  return {
    sourcePath: attrs.src,
    altText: decodeEntities(attrs.alt || ''),
    caption: '',
    contextText: '',
  };
}

function isReadableChapter(chapter: ChapterInput): boolean {
  const text = chapter.text.trim();
  if ((chapter.images?.length || 0) > 0) return true;
  if (!text) return false;

  const normalizedText = normalizeForComparison(text);
  const normalizedTitle = normalizeForComparison(chapter.title);
  if (['cover', 'image', 'img', 'title page', 'titlepage'].includes(normalizedText)) return false;
  if (text.length <= 80 && !text.includes('\n') && normalizedText === normalizedTitle) return false;
  return true;
}

function normalizeForComparison(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeZipPath(filePath: string): string {
  const parts: string[] = [];
  for (const part of filePath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const textParts: string[] = [];
  for (const match of raw.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    textParts.push(decodePdfLiteral(match[0]!.replace(/\)\s*Tj$/, '').slice(1)));
  }
  for (const match of raw.matchAll(/\[((?:\s*\((?:\\.|[^\\)])*\)\s*)+)\]\s*TJ/g)) {
    for (const part of match[1]!.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      textParts.push(decodePdfLiteral(part[0]!.slice(1, -1)));
    }
  }
  return textParts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function decodePdfLiteral(value: string): string {
  return value.replace(/\\([\\()nrtbf])/g, (_match, escaped: string) => {
    const map: Record<string, string> = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      '\\': '\\',
      '(': '(',
      ')': ')',
    };
    return map[escaped] ?? escaped;
  });
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
