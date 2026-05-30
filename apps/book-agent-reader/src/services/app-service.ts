import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AgentMode } from '../domain/agent.js';
import type { Anchor, LoadedBook, SourceType } from '../domain/book.js';
import type { ChapterSummary } from '../domain/chapter-summary.js';
import type { Highlight, SaveHighlightInput } from '../domain/highlight.js';
import type { SessionBookmark } from '../domain/session.js';
import type { SaveVocabInput, VocabEntry } from '../domain/vocab.js';
import type { BookAgentRuntimeConfig } from '../config/runtime-config.js';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { BookStore } from './book-store.js';
import { ChapterSummaryStore } from './chapter-summary-store.js';
import { ClaudeCodeAgent } from './claude-code-agent.js';
import { importEpubBook, importEpubDirectory, importPdfBook, importTextBook } from './book-importer.js';
import { MarkdownExporter } from './markdown-exporter.js';
import { LibrarySearchService } from './library-search.js';
import { buildReadingContext } from './reading-context.js';
import { SessionStore } from './session-store.js';
import { SkillExporter } from './skill-exporter.js';
import { VocabStore } from './vocab-store.js';
import { HighlightStore } from './highlight-store.js';

export interface ImportTextInput {
  title: string;
  author?: string;
  language?: string;
  content: string;
  sourceType?: Extract<SourceType, 'text' | 'markdown'>;
}

export interface ImportBinaryInput {
  fileName: string;
  dataBase64: string;
}

export interface AskInput {
  bookId: string;
  chapterId: string;
  pageIndex: number;
  selectedText?: string;
  question: string;
  mode: AgentMode;
}

export interface AskResult {
  answer: string;
  title: string;
  summary: string;
  session: SessionBookmark;
}

export class AppService {
  private books: BookStore;
  private sessions: SessionStore;
  private vocab: VocabStore;
  private highlights: HighlightStore;
  private summaries: ChapterSummaryStore;
  private markdown = new MarkdownExporter();
  private skills = new SkillExporter();
  private search: LibrarySearchService;
  private runtimeConfig: BookAgentRuntimeConfig;

  constructor(private homeDir: string, runtimeConfig?: BookAgentRuntimeConfig) {
    this.runtimeConfig = runtimeConfig || loadRuntimeConfig();
    this.books = new BookStore(homeDir);
    this.sessions = new SessionStore(homeDir);
    this.vocab = new VocabStore(homeDir);
    this.highlights = new HighlightStore(homeDir);
    this.summaries = new ChapterSummaryStore(homeDir);
    this.search = new LibrarySearchService(this.books);
  }

  async importText(input: ImportTextInput): Promise<LoadedBook> {
    const imported = importTextBook(input);
    await this.books.saveImportedBook(imported);
    return this.books.loadBook(imported.manifest.id);
  }

  async importSampleBook(): Promise<LoadedBook> {
    return this.importText({
      title: '品牌与信任示例',
      author: 'Book Agent Reader',
      language: 'zh',
      sourceType: 'markdown',
      content: [
        '# 信任如何进入设计',
        'Trust creation is a fundamental goal of brand design. A reader should not treat a visual detail as decoration only; the detail often works as evidence of care, authority, and continuity.',
        '',
        'When a symbol becomes familiar, it can shorten decision-making. This is why currency, identity systems, and product marks often rely on repeated visual cues.',
        '',
        '# 品牌价值如何被讨论',
        'A company can estimate brand value, but the estimate only matters when it helps people make decisions. The important question is not only how much the brand is worth, but why people trust it enough to pay attention.',
      ].join('\n'),
    });
  }

  async importFile(filePath: string): Promise<LoadedBook> {
    const ext = path.extname(filePath).toLowerCase();
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      if (ext !== '.epub') {
        throw new Error('当前只支持导入目录包形式的 EPUB。');
      }
      const imported = await importEpubDirectory(filePath);
      await this.books.saveImportedBook(imported);
      return this.books.loadBook(imported.manifest.id);
    }
    const buffer = await readFile(filePath);
    return this.importBuffer({
      fileName: path.basename(filePath),
      buffer,
    });
  }

  async importBinary(input: ImportBinaryInput): Promise<LoadedBook> {
    return this.importBuffer({
      fileName: input.fileName,
      buffer: Buffer.from(input.dataBase64, 'base64'),
    });
  }

  private async importBuffer(input: { fileName: string; buffer: Buffer }): Promise<LoadedBook> {
    const ext = path.extname(input.fileName).toLowerCase();
    const title = path.basename(input.fileName, ext);

    if (ext === '.epub') {
      const imported = await importEpubBook(input.buffer);
      await this.books.saveImportedBook(imported);
      return this.books.loadBook(imported.manifest.id);
    }

    if (ext === '.pdf') {
      const imported = importPdfBook(input.buffer, { title });
      await this.books.saveImportedBook(imported);
      return this.books.loadBook(imported.manifest.id);
    }

    if (!['.txt', '.md', '.markdown'].includes(ext)) {
      throw new Error('当前版本支持 EPUB、文本型 PDF、纯文本和标记文档导入。');
    }
    const content = input.buffer.toString('utf-8');
    return this.importText({
      title,
      language: 'unknown',
      sourceType: ext === '.txt' ? 'text' : 'markdown',
      content,
    });
  }

  async listBooks() {
    return this.books.listBooks();
  }

  async loadBook(bookId: string): Promise<LoadedBook> {
    return this.books.loadBook(bookId);
  }

  async ask(input: AskInput): Promise<AskResult> {
    const book = await this.loadBook(input.bookId);
    const relatedPassages = await this.search.search({
      query: [input.question, input.selectedText || ''].join(' '),
      currentBookId: input.bookId,
      limit: 5,
    });
    const highlights = await this.listHighlights(input.bookId);
    const chapterSummary = (await this.listChapterSummaries(input.bookId)).find(
      (summary) => summary.chapterId === input.chapterId,
    );
    const context = buildReadingContext({
      book,
      chapterId: input.chapterId,
      pageIndex: input.pageIndex,
      selectedText: input.selectedText,
      relatedPassages,
      highlights,
      chapterSummary,
    });
    const agent = new ClaudeCodeAgent({
      cwd: this.books.bookDir(input.bookId),
      claudeExecutable: this.runtimeConfig.claudeExecutable,
      runtimeConfig: this.runtimeConfig,
      timeoutMs: 60_000,
    });
    const response = await agent.respond({
      mode: input.mode,
      question: input.question,
      context,
    });
    const anchor: Anchor = {
      type: input.selectedText ? 'text' : 'page',
      bookId: input.bookId,
      chapterId: input.chapterId,
      pageIndex: input.pageIndex,
      text: input.selectedText,
    };
    const session = await this.sessions.createSession({
      bookId: input.bookId,
      anchor,
      title: response.title,
      excerpt: input.selectedText || context.currentPageText.slice(0, 120),
      userQuestion: input.question,
      assistantAnswer: response.answer,
      summary: response.summary,
      runtimeSessionId: response.runtimeSessionId,
    });
    if (input.mode === 'summarize-chapter') {
      await this.summaries.saveSummary({
        bookId: input.bookId,
        chapterId: input.chapterId,
        chapterTitle: context.chapterTitle,
        summary: response.summary || response.answer.slice(0, 280),
        keyClaims: extractBulletCandidates(response.answer, ['论点', '主张']),
        keyConcepts: [context.chapterTitle, ...extractBulletCandidates(response.answer, ['概念'])].slice(0, 6),
        reflectionQuestions: extractQuestions(response.answer),
      });
    }
    return {
      answer: response.answer,
      title: response.title,
      summary: response.summary,
      session,
    };
  }

  async saveVocab(input: SaveVocabInput): Promise<VocabEntry> {
    return this.vocab.saveEntry(input);
  }

  async saveHighlight(input: SaveHighlightInput): Promise<Highlight> {
    return this.highlights.saveHighlight(input);
  }

  async listVocab(bookId: string): Promise<VocabEntry[]> {
    return this.vocab.listEntries(bookId);
  }

  async listHighlights(bookId: string): Promise<Highlight[]> {
    return this.highlights.listHighlights(bookId);
  }

  async listChapterSummaries(bookId: string): Promise<ChapterSummary[]> {
    return this.summaries.listSummaries(bookId);
  }

  async listSessions(bookId: string): Promise<SessionBookmark[]> {
    return this.sessions.listSessions(bookId);
  }

  async exportReadingNote(bookId: string): Promise<string> {
    const book = await this.loadBook(bookId);
    const sessions = await this.listSessions(bookId);
    const vocab = await this.listVocab(bookId);
    const highlights = await this.listHighlights(bookId);
    const chapterSummaries = await this.listChapterSummaries(bookId);
    return this.markdown.writeReadingNote(this.homeDir, { book, sessions, vocab, highlights, chapterSummaries });
  }

  async exportSkill(bookId: string): Promise<string> {
    const book = await this.loadBook(bookId);
    const sessions = await this.listSessions(bookId);
    return this.skills.writeSkill(this.homeDir, { book, sessions });
  }
}

function extractQuestions(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter((line) => line.endsWith('？') || line.endsWith('?'))
    .slice(0, 5);
}

function extractBulletCandidates(value: string, labels: string[]): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter((line) => labels.some((label) => line.includes(label)))
    .slice(0, 5);
}
