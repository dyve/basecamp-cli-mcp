# basecamp-cli-mcp

A local MCP server that wraps the official [Basecamp CLI](https://github.com/basecamp/basecamp-cli) to give Claude Desktop (and Cowork) the same Basecamp functionality as the [Claude Code basecamp skill](https://github.com/basecamp/skills).

## Architecture

```
AI agent (Claude Desktop / Cowork)
    └── MCP tools (this server)
            └── basecamp CLI binary
                    └── Basecamp REST API
```

All tools in this server are thin wrappers around the `basecamp` CLI. The server adds no business logic — it maps MCP tool calls to CLI invocations and returns the output.

## Running

```bash
node src/index.js
```

The server communicates over stdio (MCP standard). It is already configured in `~/Library/Application Support/Claude/claude_desktop_config.json`.

The `basecamp` binary is resolved via `BASECAMP_BIN` env var, or auto-detected from `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`.

## Tool design

### Use specific tools first

Always prefer the named tools over `basecamp_run`. The routing table:

| Goal | Use this tool |
|---|---|
| List todos (in a project) | `list_todos` |
| List todos (cross-project, yourself) | `get_assignments` |
| List todos (cross-project, any person) | `get_assigned_todos` |
| Overdue todos (cross-project) | `get_overdue_todos` |
| Create a todo | `create_todo` |
| Complete a todo | `complete_todo` |
| List projects | `list_projects` |
| Show a project | `show_project` |
| Post a message | `create_message` |
| List comments on an item | `list_comments` |
| Add a comment | `add_comment` |
| List cards | `list_cards` |
| Create a card | `create_card` |
| Move a card | `move_card` |
| Full project overview | `get_project_overview` |
| Schedule (single project) | `list_schedule_entries` |
| Schedule (cross-project) | `get_schedule` |
| Search | `search` |
| Recent activity | `get_timeline` |
| Chat | `post_chat_message` / `list_chat_messages` |
| Notifications | `list_notifications` / `mark_notification_read` |

### `basecamp_run` — last resort only

Use `basecamp_run` only for operations not covered by a specific tool: `gauges`, `lineup`, `check-ins`, `webhooks`, `subscriptions`, `templates`, cross-project `recordings`, `files`/`uploads`, `accounts`, schedule create/update, todos position/sweep, cards update/steps, messages pin/publish.

Do NOT pass `--json` or `--md` yourself — they are appended automatically.

```json
{ "args": ["gauges", "list"] }
{ "args": ["lineup", "list"] }
{ "args": ["recordings", "todos"] }
{ "args": ["checkins", "questions", "--in", "MyProject"] }
```

### Output format

- Default: `--json` (machine-readable)
- Pass `markdown: true` to get `--md` output (human-readable, for display)
- Pass a `jq` expression to filter JSON inline: `"jq": ".[].title"` — do not pipe to external `jq`

### Basecamp URLs

Always call `parse_url` first when you receive a Basecamp URL, before passing IDs to any other tool. Never pass a raw URL where an ID is expected — except to tools that explicitly accept URLs (e.g. `show_todo`, `show_card`).

### @mentions

Content fields (todo descriptions, messages, comments, chat) support Markdown and @mentions. Prefer `[@Name](mention:SGID)` — it requires no extra API calls and works deterministically.

### Project context

The CLI reads `.basecamp/config.json` in the current directory for a default `project_id` and `todolist_id`. When working inside a project repo, `--in` can often be omitted.

## CLI introspection

The CLI supports `basecamp <cmd> --agent --help` to get structured JSON describing subcommands and flags. Use this via `basecamp_run` if you need to discover flags for an operation not covered by a specific tool.

## References

- [Basecamp CLI](https://github.com/basecamp/basecamp-cli) — the official CLI this server wraps
- [Claude Code basecamp skill](https://github.com/basecamp/skills) — the skill this project mirrors for Claude Desktop

## Source

Single file: `src/index.js`. All tools are registered with `addTool(name, description, schema, handler)`.
