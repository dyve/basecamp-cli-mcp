# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added (CLI v0.9.1)

- `list_upload_versions`: lists every version of an uploaded file (`files versions`, new in CLI v0.9.1). Paginated like the other list tools; the CLI's no-limit default is "fetch everything" here too, so a bare call reports `has_more: false`. The description states what the items actually are, since it is easy to misread them as uploads: each item is a *version* — its `id` is a version ID (not the upload's), `download_url` points at that specific version, and exactly one item has `current: true`.
- `replace_upload`: publishes a new version of an existing upload from a local file (`files replace`, new in CLI v0.9.1). The upload keeps its ID, URL and comments, so a published link keeps working across releases. Nobody is notified. `description` is omitted from the CLI call when the param is absent (the existing description carries forward) and passed through when present, so an explicit empty string clears it — the endpoint's presence semantics, which a plain truthiness check would have collapsed. `base_name` renames without touching the extension.
- Creating an upload still has no dedicated tool; documented in AGENTS.md as `basecamp_run ["files", "uploads", "create", ...]`.

Both verified live against the sandbox project: create → `replace_upload` → `list_upload_versions` returned both filenames with exactly one current version, `base_name` applied, and the description confirmed to carry forward on omission and clear on an explicit empty string. Test upload trashed afterward.

### Fixed (CLI v0.9.1 exit-code audit)

- **`lenient` mode in `runBasecamp` silently turned failed calls into empty results.** The CLI prints its error envelope (`{ ok: false, error, code, meta: { request_id } }`) to *stdout*, not stderr, so the lenient path's "stdout parses as JSON → treat it as a payload" test accepted error envelopes as data. Since an error envelope has no `data` array, callers read it as zero items. Concretely: in scoped `search` across several projects, a project whose search failed was counted as searched with no hits and produced **no warning** — `scopes_searched` still listed every scope and `warnings` was empty. Lenient now returns the payload only when `ok !== false`, so genuine failures reach the existing per-project warning path. Verified end to end against a stub CLI emitting an error envelope with a nonzero exit, and confirmed a nonzero exit that still carries a usable payload (lenient's actual purpose) is still returned.
- **`get_timeline` with `since` reported a truncated walk as a complete one.** A failed page inside the sequential pagination loop was swallowed by a bare `catch { break }`, returning the events collected so far with `page.has_more: false` and no indication anything went wrong. Failures now append to a `warnings` array and set `page.has_more: true`.
- **Exit codes were discarded from every error message.** Tool errors dumped the raw JSON envelope. They now render as `Basecamp error [<code>/exit <n>]: <message>` with the `request_id` and, for the codes where the name alone isn't actionable (`auth_required`, `forbidden`, `ambiguous`, `validation`, `limit_exceeded`), a one-line remediation hint. New `describeCliError`/`formatCliError` helpers are shared by the tool-level catch, both `search` warning paths, and the `get_timeline` loop, replacing four copies of the `e.stderr || e.stdout || e.message` idiom.
- Added the full exit-code table, including `validation`/9 (422) and `limit_exceeded`/10 (507) — new in CLI v0.9.1, previously collapsed into `api_error`/7. Values verified against the CLI's `internal/output/codes.go` and the shared `basecamp/cli` `output/codes.go` at tag v0.9.1, plus live probes (`not_found`/2, `usage`/1).

### Changed

- **Requires Basecamp CLI v0.9.0+** (was tested against v0.8.1). CLI v0.9.0 also changed `basecamp auth login` against a Basecamp-hosted OAuth server to request `full` scope by default instead of a server-side read-only default (previously every write returned "access denied" for such logins) — this only affects new logins and is not something this MCP server's code can or needs to work around.

### Fixed (re-verified every CLI invocation against v0.9.0 `--help` and live data)

- **`list_cards`: pagination (`all`/`limit`/`page`) now hard-errors without a `column`.** CLI v0.9.0 requires `--column` whenever pagination flags are used on a project-scoped `cards list` (`{"error": "Pagination flags require --column"}`) — previously a bare call with no flags already returned every card across all columns in one shot. The tool now only forwards pagination flags when `column` is set; without a column it treats the (already-complete) result as `has_more: false` instead of erroring.
- **`get_assigned_todos`: `--assignee` is not a real flag on `reports assigned`.** Any call with a non-default `assignee` param threw `"Unknown option: --assignee"`. The person is a positional argument (`basecamp reports assigned [person]`); fixed to pass it positionally. Verified `reports assigned me` returns `{ data: { grouped_by, person, todos: [...] } }` with `data.todos` still a flat array (the existing parsing logic needed no other changes).
- **`get_overdue_todos`: the `project` param was silently a no-op.** `reports overdue --project <id>` is accepted by the CLI but ignored — it's only an inherited global flag, not consumed by the subcommand itself (confirmed: a bogus project ID returned the same unfiltered 81-item result as no filter at all). The tool now filters client-side by `item.bucket.id`/`item.bucket.name`, the same pattern already used for `assignee` filtering in this function, resolving a project name to an ID via the existing `resolveProjectIds` helper.
- `list_notifications`: tool description claimed the response shape was `{ data: { memories, reads, unreads } }`. There is no `memories` key on Basecamp 5 (that's BC4-only terminology) — actual shape is `{ reads, unreads, bubble_ups_count, scheduled_bubble_ups_count }`, and the Bubble Up items themselves aren't in this payload at all (counts only). Description corrected; added a pointer to `basecamp_run ["notifications", "bubbleups"]` for listing them.
- `list_projects`, `list_todolists`, `list_documents`, `list_uploads`, `list_people`: these subcommands' own `--help` states their true no-flag default is "fetch everything" (`0 = all`), not a capped page — `wrapPaginated` was labeling a complete result set as `has_more: null` with a "pass all=true to fetch exhaustively" note, prompting a wasted redundant follow-up call. Now treated as `all: true` whenever no `limit` is given. Left unchanged where the CLI default is genuinely a capped page: `list_messages`/`browse_content` (100), `list_chat_messages` (25, no exhaustive mode).

### Added

- `get_assignments`: added the `due_later` scope value, new in CLI v0.9.0 alongside the existing `overdue`/`due_today`/`due_tomorrow`/`due_later_this_week`/`due_next_week` (confirmed via `assignments due --help` and a live call).
- `move_card`: added `to_wormhole` (maps to `--to-wormhole`), new in CLI v0.9.0 for moving a card to a different *project* asynchronously via a wormhole ID or destination-column URL. Not added to the batch `move_cards` tool — wormhole moves are a distinct, rarer per-card action, not a column-move variant.

### Verified correct, not a bug

- `cards step update`/`cards step create`, `cards move --to`/`--position`/`--on-hold`, `cards step move`: all flags unchanged from v0.8.1. CLI v0.9.0's "presence-aware card step updates" / "stop echoing back unchanged step fields" changes (PRs #608, #620) only affect which fields appear in the *response* JSON on partial updates — since these tools pass the response straight through, there's nothing to break.
- `reports assigned --group-by project|date` (new in v0.9.0): confirmed grouping only adds a `grouped_by` label, `data.todos` stays a flat array either way — no parsing impact even though this tool doesn't expose the flag.
- `reports overdue` bucket keys (`over_a_month_late`, etc.), account-wide `todos list` bucket shape (`[{ bucket, todos }]`), `assignments`/`assignments due`/`assignments completed` shapes: all unchanged from v0.8.1.
- `docs` is confirmed a CLI-level alias for the `files` command tree (`ALIASES: docs, documents`) — `create_document`/`update_document`'s `["docs", ...]` invocations still resolve correctly.

### Audited and confirmed unaffected (CLI v0.9.0)

- `chat`, `checkins`, `webhooks`, `subscriptions`, `templates`, `gauges`, `lineup`, `accounts`, `hillcharts`, `cards wormholes` — only reachable via `basecamp_run`, no shape-specific logic to break.
- Not wired up as dedicated tools (all reachable today via `basecamp_run`, listed here so a future pass knows they exist): `cards list --all-projects` (account-wide Kanban card listing with its own assignee/due/unassigned filters, the card-table analog of the `todos list` account-wide filtering below), `todos list --all-projects`/`--due <with|without|overdue>`/`--unassigned`/`--no-due-date` (new account-wide, server-side filters), `reports schedule --start`/`--end` (custom date window), `cards wormholes list/create/update/delete` (needed to discover valid `--to-wormhole` targets), `comments list --all-projects`/`comments thread`, `files list --all-projects --kind --person`, `notifications bubbleups`, top-level `assign`/`unassign` shortcuts.

### Fixed

- `list_todos`: removed the client-side `--status` filter workaround. CLI v0.7.2 silently ignored `todos list --status`; fixed upstream in v0.8.0 (basecamp-sdk `TodoListOptions.Completed` migration). The tool now passes `--status` straight through to the CLI, which restores pagination (`--limit`/`--page`) when filtering by status — previously disabled as a side effect of the workaround.
- `list_todos`: fixed a new correctness bug introduced by CLI v0.8.0's "bound account-wide listings" change. Calling `todos list` with no `--in` project now returns results grouped by project bucket (`data: [{ bucket, todos: [...] }]`) instead of a flat todo array. Unhandled, this made unscoped `list_todos` calls undercount results and made unscoped status filtering (e.g. "list completed todos everywhere") silently return zero results. The tool now flattens the bucket-grouped shape before counting/filtering. Project-scoped calls (`--in project`) were already flat and unaffected.
- `search`: removed the dead zero-match-fallback workaround. CLI v0.7.2's search API returned up to 10,000 items with exit code 0 for queries with no real matches (indistinguishable from real results without inspecting titles). Fixed upstream in v0.8.0 (CLI PR basecamp/basecamp-cli#557); verified against 5 edge-case queries (nonsense terms, emoji, single character, empty string) before removing the detection code.
- `get_assignments`, `get_assigned_todos`, `get_overdue_todos`: fixed a long-standing field-semantics bug uncovered while re-testing these against v0.8.1 (unclear whether it predates this CLI version or was introduced by its `reports`/`assignments` reshuffle — verified only against the current shape). All three tools claimed "each item has a priority field (high/medium/low)", but no Basecamp endpoint has ever returned that. The actual shapes:
  - `basecamp assignments` (used by `get_assignments`, scope='all') groups into `priorities` (starred / added to Up Next) and `non_priorities` — renamed the field to `group` with these real values.
  - `basecamp reports assigned` (used by `get_assigned_todos`) returns a flat `todos` list regardless of `--group-by`; there is no per-item priority concept at all. Removed the fake grouping entirely — items are now returned as-is with no synthetic field.
  - `basecamp reports overdue` (used by `get_overdue_todos`) genuinely groups by lateness (`under_a_week_late`, `over_a_week_late`, `over_a_month_late`, `over_three_months_late`) — renamed the field to `lateness` with the real bucket names instead of fabricating high/medium/low.
  - Renamed the shared helper from `flattenPriorityGroups` to `flattenGroupedResponse(data, fieldName)` to reflect that it's a generic bucket-flattener, not priority-specific.

### Documentation

- README: bumped the Basecamp CLI requirement to v0.8.1+.
- AGENTS.md: `--comments` / `--all-comments` / `--no-comments` flags on typed show commands, previously documented as missing from CLI v0.7.2, are now present as of CLI v0.8.0. Note that with `--json` output, comments are still opt-in (`--comments` must be passed explicitly).

### Fixed (full source review, every CLI invocation re-verified against v0.8.1 `--help`)

- **`create_todo`, `complete_todos`, `reopen_todos`, `create_message`, `create_card`, `add_comment` were completely broken.** CLI v0.8.0 removed the bare shortcut commands (`todo`, `message`, `card`, `comment`, `done`, `reopen`) that shadowed their group nouns (PR basecamp/basecamp-cli#416) — the earlier audit for this CLI upgrade claimed "no usage found" of this breaking change, which was wrong; it checked for other breaking-change keywords but never actually tested these six tools end to end. All six now call the full subcommand instead (`todos create`, `todos complete`, `todos uncomplete`, `messages create`, `cards create`, `comments create`). Verified live against the sandbox project (create, complete/uncomplete, message, comment, card all round-tripped correctly; test data cleaned up afterward). `todos complete`/`uncomplete` accept multiple IDs in one call now, but batching was deliberately not adopted for `complete_todos`/`reopen_todos`: a mixed valid/invalid batch call returns only a summary string ("Completed 1, failed 1") with no per-ID error detail, which would silently degrade the `{ succeeded, failed }` contract these tools promise. Kept one CLI call per ID via `Promise.allSettled` instead.
- **`get_assignments` (default scope) was firing an unbounded per-item enrichment call and mostly failing.** Every item returned by `basecamp assignments` lacks a `created_at` field, which triggered a `todos show`/`cards show` subprocess per item to backfill it — 161 concurrent calls against this account's real data. Measured: unbounded concurrency succeeded on 4/161 calls (2.5%); even capped at 3 concurrent it took 25 seconds and still failed on 21/161. `created_at` was never part of this tool's documented output contract, so the entire enrichment mechanism (walk/enrich/inject, ~55 lines) was removed rather than just rate-limited — callers needing an exact timestamp for a specific item can call `show_todo`/`show_card` directly.
- `search`'s `resolveProjectIds` (used when `project_ids` contains project names rather than IDs) was calling `basecamp projects list --all` once per name instead of once per call — redundant CLI invocations when resolving multiple names. Now fetches the project list at most once per `search` call and resolves every name against it.
- Removed a leftover stale duplicate comment above `flattenGroupedResponse` from an earlier rename (the old `flattenPriorityGroups` docstring was never deleted when the function was renamed).

### Verified correct, not a bug

- `search --sort` accepting `created_at`/`updated_at` in this tool's schema looked wrong against `basecamp search --help` (which only documents `relevance`/`recency`) — live-tested and confirmed the CLI silently aliases `created_at`/`updated_at` to `recency` ordering (identical result order in both cases; a genuinely invalid value like `totallybogus` errors clearly). No change needed.
- Every other CLI invocation and flag in the file (all `cards`/`todos`/`messages`/`docs`/`files`/`schedule`/`chat`/`notifications`/`people`/`url`/`recordings`/`todolists`/`projects`/`comments` subcommands and their flags) was individually re-checked against live `--help` output on v0.8.1 — no further drift found.

### Audited and confirmed unaffected (CLI v0.8.1)

- Account-wide/cross-project listings other than `todos list` — `recordings list` (used by `browse_content`), `reports schedule`, `people list`, `projects list`, `timeline`/`timeline me` — all still return flat arrays or their existing wrapper shape; none picked up the bucket-grouping change that hit `todos list`.
- `cards steps <card_id>` still requires an explicit `--project`/`--in` (no auto-resolve) — confirmed still true on v0.8.1, our code already passes it correctly via `--in`.
- `cards step show` still does not exist as a subcommand on v0.8.1 — confirmed via `--help`; our code never assumed it did.
- `list_comments`' comment-vs-recording disambiguation (calls `comments show` as a fallback when `comments list` returns empty) — confirmed still functions correctly against v0.8.1.
- `chat`, `checkins`, `webhooks`, `subscriptions`, `templates`, `gauges`, `lineup`, `accounts` — these are only reachable through the generic `basecamp_run` passthrough tool, which has no shape-specific logic to break.
- `templates --status` (rescoped to the `list` subcommand), `messagetypes`/bump-range surface changes, and the dropped account-wide boost aggregate — no usage in this codebase.
