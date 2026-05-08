#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const BASECAMP_BIN = await (async () => {
  if (process.env.BASECAMP_BIN) return process.env.BASECAMP_BIN;
  try {
    const { stdout } = await execFileAsync("which", ["basecamp"], {
      env: {
        PATH: [
          process.env.HOME + "/.local/bin",
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          process.env.PATH,
        ].filter(Boolean).join(":"),
      },
    });
    return stdout.trim();
  } catch {
    return "basecamp";
  }
})();

const ENV = {
  ...process.env,
  PATH: [
    process.env.HOME + "/.local/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    process.env.PATH,
  ].filter(Boolean).join(":"),
};

async function runBasecamp(args, { markdown = false, jq = null } = {}) {
  const formatFlag = markdown ? "--md" : "--json";
  const allArgs = jq
    ? [...args, formatFlag, "--jq", jq]
    : [...args, formatFlag];
  const { stdout } = await execFileAsync(BASECAMP_BIN, allArgs, {
    env: ENV,
    timeout: 30000,
  });
  return stdout.trim();
}

function ok(text) {
  return { content: [{ type: "text", text }] };
}

function fail(text) {
  return { content: [{ type: "text", text }], isError: true };
}

const server = new McpServer({
  name: "basecamp",
  version: "1.0.0",
});

function addTool(name, description, schema, handler) {
  server.tool(name, description, schema, async (args) => {
    try {
      return await handler(args);
    } catch (e) {
      const msg = e.stderr?.trim() || e.stdout?.trim() || e.message;
      return fail(`Basecamp error: ${msg}`);
    }
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Extracts { projectId, cardId } from a Basecamp card URL, or null if not a URL.
// URL format: https://3.basecamp.com/{account}/buckets/{project}/card_tables/cards/{card}
function parseCardUrl(value) {
  const m = value.match(/^https?:\/\/3\.basecamp\.com\/\d+\/buckets\/(\d+)\/card_tables\/cards\/(\d+)/);
  if (!m) return null;
  return { projectId: m[1], cardId: m[2] };
}

// ── URL PARSING ──────────────────────────────────────────────────────────────

addTool("parse_url",
  "Parse a Basecamp URL to extract account_id, project_id, recording type, recording_id, and comment_id. " +
  "ALWAYS call this first whenever you receive a Basecamp URL, before passing any IDs to other tools.",
  { url: z.string().describe("Full Basecamp URL") },
  async ({ url }) => ok(await runBasecamp(["url", "parse", url]))
);

// ── PROJECTS ─────────────────────────────────────────────────────────────────

addTool("list_projects", "List all accessible Basecamp projects",
  {},
  async () => ok(await runBasecamp(["projects", "list"]))
);

addTool("show_project", "Show details of a Basecamp project",
  { id: z.string().describe("Project ID or name") },
  async ({ id }) => ok(await runBasecamp(["projects", "show", id]))
);

// ── TODOS ────────────────────────────────────────────────────────────────────

addTool("list_todos",
  "List todos in a project or todolist. " +
  "For cross-project work overview, prefer get_assignments (your own) or get_assigned_todos (any person). " +
  "For overdue todos across all projects, prefer get_overdue_todos.",
  {
    project: z.string().optional().describe("Project ID or name"),
    list: z.string().optional().describe("Todolist ID or name"),
    status: z.enum(["completed", "incomplete"]).optional().describe("Filter by status"),
    assignee: z.string().optional().describe("Filter by assignee name, ID, or 'me'"),
    overdue: z.boolean().optional().describe("Only show overdue todos"),
    all: z.boolean().optional().describe("Fetch all (no limit)"),
    limit: z.number().int().optional().describe("Max results"),
  },
  async ({ project, list, status, assignee, overdue, all, limit }) => {
    const args = ["todos", "list"];
    if (project) args.push("--in", project);
    if (list) args.push("--list", list);
    if (status) args.push("--status", status);
    if (assignee) args.push("--assignee", assignee);
    if (overdue) args.push("--overdue");
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    return ok(await runBasecamp(args));
  }
);

addTool("show_todo", "Show details of a specific todo",
  { id: z.string().describe("Todo ID or Basecamp URL") },
  async ({ id }) => ok(await runBasecamp(["todos", "show", id]))
);

addTool("create_todo",
  "Create a new todo. " +
  "For @mentions in description, use the format [@Name](mention:SGID) — requires no extra API calls.",
  {
    content: z.string().describe("Todo title"),
    project: z.string().describe("Project ID or name"),
    list: z.string().optional().describe("Todolist ID or name"),
    assignee: z.string().optional().describe("Assignee name, ID, or 'me'"),
    due: z.string().optional().describe("Due date: YYYY-MM-DD or natural language like 'next friday', 'tomorrow', '+3'"),
    description: z.string().optional().describe("Extended description (Markdown, @mentions supported)"),
  },
  async ({ content, project, list, assignee, due, description }) => {
    const args = ["todo", content, "--in", project];
    if (list) args.push("--list", list);
    if (assignee) args.push("--assignee", assignee);
    if (due) args.push("--due", due);
    if (description) args.push("--description", description);
    return ok(await runBasecamp(args));
  }
);

addTool("complete_todo", "Mark one or more todos as complete",
  { ids: z.array(z.string()).min(1).describe("Todo ID(s) or Basecamp URL(s)") },
  async ({ ids }) => ok(await runBasecamp(["done", ...ids]))
);

addTool("reopen_todo", "Uncomplete (reopen) a todo",
  { id: z.string().describe("Todo ID or Basecamp URL") },
  async ({ id }) => ok(await runBasecamp(["reopen", id]))
);

addTool("update_todo", "Update an existing todo (title, assignee, due date, description)",
  {
    id: z.string().describe("Todo ID or Basecamp URL"),
    title: z.string().optional().describe("New title"),
    assignee: z.string().optional().describe("Assignee name, ID, or 'me'"),
    due: z.string().optional().describe("Due date (YYYY-MM-DD, natural language, or 'none' to clear)"),
    description: z.string().optional().describe("Description (Markdown, or 'none' to clear)"),
  },
  async ({ id, title, assignee, due, description }) => {
    const args = ["todos", "update", id];
    if (title) args.push("--title", title);
    if (assignee) args.push("--assignee", assignee);
    if (due === "none") args.push("--no-due");
    else if (due) args.push("--due", due);
    if (description === "none") args.push("--no-description");
    else if (description) args.push("--description", description);
    return ok(await runBasecamp(args));
  }
);

addTool("assign_todo",
  "Assign one or more todos to a person. Use 'me' for yourself.",
  {
    ids: z.array(z.string()).min(1).describe("Todo ID(s)"),
    to: z.string().describe("Assignee name, ID, or 'me'"),
    project: z.string().describe("Project ID or name"),
  },
  async ({ ids, to, project }) =>
    ok(await runBasecamp(["assign", ...ids, "--to", to, "--in", project]))
);

// ── TODOLISTS ────────────────────────────────────────────────────────────────

addTool("list_todolists", "List all todolists in a project",
  { project: z.string().describe("Project ID or name") },
  async ({ project }) => ok(await runBasecamp(["todolists", "list", "--in", project]))
);

addTool("create_todolist", "Create a new todolist in a project",
  {
    name: z.string().describe("Todolist name"),
    project: z.string().describe("Project ID or name"),
    description: z.string().optional().describe("Description"),
  },
  async ({ name, project, description }) => {
    const args = ["todolists", "create", name, "--in", project];
    if (description) args.push("--description", description);
    return ok(await runBasecamp(args));
  }
);

// ── MESSAGES ──────────────────────────────────────────────────────────────────

addTool("list_messages", "List messages on a project's message board",
  { project: z.string().describe("Project ID or name") },
  async ({ project }) => ok(await runBasecamp(["messages", "list", "--in", project]))
);

addTool("show_message", "Show a specific message",
  { id: z.string().describe("Message ID or Basecamp URL") },
  async ({ id }) => ok(await runBasecamp(["messages", "show", id]))
);

addTool("create_message",
  "Post a new message to a project's message board. " +
  "Body supports Markdown and @mentions. For @mentions use [@Name](mention:SGID) — requires no extra API calls.",
  {
    title: z.string().describe("Message subject"),
    body: z.string().optional().describe("Message body (Markdown and @mentions supported)"),
    project: z.string().describe("Project ID or name"),
    subscribe: z.string().optional().describe("Subscribe people (comma-separated names, emails, or IDs)"),
    no_subscribe: z.boolean().optional().describe("Post silently, without notifying anyone"),
  },
  async ({ title, body, project, subscribe, no_subscribe }) => {
    const args = ["message", title];
    if (body) args.push(body);
    args.push("--in", project);
    if (no_subscribe) args.push("--no-subscribe");
    else if (subscribe) args.push("--subscribe", subscribe);
    return ok(await runBasecamp(args));
  }
);

// ── CARDS (KANBAN) ────────────────────────────────────────────────────────────

addTool("list_cards", "List all active cards in a project's card table",
  {
    project: z.string().describe("Project ID or name"),
    column: z.string().optional().describe("Filter by column ID"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ project, column, card_table }) => {
    const args = ["cards", "list", "--in", project];
    if (column) args.push("--column", column);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("list_card_columns", "List the columns in a project's card table",
  {
    project: z.string().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ project, card_table }) => {
    const args = ["cards", "columns", "--in", project];
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("show_card", "Show details of a specific card",
  { id: z.string().describe("Card ID or Basecamp URL") },
  async ({ id }) => ok(await runBasecamp(["cards", "show", id]))
);

addTool("create_card", "Create a new card in a project's card table",
  {
    title: z.string().describe("Card title"),
    project: z.string().describe("Project ID or name"),
    body: z.string().optional().describe("Card body/description"),
    column: z.string().optional().describe("Column ID (defaults to first column)"),
  },
  async ({ title, project, body, column }) => {
    const args = ["card", title];
    if (body) args.push(body);
    args.push("--in", project);
    if (column) args.push("--column", column);
    return ok(await runBasecamp(args));
  }
);

addTool("move_card", "Move a card to a different column (optionally to on-hold section)",
  {
    id: z.string().describe("Card ID"),
    to: z.string().optional().describe("Target column ID or name"),
    position: z.number().int().optional().describe("Position in column (1-indexed)"),
    on_hold: z.boolean().optional().describe("Move to on-hold section"),
    project: z.string().optional().describe("Project ID or name (required when using column name)"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables and using column name)"),
  },
  async ({ id, to, position, on_hold, project, card_table }) => {
    const args = ["cards", "move", id];
    if (to) args.push("--to", to);
    if (position != null) args.push("--position", String(position));
    if (on_hold) args.push("--on-hold");
    if (project) args.push("--in", project);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("update_card", "Update an existing card (title, body, assignee, due date)",
  {
    id: z.string().describe("Card ID or Basecamp URL"),
    title: z.string().optional().describe("New title"),
    body: z.string().optional().describe("New body/description"),
    assignee: z.string().optional().describe("Assignee ID or name"),
    due: z.string().optional().describe("Due date (natural language or YYYY-MM-DD)"),
    project: z.string().optional().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ id, title, body, assignee, due, project, card_table }) => {
    const args = ["cards", "update", id];
    if (title) args.push("--title", title);
    if (body) args.push("--body", body);
    if (assignee) args.push("--assignee", assignee);
    if (due) args.push("--due", due);
    if (project) args.push("--in", project);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

// ── CARD STEPS ────────────────────────────────────────────────────────────────

addTool("list_steps", "List all steps (checklist items) on a card",
  {
    card: z.string().describe("Card ID or Basecamp URL"),
    project: z.string().optional().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ card, project, card_table }) => {
    const parsed = parseCardUrl(card);
    const cardId = parsed ? parsed.cardId : card;
    const resolvedProject = project ?? parsed?.projectId;
    const args = ["cards", "steps", cardId];
    if (resolvedProject) args.push("--in", resolvedProject);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("create_step", "Add a new step (checklist item) to a card",
  {
    title: z.string().describe("Step title"),
    card: z.string().describe("Card ID or Basecamp URL"),
    assignees: z.string().optional().describe("Assignee IDs or names (comma-separated)"),
    due: z.string().optional().describe("Due date (natural language or YYYY-MM-DD)"),
    project: z.string().optional().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ title, card, assignees, due, project, card_table }) => {
    const parsed = parseCardUrl(card);
    const cardId = parsed ? parsed.cardId : card;
    const resolvedProject = project ?? parsed?.projectId;
    const args = ["cards", "step", "create", title, "--card", cardId];
    if (assignees) args.push("--assignees", assignees);
    if (due) args.push("--due", due);
    if (resolvedProject) args.push("--in", resolvedProject);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("complete_step", "Mark a card step as completed",
  {
    id: z.string().describe("Step ID or Basecamp URL"),
    project: z.string().optional().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ id, project, card_table }) => {
    const args = ["cards", "step", "complete", id];
    if (project) args.push("--in", project);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("uncomplete_step", "Mark a card step as not completed",
  {
    id: z.string().describe("Step ID or Basecamp URL"),
    project: z.string().optional().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ id, project, card_table }) => {
    const args = ["cards", "step", "uncomplete", id];
    if (project) args.push("--in", project);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("update_step", "Update a card step (title, assignees, due date)",
  {
    id: z.string().describe("Step ID or Basecamp URL"),
    title: z.string().optional().describe("New title"),
    assignees: z.string().optional().describe("Assignee IDs or names (comma-separated)"),
    due: z.string().optional().describe("Due date (natural language or YYYY-MM-DD)"),
    project: z.string().optional().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ id, title, assignees, due, project, card_table }) => {
    const args = ["cards", "step", "update", id];
    if (title) args.push(title);
    if (assignees) args.push("--assignees", assignees);
    if (due) args.push("--due", due);
    if (project) args.push("--in", project);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("move_step", "Reposition a step within a card (0-indexed)",
  {
    id: z.string().describe("Step ID or Basecamp URL"),
    card: z.string().describe("Card ID or Basecamp URL (required)"),
    position: z.number().int().describe("Target position (0-indexed)"),
    project: z.string().optional().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ id, card, position, project, card_table }) => {
    const parsed = parseCardUrl(card);
    const cardId = parsed ? parsed.cardId : card;
    const resolvedProject = project ?? parsed?.projectId;
    const args = ["cards", "step", "move", id, "--card", cardId, "--position", String(position)];
    if (resolvedProject) args.push("--in", resolvedProject);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

addTool("delete_step", "Permanently delete a step from a card",
  {
    id: z.string().describe("Step ID or Basecamp URL"),
    project: z.string().optional().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ id, project, card_table }) => {
    const args = ["cards", "step", "delete", id];
    if (project) args.push("--in", project);
    if (card_table) args.push("--card-table", card_table);
    return ok(await runBasecamp(args));
  }
);

// ── COMMENTS ─────────────────────────────────────────────────────────────────

addTool("list_comments", "List comments on a Basecamp recording (todo, message, card, etc.)",
  {
    id: z.string().describe("Recording ID or Basecamp URL"),
    project: z.string().optional().describe("Project ID or name"),
  },
  async ({ id, project }) => {
    const args = ["comments", "list", id];
    if (project) args.push("--in", project);
    return ok(await runBasecamp(args));
  }
);

addTool("add_comment",
  "Add a comment to any Basecamp item. Comments are flat — always comment on the parent recording, not on a comment ID. " +
  "Supports Markdown and @mentions. For @mentions use [@Name](mention:SGID) — requires no extra API calls.",
  {
    id: z.string().describe("Recording ID (parent item, NOT a comment ID). If you have a URL with a comment fragment, parse the URL first and use the recording_id."),
    content: z.string().describe("Comment text (Markdown and @mentions supported)"),
    project: z.string().optional().describe("Project ID or name"),
  },
  async ({ id, content, project }) => {
    const args = ["comment", id, content];
    if (project) args.push("--in", project);
    return ok(await runBasecamp(args));
  }
);

// ── SCHEDULE ──────────────────────────────────────────────────────────────────

addTool("list_schedule_entries",
  "List schedule entries in a project. For upcoming entries across all projects, use get_schedule instead.",
  {
    project: z.string().describe("Project ID or name"),
  },
  async ({ project }) => ok(await runBasecamp(["schedule", "entries", "--in", project]))
);

// ── CHAT ─────────────────────────────────────────────────────────────────────

addTool("list_chat_messages", "List recent messages in a project's chat",
  { project: z.string().describe("Project ID or name") },
  async ({ project }) => ok(await runBasecamp(["chat", "messages", "--in", project]))
);

addTool("post_chat_message",
  "Post a message to a project's chat. Supports @mentions and Markdown.",
  {
    message: z.string().describe("Message text (@mentions like [@Name](mention:SGID) and Markdown are supported)"),
    project: z.string().describe("Project ID or name"),
  },
  async ({ message, project }) =>
    ok(await runBasecamp(["chat", "post", message, "--in", project]))
);

// ── ASSIGNMENTS & REPORTS ─────────────────────────────────────────────────────

addTool("get_assignments",
  "Get your own assignments across all projects (priorities + non-priorities). " +
  "Prefer this over list_todos for a cross-project overview of your own work.",
  {
    scope: z.enum(["all", "overdue", "due_today", "due_tomorrow", "due_later_this_week", "due_next_week", "completed"])
      .optional()
      .describe("Scope: 'all' (default), 'overdue', 'due_today', 'due_tomorrow', 'due_later_this_week', 'due_next_week', 'completed'"),
  },
  async ({ scope }) => {
    if (!scope || scope === "all") return ok(await runBasecamp(["assignments"]));
    if (scope === "completed") return ok(await runBasecamp(["assignments", "completed"]));
    return ok(await runBasecamp(["assignments", "due", scope]));
  }
);

addTool("get_assigned_todos",
  "Get todos assigned to any person across all projects (cross-project report). " +
  "Use 'me' for yourself, or a name/ID for someone else. Prefer this over list_todos for cross-project assignee queries.",
  { assignee: z.string().optional().describe("Person name, ID, or 'me' (defaults to current user)") },
  async ({ assignee }) => {
    const args = ["reports", "assigned"];
    if (assignee) args.push("--assignee", assignee);
    return ok(await runBasecamp(args));
  }
);

addTool("get_overdue_todos",
  "Get overdue todos across all projects. Prefer this over list_todos with --overdue for cross-project queries.",
  {},
  async () => ok(await runBasecamp(["reports", "overdue"]))
);

addTool("get_schedule",
  "Get upcoming schedule entries across all projects. For a single project's schedule, use list_schedule_entries.",
  {},
  async () => ok(await runBasecamp(["reports", "schedule"]))
);

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

addTool("list_notifications", "List your Basecamp notifications",
  { page: z.number().int().optional().describe("Page number (default: 1)") },
  async ({ page }) => {
    const args = ["notifications"];
    if (page && page > 1) args.push("--page", String(page));
    return ok(await runBasecamp(args));
  }
);

addTool("mark_notification_read", "Mark a notification as read",
  {
    id: z.string().describe("Notification ID"),
    page: z.number().int().optional().describe("Page the notification was listed on"),
  },
  async ({ id, page }) => {
    const args = ["notifications", "read", id];
    if (page) args.push("--page", String(page));
    return ok(await runBasecamp(args));
  }
);

// ── SEARCH ───────────────────────────────────────────────────────────────────

addTool("search", "Full-text search across all Basecamp content",
  {
    query: z.string().describe("Search query"),
    limit: z.number().int().optional().describe("Max results"),
    sort: z.enum(["created_at", "updated_at"]).optional().describe("Sort order (default: relevance)"),
  },
  async ({ query, limit, sort }) => {
    const args = ["search", query];
    if (limit != null) args.push("--limit", String(limit));
    if (sort) args.push("--sort", sort);
    return ok(await runBasecamp(args));
  }
);

// ── TIMELINE ─────────────────────────────────────────────────────────────────

addTool("get_timeline",
  "Get recent activity. Omit project for account-wide timeline.",
  {
    project: z.string().optional().describe("Project ID or name (omit for account-wide)"),
    person: z.string().optional().describe("Person ID (filter to their activity)"),
    me: z.boolean().optional().describe("Show only your own activity"),
    limit: z.number().int().optional().describe("Max results (default: 100)"),
  },
  async ({ project, person, me, limit }) => {
    const args = me ? ["timeline", "me"] : ["timeline"];
    if (project) args.push("--in", project);
    if (person) args.push("--person", person);
    if (limit != null) args.push("--limit", String(limit));
    return ok(await runBasecamp(args));
  }
);

// ── PEOPLE ───────────────────────────────────────────────────────────────────

addTool("list_people", "List people in the account or on a specific project",
  { project: z.string().optional().describe("Project ID or name (omit for all account members)") },
  async ({ project }) => {
    const args = ["people", "list"];
    if (project) args.push("--project", project);
    return ok(await runBasecamp(args));
  }
);

addTool("get_me", "Get current authenticated user details",
  {},
  async () => ok(await runBasecamp(["me"]))
);

// ── AUTH ─────────────────────────────────────────────────────────────────────

addTool("auth_status", "Check Basecamp authentication status and active account",
  {},
  async () => ok(await runBasecamp(["auth", "status"]))
);

// ── PROJECT OVERVIEW ──────────────────────────────────────────────────────────

addTool("get_project_overview",
  "Get a full overview of a project: open todos, recent messages, and cards — all in one call.",
  {
    project: z.string().describe("Project ID or name"),
    todo_status: z.enum(["completed", "incomplete"]).optional().describe("Filter todos by status (default: incomplete)"),
  },
  async ({ project, todo_status }) => {
    const todoArgs = ["todos", "list", "--in", project, "--all", "--status", todo_status ?? "incomplete"];

    const [todos, messages, cards] = await Promise.allSettled([
      runBasecamp(todoArgs, { markdown: true }),
      runBasecamp(["messages", "list", "--in", project], { markdown: true }),
      runBasecamp(["cards", "list", "--in", project], { markdown: true }),
    ]);

    const section = (title, result) => result.status === "fulfilled"
      ? `## ${title}\n\n${result.value}`
      : `## ${title}\n\n_Error: ${result.reason?.stderr?.trim() || result.reason?.stdout?.trim() || result.reason?.message}_`;

    return ok([
      section("Open Todos", todos),
      section("Messages", messages),
      section("Cards", cards),
    ].join("\n\n---\n\n"));
  }
);

// ── ESCAPE HATCH ─────────────────────────────────────────────────────────────

addTool("basecamp_run",
  "LAST RESORT: run any basecamp CLI command not covered by a specific tool. " +
  "Always prefer the specific tools above. Only use this for: gauges, lineup, check-ins, " +
  "webhooks, subscriptions, templates, recordings (cross-project), files/uploads, " +
  "accounts, schedule create/update, todos position/sweep, messages pin/publish." +
  "Do NOT pass --json or --md yourself — they are appended automatically. " +
  "Pass args as an array, e.g. [\"gauges\", \"list\"] or [\"checkins\", \"questions\", \"--in\", \"MyProject\"].",
  {
    args: z.array(z.string()).describe(
      "CLI arguments after 'basecamp'. Examples: " +
      "[\"gauges\", \"list\"], " +
      "[\"lineup\", \"list\"], " +
      "[\"recordings\", \"todos\"], " +
      "[\"checkins\", \"questions\", \"--in\", \"MyProject\"], " +
      "[\"templates\", \"list\"], " +
      "[\"webhooks\", \"list\", \"--in\", \"MyProject\"]"
    ),
    markdown: z.boolean().optional().describe("Use --md (Markdown) output instead of --json"),
    jq: z.string().optional().describe("JQ expression to filter the JSON output, e.g. '.[].title'"),
  },
  async ({ args, markdown, jq }) =>
    ok(await runBasecamp(args, { markdown: markdown ?? false, jq: jq ?? null }))
);

// ── START ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
