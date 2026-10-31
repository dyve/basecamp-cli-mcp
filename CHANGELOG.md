# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Verified correct, not a bug (maintenance pass, CLI v0.21.0 → v0.22.0 — all 4 commits and the SDK range read, every invocation's flags swept against `--help`, core tools smoke-tested)

- v0.22.0 only adds commands: `timesheet entry create/show/update/delete` (basecamp-cli#982), and `hillcharts updates` / `hillcharts updates show` / `hillcharts update --dot --note --notify` (#990, #991). The CLI's `.surface` file gains 258 lines and loses none. No tool calls `timesheet` or `hillcharts` directly; `basecamp_run ["timesheet", "report", …]` still works.
- basecamp-sdk v0.32.0 → v0.34.0: MIGRATING.md lists only additive hill chart operations, plus an optional `versions_url` on `HillChart`.
- The flag sweep found nothing missing (its hits were the known false positives: enum literals, and flags belonging to a sibling call in the same tool). All 60 tools register; `list_projects` (total 132), `list_todos`, `search` and `show_project` return the expected shapes.

### Not wired up (CLI v0.22.0)

- Timesheet entry writes and hill chart progress updates. Under the retirement plan this server gets fixes only. `basecamp mcp` serves the hill chart reads and posts (`list_hill_chart_versions`, `get_hill_chart_version`, `create_hill_chart_version`), and both are reachable here through `basecamp_run`.

### Changed (CLI v0.22.0)

- README floor set to v0.22.0, the version verified against. Nothing here requires it.

### Fixed (maintenance pass, CLI v0.19.0 → v0.21.0 — all 12 commits and the SDK range read, every invocation's flags swept against `--help`, affected paths live-tested in Sandbox)

- **The CLI's error hint was dropped.** The error envelope carries a `hint`, often the exact recovery command, and `describeCliError` ignored it. It matters more since v0.20.0 (basecamp-cli#981): a write whose assignee Basecamp drops (a column ID, someone outside the project) now saves the record and then fails with `usage`, and the hint says how to assign it. Tool errors now append the CLI's hint after ours, and bulk failures carry it as `failed[].hint`. Verified: `update_card` with a column ID as assignee, and `assign_todos` with one valid and one invalid ID, which saved the valid assignee and kept the description and due date.

### Verified correct, not a bug (CLI v0.21.0)

- **Dropped assignees now fail (basecamp-cli#981).** `create_card`, `update_card`, `create_todo`, `update_todo` and `assign_todos` used to report success while Basecamp silently skipped an invalid assignee, and `cards update` could clear a card's real assignees. They now return an error, which our tools surface. The record is still saved, and the error says so and lists the assignees it was saved with.
- **Empty lists emit `"data": []` (basecamp-cli#979).** `todos list` with no to-dos used to omit `data`. `wrapPaginated` already read a missing `data` as empty, so `list_todos` on an empty project returned `count: 0, has_more: false` before and after.
- **Moves and copies (basecamp-cli#973, #985).** `cards move` gained `--to-project` and `--to-card-table`, and move/copy commands now refuse container flags they don't read. `move_card` and `move_cards` still send `--to`, `--position`, `--on-hold`, `--to-wormhole`, `--project` and `--card-table`, all still accepted. Moved a Sandbox card between columns with `--project` through both tools. The response shape (`{ id, column, status: "moved" }`) is unchanged.
- **Ping writes (basecamp-cli#970).** Basecamp now refuses generic recording writes on Campfire lines in a Ping. The CLI explains the 403 and names `chat delete`. This server only trashes through `recordings trash` in docs and tests, never on chat lines.
- **SDK v0.29.1 → v0.32.0.** MIGRATING.md lists only additive changes for v0.30–v0.32: recording move, copy and filing operations, and project logos. A flag sweep of every tool's CLI invocations against live `--help` found nothing missing.

### Not wired up (CLI v0.20.0–v0.21.0)

- Cross-project move and copy for cards, to-dos, to-do lists, messages, Docs & Files, columns, schedule entries, check-in questions and forwards (`… move --to-project`, `… copy`), `filings show`, and `projects logo set/remove`. Under the retirement plan this server gets fixes only; all of these are in `basecamp mcp` (`basecamp_recordings` move/copy since v0.21.0). Reachable here through `basecamp_run`.

### Changed (CLI v0.21.0)

- README floor set to v0.21.0, the version verified against. Nothing here requires it.

### Verified correct, not a bug (maintenance pass, CLI v0.18.1 → v0.19.0 — all 5 commits and the SDK range read, core tools smoke-tested)

- v0.19.0 bumps basecamp-sdk v0.28.1 → v0.29.1 (v0.29.0 never published a Go module). The SDK's Go changes are confined to `eventfeed`, which now renews the live event stream in band before its token expires, and the CLI change adds logging of that renewal to its connector. This server never calls the connector or the event feed. MIGRATING.md has no v0.29 section. The other CLI commit is a sqlite dependency bump.
- No flags, commands or response shapes changed. All 60 tools register; `list_projects` (total 132), `list_todos`, `search` and `show_project` return the expected shapes.

### Changed (CLI v0.19.0)

- README floor set to v0.19.0, the version verified against. Nothing here requires it.

### Verified correct, not a bug (maintenance pass, CLI v0.18.0 → v0.18.1 — both commits read, cached-read paths live-tested in Sandbox)

- v0.18.1 only bumps basecamp-sdk v0.28.0 → v0.28.1, which makes every typed GET revalidate against the CLI's ETag cache (`If-None-Match`, a 304 served from the cached body). Before, only the raw path and pages 2+ did. Three things could have broken here, and none did:
  - **Totals after a 304.** `has_more`/`total` read the CLI's "Showing X of Y" notice, built from `X-Total-Count`. Repeated `list_messages` and `list_projects` calls, the second answered from cache, kept `total: 2` and `total: 132`.
  - **Stale reads after a write.** Every GET still goes to the server, so a cache hit happens only when nothing changed. In Sandbox, `show_todo` right after `update_todo` and `complete_todos` returned the new title and `completed: true`.
  - **Parallel processes sharing one cache directory.** The SDK now writes each entry as one file renamed into place, fixing an ETag/body mismatch between concurrent writers that could serve an old body indefinitely. An 8-way `search` across projects, run twice, gave identical results with no warnings.
- No flags, commands or response shapes changed. New cache entries use `~/.cache/basecamp/responses/*.entry`; the old `*.body` files read as misses and are left in place.

### Changed (CLI v0.18.1)

- README floor set to v0.18.1, the version verified against. Nothing here requires it; v0.18.0 behaves the same apart from the cache.
- `@modelcontextprotocol/sdk` 1.32.1 → 1.32.2 (patch). `zod` 4 is available but stays on 3.25: a major bump gets its own branch.

### Fixed (full-code review, CLI v0.18.0 — every finding reproduced live or with a stub CLI, writes tested in Sandbox and cleaned up)

- **Paging advice led to calls the CLI refuses.** Every list tool said "increment the page param", but on v0.18.0 nearly every list command refuses `--page` above 1 ("only --page 1 is supported; use --all") and `--page` with `--limit`. Measured on 16 commands: only account-wide `todos list` and `notifications list` still page. `page` is removed from the twelve tools where it could not work. `list_todos` keeps it account-wide only and refuses it otherwise. `next_page` now says to pass `all=true`. `has_more` now reads the CLI's own notice: "Showing 1 of 68" gives `has_more: true, total: 68`, and "more may exist" gives `true`.
- **`get_timeline` with `since` stopped at 100 events.** Its walk asked for `--page 2`, which the CLI refuses, so any window over 100 events ended with a warning. It now widens instead — the newest 100, 500, 2500, then everything — until the window reaches past `since`. Verified: 263 events since 2026-09-01 on a busy project, exactly what `--all` holds.
- **`get_timeline` with an unparseable `since` returned an empty, "complete" result.** `new Date("yesterday")` is invalid, every comparison was false, and the walk stopped at once. It is now refused, with nothing fetched.
- **Scoped `search` returned zero hits that exist.** `scopes` was never sent as `--type`: the CLI's default 20 hits of any type were fetched and filtered locally, so `scopes: ["document"]` gave 0 documents of 84. Each scope now runs its own CLI search with `--type`, gets its own limit, and keeps what the CLI files under that type: steps under cards, Google Docs under documents.
- **`search` with `project_ids` claimed completeness after 20 hits.** Each per-project search is capped at 20, but the merged result always said `has_more: false`. "en" in one project gave 20 of 89 with `has_more: false`. Every search, whether per scope or per project, now reports its own cut in `page.truncated` (`{ scope?, project?, shown, total }`). An empty `project_ids` now means no project filter, where it ran one search with a null target.
- **Unscoped `search` silently dropped result types.** Items were filtered to six known types, removing card steps, gauge needles, forwards, Google Docs and cloud files without changing the reported total. All results now pass through.
- **Text starting with "-" could not be posted.** Comment content, message, card and document titles and bodies, to-do content, step titles, chat lines, project names and search queries were passed as positionals, so "- item" (a Markdown list) or "-1, disagree" was read as flags and refused ("unknown shorthand flag"). User text now follows a `--` end-of-flags marker, and `runBasecamp` places `--json` before it. Verified in Sandbox through every affected tool.
- **`get_overdue_todos` matched assignee names by substring.** "an" matched "Dylan Verheul" and "Ilse Lanser" alike. A name or email is now resolved by `people show`, which reports an ambiguous or unknown name as an error, and matching is by person ID.
- **An expired token made every parallel call start its own refresh.** On an auth failure each call cleared the cached token on its own, so N parallel children ran N `auth token` processes — the keychain race the single-flight exists to prevent — and could discard a token another call had just fetched. Now a call clears the token only if it is still the one it used. Stub-tested with 8 parallel `complete_todos` against an expired token: 9 `auth token` runs before the fix, 2 after, and all 8 succeeded.
- **`list_cards` silently ignored `limit` without `column`** and returned every card (up to 100 per column). It is now refused, since the CLI does not accept it there either.
- **`list_schedule_entries` called a complete result possibly capped.** `schedule entries` fetches everything unless limited, so with no limit it now reports `has_more: false`.
- **`list_chat_messages` said it was paginated.** Chat has no `--page` and no `--all`. `has_more` now counts against the CLI's default of 25, and `next_page` says to raise `limit`.
- **Minor:** `update_project` with `description: ""` was silently ignored next to a name change. The CLI cannot clear a description (it reads an empty value as no field), so this is now refused with nothing changed. `get_project_overview` labelled completed to-dos "Open Todos".

### Verified correct, not a bug (full-code review)

- `lenient` mode refuses `{ ok: false }` envelopes. Error formatting, `collectResults`, `get_assignments`, `get_assigned_todos`, account-wide `list_todos` flattening, `browse_content` types, and all flags sent (checked against `--help`) are correct. `scripts/mcp-call.mjs` has no correctness bugs.
- The account-wide `timeline` returns no events on v0.18.0 while project timelines do. That is CLI behavior, not ours.

### Fixed (maintenance pass, CLI v0.17.0 → v0.18.0 — all 33 commits read, affected paths live-tested in Sandbox)

- **`delete_step` could trash any recording — a card, a to-do, a document.** `cards step delete` is a generic recording trash (`CardSteps.Delete` → `TrashRecording`) that checks no type. Given a card's ID, it trashed the card and reported `Deleted step #<id>`; verified live in Sandbox. An agent confusing a card ID with a step ID lost the card silently. `delete_step` now reads the recording's type with `show` first and refuses anything but `Kanban::Step`, with nothing deleted. Its description also said "permanently delete", but the step goes to the trash, where it can be restored.
- **Card URLs in the step tools are resolved by the CLI, not a local regex.** `list_steps`, `create_step` and `move_step` read the `card` URL with a regex that had fallen behind the CLI twice:
  - It only knew `3.basecamp.com`, so the API's `app_url` (`app.basecamp.com`), the link an agent is most likely to hold, failed with `Invalid card ID`. API (`3.basecampapi.com/….json`) and mixed-case URLs failed the same way.
  - It matched a prefix, so `…/cards/{card}/comments/{id}` and a `#__recording_` comment link acted on the card, and `cards/123abc` acted on card 123.
  
  The tools now call `url parse`, which follows the CLI's host and nesting rules (basecamp-cli#946 refuses nested items since v0.18.0), and accept only a plain card link: `/edit` and similar still resolve, while comment links, nested items and malformed IDs are refused. Verified in Sandbox on nine URL forms, with the URL alone supplying the project.

### Changed (CLI v0.18.0)

- README floor set to v0.18.0, the version verified against. Nothing here requires it.

### Verified correct, not a bug (CLI v0.18.0)

- **Who completed an item, and when** (basecamp-cli#942): `show_todo` now carries `completion`, `completer` and `completed_at` on completed to-dos and cards, where they were `null`. Passed through unchanged; verified in Sandbox.
- **Stricter URL resolution** (#946, #950): a URL naming another item, or a schedule occurrence URL given to a series action, is refused instead of acting on the parent. URL-taking tools pass URLs to the CLI, so agents get `Basecamp error [usage/exit 1]: Invalid todo ID` rather than a wrong target. `/dates/edit`-style suffixes still resolve. `parse_url` wraps `url parse` and inherits the change.
- **Rate limiting per request, not per operation** (#909): `search` with 15 `project_ids` returned 15/15 with no warnings in 1.2–2.3 s, against 3.1 s on v0.13.2. [#14](https://github.com/dyve/basecamp-cli-mcp/issues/14) is unchanged.
- **Credential changes** (#856, #959 and the keyring work, which bounds Linux keyring calls): `auth token` still prints one bare token line on stdout, so the `BASECAMP_TOKEN` single-flight is unaffected. The "Agent skill updated" banner goes to stderr.
- New, reachable via `basecamp_run` and not added under the retirement plan: `spotlight`/`unspotlight`, `projects wallpaper set|mode|remove`, `auth token --session-id`. `tools trash` now says it deletes or disables, never trashes.
- [basecamp-cli#895](https://github.com/basecamp/basecamp-cli/issues/895), [#896](https://github.com/basecamp/basecamp-cli/issues/896) and [#897](https://github.com/basecamp/basecamp-cli/issues/897) are still open with no response.

### Fixed (maintenance pass, CLI v0.16.0 → v0.17.0 — all 4 commits read, changed paths diffed, due dates live-tested in Sandbox)

- **A blank due date silently cleared an existing one.** `todos update --due "   "` removes a to-do's due date and reports success on v0.17.0. basecamp-cli#937 says the shared due-date parser it introduced rejects whitespace-only values; for `todos update` it does not. The tools passed any non-empty string through, so an agent sending `" "` lost the date without an error. All six due-date parameters (`create_todo`, `update_todo`, `assign_todos`, `update_card`, `create_step`, `update_step`) now refuse a blank value at the schema, before any CLI call. Verified: a to-do due 2026-12-24 went to `null` through the old path; with a stub CLI, blank values are refused with no call made, while `none` (→ `--no-due`) and `next friday` pass.

### Changed (CLI v0.17.0)

- README floor set to v0.17.0, the version verified against. v0.16.0 is enough for everything here; v0.17.0 itself adds nothing this server needs.

### Verified correct, not a bug (CLI v0.17.0)

- `update_todo` due dates on the new shared parser (#937): `next friday` → 2026-10-30, `2026-12-24`, and `none` all behave as before, and the description is untouched by each.
- `cards create --due` is new (#937). `create_card` has no `due` parameter, so a dated card still takes `create_card` then `update_card`. Not added: the retirement plan allows fixes only, and the gateway's `create_card` already takes `due_on`.
- The other commits are connector (#936), Nix/Ruby (#935) and release work (#938).
- [basecamp-cli#895](https://github.com/basecamp/basecamp-cli/issues/895), [#896](https://github.com/basecamp/basecamp-cli/issues/896) and [#897](https://github.com/basecamp/basecamp-cli/issues/897) are still open with no response.

### Fixed (maintenance pass, CLI v0.14.0 → v0.16.0 — all 10 commits read, changed paths checked against the v0.16.0 source, live tests in Sandbox)

- **`list_cards` reads the cap from `meta.truncated_columns`, not from the notice.** CLI v0.16.0 (basecamp-cli#933) adds `meta.truncated_columns` — `{ id, title, shown, total }` per column cut short — and makes the notice a diagnostic. Under `--json`, which this server uses, the notice still appears in the envelope, so the v0.14.0 fix was not broken. But any notice at all set `has_more: true`, which would misfire on unrelated warnings, and the agent got prose instead of column IDs. `has_more` now follows `truncated_columns`, `page.truncated_columns` passes it through, and `next_page` says to list those columns by `id` with `column`. Checked against a stub CLI (cut short, `all: true`, unrelated notice only) and live on a 308-card board. No column in this account is over 100 cards, so the real cap could not be triggered live.

### Changed (CLI v0.16.0)

- **Requires Basecamp CLI v0.16.0+** (was v0.14.0), for `meta.truncated_columns`. Without it, `list_cards` reports a capped v0.14/v0.15 listing as complete. v0.15.1 also builds with Go 1.26.10 for GO-2026-6809 (crypto/x509).

### Verified correct, not a bug (CLI v0.16.0)

- **Standalone URLs become embeds** (basecamp-cli#927). In Markdown rich text, a URL alone on its line is now embedded when Basecamp can embed it. URLs inside a sentence, list, quote, table or code, titled links, and anything sent with `format: "html"` are left alone. This applies to every rich-text tool with no change on our side. Verified in Sandbox with `create_todo`: a YouTube URL on its own line became an `embed/youtube-video` attachment, an inline URL stayed a link, and a title-only `update_todo` left the embed intact. Embedding never fails a post; a URL that can't be embedded stays a link.
- `embeds create|show` are new and reachable via `basecamp_run`. They are only needed for embeds in `format: "html"` content.
- The other commits are connector, CI and release work (#907, #920, #929, #931).
- `basecamp mcp`: the gateway gained the embed actions in its files domain. [basecamp-cli#895](https://github.com/basecamp/basecamp-cli/issues/895), [#896](https://github.com/basecamp/basecamp-cli/issues/896) and [#897](https://github.com/basecamp/basecamp-cli/issues/897) are still open with no response, so the retirement blockers stand.

### Fixed (maintenance pass, CLI v0.13.2 → v0.14.0 — all 17 commits read, changed invocations re-verified against live `--help`, `list_cards` run live and against a stub)

- **`list_cards` without `column` claimed completeness on a capped listing.** Since CLI v0.14.0 (basecamp-cli#919) `cards list` without `--column` reads at most 100 cards per column — a Done column keeps every card ever finished — and names the columns it cut short in the envelope's `notice`. The tool hard-coded `has_more: false` for that case and `wrapPaginated` dropped `notice`, so an agent was told a truncated board was complete. `has_more` now follows the notice, `all: true` passes `--all` (which lifts the cap), and the description says so. Verified live on a 306-card board with no column over 100 (`has_more: false`, no notice) and with a stub emitting the cut-short notice (`has_more: true`, notice passed through).
- **Every list tool now passes the CLI's `notice` through as `page.notice`.** It was discarded. The CLI already used it for truncation warnings with totals — `list_projects` with `limit: 2` now says "Showing 2 of 132 results".
- **`scripts/mcp-call.mjs` printed "server exited (code null) before answering" after a successful answer** when the result took long enough to flush. The exit handler logged before checking the `finished` guard added in the previous pass; exit codes were already correct.

### Changed (CLI v0.14.0)

- **Requires Basecamp CLI v0.14.0+** (was v0.13.2) — the version verified against. Older CLIs still work: they do not cap `cards list`, so they never send the notice.

### Verified correct, not a bug (CLI v0.14.0)

- `post_chat_message`: since basecamp-cli#921 a message that is HTML from end to end is refused without `--content-type`. The tool sends none, and the refusal reaches the agent as `Basecamp error [usage/exit 1]: this message is HTML, which plain text would show as tags` — explicit, nothing posted. Left as is: passing `text/plain` would post the tags, and the description already says chat is plain text.
- basecamp-cli#916 changes how a numeric `--in`/`--project` resolves (no `/projects.json` walk, IDs canonicalized). Faster for every project-scoped tool; no argument or shape change.
- basecamp-cli#910 only rewords `cards move --to` help: it accepts any column in the project, on any card table. `move_card(s)` already pass the column through.
- `basecamp mcp` gained Pings and `update_boost`; [basecamp-cli#895](https://github.com/basecamp/basecamp-cli/issues/895) and [#896](https://github.com/basecamp/basecamp-cli/issues/896) are still open with no response, so the retirement plan's blockers stand.

### Still not wired up as dedicated tools (CLI v0.14.0)

- `pings list|show|start|messages|post|upload` (private conversations, basecamp-cli#913) and `boost update` (#917). Reachable via `basecamp_run`; the gateway covers both.
- The `connect` agent-connector commits (#850–#852, #877, #879, #914, #915, #918) — out of scope for a tool server.

### Fixed (maintenance pass, CLI v0.9.1 → v0.13.2 — full commit range read, every invocation re-verified against live `--help`, parsing tools run end to end, Sandbox for writes)

- **`move_step` was off by one.** Step positions are 1-based since CLI v0.12.0 (basecamp-cli#791: `CardStepsService.Reposition` refuses 0, because bc3 always counted from 1). The tool described itself as "0-indexed", so 0 failed and any other value landed one slot low. Description corrected and the schema enforces `min(1)`. Verified in Sandbox: steps A, B, C; moving C to 1 gives C, A, B; 0 is rejected before the CLI is called.
- **`get_overdue_todos` with `assignee: "me"` always returned nothing.** It read the caller's id from `basecamp me`, which returns `{ identity, accounts }` — no top-level `id`, so every assignee was compared with `"undefined"`. `identity.id` would not have helped either: it is the Launchpad identity, not the account person that appears in `assignees`. Now uses `people show me`. Verified: 27 items, all assigned to the caller, matching exactly the 27 to-dos in `get_assignments` scope `overdue` (its remaining 13 are cards and card steps, which `reports overdue` does not cover). Possibly older than this range; it was never exercised with `me`.
- **`search` offered sort values the CLI does not have.** The enum was `created_at | updated_at`; `search --sort` takes `relevance | recency`. Both old values were silently accepted and taken as `recency` — identical result order, verified — so an agent could not get what it asked for and could not tell. Enum is now `relevance | recency`.
- **`list_notifications` sent agents paging for unreads that paging never returns.** Since CLI v0.12.0 (basecamp-cli#799) `--page` pages READ notifications only, every page repeats the same unreads, and the server caps unreads at 100. The tool's "increment page" note made an agent replay the same 100 unreads indefinitely — and this account sits at the cap. The description now says what paging covers, and `page` carries the CLI's new `unreads_capped` with a note when it is true.
- **`post_chat_message` claimed Markdown support.** Campfire lines are sent as plain text; only an @mention promotes a line to rich text (`chat post --help`). Description corrected.
- **`scripts/mcp-call.mjs` truncated piped output at ~64 KB.** `process.exit()` ran straight after `console.log`, and writes to a piped stdout are asynchronous, so any large result (`list_notifications`, `get_overdue_todos`) arrived cut off mid-string when piped while a redirect to a file was complete. It now exits from the callback of an empty write, after every earlier write has flushed, behind a guard so the killed server's exit event cannot report a failure meanwhile.

### Added (CLI v0.13.2)

- **`format: "markdown" | "html"` on the ten tools that send rich text** — `create_todo`, `update_todo`, `create_message`, `update_message`, `create_card`, `update_card`, `add_comment`, `create_document`, `update_document`, `replace_upload`. Since CLI v0.12.0 (basecamp-cli#832) rich text is always read as Markdown unless `--format html` says otherwise; content containing HTML used to be passed through untouched. Verified in Sandbox: an HTML body written back without the flag had indented lines turned into a code block, `*x*` into italics, `# x` into a heading and `1. x` into a list; with `format: "html"` it is stored byte-identical. Omitting `format` keeps the CLI default, so existing calls are unchanged. A title-only `update_document` with `format` set still leaves the body intact.
- **`retryable` from the CLI's error envelope** (CLI v0.10.0+, basecamp-cli#665). Tool errors gain `, retryable` in their label when the CLI classifies the failure as transient; bulk failures become `{ id, reason, retryable }`. `false` is passed through in the structured shape but never printed, because the CLI defines it as "no known reason a retry would help", not permanence. `collectResults` now uses `describeCliError` instead of its own copy of the stdout/stderr parsing. Verified with a real `not_found` (`false`) and a stub CLI emitting a `rate_limit` envelope (`true`, in both shapes).

### Changed (CLI v0.13.2)

- **Requires Basecamp CLI v0.13.2+** (was v0.9.1). The behaviors this release depends on — 1-based step positions, `--format`, `unreads_capped` — arrived in v0.12.0; v0.13.2 is the version verified against, and v0.13.1/v0.13.2 carry Go standard-library and `golang.org/x/net` security fixes (GO-2026-6617 and others) plus an OAuth fix for fake-IP DNS networks.
- `@modelcontextprotocol/sdk` 1.30.0 → 1.32.1. The 1.31–1.32 changes (OAuth issuer binding, same-origin HTTP redirects, opt-in `maxToolInputElements`/`expectedResource`) do not touch the stdio transport or `server.tool`. `npm audit fix` cleared five new transitive advisories on the SDK's HTTP-server side (`proxy-addr`, `qs`, `ip-address`), unreachable on stdio; `npm audit` reports 0. `zod` stays on 3.x — the SDK still allows `^3.25 || ^4.0`, and a major bump across every schema is its own change. SDK 2.x exists (2.3.1) and is likewise its own decision.

### Verified correct, not a bug (CLI v0.13.2)

- Every flag every tool sends exists on v0.13.2, checked mechanically with one `--agent --help` dump per invocation; positional arguments unchanged. No tool used anything removed in the range: `timeline --watch` (gone, basecamp-cli#646), `chat delete` (now needs `--force` in machine mode, #654).
- Response shapes unchanged for every tool that reshapes output: account-wide `todos list` (bucket grouping), `assignments` (priorities/non_priorities), `reports assigned`, `reports overdue` (lateness buckets), `reports schedule` (`assignables`, `schedule_entries`, `recurring_schedule_entry_occurrences`), `timeline` with and without `since`, `notifications list` (one additive field, `unreads_capped`).
- `search --project` is genuinely applied, not an inherited flag the subcommand ignores (the `reports overdue` trap): 50 hits globally, 0 for one project. A nonexistent project ID also returns 0 with `ok: true` rather than `not_found` — CLI behavior, not ours.
- Parallel fan-out above the CLI's 10-process limit now queues instead of failing (basecamp-cli#712, v0.12.0): 15-way `search` across 15 projects returned 15/15 in 3.1 s. See [#14](https://github.com/dyve/basecamp-cli-mcp/issues/14) for what is still unbounded.
- The `BASECAMP_TOKEN` single-flight in `runBasecamp` is kept. Upstream fixed a keyring probe race (basecamp-cli#661) and added a cross-process credential lock (#720), which may make it unnecessary, but that was not re-measured — and AGENTS.md forbids removing it without that.
- `cards steps` now reads every step past the 100 a card embeds (basecamp-cli#819); `list_steps` passes it through and benefits with no change.
- Affects `basecamp_run` callers only: a bare group with a stray positional (`cards 12345`) is now a usage error instead of a silent exit-0 help screen (#678), and `comments`/`recordings trash` given a comment link now act on the comment rather than its parent (#813).

### Still not wired up as dedicated tools (CLI v0.13.2)

New in v0.10.0–v0.13.2, reachable via `basecamp_run`, triaged rather than added (scope policy). Tracked with the older entries in [#8](https://github.com/dyve/basecamp-cli-mcp/issues/8).

- `files move <id> --to <folder>` — moves a document, upload or folder within a project, keeping ID, URL and comments. Strongest candidate for a tool.
- `subtasks list|show|create|update|complete|uncomplete|move|delete` — subtasks on to-dos as well as cards, account-scoped. Overlaps the card-step tools; deciding between extending those and a parallel set is its own change.
- `messages create|update --category`, `messages update --no-category` — message types by ID or name.
- `bubble-up add|remove`, `profile` editing, `people clients add|remove|invite|enable|disable`, the to-do list template library and `templates construct --start-date`, the account event feed (`events`, `inbox`, stream tickets).
- `basecamp mcp` — the CLI's own MCP server (15 domain tools over 247 operations, `--read-only`, `--domains`). Not a command to wrap, but it overlaps this project's purpose; whether this server narrows to what it adds (pagination signal, bulk partial-success, scoped search) is an open question, not a maintenance item.
- `auth agent connect`, `connect` — agent-identity and connector setup, out of scope for a tool server.

### Changed

- **Every CLI invocation now uses the canonical flag and command form** ([#6](https://github.com/dyve/basecamp-cli-mcp/issues/6)). 36 uses of `--in` became `--project`, and `create_document` / `update_document` moved off the `docs` command tree onto `files`. AGENTS.md has forbidden aliases since 2026-08-05 on the grounds that they are likelier than group nouns to be removed between versions — the v0.8.0 shortcut removal broke six tools this way — but the rule was documentation-only and unenforced until now. Nothing was broken before this change; it removes a class of breakage rather than fixing one.

  Not a blind rename. All 30 subcommands that were receiving `--in` were checked against live `--help` first: every one accepts `--project`, and every one reports `--in string  Project ID (alias for --project)`. The `docs` → `files` move was verified by diffing the two trees' help output — they are two separately registered trees with identical subcommands, not one cobra alias (`basecamp files --help` says `ALIASES: files, file`; `basecamp docs --help` says `ALIASES: docs, documents`), and only `files` appears in the top-level `basecamp --help`, which is what makes it canonical.

  Also updated five `--in` occurrences inside tool descriptions, where `basecamp_run` examples for `cards wormholes list`, `checkins questions`, `webhooks list` and `forwards list` were teaching agents the alias form. `--project` verified on all four.

  Spot-checked live per command group rather than per site: 13 read tools (todos, todolists, messages, cards, card columns, files, documents, uploads, schedule, chat, `browse_content`, `get_project_overview`, `get_timeline`), then the write paths — `create_document`, `create_todo`, `create_message`, `create_card`, `update_document`, `create_step`, `list_steps`, `add_comment`, `list_comments`, `post_chat_message`, `move_card`, `complete_todos`, `reopen_todos`, `update_todo`. `update_document` through the renamed `files update` still does a merge-safe partial update: a title-only change left the body intact. Test data trashed afterward; sandbox verified clean.


### Fixed (maintenance pass, CLI v0.9.1 — every invocation re-verified against live `--help` + sandbox)

- **Parallel operations were mostly failing with a spurious auth error.** Concurrent `basecamp` processes race reading stored OAuth credentials from the macOS keychain: exactly one wins and the rest exit `{"code":"auth_required","error":"credentials not found for https://3.basecampapi.com"}`. Measured against CLI v0.9.1 with a valid token 7h from expiry: **7 of 8 failed at 8-way fan-out, 1 of 2 at 2-way, 0 of 4 sequential** — so the failure rate scales with the fan-out, and every parallel path in this server was affected: `complete_todos`, `reopen_todos`, `assign_todos`, `move_cards`, `mark_notifications_read` (all `Promise.allSettled`) and `search` with `project_ids` (parallel per-project calls). This is also the true root cause of the `get_assignments` failure rate recorded in the v0.8.1 pass below (4/161 succeeded), which was attributed there to enrichment volume alone. `runBasecamp` now fetches the token once via `basecamp auth token` behind a single-flight promise and passes it to every child through `BASECAMP_TOKEN`, which skips the keychain entirely — the mechanism the CLI documents for this (`basecamp auth token --help`). Verified: 8/8 concurrent CLI calls and 8/8 concurrent `list_projects` tool calls succeed, and a 4-ID `complete_todos` returns all four in `succeeded`. A cached token that outlives its expiry is indistinguishable from having none, so an auth failure clears the cache and retries exactly once; `BASECAMP_TOKEN` already set in the environment is respected and never overwritten. Note the token now reaches child processes via their environment instead of the keychain — the same trust boundary, since any process running as this user could already read it.
- **`list_notifications` failed for any `page` above 1** with `{"error": "Unknown option: --page", "code": "usage"}`. Bare `basecamp notifications` has no `--page` flag; the `notifications list` subcommand does (`notifications list --help` states it is "same as bare 'notifications'", making the bare form an alias — precisely the pattern AGENTS.md's "No CLI aliases" rule exists to avoid). Now calls `notifications list`. `mark_notifications_read` was already correct: `notifications read --page` is a real flag.
- **`runBasecamp` set no `maxBuffer`, leaving Node's 1 MB `execFile` default in force.** Measured against this account: `projects list --all` already returns 479 KB, `notifications list` 415 KB, `todos list --all-projects` 370 KB, `reports overdue` 346 KB. A larger account or a wider `search` crosses 1 MB, at which point `execFile` throws `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` and the tool reports an opaque "Basecamp error" — a truncation-shaped failure blamed on Basecamp, against this project's "no silent failure" design goal. Raised to 10 MB, matching the MCP stdio transport's own `ReadBuffer` ceiling (new in SDK 1.30.0): a response larger than that cannot reach the client regardless.
- `get_schedule`: description said "upcoming schedule entries", but `reports schedule` returns `data: { assignables, schedule_entries, recurring_schedule_entry_occurrences }` — `assignables` are dated todos and cards, not calendar events. An agent reading the old description would treat the response as a flat entry list. Corrected; the tool itself passes the response through unchanged and needed no code change.

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

- **Requires Basecamp CLI v0.9.1+** (was v0.9.0). It is the floor because `list_upload_versions` and `replace_upload` wrap commands that do not exist before it, and because exit codes 9 (`validation`) and 10 (`limit_exceeded`) are only distinguishable from `api_error`/7 there. v0.9.1 also absorbed basecamp-sdk v0.13.0 → v0.14.0, whose partial-update semantics affect `update_document` and `update_step`; both verified below. Its GitHub release notes list only two PRs and do not mention the SDK bump at all — the commit range does. (The v0.9.0 auth-scope change is recorded under that version below.)
- `@modelcontextprotocol/sdk` 1.29.0 → 1.30.0, plus `npm audit fix` for transitive advisories in the SDK's HTTP-transport dependencies (`hono`, `ip-address` via `express-rate-limit`, `qs`). None were reachable on stdio, but all are resolved in-range; `npm audit` now reports 0 vulnerabilities. `zod` deliberately left at 3.25.76 — 4.4.3 is available and SDK 1.30.0 permits `^3.25 || ^4.0`, but a major bump across every tool schema is its own change, not a maintenance-pass rider.

### Verified correct, not a bug (CLI v0.9.1)

- **`update_document` partial updates are merge-safe in both directions** — the destructive case the SDK v0.14.0 migration notes warn about (a field becoming a pointer, so a title-only update nulls the body). Live-tested: title-only update preserved the body, content-only update preserved the title, both confirmed by re-reading the document afterward. Clearing both fields at once is now a clean local usage error ("Cannot clear both --title and --content at once"), and passing neither yields "No update fields specified".
- **`update_step` preserves `due_on` across a title-only update** (`UpdateStepRequest.DueOn` became a pointer, nil = leave alone). Live-tested against a step created with `--due 2026-09-15`; the date survived a title change.
- The new exit codes (422 → 9 validation, 507 → 10 limit_exceeded, previously both collapsed to 7) break nothing on their own — `runBasecamp` never inspected exit codes. They did, however, need handling, which is what the exit-code audit above adds: because the CLI reports *every* failure as JSON on stdout, discarding the code left `lenient` mode unable to tell a failure from an empty result.
- All 57 distinct `group subcommand` invocations in `src/index.js` exist on v0.9.1, and every flag each tool sends appears in that subcommand's live `--help` (checked mechanically, one help dump per invocation). Positional arguments re-confirmed by hand for the commands that take them — `todos create <content>`, `messages create <title> [body]`, `cards create <title> [body]`, `comments create <id> <content>`, `docs documents create <title> [content]`, `cards step create <title> --card`, `cards step update <id> [title]`, `todolists create <name>`, `projects create <name>`, `url parse <url>`, `reports assigned [person]`.
- `comments thread` still exists despite v0.9.1 deleting the SDK's `FetchCommentThread` and the `Recordings().Get` it called — the command was rerouted, not removed.
- `cards step show` is still absent (re-confirmed on v0.9.1) — `cards steps <card_id>` plus a client-side filter remains the only way to read one step.
- Not reachable except through `basecamp_run`, so nothing here to break, but worth knowing the semantics moved: `schedule create`/`update` (pointer fields; timestamps now revalidated locally as RFC 3339 or a bare date), `gauges list` (options and result wrappers), `todolists groups update` (routed to the merge-safe todolists endpoint), `webhooks update` (an all-blank `--types` no longer serializes as an empty list that clears the subscription roster), and `files update` on an upload (`UpdateUploadRequest.Description` is now a pointer).

### Still not wired up as dedicated tools (CLI v0.9.1)

Reachable today via `basecamp_run`, listed so a future pass knows they exist. `files versions` and `files replace` have moved off this list — they are now `list_upload_versions` and `replace_upload`. The list is now also tracked as issue [#8](https://github.com/dyve/basecamp-cli-mcp/issues/8), since keeping it only in a released changelog section is what let it drift.

- `files uploads create` — creating an upload, the natural companion to `replace_upload` ([#7](https://github.com/dyve/basecamp-cli-mcp/issues/7))
- `cards wormholes list/create/update/delete` — needed to discover valid `to_wormhole` targets for `move_card`
- `cards list --all-projects` — account-wide Kanban card listing with its own assignee/due/unassigned filters
- `todos list --all-projects` / `--due <with|without|overdue>` / `--unassigned` / `--no-due-date` — account-wide server-side filters
- `reports schedule --start` / `--end` — custom date window
- `comments list --all-projects`, `comments thread`
- `files list --all-projects --kind --person`
- `notifications bubbleups`, `notifications list --limit-bubble-ups`
- `docs documents create --visible-to-clients`
- top-level `assign` / `unassign` shortcuts

Standing backlog: [#8](https://github.com/dyve/basecamp-cli-mcp/issues/8).

### Known limitation, unchanged

- `update_document` and `update_todo` guard their optional fields with truthiness (`if (title)`), so an explicit empty string is dropped rather than forwarded. CLI v0.9.1 now supports clearing exactly one field via an explicit empty value, so "clear the document body" is a real operation this server cannot express. Left as-is deliberately: switching to `!= null` would make an agent that passes `content: ""` by accident destroy a document body, and the safer default is worth more than the missing clear. Callers needing it can use `basecamp_run`.

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
- Commands with no dedicated tool were catalogued in this pass; the list is maintained under "Still not wired up as dedicated tools (CLI v0.9.1)" above rather than duplicated here.

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
