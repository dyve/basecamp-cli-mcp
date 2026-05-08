# basecamp-cli-mcp

**basecamp-cli-mcp** is a local MCP server that wraps the [Basecamp CLI](https://github.com/basecamp/basecamp-cli) so that Claude Desktop and Cowork can interact with Basecamp via MCP tools. It mirrors [the Basecamp skill](https://github.com/basecamp/basecamp-cli/tree/main/skills) — the official skill for Claude Code — and extends it where useful.

## Requirements

- Node.js 18+
- [Basecamp CLI](https://github.com/basecamp/basecamp-cli) installed and authenticated

## Setup

```bash
npm install
```

Add to your MCP client config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "basecamp": {
      "command": "node",
      "args": ["/path/to/basecamp-cli-mcp/src/index.js"]
    }
  }
}
```

## Tools

The server provides typed tools for the most common Basecamp operations:

- **Projects** — `list_projects`, `show_project`
- **Todos** — `list_todos`, `show_todo`, `create_todo`, `update_todo`, `complete_todo`, `reopen_todo`, `assign_todo`
- **Todolists** — `list_todolists`, `create_todolist`
- **Messages** — `list_messages`, `show_message`, `create_message`
- **Cards** — `list_cards`, `list_card_columns`, `show_card`, `create_card`, `move_card`, `update_card`
- **Card steps** — `list_steps`, `create_step`, `complete_step`, `uncomplete_step`, `update_step`, `move_step`, `delete_step`
- **Comments** — `list_comments`, `add_comment`
- **Chat** — `list_chat_messages`, `post_chat_message`
- **Assignments & reports** — `get_assignments`, `get_assigned_todos`, `get_overdue_todos`, `get_schedule`
- **Notifications** — `list_notifications`, `mark_notification_read`
- **Search** — `search`
- **Timeline** — `get_timeline`
- **People** — `list_people`, `get_me`
- **Auth** — `auth_status`
- **URL parsing** — `parse_url`
- **Project overview** — `get_project_overview`
- **Escape hatch** — `basecamp_run` (run any CLI command not covered above)

## Claude Code: skip permission prompts (optional)

If you use this server with Claude Code and want to stop being prompted for every Basecamp tool call, add the tools to your allowlist in `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__basecamp__add_comment",
      "mcp__basecamp__assign_todo",
      "mcp__basecamp__auth_status",
      "mcp__basecamp__basecamp_run",
      "mcp__basecamp__complete_step",
      "mcp__basecamp__complete_todo",
      "mcp__basecamp__create_card",
      "mcp__basecamp__create_message",
      "mcp__basecamp__create_step",
      "mcp__basecamp__create_todo",
      "mcp__basecamp__create_todolist",
      "mcp__basecamp__delete_step",
      "mcp__basecamp__get_assigned_todos",
      "mcp__basecamp__get_assignments",
      "mcp__basecamp__get_me",
      "mcp__basecamp__get_overdue_todos",
      "mcp__basecamp__get_project_overview",
      "mcp__basecamp__get_schedule",
      "mcp__basecamp__get_timeline",
      "mcp__basecamp__list_card_columns",
      "mcp__basecamp__list_cards",
      "mcp__basecamp__list_chat_messages",
      "mcp__basecamp__list_comments",
      "mcp__basecamp__list_messages",
      "mcp__basecamp__list_notifications",
      "mcp__basecamp__list_people",
      "mcp__basecamp__list_projects",
      "mcp__basecamp__list_schedule_entries",
      "mcp__basecamp__list_steps",
      "mcp__basecamp__list_todolists",
      "mcp__basecamp__list_todos",
      "mcp__basecamp__mark_notification_read",
      "mcp__basecamp__move_card",
      "mcp__basecamp__move_step",
      "mcp__basecamp__parse_url",
      "mcp__basecamp__post_chat_message",
      "mcp__basecamp__reopen_todo",
      "mcp__basecamp__search",
      "mcp__basecamp__show_card",
      "mcp__basecamp__show_message",
      "mcp__basecamp__show_project",
      "mcp__basecamp__show_todo",
      "mcp__basecamp__uncomplete_step",
      "mcp__basecamp__update_card",
      "mcp__basecamp__update_step",
      "mcp__basecamp__update_todo"
    ]
  }
}
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `BASECAMP_BIN` | auto-detected | Path to the `basecamp` binary |

## References

- [Basecamp CLI](https://github.com/basecamp/basecamp-cli) — the official CLI this server wraps
- [Basecamp skill](https://github.com/basecamp/basecamp-cli/tree/main/skills) — the official skill this project mirrors, ships inside the CLI repo
