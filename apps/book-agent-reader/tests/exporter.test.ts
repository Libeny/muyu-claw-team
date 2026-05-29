import assert from 'node:assert/strict';
import test from 'node:test';
import { importTextBook } from '../src/services/book-importer.js';
import { MarkdownExporter } from '../src/services/markdown-exporter.js';

test('标记文档导出包含章节、会话和生词', () => {
  const book = importTextBook({
    title: '品牌差距',
    language: 'en',
    content: '# 信任\nTrust creation is a fundamental goal.',
    sourceType: 'markdown',
  });
  const markdown = new MarkdownExporter().renderReadingNote({
    book,
    highlights: [
      {
        id: 'highlight-1',
        bookId: book.manifest.id,
        chapterId: book.chapters[0]!.id,
        pageIndex: 0,
        text: 'Trust creation',
        note: '信任建立是本章关键句。',
        createdAt: '2026-05-28T00:00:00.000Z',
        updatedAt: '2026-05-28T00:00:00.000Z',
      },
    ],
    chapterSummaries: [
      {
        id: 'summary-1',
        bookId: book.manifest.id,
        chapterId: book.chapters[0]!.id,
        chapterTitle: '信任',
        summary: '本章讨论品牌如何建立信任。',
        keyClaims: ['信任降低决策成本'],
        keyConcepts: ['信任', '品牌设计'],
        reflectionQuestions: ['哪些视觉线索会让你信任一个品牌？'],
        createdAt: '2026-05-28T00:00:00.000Z',
        updatedAt: '2026-05-28T00:00:00.000Z',
      },
    ],
    sessions: [
      {
        id: 'session-1',
        bookId: book.manifest.id,
        anchor: { type: 'text', bookId: book.manifest.id, text: 'Trust creation' },
        title: '信任如何建立',
        excerpt: 'Trust creation',
        messages: [],
        summary: '品牌设计通过信任降低用户决策成本。',
        tags: [],
        createdAt: '2026-05-28T00:00:00.000Z',
        updatedAt: '2026-05-28T00:00:00.000Z',
      },
    ],
    vocab: [
      {
        id: 'vocab-1',
        bookId: book.manifest.id,
        term: 'trust',
        translation: '信任',
        sourceSentence: 'Trust creation is a fundamental goal.',
        familiarity: 'new',
        createdAt: '2026-05-28T00:00:00.000Z',
        updatedAt: '2026-05-28T00:00:00.000Z',
      },
    ],
  });

  assert.match(markdown, /# 品牌差距/);
  assert.match(markdown, /## 章节/);
  assert.match(markdown, /## 章节概要/);
  assert.match(markdown, /信任降低决策成本/);
  assert.match(markdown, /## 高亮标注/);
  assert.match(markdown, /Trust creation/);
  assert.match(markdown, /信任如何建立/);
  assert.match(markdown, /trust/);
});
