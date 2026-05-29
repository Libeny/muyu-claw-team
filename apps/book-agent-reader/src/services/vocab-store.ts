import path from 'node:path';
import type { SaveVocabInput, VocabEntry } from '../domain/vocab.js';
import { readJsonFile, writeJsonFile } from './file-json-store.js';
import { nowIso, stableId } from './ids.js';

export class VocabStore {
  constructor(private homeDir: string) {}

  async saveEntry(input: SaveVocabInput): Promise<VocabEntry> {
    const entries = await this.listEntries(input.bookId);
    const id = stableId('vocab', [input.bookId, input.term.toLowerCase(), input.sourceSentence]);
    const existing = entries.find((entry) => entry.id === id);
    if (existing) return existing;

    const now = nowIso();
    const entry: VocabEntry = {
      id,
      bookId: input.bookId,
      chapterId: input.chapterId,
      pageIndex: input.pageIndex,
      term: input.term,
      translation: input.translation,
      sourceSentence: input.sourceSentence,
      note: input.note,
      familiarity: input.familiarity || 'new',
      createdAt: now,
      updatedAt: now,
    };
    entries.push(entry);
    await writeJsonFile(this.vocabPath(input.bookId), entries);
    return entry;
  }

  async listEntries(bookId: string): Promise<VocabEntry[]> {
    return readJsonFile<VocabEntry[]>(this.vocabPath(bookId), []);
  }

  private vocabPath(bookId: string): string {
    return path.join(this.homeDir, 'books', bookId, 'vocab.json');
  }
}
