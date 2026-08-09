# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- **Requires Basecamp CLI v0.8.1+** (was tested against v0.7.2). See below for why.

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
