import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { BookCoverImage, BookManifest, Chapter, ImageAsset, ImportedBook, LoadedBook } from '../domain/book.js';
import { readJsonFile, writeJsonFile } from './file-json-store.js';

export class BookStore {
  constructor(private homeDir: string) {}

  async saveImportedBook(book: ImportedBook): Promise<void> {
    const dir = this.bookDir(book.manifest.id);
    await mkdir(path.join(dir, 'chapters'), { recursive: true });
    await writeJsonFile(path.join(dir, 'book.json'), book.manifest);
    for (const chapter of book.chapters) {
      await writeJsonFile(path.join(dir, 'chapters', `${chapter.id}.json`), chapter);
    }
  }

  async listBooks(): Promise<BookManifest[]> {
    await mkdir(this.booksDir(), { recursive: true });
    const entries = await readdir(this.booksDir(), { withFileTypes: true });
    const books: BookManifest[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await readJsonFile<BookManifest | null>(
        path.join(this.booksDir(), entry.name, 'book.json'),
        null,
      );
      if (manifest) books.push(await this.withCoverImage(manifest));
    }
    return books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadBook(bookId: string): Promise<LoadedBook> {
    const manifest = await readJsonFile<BookManifest | null>(path.join(this.bookDir(bookId), 'book.json'), null);
    if (!manifest) {
      throw new Error(`书籍不存在：${bookId}`);
    }
    const chapters = await Promise.all(
      manifest.chapterIds.map((chapterId) =>
        readJsonFile<Chapter | null>(path.join(this.bookDir(bookId), 'chapters', `${chapterId}.json`), null),
      ),
    );
    return {
      manifest,
      chapters: chapters.filter((chapter): chapter is Chapter => Boolean(chapter)).sort((a, b) => a.order - b.order),
    };
  }

  bookDir(bookId: string): string {
    return path.join(this.booksDir(), bookId);
  }

  private booksDir(): string {
    return path.join(this.homeDir, 'books');
  }

  private async withCoverImage(manifest: BookManifest): Promise<BookManifest> {
    if (manifest.coverImage?.dataUrl) return manifest;
    for (const chapterId of manifest.chapterIds) {
      const chapter = await readJsonFile<Chapter | null>(
        path.join(this.bookDir(manifest.id), 'chapters', `${chapterId}.json`),
        null,
      );
      const image = chapter?.images?.find((item) => item.dataUrl);
      if (image) return { ...manifest, coverImage: imageToCoverImage(image) };
    }
    return manifest;
  }
}

function imageToCoverImage(image: ImageAsset): BookCoverImage {
  return {
    sourcePath: image.sourcePath,
    mediaType: image.mediaType,
    dataUrl: image.dataUrl,
    altText: meaningfulImageText(image.altText) || meaningfulImageText(image.caption) || '封面',
  };
}

function meaningfulImageText(value?: string): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (['image', 'img', 'picture', 'photo', 'graphic', 'figure'].includes(normalized.toLowerCase())) return '';
  return normalized;
}
