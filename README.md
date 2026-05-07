# basecamp-cli-mcp

A local MCP server that wraps the official [Basecamp CLI](https://github.com/basecamp/basecamp-cli) to give Claude Desktop (and Cowork) the same Basecamp functionality as the [Claude Code basecamp skill](https://github.com/basecamp/skills).

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
- **Cards** — `list_cards`, `list_card_columns`, `show_card`, `create_card`, `move_card`
- **Comments** — `add_comment`
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

## Environment

| Variable | Default | Description |
|---|---|---|
| `BASECAMP_BIN` | auto-detected | Path to the `basecamp` binary |

## References

- [Basecamp CLI](https://github.com/basecamp/basecamp-cli) — the official CLI this server wraps
- [Claude Code basecamp skill](https://github.com/basecamp/skills) — the skill this project mirrors for Claude Desktop
