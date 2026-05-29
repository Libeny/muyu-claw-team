import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type AgentRuntimeMode = 'claude-code' | 'mock';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface BookAgentRuntimeConfig {
  agentMode: AgentRuntimeMode;
  claudeExecutable?: string;
  model: string;
  subagentModel: string;
  baseUrl?: string;
  effortLevel: EffortLevel;
  env: Record<string, string>;
}

export interface RuntimeConfigLoadOptions {
  cwd?: string;
  userDataDir?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_MODEL = 'deepseek-v4-pro[1m]';
const DEFAULT_SUBAGENT_MODEL = 'deepseek-v4-flash';
const DEFAULT_BASE_URL = 'https://api.deepseek.com/anthropic';
const DEFAULT_EFFORT_LEVEL: EffortLevel = 'max';
const EFFORT_LEVELS = new Set<EffortLevel>(['low', 'medium', 'high', 'xhigh', 'max']);
const CONFIG_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
];

export function loadRuntimeConfig(options: RuntimeConfigLoadOptions = {}): BookAgentRuntimeConfig {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const fileValues = loadConfigFiles(cwd, options.userDataDir, options.configPath || env.BOOK_AGENT_READER_CONFIG);
  const values = { ...fileValues, ...definedEnv(env) };

  return {
    agentMode: normalizeAgentMode(values.BOOK_AGENT_READER_AGENT_MODE),
    claudeExecutable: firstValue(values.BOOK_AGENT_READER_CLAUDE_PATH, values.CLAUDE_EXECUTABLE, discoverClaudeExecutable()),
    model: firstValue(values.BOOK_AGENT_READER_CLAUDE_MODEL, values.ANTHROPIC_MODEL, DEFAULT_MODEL)!,
    subagentModel: firstValue(
      values.BOOK_AGENT_READER_SUBAGENT_MODEL,
      values.CLAUDE_CODE_SUBAGENT_MODEL,
      values.ANTHROPIC_DEFAULT_HAIKU_MODEL,
      DEFAULT_SUBAGENT_MODEL,
    )!,
    baseUrl: firstValue(values.ANTHROPIC_BASE_URL, DEFAULT_BASE_URL),
    effortLevel: normalizeEffortLevel(values.BOOK_AGENT_READER_EFFORT_LEVEL || values.BOOK_AGENT_READER_CLAUDE_EFFORT),
    env: pickRuntimeEnv(values),
  };
}

export function applyRuntimeConfig(config: BookAgentRuntimeConfig, env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, value] of Object.entries(config.env)) {
    env[key] = value;
  }
  env.BOOK_AGENT_READER_AGENT_MODE = config.agentMode;
  if (config.claudeExecutable) env.BOOK_AGENT_READER_CLAUDE_PATH = config.claudeExecutable;
  env.BOOK_AGENT_READER_CLAUDE_MODEL = config.model;
  env.BOOK_AGENT_READER_SUBAGENT_MODEL = config.subagentModel;
  env.BOOK_AGENT_READER_EFFORT_LEVEL = config.effortLevel;
}

function loadConfigFiles(cwd: string, userDataDir?: string, explicitPath?: string): Record<string, string> {
  const candidates = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
    userDataDir ? path.join(userDataDir, '.env.local') : '',
    explicitPath || '',
  ].filter(Boolean);

  const values: Record<string, string> = {};
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    Object.assign(values, parseEnvFile(readFileSync(candidate, 'utf-8')));
  }
  return values;
}

function parseEnvFile(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    const value = normalizeEnvValue(normalized.slice(separator + 1).trim());
    values[key] = value;
  }
  return values;
}

function normalizeEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, '').trim();
}

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.length > 0) values[key] = value;
  }
  return values;
}

function pickRuntimeEnv(values: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  const model = firstValue(values.BOOK_AGENT_READER_CLAUDE_MODEL, values.ANTHROPIC_MODEL, DEFAULT_MODEL);
  const subagentModel = firstValue(
    values.BOOK_AGENT_READER_SUBAGENT_MODEL,
    values.CLAUDE_CODE_SUBAGENT_MODEL,
    values.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    DEFAULT_SUBAGENT_MODEL,
  );
  env.ANTHROPIC_BASE_URL = firstValue(values.ANTHROPIC_BASE_URL, DEFAULT_BASE_URL)!;
  env.ANTHROPIC_MODEL = model!;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = firstValue(values.ANTHROPIC_DEFAULT_HAIKU_MODEL, subagentModel)!;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = firstValue(values.ANTHROPIC_DEFAULT_SONNET_MODEL, model)!;
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = firstValue(values.ANTHROPIC_DEFAULT_OPUS_MODEL, model)!;
  env.CLAUDE_CODE_SUBAGENT_MODEL = subagentModel!;
  env.CLAUDE_CODE_EFFORT_LEVEL = normalizeEffortLevel(
    values.BOOK_AGENT_READER_EFFORT_LEVEL || values.BOOK_AGENT_READER_CLAUDE_EFFORT || values.CLAUDE_CODE_EFFORT_LEVEL,
  );
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = firstValue(values.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1')!;

  for (const key of CONFIG_ENV_KEYS) {
    if (['HTTP_PROXY', 'HTTPS_PROXY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'].includes(key) && values[key]) {
      env[key] = values[key];
    }
  }
  return env;
}

function normalizeAgentMode(value?: string): AgentRuntimeMode {
  return value === 'mock' ? 'mock' : 'claude-code';
}

function normalizeEffortLevel(value?: string): EffortLevel {
  if (!value) return DEFAULT_EFFORT_LEVEL;
  if (EFFORT_LEVELS.has(value as EffortLevel)) return value as EffortLevel;
  throw new Error(`BOOK_AGENT_READER_EFFORT_LEVEL 必须是 low、medium、high、xhigh 或 max，当前值：${value}`);
}

function discoverClaudeExecutable(): string | undefined {
  for (const candidate of ['/usr/local/bin/claude', '/opt/homebrew/bin/claude']) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function firstValue(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0);
}
