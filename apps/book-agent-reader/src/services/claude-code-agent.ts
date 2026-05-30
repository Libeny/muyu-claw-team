import type { AgentRequest, AgentResponse } from '../domain/agent.js';
import { BOOK_AGENT_SKILL_SUMMARY, BOOK_AGENT_SYSTEM_PROMPT } from '../agent/book-agent-system.js';
import type { BookAgentRuntimeConfig } from '../config/runtime-config.js';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { MockAgent } from './mock-agent.js';

export interface ClaudeCodeAgentOptions {
  cwd: string;
  claudeExecutable?: string;
  timeoutMs?: number;
  runtimeConfig?: BookAgentRuntimeConfig;
}

export class ClaudeCodeAgent {
  private fallback = new MockAgent();

  constructor(private options: ClaudeCodeAgentOptions) {}

  async respond(request: AgentRequest): Promise<AgentResponse> {
    const runtimeConfig = this.options.runtimeConfig || loadRuntimeConfig();
    if (runtimeConfig.agentMode !== 'claude-code') {
      return this.fallback.respond(request);
    }

    const claudeExecutable = this.options.claudeExecutable || runtimeConfig.claudeExecutable;
    if (!claudeExecutable) {
      return this.fallback.respond(request);
    }

    try {
      return await this.runClaudeCode(request, claudeExecutable, runtimeConfig);
    } catch (error) {
      const fallback = await this.fallback.respond(request);
      return {
        ...fallback,
        answer: `${fallback.answer}\n\n（Claude Code 调用失败，已使用本地模拟器返回。错误：${String((error as Error).message || error)}）`,
      };
    }
  }

  private async runClaudeCode(
    request: AgentRequest,
    claudeExecutable: string,
    runtimeConfig: BookAgentRuntimeConfig,
  ): Promise<AgentResponse> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), this.options.timeoutMs || 60_000);
    const prompt = buildPrompt(request);
    let text = '';
    let sessionId = request.runtimeSessionId || '';

    try {
      const stream = query({
        prompt,
        options: {
          ...buildClaudeCodeOptions({
            cwd: this.options.cwd,
            claudeExecutable,
            runtimeConfig,
            abortController,
          }),
          resume: request.runtimeSessionId || undefined,
        },
      } as any);

      for await (const message of stream as AsyncIterable<any>) {
        if (message.type === 'system' && message.subtype === 'init') {
          sessionId = message.session_id || sessionId;
        }
        if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
          text = message.message.content
            .filter((block: { type: string; text?: string }) => block.type === 'text' && block.text)
            .map((block: { text: string }) => block.text)
            .join('');
        }
        if (message.type === 'result' && message.subtype === 'success' && typeof message.result === 'string') {
          text = message.result || text;
          sessionId = message.session_id || sessionId;
        }
      }
    } finally {
      clearTimeout(timer);
    }

    return {
      answer: text.trim() || 'Claude Code 未返回内容。',
      title: `关于：${request.context.selectedText || request.question}`.slice(0, 40),
      summary: text.trim().slice(0, 160),
      runtimeSessionId: sessionId,
    };
  }
}

export function buildClaudeCodeOptions(input: {
  cwd: string;
  claudeExecutable: string;
  runtimeConfig: BookAgentRuntimeConfig;
  abortController: AbortController;
  parentEnv?: NodeJS.ProcessEnv;
}): Record<string, any> {
  return {
    cwd: input.cwd,
    pathToClaudeCodeExecutable: input.claudeExecutable,
    model: input.runtimeConfig.model,
    effort: input.runtimeConfig.effortLevel,
    includePartialMessages: true,
    abortController: input.abortController,
    tools: { type: 'preset', preset: 'claude_code' },
    systemPrompt: BOOK_AGENT_SYSTEM_PROMPT,
    env: buildClaudeEnvironment(input.parentEnv || process.env, input.runtimeConfig.env),
  };
}

function buildClaudeEnvironment(parentEnv: NodeJS.ProcessEnv, configuredEnv: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    if (isProxyKey(key) && !configuredEnv[key]) continue;
    env[key] = value;
  }
  return {
    ...env,
    ...configuredEnv,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'book-agent-reader/0.1.0',
  };
}

function isProxyKey(key: string): boolean {
  return ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].includes(key);
}

function buildPrompt(request: AgentRequest): string {
  return [
    '你是图书智能伴读器，正在帮助用户阅读一本书。',
    BOOK_AGENT_SKILL_SUMMARY,
    '请只根据下方提供的上下文回答。不要假装知道未提供的原文，也不要大段复述受版权保护的内容。',
    '',
    `书名：${request.context.bookTitle}`,
    `章节：${request.context.chapterTitle}`,
    `页码：${request.context.pageIndex + 1}`,
    `选中文本：${request.context.selectedText || '无'}`,
    '',
    '当前页文本：',
    request.context.currentPageText,
    '',
    '附近上下文：',
    request.context.nearbyText,
    '',
    '已保存章节概要：',
    request.context.chapterSummary ? request.context.chapterSummary.summary : '无',
    '',
    '用户高亮：',
    request.context.highlights.length
      ? request.context.highlights.map((highlight) => `- ${highlight.text}${highlight.note ? `（${highlight.note}）` : ''}`).join('\n')
      : '无',
    '',
    '当前章节图片上下文：',
    request.context.imageContexts.length
      ? request.context.imageContexts
          .map((image) => `- 图片：${image.altText || image.sourcePath}；图注：${image.caption || '无'}；附近文本：${image.contextText || '无'}`)
          .join('\n')
      : '无',
    '',
    '书库相关片段：',
    request.context.relatedPassages.length
      ? request.context.relatedPassages
          .map(
            (passage) =>
              `- 《${passage.bookTitle}》${passage.chapterTitle} 第 ${passage.pageIndex + 1} 页：${passage.text}`,
          )
          .join('\n')
      : '无',
    '',
    `用户问题：${request.question}`,
    '',
    '请用中文回答，必要时给出简短思考问题。',
  ].join('\n');
}
