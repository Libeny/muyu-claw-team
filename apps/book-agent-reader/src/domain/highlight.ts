export interface Highlight {
  id: string;
  bookId: string;
  chapterId: string;
  pageIndex: number;
  text: string;
  note: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveHighlightInput {
  bookId: string;
  chapterId: string;
  pageIndex: number;
  text: string;
  note?: string;
  color?: string;
}
