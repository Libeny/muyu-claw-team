import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { AppService } from '../src/services/app-service.js';

test('应用服务可以从 EPUB 和 PDF 文件导入书籍', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-home-'));
  const fileDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-files-'));
  const service = new AppService(homeDir);

  const epubPath = path.join(fileDir, 'sample.epub');
  await writeFile(epubPath, await createEpubBuffer());
  const epub = await service.importFile(epubPath);

  assert.equal(epub.manifest.sourceType, 'epub');
  assert.equal(epub.manifest.title, '服务层 EPUB');
  assert.match(epub.chapters[0]?.text ?? '', /Trust creation/);

  const pdfPath = path.join(fileDir, 'sample.pdf');
  await writeFile(pdfPath, createPdfBuffer());
  const pdf = await service.importFile(pdfPath);

  assert.equal(pdf.manifest.sourceType, 'pdf');
  assert.equal(pdf.manifest.title, 'sample');
  assert.match(pdf.chapters[0]?.text ?? '', /Brand value/);
});

test('应用服务可以导入 macOS 目录包形式的 EPUB', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-home-'));
  const fileDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-files-'));
  const service = new AppService(homeDir);
  const epubDir = path.join(fileDir, 'unpacked.epub');
  await createUnpackedEpub(epubDir);

  const book = await service.importFile(epubDir);

  assert.equal(book.manifest.sourceType, 'epub');
  assert.equal(book.manifest.title, '目录包 EPUB');
  assert.equal(book.chapters.length, 1);
  assert.match(book.chapters[0]?.text ?? '', /Directory EPUB content/);
});

async function createEpubBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<container><rootfiles><rootfile full-path="book/content.opf"/></rootfiles></container>`,
  );
  zip.file(
    'book/content.opf',
    `<package>
      <metadata><dc:title>服务层 EPUB</dc:title><dc:creator>作者</dc:creator><dc:language>en</dc:language></metadata>
      <manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="c1"/></spine>
    </package>`,
  );
  zip.file('book/chapter.xhtml', `<html><body><h1>信任</h1><p>Trust creation matters.</p></body></html>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function createPdfBuffer(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 72 >>
stream
BT
(Brand value changes decisions.) Tj
ET
endstream
endobj
%%EOF`,
    'utf-8',
  );
}

async function createUnpackedEpub(rootDir: string): Promise<void> {
  await mkdir(path.join(rootDir, 'META-INF'), { recursive: true });
  await mkdir(path.join(rootDir, 'book'), { recursive: true });
  await writeFile(path.join(rootDir, 'mimetype'), 'application/epub+zip');
  await writeFile(
    path.join(rootDir, 'META-INF', 'container.xml'),
    `<container><rootfiles><rootfile full-path="book/content.opf"/></rootfiles></container>`,
  );
  await writeFile(
    path.join(rootDir, 'book', 'content.opf'),
    `<package>
      <metadata><dc:title>目录包 EPUB</dc:title><dc:creator>作者</dc:creator><dc:language>en</dc:language></metadata>
      <manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="c1"/></spine>
    </package>`,
  );
  await writeFile(
    path.join(rootDir, 'book', 'chapter.xhtml'),
    `<html><body><h1>目录章节</h1><p>Directory EPUB content matters.</p></body></html>`,
  );
}
