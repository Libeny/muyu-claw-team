import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importTextBook } from '../src/services/book-importer.js';
import { BookStore } from '../src/services/book-store.js';
import { LibrarySearchService } from '../src/services/library-search.js';

test('书库检索会返回跨书相关片段并标明来源', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'book-agent-reader-'));
  const store = new BookStore(homeDir);
  const brandBook = importTextBook({
    title: '品牌书',
    content: '# 信任\nTrust creation reduces decision cost.',
    sourceType: 'markdown',
  });
  const strategyBook = importTextBook({
    title: '战略书',
    content: '# 决策\nDecision cost matters when a brand asks for attention.',
    sourceType: 'markdown',
  });
  await store.saveImportedBook(brandBook);
  await store.saveImportedBook(strategyBook);

  const results = await new LibrarySearchService(store).search({
    query: 'brand decision cost',
    currentBookId: brandBook.manifest.id,
    limit: 4,
  });

  assert.equal(results.length, 2);
  assert.equal(results[0]?.bookTitle, '战略书');
  assert.match(results[0]?.text ?? '', /Decision cost/);
  assert.equal(results[1]?.bookTitle, '品牌书');
});
