import type { ChapterSummary } from './chapter-summary.js';
import type { Highlight } from './highlight.js';

export type SourceType = 'text' | 'markdown' | 'epub' | 'pdf';

export interface Page {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  order: number;
  text: string;
  pages: Page[];
  images?: ImageAsset[];
}

export interface ImageAsset {
  id: string;
  bookId: string;
  chapterId: string;
  sourcePath: string;
  mediaType?: string;
  dataUrl?: string;
  textOffset?: number;
  pageIndex?: number;
  altText: string;
  caption: string;
  contextText: string;
}

export interface BookManifest {
  id: string;
  title: string;
  author: string;
  language: string;
  sourceType: SourceType;
  createdAt: string;
  updatedAt: string;
  chapterIds: string[];
}

export interface ImportedBook {
  manifest: BookManifest;
  chapters: Chapter[];
}

export interface LoadedBook extends ImportedBook {}

export type AnchorType = 'book' | 'chapter' | 'page' | 'text' | 'image' | 'highlight';

export interface Anchor {
  type: AnchorType;
  bookId: string;
  chapterId?: string;
  pageIndex?: number;
  text?: string;
  imageId?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface ReadingContext {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  pageIndex: number;
  selectedText: string;
  currentPageText: string;
  nearbyText: string;
  relatedPassages: RelatedPassage[];
  imageContexts: ImageAsset[];
  highlights: Highlight[];
  chapterSummary?: ChapterSummary;
}

export interface RelatedPassage {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  pageIndex: number;
  text: string;
  score: number;
}
