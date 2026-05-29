import path from 'node:path';
import type { Highlight, SaveHighlightInput } from '../domain/highlight.js';
import { readJsonFile, writeJsonFile } from './file-json-store.js';
import { nowIso, stableId } from './ids.js';

export class HighlightStore {
  constructor(private homeDir: string) {}

  async saveHighlight(input: SaveHighlightInput): Promise<Highlight> {
    const highlights = await this.listHighlights(input.bookId);
    const id = stableId('highlight', [
      input.bookId,
      input.chapterId,
      String(input.pageIndex),
      input.text,
      input.note || '',
    ]);
    const existing = highlights.find((highlight) => highlight.id === id);
    if (existing) return existing;

    const now = nowIso();
    const highlight: Highlight = {
      id,
      bookId: input.bookId,
      chapterId: input.chapterId,
      pageIndex: input.pageIndex,
      text: input.text,
      note: input.note || '',
      color: input.color || 'yellow',
      createdAt: now,
      updatedAt: now,
    };
    highlights.push(highlight);
    await writeJsonFile(this.pathFor(input.bookId), highlights);
    return highlight;
  }

  async listHighlights(bookId: string): Promise<Highlight[]> {
    return readJsonFile<Highlight[]>(this.pathFor(bookId), []);
  }

  private pathFor(bookId: string): string {
    return path.join(this.homeDir, 'books', bookId, 'highlights.json');
  }
}
