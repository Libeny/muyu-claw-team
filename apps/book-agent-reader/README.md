# 图书智能伴读器

这是图书智能伴读器的 Electron 桌面应用包。

## 运行

开发态桌面应用：

```bash
npm run book:dev
```

本地网页预览：

```bash
npm run book:web
```

macOS 安装包：

```bash
npm run book:package:mac
```

构建产物：

- `apps/book-agent-reader/release/图书智能伴读器-0.1.0-arm64.dmg`
- `apps/book-agent-reader/release/mac-arm64/图书智能伴读器.app`

## Claude Code 配置

应用启动时会读取本地配置文件。源码开发态可使用：

```text
apps/book-agent-reader/.env.local
```

打包后的 macOS 应用会读取：

```text
~/Library/Application Support/book-agent-reader/.env.local
```

推荐 DeepSeek 配置：

```bash
BOOK_AGENT_READER_AGENT_MODE=claude-code
BOOK_AGENT_READER_CLAUDE_PATH=/usr/local/bin/claude
BOOK_AGENT_READER_CLAUDE_MODEL=deepseek-v4-pro[1m]
BOOK_AGENT_READER_SUBAGENT_MODEL=deepseek-v4-flash
BOOK_AGENT_READER_EFFORT_LEVEL=max
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=你的密钥
ANTHROPIC_API_KEY=你的密钥
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

默认不启用代理。只有明确需要时才配置：

```bash
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
```

本地密钥文件必须保持 git 忽略，不要提交真实密钥。
