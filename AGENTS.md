# basecamp-cli-mcp

**basecamp-cli-mcp** is a local MCP server that wraps the [Basecamp CLI](https://github.com/basecamp/basecamp-cli) so that Claude Desktop and Cowork can interact with Basecamp via MCP tools.

**The Basecamp skill** is the official skill that ships inside the same CLI repo (`skills/`). It guides Claude Code to use the CLI directly via bash — no MCP involved. Claude Code has terminal access; Claude Desktop and Cowork do not, which is why basecamp-cli-mcp exists.

## Scope policy

The baseline is parity with the Basecamp skill. Any tool that goes beyond that baseline is an **explicit extension** — a deliberate decision because the CLI supports it and it is useful in agent workflows. Current explicit extensions:

- **Card update** (`update_card`) — the official skill has create/move but not update
- **Card steps** (`list_steps`, `create_step`, `complete_step`, `uncomplete_step`, `update_step`, `move_step`, `delete_step`) — steps are structurally identical to todos and used for assigning subtasks on cards

Do not add extensions opportunistically. If the CLI supports something the official skill does not, make a deliberate decision before adding it.

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
| Update a card | `update_card` |
| List steps on a card | `list_steps` |
| Create a step | `create_step` |
| Complete a step | `complete_step` |
| Uncomplete a step | `uncomplete_step` |
| Update a step | `update_step` |
| Move a step | `move_step` |
| Delete a step | `delete_step` |
| Full project overview | `get_project_overview` |
| Schedule (single project) | `list_schedule_entries` |
| Schedule (cross-project) | `get_schedule` |
| Search | `search` |
| Recent activity | `get_timeline` |
| Chat | `post_chat_message` / `list_chat_messages` |
| Notifications | `list_notifications` / `mark_notification_read` |

### `basecamp_run` — last resort only

Use `basecamp_run` only for operations not covered by a specific tool: `gauges`, `lineup`, `check-ins`, `webhooks`, `subscriptions`, `templates`, cross-project `recordings`, `files`/`uploads`, `accounts`, schedule create/update, todos position/sweep, messages pin/publish.

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

Most tools accept either an ID or a Basecamp URL for their primary ID parameter — check the parameter description. Still call `parse_url` first when you receive a URL you haven't already parsed: it extracts `project_id` and other context you will typically need for other parameters.

### @mentions

Content fields (todo descriptions, messages, comments, chat) support Markdown and @mentions. Prefer `[@Name](mention:SGID)` — it requires no extra API calls and works deterministically.

### Project context

The CLI reads `.basecamp/config.json` in the current directory for a default `project_id` and `todolist_id`. When working inside a project repo, `--in` can often be omitted.

## CLI introspection

The CLI supports `basecamp <cmd> --agent --help` to get structured JSON describing subcommands and flags. Use this via `basecamp_run` if you need to discover flags for an operation not covered by a specific tool.

## References

- [Basecamp CLI](https://github.com/basecamp/basecamp-cli) — the official CLI this server wraps
- [Basecamp skill](https://github.com/basecamp/basecamp-cli/tree/main/skills) — the official skill this project mirrors, ships inside the CLI repo

## Source

Single file: `src/index.js`. All tools are registered with `addTool(name, description, schema, handler)`.
