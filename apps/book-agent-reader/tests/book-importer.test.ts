import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { importEpubBook, importTextBook } from '../src/services/book-importer.js';
import { BookStore } from '../src/services/book-store.js';

test('文本导入会按一级标题拆成章节并生成页面', async () => {
  const imported = importTextBook({
    title: '品牌差距',
    author: 'Marty Neumeier',
    language: 'en',
    content: '# 第一章\n品牌不是标志。\n\n# 第二章\n品牌是直觉感受。',
    sourceType: 'markdown',
  });

  assert.equal(imported.manifest.title, '品牌差距');
  assert.equal(imported.chapters.length, 2);
  assert.equal(imported.chapters[0]?.title, '第一章');
  assert.equal(imported.chapters[0]?.pages.length, 1);
  assert.match(imported.chapters[1]?.text ?? '', /品牌是直觉感受/);

  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-'));
  const store = new BookStore(homeDir);
  await store.saveImportedBook(imported);
  const loaded = await store.loadBook(imported.manifest.id);

  assert.equal(loaded.manifest.id, imported.manifest.id);
  assert.equal(loaded.chapters.length, 2);
});

test('EPUB 导入会按 NCX 目录锚点拆分单文件长正文，并保留图片文件', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>');
  zip.file(
    'content.opf',
    `<package>
      <metadata><dc:title>The Brand Gap</dc:title><dc:creator>Marty Neumeier</dc:creator><dc:language>en</dc:language></metadata>
      <manifest>
        <item href="book.html" id="body" media-type="application/xhtml+xml"/>
        <item href="toc.ncx" id="ncx" media-type="application/x-dtbncx+xml"/>
      </manifest>
      <spine toc="ncx"><itemref idref="body"/></spine>
    </package>`,
  );
  zip.file(
    'toc.ncx',
    `<ncx><navMap>
      <navPoint id="n1" playOrder="1"><navLabel><text>Introduction</text></navLabel><content src="book.html#intro"/></navPoint>
      <navPoint id="n2" playOrder="2"><navLabel><text>What a Brand Isn’t</text></navLabel><content src="book.html#brand-isnt"/></navPoint>
    </navMap></ncx>`,
  );
  zip.file(
    'book.html',
    `<html><body>
      <p>Front matter before the first real section contains enough text to keep as readable front matter.</p>
      <h2 id="intro">Introduction</h2>
      <p><img alt="Image" src="images/placeholder.jpg"/></p>
      <p>A lot of people talk about branding.</p>
      <h3 id="brand-isnt">What a Brand Isn’t</h3>
      <p>A brand is not a logo.<br/>It is a person's gut feeling.</p>
      <figure><img alt="Currency trust diagram" src="images/trust.jpg"/><figcaption>Currency mirrors trust.</figcaption></figure>
    </body></html>`,
  );
  zip.file('images/placeholder.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  zip.file('images/trust.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const imported = await importEpubBook(await zip.generateAsync({ type: 'nodebuffer' }));

  assert.deepEqual(
    imported.chapters.map((chapter) => chapter.title),
    ['book', 'Introduction', 'What a Brand Isn’t'],
  );
  assert.match(imported.chapters[1]?.text ?? '', /people talk about branding/);
  assert.match(imported.chapters[2]?.text ?? '', /A brand is not a logo\.\nIt is a person's gut feeling/);
  assert.equal(imported.chapters[1]?.images?.length ?? 0, 1);
  assert.equal(imported.chapters[1]?.images?.[0]?.altText, 'Image');
  assert.match(imported.chapters[1]?.images?.[0]?.dataUrl ?? '', /^data:image\/jpeg;base64,/);
  assert.equal(imported.chapters[2]?.images?.length ?? 0, 1);
  assert.equal(imported.chapters[2]?.images?.[0]?.altText, 'Currency trust diagram');
  assert.match(imported.chapters[2]?.images?.[0]?.dataUrl ?? '', /^data:image\/jpeg;base64,/);
});
