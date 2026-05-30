import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importTextBook } from '../src/services/book-importer.js';
import { BookStore } from '../src/services/book-store.js';
import { ChapterSummaryStore } from '../src/services/chapter-summary-store.js';
import { HighlightStore } from '../src/services/highlight-store.js';

test('高亮标注按书籍保存并支持列出', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-'));
  const book = importTextBook({
    title: '品牌差距',
    sourceType: 'markdown',
    content: '# 信任\nTrust creation is a fundamental goal.',
  });
  await new BookStore(homeDir).saveImportedBook(book);

  const store = new HighlightStore(homeDir);
  const highlight = await store.saveHighlight({
    bookId: book.manifest.id,
    chapterId: book.chapters[0]!.id,
    pageIndex: 0,
    text: 'Trust creation',
    note: '品牌设计的核心目标',
  });

  const highlights = await store.listHighlights(book.manifest.id);
  assert.equal(highlights.length, 1);
  assert.equal(highlights[0]?.id, highlight.id);
  assert.equal(highlights[0]?.note, '品牌设计的核心目标');
});

test('章节概要按章节保存并可更新', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-'));
  const book = importTextBook({
    title: '品牌差距',
    sourceType: 'markdown',
    content: '# 信任\nTrust creation is a fundamental goal.',
  });
  await new BookStore(homeDir).saveImportedBook(book);

  const store = new ChapterSummaryStore(homeDir);
  await store.saveSummary({
    bookId: book.manifest.id,
    chapterId: book.chapters[0]!.id,
    chapterTitle: book.chapters[0]!.title,
    summary: '本章讨论品牌如何建立信任。',
    keyClaims: ['信任降低决策成本'],
    keyConcepts: ['信任', '品牌设计'],
    reflectionQuestions: ['哪些视觉线索会让你信任一个品牌？'],
  });
  await store.saveSummary({
    bookId: book.manifest.id,
    chapterId: book.chapters[0]!.id,
    chapterTitle: book.chapters[0]!.title,
    summary: '更新后的章节概要。',
    keyClaims: ['品牌是一种信任捷径'],
    keyConcepts: ['信任'],
    reflectionQuestions: ['这个观点能否迁移到产品设计？'],
  });

  const summaries = await store.listSummaries(book.manifest.id);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.summary, '更新后的章节概要。');
  assert.deepEqual(summaries[0]?.keyClaims, ['品牌是一种信任捷径']);
});
