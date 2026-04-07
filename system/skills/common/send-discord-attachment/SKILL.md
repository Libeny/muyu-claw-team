# Send Discord Attachment

Use this skill when you need to send an image or other file back to the current Discord conversation.

Requirements:
- The file must already exist on disk.
- Prefer files inside the current workspace.
- Keep the optional message concise.

How to use:
1. Confirm the file path exists.
2. Run the helper script from this skill directory with Bash.
3. Pass one or more `--file` arguments.
4. Optionally pass `--content` for the message text.
5. Add `--mention` only if you explicitly want to mention the current user.

Command:

```bash
node ~/.claude/skills/send-discord-attachment/scripts/send-discord-attachment.mjs \
  --file "<path-to-file>" \
  --content "这里是生成结果"
```

Multiple files:

```bash
node ~/.claude/skills/send-discord-attachment/scripts/send-discord-attachment.mjs \
  --file "<file-a>" \
  --file "<file-b>" \
  --content "这里是两份附件"
```

Notes:
- The helper uses the current Discord bot token and channel context from environment variables injected by the runtime.
- This skill sends immediately. It does not queue files for a later turn.
