import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AgentMessage } from '../domain/agent.js';
import type { CreateSessionInput, SessionBookmark } from '../domain/session.js';
import { readJsonFile, writeJsonFile } from './file-json-store.js';
import { nowIso, randomId } from './ids.js';

export class SessionStore {
  constructor(private homeDir: string) {}

  async createSession(input: CreateSessionInput): Promise<SessionBookmark> {
    const now = nowIso();
    const session: SessionBookmark = {
      id: randomId('session'),
      bookId: input.bookId,
      anchor: input.anchor,
      title: input.title,
      excerpt: input.excerpt,
      messages: [
        { role: 'user', content: input.userQuestion, createdAt: now },
        { role: 'assistant', content: input.assistantAnswer, createdAt: now },
      ],
      summary: input.summary,
      tags: input.tags || [],
      runtimeSessionId: input.runtimeSessionId,
      createdAt: now,
      updatedAt: now,
    };
    await this.save(session);
    return session;
  }

  async appendMessage(sessionId: string, message: Omit<AgentMessage, 'createdAt'>): Promise<SessionBookmark> {
    const session = await this.loadById(sessionId);
    session.messages.push({ ...message, createdAt: nowIso() });
    session.updatedAt = nowIso();
    await this.save(session);
    return session;
  }

  async listSessions(bookId: string): Promise<SessionBookmark[]> {
    const index = await readJsonFile<string[]>(this.indexPath(bookId), []);
    const sessions = await Promise.all(index.map((sessionId) => this.loadById(sessionId)));
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async loadById(sessionId: string): Promise<SessionBookmark> {
    const session = await readJsonFile<SessionBookmark | null>(this.sessionPath(sessionId), null);
    if (!session) throw new Error(`会话不存在：${sessionId}`);
    return session;
  }

  private async save(session: SessionBookmark): Promise<void> {
    await mkdir(this.sessionsDir(), { recursive: true });
    await writeJsonFile(this.sessionPath(session.id), session);
    const index = await readJsonFile<string[]>(this.indexPath(session.bookId), []);
    if (!index.includes(session.id)) {
      index.push(session.id);
      await writeJsonFile(this.indexPath(session.bookId), index);
    }
  }

  private sessionsDir(): string {
    return path.join(this.homeDir, 'sessions');
  }

  private sessionPath(sessionId: string): string {
    return path.join(this.sessionsDir(), `${sessionId}.json`);
  }

  private indexPath(bookId: string): string {
    return path.join(this.sessionsDir(), `${bookId}.index.json`);
  }
}
