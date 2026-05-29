import path from 'node:path';
import type { ChapterSummary, SaveChapterSummaryInput } from '../domain/chapter-summary.js';
import { readJsonFile, writeJsonFile } from './file-json-store.js';
import { nowIso, stableId } from './ids.js';

export class ChapterSummaryStore {
  constructor(private homeDir: string) {}

  async saveSummary(input: SaveChapterSummaryInput): Promise<ChapterSummary> {
    const summaries = await this.listSummaries(input.bookId);
    const now = nowIso();
    const id = stableId('summary', [input.bookId, input.chapterId]);
    const existingIndex = summaries.findIndex((summary) => summary.id === id);
    const previous = existingIndex >= 0 ? summaries[existingIndex] : null;
    const summary: ChapterSummary = {
      id,
      bookId: input.bookId,
      chapterId: input.chapterId,
      chapterTitle: input.chapterTitle,
      summary: input.summary,
      keyClaims: input.keyClaims || [],
      keyConcepts: input.keyConcepts || [],
      reflectionQuestions: input.reflectionQuestions || [],
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };

    if (existingIndex >= 0) summaries[existingIndex] = summary;
    else summaries.push(summary);

    await writeJsonFile(this.pathFor(input.bookId), summaries);
    return summary;
  }

  async listSummaries(bookId: string): Promise<ChapterSummary[]> {
    return readJsonFile<ChapterSummary[]>(this.pathFor(bookId), []);
  }

  private pathFor(bookId: string): string {
    return path.join(this.homeDir, 'books', bookId, 'chapter-summaries.json');
  }
}
