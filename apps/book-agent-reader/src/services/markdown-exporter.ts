import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChapterSummary } from '../domain/chapter-summary.js';
import type { Highlight } from '../domain/highlight.js';
import type { ImportedBook } from '../domain/book.js';
import type { SessionBookmark } from '../domain/session.js';
import type { VocabEntry } from '../domain/vocab.js';

export interface ReadingNoteInput {
  book: ImportedBook;
  highlights?: Highlight[];
  chapterSummaries?: ChapterSummary[];
  sessions: SessionBookmark[];
  vocab: VocabEntry[];
}

export class MarkdownExporter {
  renderReadingNote(input: ReadingNoteInput): string {
    const lines = [
      `# ${input.book.manifest.title}`,
      '',
      `作者：${input.book.manifest.author || '未知'}`,
      `语言：${input.book.manifest.language}`,
      '',
      '## 章节',
      '',
      ...input.book.chapters.flatMap((chapter) => [`- ${chapter.title}`, '']),
      '## 章节概要',
      '',
      ...renderChapterSummaries(input.chapterSummaries || []),
      '## 高亮标注',
      '',
      ...renderHighlights(input.highlights || []),
      '## 会话书签',
      '',
      ...renderSessions(input.sessions),
      '## 生词本',
      '',
      ...renderVocab(input.vocab),
    ];
    return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  }

  async writeReadingNote(homeDir: string, input: ReadingNoteInput): Promise<string> {
    const outputPath = path.join(homeDir, 'books', input.book.manifest.id, 'exports', 'reading-note.md');
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, this.renderReadingNote(input), 'utf-8');
    return outputPath;
  }
}

function renderChapterSummaries(summaries: ChapterSummary[]): string[] {
  if (!summaries.length) return ['暂无章节概要。', ''];
  return summaries.flatMap((summary) => [
    `### ${summary.chapterTitle}`,
    '',
    summary.summary,
    '',
    ...renderList('核心论点', summary.keyClaims),
    ...renderList('关键概念', summary.keyConcepts),
    ...renderList('思考问题', summary.reflectionQuestions),
  ]);
}

function renderHighlights(highlights: Highlight[]): string[] {
  if (!highlights.length) return ['暂无高亮。', ''];
  return highlights.flatMap((highlight) => [
    `- ${highlight.text}`,
    highlight.note ? `  - 备注：${highlight.note}` : '',
    '',
  ]);
}

function renderSessions(sessions: SessionBookmark[]): string[] {
  if (!sessions.length) return ['暂无会话书签。', ''];
  return sessions.flatMap((session) => [
    `### ${session.title}`,
    '',
    `来源：${session.excerpt || '未记录'}`,
    '',
    session.summary || '暂无摘要。',
    '',
  ]);
}

function renderVocab(vocab: VocabEntry[]): string[] {
  if (!vocab.length) return ['暂无生词。', ''];
  return vocab.flatMap((entry) => [
    `- **${entry.term}**：${entry.translation}`,
    `  - 来源：${entry.sourceSentence}`,
    '',
  ]);
}

function renderList(title: string, values: string[]): string[] {
  if (!values.length) return [];
  return [`${title}：`, '', ...values.map((value) => `- ${value}`), ''];
}
