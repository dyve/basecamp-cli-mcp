# basecamp-cli-mcp

**basecamp-cli-mcp** is a local MCP server that wraps the [Basecamp CLI](https://github.com/basecamp/basecamp-cli) so that Claude Desktop and Cowork can interact with Basecamp via MCP tools.

**The Basecamp skill** is the official skill that ships inside the same CLI repo (`skills/`). It guides Claude Code to use the CLI directly via bash — no MCP involved. Claude Code has terminal access; Claude Desktop and Cowork do not, which is why basecamp-cli-mcp exists.

## Primary goal

Full Basecamp API coverage as well-typed MCP tools with a consistent, agent-oriented interface. All tools are thin wrappers around the `basecamp` CLI binary — no business logic, no data transformation beyond what the CLI already provides.

The Basecamp skill is a reference point — useful for checking gaps and as an upstream PR target — but not the ceiling. This server goes beyond it deliberately.

## Design goals

**Consistent interface.** Every list tool returns the same pagination shape (`{ items, count, page: { has_more } }`). Every bulk operation returns the same partial-success shape (`{ succeeded, failed }`). Agents can rely on these shapes without inspecting individual tool responses.

**Explicit errors.** Never silent failure. When an operation partially fails, the response names which items failed and why. When a tool call is wrong (wrong ID type, unsupported operation), the error says so directly. Agents should never have to guess whether something worked.

**Speed.** Bulk operations run in parallel via `Promise.allSettled`. Per-project search runs one CLI call per project concurrently. No sequential loops where parallel is safe.

**No CLI aliases.** Always call the canonical `group subcommand` form and the full flag name (e.g. `todos create`, `--project`), never a shortcut or alias (e.g. bare `todo`, `--in`). Aliases are more likely to be deprecated or removed between CLI versions than the group noun they alias — the v0.8.0 removal of bare shortcuts (`todo`, `message`, `card`, `comment`, `done`, `reopen`) broke six tools that used them, while the group-noun forms (`todos create`, `todos complete`, etc.) were untouched. Canonical forms are also self-documenting in a diff or log, where an alias like `--in` reads ambiguously next to `--project`.

This is a documentation-only rule for new/changed code going forward — it is **not yet enforced retroactively**. As of 2026-08-05 the codebase still uses `--in` (alias for `--project`) throughout, and possibly other aliases not yet audited for this. Fixing that is a separate, larger cleanup, not bundled into this note.

## Scope policy

The baseline is parity with the Basecamp skill. Any tool that goes beyond that baseline is an **explicit extension** — a deliberate decision because the CLI supports it and it is useful in agent workflows.

Do not add extensions opportunistically. If the CLI supports something the official skill does not, make a deliberate decision before adding it.

## Explicit extensions over the official Basecamp skill

These features go beyond (or improve on) what the official `skills/basecamp/SKILL.md` documents. Candidates for an upstream PR are marked **[PR candidate]**.

### 1. Pagination metadata on every `list_*` response **[PR candidate]**

Every list tool wraps its response in `{ items, count, page: { has_more, [note] } }`.

- `has_more: false` when `--all` was used or count is less than the limit → safe to claim completeness
- `has_more: true` when count reached the limit → more exist, increment page
- `has_more: null` when no limit was specified → adds `note: "Use all=true to fetch exhaustively"`

**Why:** an LLM reading a raw list with no `has_more` signal will make false completeness claims ("you have 12 open todos") on a partial page.

### 2. Docs & Files write tools

The official skill covers read operations only. Added:

- `create_document` — creates a new document; supports draft, subscribe, folder placement
- `update_document` — updates title or content; accepts ID or Basecamp URL

### 3. `browse_content` — reliable type-based browsing **[PR candidate]**

Wraps `recordings list --type TYPE`. Unlike `search`, it is exhaustive for a given type and project — zero results means zero items, not a search miss.

### 4. Bulk operations with partial-success shape

`move_cards`, `complete_todos`, `reopen_todos`, `assign_todos`, and `mark_notifications_read` accept arrays and run in parallel via `Promise.allSettled`. Each returns `{ succeeded: [ids], failed: [{ id, reason }] }`.

`assign_todos` accepts a per-item shape `{ id, assignee_ids[], due_date? }` so each todo can have independent assignees and an optional due date update in one call.

### 5. `--comments` on show tools

`--comments` / `--all-comments` / `--no-comments` flags landed on typed show commands in CLI v0.8.0 (not present in v0.7.2). With `--json`, comments are still opt-in — pass `--comments` explicitly to get a `comments` field on the show response. `list_comments` remains the way to page through more than the default 100.

### 6. Card update and card steps

`update_card` and the full step lifecycle (`list_steps`, `create_step`, `complete_step`, `uncomplete_step`, `update_step`, `move_step`, `delete_step`) are not in the official skill reference.

`cards steps <card_id>` does not auto-resolve the project the way `todos show`/`cards show` do — an explicit `--project`/`--in` is required (confirmed still true on CLI v0.8.1). Our tools always pass it via `--in`. There is also no `cards step show` subcommand (confirmed still absent on v0.8.1) — the only way to get a single step's details is `cards steps <card_id> --in <project>` and filtering the returned array for the matching step ID (`type: "Kanban::Step"`).

### 7. Scoped and project-filtered search

Bare `search(query)` with no constraints regularly hits the 30-second timeout. The MCP applies a default limit of 20 and adds a `page.note` warning. Callers should supply explicit constraints:

- `scopes` — limit to content types; runs as a single CLI call with client-side grouping
- `project_ids` — parallel per-project calls, more resilient to timeouts
- `limit` — explicit bound as a last resort

Prefer `browse_content` when the content type is known.

### 8. No silent truncation in `show` commands

CLI `show` commands return full body fields. Verified at ~20 KB. No `truncated` signal needed.

### 9. Disambiguated tool descriptions

The MCP tool descriptions must disambiguate sibling tools from schema alone — an agent has no way to run `--agent --help` at decision time. Key disambiguation:

- `get_assignments` vs `get_assigned_todos`: self vs. any-person scope
- `list_messages` vs `list_chat_messages`: message board vs. Campfire chat
- `list_comments` / `add_comment`: explicitly names todos, messages, cards, documents, and uploads as valid targets

---

## Architecture

```
AI agent (Claude Desktop / Cowork)
    └── MCP tools (this server)
            └── basecamp CLI binary
                    └── Basecamp REST API
```

Single file: `src/index.js`. All tools registered with `addTool(name, description, schema, handler)`.

`scripts/mcp-call.mjs` is the only other executable — a dependency-free stdio MCP client for calling one tool by hand (`node scripts/mcp-call.mjs <tool> '<json>'`, or `--list`). Use it to verify a change end to end through the server rather than by running the CLI directly, which skips every wrapper this project exists to provide. It inherits `BASECAMP_BIN`, so a stub binary emitting a chosen error envelope and exit code covers the failure paths live data will not produce on demand.

## Key behaviors for agents

**Pagination:** every `list_*` response includes `page.has_more`. Do not claim completeness unless it is `false`.

**Output format:** default is `--json`. Pass `markdown: true` for human-readable output. Pass a `jq` expression to filter inline — do not pipe to external `jq`.

**URLs:** most tools accept an ID or a Basecamp URL. Call `parse_url` first when you receive a URL — it is local-only (pure regex, no API call). For non-project resources, `basecamp show <URL>` fetches in one call without a separate `parse_url` step.

**@mentions:** use `[@Name](mention:SGID)` — deterministic, no extra API calls.

**`basecamp_run`:** last resort for operations without a specific tool: gauges, lineup, check-ins, webhooks, subscriptions, templates, accounts, schedule create/update, todos position/sweep, messages pin/publish, timesheet, forwards, boost/reactions, attachments download. Do not pass `--json` or `--md` — appended automatically.

**CLI introspection:** `basecamp <cmd> --agent --help` returns structured JSON with subcommands and flags. Use via `basecamp_run` to discover flags for anything not covered by a specific tool.
