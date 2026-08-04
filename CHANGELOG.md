# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- **Requires Basecamp CLI v0.8.1+** (was tested against v0.7.2). See below for why.

### Fixed

- `list_todos`: removed the client-side `--status` filter workaround. CLI v0.7.2 silently ignored `todos list --status`; fixed upstream in v0.8.0 (basecamp-sdk `TodoListOptions.Completed` migration). The tool now passes `--status` straight through to the CLI, which restores pagination (`--limit`/`--page`) when filtering by status — previously disabled as a side effect of the workaround.
- `list_todos`: fixed a new correctness bug introduced by CLI v0.8.0's "bound account-wide listings" change. Calling `todos list` with no `--in` project now returns results grouped by project bucket (`data: [{ bucket, todos: [...] }]`) instead of a flat todo array. Unhandled, this made unscoped `list_todos` calls undercount results and made unscoped status filtering (e.g. "list completed todos everywhere") silently return zero results. The tool now flattens the bucket-grouped shape before counting/filtering. Project-scoped calls (`--in project`) were already flat and unaffected.
- `search`: removed the dead zero-match-fallback workaround. CLI v0.7.2's search API returned up to 10,000 items with exit code 0 for queries with no real matches (indistinguishable from real results without inspecting titles). Fixed upstream in v0.8.0 (CLI PR basecamp/basecamp-cli#557); verified against 5 edge-case queries (nonsense terms, emoji, single character, empty string) before removing the detection code.

### Documentation

- README: bumped the Basecamp CLI requirement to v0.8.1+.
- AGENTS.md: `--comments` / `--all-comments` / `--no-comments` flags on typed show commands, previously documented as missing from CLI v0.7.2, are now present as of CLI v0.8.0. Note that with `--json` output, comments are still opt-in (`--comments` must be passed explicitly).

### Notes for future upgrades

- Not yet verified against CLI v0.8.1: whether `cards steps <card_id>` still requires an explicit `--project` (no auto-resolve), and whether `cards step show` still doesn't exist. No card data was available to test against at the time of this change.
- No usage found in this codebase of other CLI v0.8.0 breaking changes: removed shortcut commands, `templates --status` (rescoped to the `list` subcommand), `messagetypes`/bump-range surface changes, or the dropped account-wide boost aggregate.
