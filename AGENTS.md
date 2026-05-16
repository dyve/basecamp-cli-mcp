# basecamp-cli-mcp

**basecamp-cli-mcp** is a local MCP server that wraps the [Basecamp CLI](https://github.com/basecamp/basecamp-cli) so that Claude Desktop and Cowork can interact with Basecamp via MCP tools.

**The Basecamp skill** is the official skill that ships inside the same CLI repo (`skills/`). It guides Claude Code to use the CLI directly via bash — no MCP involved. Claude Code has terminal access; Claude Desktop and Cowork do not, which is why basecamp-cli-mcp exists.

## Scope policy

The baseline is parity with the Basecamp skill. Any tool that goes beyond that baseline is an **explicit extension** — a deliberate decision because the CLI supports it and it is useful in agent workflows.

Do not add extensions opportunistically. If the CLI supports something the official skill does not, make a deliberate decision before adding it.

## Explicit extensions over the official Basecamp skill

These are features available in this MCP server that go beyond (or improve on) what the official `skills/basecamp/SKILL.md` documents. Candidates for an upstream PR are marked **[PR candidate]**.

### 1. Pagination metadata on every `list_*` response **[PR candidate]**

Every list tool wraps its response in `{ items, count, page: { has_more, [note] } }`.

- `has_more: false` when `--all` was used or count is less than the limit → safe to claim completeness
- `has_more: true` when count reached the limit → more exist, increment page
- `has_more: null` when no limit was specified → add `note: "Use all=true to fetch exhaustively"`

**Why this matters:** an LLM reading a raw list with no `has_more` signal will make false completeness claims ("you have 12 open todos") on a partial page. The official skill documents `--all` and `--limit` but does not warn the LLM consumer about this risk.

**Upstream suggestion:** add an invariant to SKILL.md: "When listing items, never claim completeness unless `--all` was used or the result count is less than the limit. Always mention that results may be paginated."

### 2. Docs & Files as typed tools (not escape hatch)

The official skill covers `files list`, `files show`, `files download`, `files uploads create` in its reference section, but these are not wired into the MCP as specific tools — agents had to fall back to `basecamp_run`. Now exposed as:

- `list_files(project, folder?)` — lists everything in a folder (folders + docs + uploads)
- `show_file(id, project?, markdown?)` — reads any item: folder metadata, document body, upload details
- `list_documents(project, folder?, page?, limit?, all?)` — documents only, paginated
- `list_uploads(project, folder?, page?, limit?, all?)` — uploads only, paginated

### 3. `browse_content` — reliable type-based browsing **[PR candidate]**

Wraps `recordings list --type TYPE` as a first-class tool with explicit pagination.

The official skill documents `recordings <type>` in its reference section but frames `search` as the primary discovery path. In practice, `search` misses recently created content and cannot filter by type. `browse_content` is exhaustive for a given type and project — zero results means zero items, not a search miss.

**Upstream suggestion:** add to SKILL.md's Decision Tree: "If search misses known content, use `recordings <type>` — it is exhaustive for that content type and will not miss items."

### 4. Bulk operations with partial-success shape

`move_cards`, `complete_todos`, `reopen_todos`, `assign_todos`, and `mark_notifications_read` all accept arrays and run operations in parallel via `Promise.allSettled`. Each returns `{ succeeded: [ids], failed: [{ id, reason }] }`. The official skill documents only single-item operations.

`assign_todos` replaces `assign_todo` with a richer per-item shape: `{ id, assignee_ids[], due_date? }`, where each todo can have independent assignees and an optional due date update in the same call.

### 5. ~~`--comments` on show tools~~

The SKILL.md documents `--comments` / `--all-comments` / `--no-comments` flags on typed show commands, but these are not present in CLI v0.7.2. The MCP does not expose them. Use `list_comments` as a follow-up call to fetch replies.

### 6. Card update (`update_card`)

The official skill has create/move but not update. Added for completeness.

### 7. Card steps (`list_steps`, `create_step`, `complete_step`, `uncomplete_step`, `update_step`, `move_step`, `delete_step`)

Steps are structurally identical to todos and used for assigning subtasks on cards. Not covered in the official skill reference.

### 8. Scoped and project-filtered search

`search(scopes=[...])` returns `{ scopes_searched, hits_by_scope, warnings }` grouped by content type instead of a flat list. Implemented as a single CLI call with client-side grouping (the CLI search command has no `--type` flag). Non-scope types (`Gauge`, `Kanban::Step`, etc.) are silently dropped from results.

`search(project_ids=[...])` runs one search per project in parallel (using the CLI `--project` flag) and merges results. Per-project failures surface in `warnings` rather than aborting the search. Combining `scopes` and `project_ids` returns a merged scoped result across all specified projects.

### 9. No silent truncation in `show` commands

CLI `show` commands return full body fields. Verified at ~20 KB (200-line document and message). No `truncated` signal needed.

### 10. Disambiguated tool descriptions

The official skill's `--agent --help` output describes tools individually, but the MCP tool descriptions must disambiguate sibling tools from the schema alone (an LLM has no way to run `--agent --help`). Key disambiguation added:

- `get_assignments` vs `get_assigned_todos`: both return `{ items, count, page }` with `priority` field (high/medium/low) on each item; descriptions distinguish self vs. any-person scope
- `list_messages` vs `list_chat_messages`: descriptions now say "MESSAGE BOARD" vs "Campfire CHAT"
- `show_comment` vs `list_comments`: descriptions now state the relationship to parent recordings

---

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
| Complete one or more todos | `complete_todos` (returns partial-success shape) |
| Show a todo (with optional comments) | `show_todo` |
| List projects | `list_projects` |
| Show a project | `show_project` |
| Post a message | `create_message` |
| Show a message (with optional comments) | `show_message` |
| List comments on an item | `list_comments` |
| Show a single comment | `show_comment` |
| Add a comment | `add_comment` |
| List cards | `list_cards` |
| Create a card | `create_card` |
| Move one card | `move_card` |
| Reopen one or more todos | `reopen_todos` (returns partial-success shape) |
| Assign todos (per-todo assignees + due) | `assign_todos` (returns partial-success shape) |
| Move multiple cards | `move_cards` |
| Update a card | `update_card` |
| Show a card (with optional comments) | `show_card` |
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
| Browse Docs & Files folder | `list_files` |
| Read a document / file / folder | `show_file` |
| List documents (paginated) | `list_documents` |
| List uploads (paginated) | `list_uploads` |
| Browse content by type | `browse_content` |
| Full-text search | `search` |
| Recent activity | `get_timeline` |
| Chat | `post_chat_message` / `list_chat_messages` |
| Notifications | `list_notifications` / `mark_notifications_read` (bulk, partial-success shape) |

### `basecamp_run` — last resort only

Use `basecamp_run` only for operations not covered by a specific tool: `gauges`, `lineup`, `check-ins`, `webhooks`, `subscriptions`, `templates`, `accounts`, schedule create/update, todos position/sweep, messages pin/publish, timesheet, forwards, boost/reactions, tools (project dock), attachments download.

Do NOT pass `--json` or `--md` yourself — they are appended automatically.

```json
{ "args": ["gauges", "list"] }
{ "args": ["lineup", "list"] }
{ "args": ["checkins", "questions", "--in", "MyProject"] }
{ "args": ["attachments", "download", "123", "--out", "/tmp/"] }
```

### Output format

- Default: `--json` (structured, machine-readable — preferred for all agent use)
- Pass `markdown: true` to get `--md` output (human-readable, for display or document bodies)
- Pass a `jq` expression to filter JSON inline: `"jq": ".[].title"` — do not pipe to external `jq`

### Pagination

Every `list_*` response includes `page.has_more`:

- `false` → safe to claim completeness
- `true` → more pages exist; increment `page` param by 1
- `null` → unknown; the `page.note` field explains how to fetch exhaustively

Do not make completeness claims ("you have N items") unless `has_more` is `false`.

### Basecamp URLs

Most tools accept either an ID or a Basecamp URL for their primary ID parameter — check the parameter description. Call `parse_url` first when you receive a URL you haven't already parsed: it extracts `project_id` and other context.

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
