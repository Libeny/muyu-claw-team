export type VocabFamiliarity = 'new' | 'learning' | 'known';

export interface VocabEntry {
  id: string;
  bookId: string;
  chapterId?: string;
  pageIndex?: number;
  term: string;
  translation: string;
  sourceSentence: string;
  note?: string;
  familiarity: VocabFamiliarity;
  createdAt: string;
  updatedAt: string;
}

export interface SaveVocabInput {
  bookId: string;
  chapterId?: string;
  pageIndex?: number;
  term: string;
  translation: string;
  sourceSentence: string;
  note?: string;
  familiarity?: VocabFamiliarity;
}
