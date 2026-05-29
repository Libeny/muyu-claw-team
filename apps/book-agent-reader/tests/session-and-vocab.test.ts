import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importTextBook } from '../src/services/book-importer.js';
import { BookStore } from '../src/services/book-store.js';
import { SessionStore } from '../src/services/session-store.js';
import { VocabStore } from '../src/services/vocab-store.js';

test('会话书签和生词记录按书籍保存', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-'));
  const bookStore = new BookStore(homeDir);
  const imported = importTextBook({
    title: '品牌差距',
    language: 'en',
    content: '# 信任\nTrust creation is a fundamental goal.',
    sourceType: 'markdown',
  });
  await bookStore.saveImportedBook(imported);

  const sessionStore = new SessionStore(homeDir);
  const session = await sessionStore.createSession({
    bookId: imported.manifest.id,
    anchor: {
      type: 'text',
      bookId: imported.manifest.id,
      chapterId: imported.chapters[0]!.id,
      pageIndex: 0,
      text: 'Trust creation',
    },
    title: '信任如何建立',
    excerpt: 'Trust creation',
    userQuestion: '这是什么意思？',
    assistantAnswer: '这里讨论品牌设计如何建立信任。',
    summary: '品牌设计通过信任降低用户决策成本。',
  });
  await sessionStore.appendMessage(session.id, {
    role: 'user',
    content: '和货币有什么关系？',
  });

  const sessions = await sessionStore.listSessions(imported.manifest.id);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.messages.length, 3);

  const vocabStore = new VocabStore(homeDir);
  const first = await vocabStore.saveEntry({
    bookId: imported.manifest.id,
    chapterId: imported.chapters[0]!.id,
    pageIndex: 0,
    term: 'trust',
    translation: '信任',
    sourceSentence: 'Trust creation is a fundamental goal.',
  });
  const duplicate = await vocabStore.saveEntry({
    bookId: imported.manifest.id,
    chapterId: imported.chapters[0]!.id,
    pageIndex: 0,
    term: 'trust',
    translation: '信任',
    sourceSentence: 'Trust creation is a fundamental goal.',
  });

  assert.equal(first.id, duplicate.id);
  assert.equal((await vocabStore.listEntries(imported.manifest.id)).length, 1);
});
