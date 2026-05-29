import type { AgentMessage } from './agent.js';
import type { Anchor } from './book.js';

export interface SessionBookmark {
  id: string;
  bookId: string;
  anchor: Anchor;
  title: string;
  excerpt: string;
  messages: AgentMessage[];
  summary: string;
  tags: string[];
  runtimeSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionInput {
  bookId: string;
  anchor: Anchor;
  title: string;
  excerpt: string;
  userQuestion: string;
  assistantAnswer: string;
  summary: string;
  tags?: string[];
  runtimeSessionId?: string;
}
