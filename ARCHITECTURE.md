# Architecture

## Principles

1. One bot maps to one agent.
2. No automatic routing.
3. Agent definitions live under `system/agents/`.
4. Group chats do not share runtime sessions.
5. Group chats only share message records and summaries.
6. `private`, `group`, and `scheduled` sessions are all isolated.
7. Scheduled tasks are internal events that enqueue work into the same queue as chat messages.
8. Permission interaction is not used; runtime boundaries are enforced by Claude native sandboxing.
9. Messages within 60 seconds merge only into the first pending task that has not started execution.
10. Once a task starts processing, later messages must become new tasks.

## Runtime Flow

```text
bridge event
  -> normalize
  -> resolve bot
  -> resolve agent
  -> resolve session
  -> enqueue
  -> immediate ack
  -> worker
  -> workspace projection
  -> Claude native sandbox (Seatbelt on macOS / bubblewrap on Linux)
  -> claude/codex runtime
  -> final delivery
```

## Directory Layout

```text
system/
  agents/
    dev/
    ops/
    design/
  skills/
    common/

users/
  <user_id>/
    MEMORY.md
    TODO.md
    LESSONS.md
    skills/
    overrides/

sessions/
  private/
    <user_id>/<bot_id>/
  group/
    <group_id>/<user_id>/<bot_id>/
  scheduled/
    <schedule_id>/<bot_id>/
```

## Skill Resolution

```text
user > agent > common
```

Only the selected agent prompt and selected skills are projected into the session runtime view.
