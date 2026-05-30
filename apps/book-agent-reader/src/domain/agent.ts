import type { ReadingContext } from './book.js';

export type AgentMode = 'ask' | 'translate' | 'explain' | 'summarize-chapter';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AgentRequest {
  mode: AgentMode;
  question: string;
  context: ReadingContext;
  previousMessages?: AgentMessage[];
  runtimeSessionId?: string;
}

export interface SuggestedVocab {
  term: string;
  translation: string;
  sourceSentence: string;
}

export interface AgentResponse {
  answer: string;
  title: string;
  summary: string;
  runtimeSessionId?: string;
  suggestedVocab?: SuggestedVocab[];
}
