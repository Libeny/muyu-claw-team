import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { importEpubBook, importPdfBook } from '../src/services/book-importer.js';

test('EPUB 导入会读取元数据、阅读顺序和章节文本', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`,
  );
  zip.file(
    'OPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0">
      <metadata>
        <dc:title>品牌差距 EPUB</dc:title>
        <dc:creator>Marty Neumeier</dc:creator>
        <dc:language>en</dc:language>
        <meta name="cover" content="cover-img"/>
      </metadata>
      <manifest>
        <item id="cover-img" href="cover.jpg" media-type="image/jpeg"/>
        <item id="chapter-1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
        <item id="chapter-2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="chapter-1"/>
        <itemref idref="chapter-2"/>
      </spine>
    </package>`,
  );
  zip.file(
    'OPS/chapter1.xhtml',
    `<html><body><h1>信任</h1><figure><img src="trust.png" alt="货币演化图"/><figcaption>货币演化展示信任如何被视觉符号承载。</figcaption></figure><p>Trust creation is a fundamental goal of brand design.</p></body></html>`,
  );
  zip.file(
    'OPS/chapter2.xhtml',
    `<html><body><h1>价值</h1><p>Brand value becomes useful when it changes decisions.</p></body></html>`,
  );
  zip.file('OPS/cover.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const imported = await importEpubBook(await zip.generateAsync({ type: 'nodebuffer' }));

  assert.equal(imported.manifest.title, '品牌差距 EPUB');
  assert.equal(imported.manifest.author, 'Marty Neumeier');
  assert.equal(imported.manifest.language, 'en');
  assert.equal(imported.manifest.sourceType, 'epub');
  assert.match(imported.manifest.coverImage?.dataUrl ?? '', /^data:image\/jpeg;base64,/);
  assert.equal(imported.chapters.length, 2);
  assert.equal(imported.chapters[0]?.title, '信任');
  assert.equal(imported.chapters[0]?.images?.[0]?.altText, '货币演化图');
  assert.match(imported.chapters[0]?.images?.[0]?.caption ?? '', /信任如何被视觉符号承载/);
  assert.match(imported.chapters[1]?.text ?? '', /Brand value/);
});

test('PDF 导入会提取文本型 PDF 的字符串内容', async () => {
  const pdf = Buffer.from(
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
<< /Length 96 >>
stream
BT
/F1 18 Tf
72 720 Td
(Trust creation is a fundamental goal.) Tj
ET
endstream
endobj
%%EOF`,
    'utf-8',
  );

  const imported = importPdfBook(pdf, { title: '品牌差距 PDF' });

  assert.equal(imported.manifest.title, '品牌差距 PDF');
  assert.equal(imported.manifest.sourceType, 'pdf');
  assert.equal(imported.chapters.length, 1);
  assert.match(imported.chapters[0]?.text ?? '', /Trust creation/);
});
