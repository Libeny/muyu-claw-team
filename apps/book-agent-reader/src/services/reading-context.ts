import type { ImportedBook, ReadingContext } from '../domain/book.js';

export interface BuildReadingContextInput {
  book: ImportedBook;
  chapterId: string;
  pageIndex: number;
  selectedText?: string;
  relatedPassages?: import('../domain/book.js').RelatedPassage[];
  highlights?: import('../domain/highlight.js').Highlight[];
  chapterSummary?: import('../domain/chapter-summary.js').ChapterSummary;
}

export function buildReadingContext(input: BuildReadingContextInput): ReadingContext {
  const chapter = input.book.chapters.find((item) => item.id === input.chapterId);
  if (!chapter) {
    throw new Error(`章节不存在：${input.chapterId}`);
  }
  const currentPage = chapter.pages[input.pageIndex] || chapter.pages[0];
  if (!currentPage) {
    throw new Error(`章节没有可阅读页面：${chapter.id}`);
  }
  const nearbyPages = chapter.pages
    .filter((page) => Math.abs(page.index - currentPage.index) <= 1)
    .map((page) => page.text)
    .join('\n\n');

  return {
    bookId: input.book.manifest.id,
    bookTitle: input.book.manifest.title,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    pageIndex: currentPage.index,
    selectedText: input.selectedText?.trim() || '',
    currentPageText: currentPage.text,
    nearbyText: nearbyPages,
    relatedPassages: input.relatedPassages || [],
    imageContexts: (chapter.images || []).filter(hasMeaningfulImageContext).slice(0, 12),
    highlights: input.highlights || [],
    chapterSummary: input.chapterSummary,
  };
}

function hasMeaningfulImageContext(image: { altText?: string; caption?: string; contextText?: string }): boolean {
  return [image.altText, image.caption, image.contextText].some((value) => isMeaningfulImageText(value || ''));
}

function isMeaningfulImageText(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return Boolean(normalized && !['image', 'img', 'picture', 'photo', 'graphic', 'figure'].includes(normalized));
}
