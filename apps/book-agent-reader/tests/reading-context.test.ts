import assert from 'node:assert/strict';
import test from 'node:test';
import { importTextBook } from '../src/services/book-importer.js';
import { buildReadingContext } from '../src/services/reading-context.js';

test('阅读上下文包含书名、章节、当前页和选中文本', () => {
  const book = importTextBook({
    title: '品牌差距',
    language: 'en',
    content: '# 信任\nTrust creation is a fundamental goal of brand design.',
    sourceType: 'markdown',
  });
  book.chapters[0]!.images = [
    {
      id: 'image-generic',
      bookId: book.manifest.id,
      chapterId: book.chapters[0]!.id,
      sourcePath: 'placeholder.png',
      altText: 'Image',
      caption: '',
      contextText: 'Image',
    },
    {
      id: 'image-1',
      bookId: book.manifest.id,
      chapterId: book.chapters[0]!.id,
      sourcePath: 'trust.png',
      altText: '货币演化图',
      caption: '货币演化展示信任如何被视觉符号承载。',
      contextText: 'Trust creation is a fundamental goal of brand design.',
    },
  ];

  const context = buildReadingContext({
    book,
    chapterId: book.chapters[0]!.id,
    pageIndex: 0,
    selectedText: 'Trust creation',
  });

  assert.equal(context.bookTitle, '品牌差距');
  assert.equal(context.chapterTitle, '信任');
  assert.equal(context.pageIndex, 0);
  assert.equal(context.selectedText, 'Trust creation');
  assert.match(context.currentPageText, /fundamental goal/);
  assert.equal(context.imageContexts.length, 1);
  assert.equal(context.imageContexts[0]?.altText, '货币演化图');
});
