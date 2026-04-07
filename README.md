# muyu-claw-team

Personal multi-bot agent system.

Current design goals:

- one bot maps to one agent
- `dev`, `ops`, `design` built-in agents
- private, group, and scheduled sessions
- shared group records, not shared runtime sessions
- local Redis + PostgreSQL
- Claude native sandboxing
- async queue with immediate ACK and delayed final reply

## Local Start

1. Copy `.env.example` to `.env` and fill the Discord bot tokens.
2. Confirm `claude` CLI is installed and logged in.
3. If you want Claude Code to follow your shell model/provider setup, export it in your shell or `.env.local` before starting the service, for example `ANTHROPIC_MODEL=...` or `ANTHROPIC_BASE_URL=...`.
4. Start local dependencies: `npm run deps:up`
5. Initialize schema: `npm run db:init`
6. Start the service: `npm run dev`

Use `npm run doctor` to verify Claude, sandbox prerequisites, bot env vars, Redis, and PostgreSQL before starting.

## Model And Provider Selection

- CLI path comes from `CLAUDE_EXECUTABLE`.
- If an agent profile sets `model`, that model is passed to Claude SDK.
- If an agent profile leaves `model` empty, Claude Code falls back to its normal resolution order, including environment variables such as `ANTHROPIC_MODEL`.
- Provider and gateway variables such as `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and alias mappings like `ANTHROPIC_DEFAULT_SONNET_MODEL` can be supplied from your shell or `.env.local`.
- Agent profiles can also define `env` overrides, but shell / `.env.local` environment values win.
- Your current `~/.zshrc` GLM setup maps `sonnet` / `opus` / `haiku` aliases through `ANTHROPIC_DEFAULT_*_MODEL`; this project supports the same pattern without extra code changes.

## Structure

```text
src/
  bridge/      platform adapters
  core/        registries, resolver, orchestration
  delivery/    final outbound delivery
  queue/       queue and coalescing
  runtime/     Claude / Codex runtime wrappers
  sandbox/     native sandbox policy
  scheduler/   internal due-task scanner -> enqueue
  store/       redis/postgres persistence
```

## Session Scopes

- `private`
- `group`
- `scheduled`

## Agent Roles

- `dev`
- `ops`
- `design`
