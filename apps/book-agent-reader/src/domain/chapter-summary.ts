export interface ChapterSummary {
  id: string;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  summary: string;
  keyClaims: string[];
  keyConcepts: string[];
  reflectionQuestions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveChapterSummaryInput {
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  summary: string;
  keyClaims?: string[];
  keyConcepts?: string[];
  reflectionQuestions?: string[];
}
