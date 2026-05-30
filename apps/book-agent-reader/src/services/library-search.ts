import type { RelatedPassage } from '../domain/book.js';
import type { BookStore } from './book-store.js';

export interface LibrarySearchInput {
  query: string;
  currentBookId?: string;
  limit?: number;
}

export class LibrarySearchService {
  constructor(private books: BookStore) {}

  async search(input: LibrarySearchInput): Promise<RelatedPassage[]> {
    const terms = tokenize(input.query);
    if (!terms.length) return [];

    const manifests = await this.books.listBooks();
    const passages: RelatedPassage[] = [];
    for (const manifest of manifests) {
      const book = await this.books.loadBook(manifest.id);
      for (const chapter of book.chapters) {
        for (const page of chapter.pages) {
          const score = scoreText(page.text, terms);
          if (score <= 0) continue;
          passages.push({
            bookId: book.manifest.id,
            bookTitle: book.manifest.title,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            pageIndex: page.index,
            text: clip(page.text, 420),
            score: score + (book.manifest.id === input.currentBookId ? 0 : 0.25),
          });
        }
      }
    }

    return passages.sort((a, b) => b.score - a.score).slice(0, input.limit || 6);
  }
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^\p{L}\p{N}\u4e00-\u9fa5]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  );
}

function scoreText(text: string, terms: string[]): number {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => {
    const matches = normalized.match(new RegExp(escapeRegex(term), 'g'))?.length || 0;
    return score + matches;
  }, 0);
}

function clip(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
