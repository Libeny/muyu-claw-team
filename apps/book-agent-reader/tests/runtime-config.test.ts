import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildClaudeCodeOptions } from '../src/services/claude-code-agent.js';
import { loadRuntimeConfig } from '../src/config/runtime-config.js';

test('运行时配置从启动配置文件读取代理、认证、模型和 effort', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'book-agent-runtime-'));
  await writeFile(
    path.join(cwd, '.env.local'),
    [
      'BOOK_AGENT_READER_AGENT_MODE=claude-code',
      'BOOK_AGENT_READER_CLAUDE_PATH=/custom/claude',
      'BOOK_AGENT_READER_CLAUDE_MODEL=claude-custom',
      'BOOK_AGENT_READER_SUBAGENT_MODEL=deepseek-v4-flash',
      'BOOK_AGENT_READER_EFFORT_LEVEL=max',
      'HTTP_PROXY=http://127.0.0.1:7890',
      'HTTPS_PROXY=http://127.0.0.1:7890',
      'ANTHROPIC_BASE_URL=https://example.test/anthropic',
      'ANTHROPIC_AUTH_TOKEN=secret-token',
      'ANTHROPIC_API_KEY=secret-key',
    ].join('\n'),
  );

  const config = loadRuntimeConfig({ cwd, env: {} });

  assert.equal(config.agentMode, 'claude-code');
  assert.equal(config.claudeExecutable, '/custom/claude');
  assert.equal(config.model, 'claude-custom');
  assert.equal(config.subagentModel, 'deepseek-v4-flash');
  assert.equal(config.baseUrl, 'https://example.test/anthropic');
  assert.equal(config.effortLevel, 'max');
  assert.equal(config.env.HTTP_PROXY, 'http://127.0.0.1:7890');
  assert.equal(config.env.HTTPS_PROXY, 'http://127.0.0.1:7890');
  assert.equal(config.env.ANTHROPIC_BASE_URL, 'https://example.test/anthropic');
  assert.equal(config.env.ANTHROPIC_AUTH_TOKEN, 'secret-token');
  assert.equal(config.env.ANTHROPIC_API_KEY, 'secret-key');
  assert.equal(config.env.ANTHROPIC_MODEL, 'claude-custom');
  assert.equal(config.env.CLAUDE_CODE_SUBAGENT_MODEL, 'deepseek-v4-flash');
  assert.equal(config.env.CLAUDE_CODE_EFFORT_LEVEL, 'max');
  assert.equal(config.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1');
});

test('运行时配置默认使用 DeepSeek pro、flash 和 max effort，环境变量覆盖配置文件', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'book-agent-runtime-'));
  await writeFile(
    path.join(cwd, '.env.local'),
    [
      'BOOK_AGENT_READER_CLAUDE_MODEL=claude-file-model',
      'BOOK_AGENT_READER_EFFORT_LEVEL=low',
      'HTTP_PROXY=http://127.0.0.1:7890',
    ].join('\n'),
  );

  const config = loadRuntimeConfig({
    cwd,
    env: {
      BOOK_AGENT_READER_EFFORT_LEVEL: 'medium',
      HTTPS_PROXY: 'http://127.0.0.1:7897',
    },
  });

  assert.equal(config.model, 'claude-file-model');
  assert.equal(config.effortLevel, 'medium');
  assert.equal(config.env.HTTP_PROXY, 'http://127.0.0.1:7890');
  assert.equal(config.env.HTTPS_PROXY, 'http://127.0.0.1:7897');

  const defaultConfig = loadRuntimeConfig({ cwd: await mkdtemp(path.join(os.tmpdir(), 'book-agent-runtime-empty-')), env: {} });
  assert.equal(defaultConfig.model, 'deepseek-v4-pro[1m]');
  assert.equal(defaultConfig.subagentModel, 'deepseek-v4-flash');
  assert.equal(defaultConfig.baseUrl, 'https://api.deepseek.com/anthropic');
  assert.equal(defaultConfig.effortLevel, 'max');
  assert.equal(defaultConfig.env.HTTP_PROXY, undefined);
  assert.equal(defaultConfig.env.HTTPS_PROXY, undefined);
});

test('Claude Code SDK options 显式传入模型、effort 和启动环境', () => {
  const abortController = new AbortController();
  const options = buildClaudeCodeOptions({
    cwd: '/tmp/book-agent-reader',
    claudeExecutable: '/usr/local/bin/claude',
    runtimeConfig: {
      agentMode: 'claude-code',
      claudeExecutable: '/usr/local/bin/claude',
      model: 'deepseek-v4-pro[1m]',
      subagentModel: 'deepseek-v4-flash',
      baseUrl: 'https://api.deepseek.com/anthropic',
      effortLevel: 'max',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]',
        CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash',
      },
    },
    abortController,
    parentEnv: {
      HTTP_PROXY: 'http://127.0.0.1:7897',
      HTTPS_PROXY: 'http://127.0.0.1:7897',
    },
  });

  assert.equal(options.cwd, '/tmp/book-agent-reader');
  assert.equal(options.pathToClaudeCodeExecutable, '/usr/local/bin/claude');
  assert.equal(options.model, 'deepseek-v4-pro[1m]');
  assert.equal(options.effort, 'max');
  assert.equal(options.env.HTTP_PROXY, undefined);
  assert.equal(options.env.HTTPS_PROXY, undefined);
  assert.equal(options.env.ANTHROPIC_BASE_URL, 'https://api.deepseek.com/anthropic');
  assert.equal(options.env.ANTHROPIC_MODEL, 'deepseek-v4-pro[1m]');
  assert.equal(options.env.CLAUDE_CODE_SUBAGENT_MODEL, 'deepseek-v4-flash');
  assert.equal(options.env.CLAUDE_AGENT_SDK_CLIENT_APP, 'book-agent-reader/0.1.0');
});
