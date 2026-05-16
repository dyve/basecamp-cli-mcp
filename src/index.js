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

// Wraps a CLI JSON list response with pagination metadata.
// The CLI envelope is { ok, data: [...], summary } — no native has_more field.
// has_more logic:
//   all=true or count=0  → false (definitely done)
//   limit set, count < limit → false (got fewer than asked)
//   limit set, count >= limit → true (more likely exist)
//   no limit → null (CLI default applied; completeness unknown)
function wrapPaginated(raw, { all = false, limit = null } = {}) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return raw; }
  let items;
  if (Array.isArray(parsed.data)) {
    items = parsed.data;
  } else if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed.ok === true && !("data" in parsed)) {
    // CLI omits data field when list is empty
    items = [];
  } else {
    return raw; // non-list (show commands, nested data structures)
  }
  const count = items.length;
  let has_more;
  if (all || count === 0) {
    has_more = false;
  } else if (limit != null) {
    has_more = count >= limit;
  } else {
    has_more = null;
  }
  return JSON.stringify({
    items,
    count,
    page: {
      has_more,
      ...(has_more === null && { note: "Results capped at CLI default. Pass all=true to fetch exhaustively." }),
      ...(has_more === true && { next_page: "increment the page param by 1" }),
    },
  }, null, 2);
}

function collectResults(ids, settled) {
  const succeeded = [], failed = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") succeeded.push(ids[i]);
    else {
      const e = r.reason;
      let reason = e?.stderr?.trim() || e?.stdout?.trim() || e?.message;
      // CLI returns JSON errors on stdout — extract the error field if present
      if (reason) {
        try { const j = JSON.parse(reason); if (j.error) reason = j.error; } catch {}
      }
      failed.push({ id: ids[i], reason });
    }
  });
  return { succeeded, failed };
}

// ── URL PARSING ──────────────────────────────────────────────────────────────

addTool("parse_url",
  "Parse a Basecamp URL to extract account_id, project_id, recording type, recording_id, and comment_id. " +
  "ALWAYS call this first whenever you receive a Basecamp URL, before passing any IDs to other tools.",
  { url: z.string().describe("Full Basecamp URL") },
  async ({ url }) => ok(await runBasecamp(["url", "parse", url]))
);

// ── PROJECTS ─────────────────────────────────────────────────────────────────

addTool("list_projects",
  "List all accessible Basecamp projects. Returns paginated results — check page.has_more.",
  {
    all: z.boolean().optional().describe("Fetch all results; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ all, limit, page }) => {
    const args = ["projects", "list"];
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
  }
);

addTool("show_project", "Show details of a Basecamp project",
  { id: z.string().describe("Project ID or name") },
  async ({ id }) => ok(await runBasecamp(["projects", "show", id]))
);

addTool("update_project", "Update a project's name or description",
  {
    id: z.string().describe("Project ID or name"),
    name: z.string().optional().describe("New project name"),
    description: z.string().optional().describe("New description (shown on the project tile)"),
  },
  async ({ id, name, description }) => {
    const args = ["projects", "update", id];
    if (name) args.push("--name", name);
    if (description) args.push("--description", description);
    await runBasecamp(args);
    return ok(await runBasecamp(["projects", "show", id]));
  }
);

// ── TODOS ────────────────────────────────────────────────────────────────────

addTool("list_todos",
  "List todos in a project or todolist. Returns paginated results — check page.has_more before claiming completeness. " +
  "For cross-project work overview, prefer get_assignments (your own) or get_assigned_todos (any person). " +
  "For overdue todos across all projects, prefer get_overdue_todos.",
  {
    project: z.string().optional().describe("Project ID or name"),
    list: z.string().optional().describe("Todolist ID or name"),
    status: z.enum(["completed", "incomplete"]).optional().describe("Filter by status"),
    assignee: z.string().optional().describe("Filter by assignee name, ID, or 'me'"),
    overdue: z.boolean().optional().describe("Only show overdue todos"),
    all: z.boolean().optional().describe("Fetch all (no limit); sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number (use with limit for manual pagination)"),
  },
  async ({ project, list, status, assignee, overdue, all, limit, page }) => {
    const args = ["todos", "list"];
    if (project) args.push("--in", project);
    if (list) args.push("--list", list);
    // WORKAROUND: `basecamp todos list --status` is silently ignored in CLI v0.7.2.
    // We fetch with --all and filter client-side. Side effect: pagination is disabled when status is used.
    // To verify if fixed: run `basecamp todos list --status completed --json` and check whether
    // results are pre-filtered (completed only) vs returning all todos. If fixed, remove the
    // client-side filter below and re-enable the page param when status is provided.
    if (assignee) args.push("--assignee", assignee);
    if (overdue) args.push("--overdue");
    if (all || status) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (!status && page != null) args.push("--page", String(page));
    const raw = await runBasecamp(args);
    if (!status) return ok(wrapPaginated(raw, { all, limit }));
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return ok(raw); }
    const allItems = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
    const items = allItems.filter(t => t.completed === (status === "completed"));
    return ok(JSON.stringify({ items, count: items.length, page: { has_more: false } }, null, 2));
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

addTool("complete_todos",
  "Mark one or more todos as complete in parallel. " +
  "Returns { succeeded: [id, ...], failed: [{ id, reason }, ...] }.",
  { ids: z.array(z.string()).min(1).describe("Todo ID(s) or Basecamp URL(s)") },
  async ({ ids }) => {
    const results = await Promise.allSettled(ids.map(id => runBasecamp(["done", id])));
    return ok(JSON.stringify(collectResults(ids, results), null, 2));
  }
);

addTool("reopen_todos",
  "Uncomplete (reopen) one or more todos in parallel. " +
  "Returns { succeeded: [id, ...], failed: [{ id, reason }, ...] }.",
  { ids: z.array(z.string()).min(1).describe("Todo ID(s) or Basecamp URL(s)") },
  async ({ ids }) => {
    const results = await Promise.allSettled(ids.map(id => runBasecamp(["reopen", id])));
    return ok(JSON.stringify(collectResults(ids, results), null, 2));
  }
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

addTool("assign_todos",
  "Assign one or more todos in parallel. Each entry specifies its own assignees (comma-separated names or IDs, or 'me') and an optional due date. " +
  "Returns { succeeded: [id, ...], failed: [{ id, reason }, ...] }.",
  {
    assignments: z.array(z.object({
      id: z.string().describe("Todo ID or Basecamp URL"),
      assignee_ids: z.array(z.string()).min(1).describe("Assignee names, IDs, or 'me'"),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD or natural language)"),
    })).min(1).describe("Assignments to perform in parallel"),
  },
  async ({ assignments }) => {
    const results = await Promise.allSettled(assignments.map(({ id, assignee_ids, due_date }) => {
      const args = ["todos", "update", id, "--assignee", assignee_ids.join(",")];
      if (due_date) args.push("--due", due_date);
      return runBasecamp(args);
    }));
    return ok(JSON.stringify(collectResults(assignments.map(a => a.id), results), null, 2));
  }
);

// ── TODOLISTS ────────────────────────────────────────────────────────────────

addTool("list_todolists",
  "List all todolists in a project. Returns paginated results — check page.has_more.",
  {
    project: z.string().describe("Project ID or name"),
    all: z.boolean().optional().describe("Fetch all results; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ project, all, limit, page }) => {
    const args = ["todolists", "list", "--in", project];
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
  }
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

addTool("list_messages",
  "List posts on a project's MESSAGE BOARD (structured posts with a subject/title). NOT chat. " +
  "For Campfire real-time chat messages, use list_chat_messages. " +
  "Returns paginated results — check page.has_more before claiming completeness.",
  {
    project: z.string().describe("Project ID or name"),
    all: z.boolean().optional().describe("Fetch all messages; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ project, all, limit, page }) => {
    const args = ["messages", "list", "--in", project];
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
  }
);

addTool("show_message",
  "Show a message board post (subject + body). NOT a chat message or comment. " +
  "Use markdown=true for cleaner rendering of rich-text bodies. " +
  "Replies are not included — use list_comments to fetch them separately.",
  {
    id: z.string().describe("Message ID or Basecamp URL"),
    markdown: z.boolean().optional().describe("Return Markdown-formatted output instead of JSON"),
  },
  async ({ id, markdown }) => ok(await runBasecamp(["messages", "show", id], { markdown: markdown ?? false }))
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

addTool("update_message",
  "Update an existing message's title or body. Body supports Markdown and @mentions. " +
  "Replaces the full body — not an append. Partial update (title only or body only) is supported.",
  {
    id: z.string().describe("Message ID or Basecamp URL"),
    project: z.string().optional().describe("Project ID or name"),
    title: z.string().optional().describe("New subject/title"),
    body: z.string().optional().describe("New body (Markdown and @mentions supported; replaces existing body)"),
    message_board: z.string().optional().describe("Message board ID (required if project has multiple boards)"),
  },
  async ({ id, project, title, body, message_board }) => {
    const args = ["messages", "update", id];
    if (project) args.push("--in", project);
    if (title) args.push("--title", title);
    if (body) args.push("--body", body);
    if (message_board) args.push("--message-board", message_board);
    return ok(await runBasecamp(args));
  }
);

// ── CARDS (KANBAN) ────────────────────────────────────────────────────────────

addTool("list_cards", "List all active cards in a project's card table. Returns paginated results — check page.has_more.",
  {
    project: z.string().describe("Project ID or name"),
    column: z.string().optional().describe("Filter by column ID"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
    all: z.boolean().optional().describe("Fetch all cards; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ project, column, card_table, all, limit, page }) => {
    const args = ["cards", "list", "--in", project];
    if (column) args.push("--column", column);
    if (card_table) args.push("--card-table", card_table);
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
  }
);

addTool("list_card_columns",
  "List the columns in a project's card table. " +
  "Returns paginated envelope with page.has_more=false (columns are a complete bounded set).",
  {
    project: z.string().describe("Project ID or name"),
    card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
  },
  async ({ project, card_table }) => {
    const args = ["cards", "columns", "--in", project];
    if (card_table) args.push("--card-table", card_table);
    return ok(wrapPaginated(await runBasecamp(args), { all: true }));
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

addTool("move_card", "Move a single card to a different column. To move multiple cards at once, use move_cards.",
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

addTool("move_cards",
  "Move multiple cards to columns in parallel. Each move specifies a card id and target column. " +
  "Returns { succeeded: [id, ...], failed: [{ id, reason }, ...] } for partial-success visibility.",
  {
    moves: z.array(z.object({
      id: z.string().describe("Card ID"),
      to: z.string().describe("Target column ID or name"),
      position: z.number().int().optional().describe("Position in column (1-indexed)"),
      on_hold: z.boolean().optional().describe("Move to on-hold section"),
      project: z.string().optional().describe("Project ID or name"),
      card_table: z.string().optional().describe("Card table ID (required if project has multiple tables)"),
    })).min(1).describe("Array of moves to perform in parallel"),
  },
  async ({ moves }) => {
    const results = await Promise.allSettled(
      moves.map(({ id, to, position, on_hold, project, card_table }) => {
        const args = ["cards", "move", id];
        if (to) args.push("--to", to);
        if (position != null) args.push("--position", String(position));
        if (on_hold) args.push("--on-hold");
        if (project) args.push("--in", project);
        if (card_table) args.push("--card-table", card_table);
        return runBasecamp(args);
      })
    );
    return ok(JSON.stringify(collectResults(moves.map(m => m.id), results), null, 2));
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

addTool("list_comments", "List comments on a Basecamp recording (todo, message, card, etc.). Returns paginated results — check page.has_more.",
  {
    id: z.string().describe("Recording ID or Basecamp URL"),
    project: z.string().optional().describe("Project ID or name"),
    all: z.boolean().optional().describe("Fetch all comments; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ id, project, all, limit, page }) => {
    const args = ["comments", "list", id];
    if (project) args.push("--in", project);
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    const raw = await runBasecamp(args);
    try {
      const envelope = JSON.parse(raw);
      if (envelope.ok && (envelope.data == null || (Array.isArray(envelope.data) && envelope.data.length === 0))) {
        try {
          const check = JSON.parse(await runBasecamp(["comments", "show", id]));
          if (check.ok && check.data?.type === "Comment") {
            return fail(`${id} is a comment ID, not a recording. Comments are flat — use show_comment to fetch it and find the parent recording.`);
          }
        } catch (_) { /* not a comment, genuinely empty */ }
      }
    } catch (_) { /* non-JSON response, return as-is */ }
    return ok(wrapPaginated(raw, { all, limit }));
  }
);

addTool("show_comment",
  "Show a single comment by ID. Returns the full comment object including parent recording id, type, and URL. " +
  "Use this when you have a comment ID from a timeline event, notification, or URL fragment. " +
  "If you have a comment URL, call parse_url first to extract the comment_id. " +
  "For all comments on a recording, use list_comments instead.",
  { id: z.string().describe("Comment ID") },
  async ({ id }) => ok(await runBasecamp(["comments", "show", id]))
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

// ── DOCS & FILES ──────────────────────────────────────────────────────────────

addTool("list_files",
  "List all contents of a Docs & Files folder: subfolders, documents, and uploads. " +
  "Omit folder to list the project root. Returns everything in the folder (no pagination — folders are typically small). " +
  "For large folders, use list_documents or list_uploads for filtered/paginated views.",
  {
    project: z.string().describe("Project ID or name"),
    folder: z.string().optional().describe("Folder (vault) ID — omit for project root"),
  },
  async ({ project, folder }) => {
    const args = ["files", "list", "--in", project];
    if (folder) args.push("--vault", folder);
    return ok(await runBasecamp(args));
  }
);

addTool("show_file",
  "Show a Docs & Files item by ID or Basecamp URL: folder/vault metadata, document (with full title and body content), or upload details. " +
  "Works for any item type — pass the URL or ID from list_files output. " +
  "For documents, this is the primary way to read document content. " +
  "Use markdown=true for cleaner rendering of rich document bodies.",
  {
    id: z.string().describe("Item ID or full Basecamp URL (works for vaults, documents, and uploads)"),
    project: z.string().optional().describe("Project ID or name"),
    markdown: z.boolean().optional().describe("Return Markdown-formatted output instead of JSON (recommended for documents)"),
  },
  async ({ id, project, markdown }) => {
    const args = ["files", "show", id];
    if (project) args.push("--in", project);
    return ok(await runBasecamp(args, { markdown: markdown ?? false }));
  }
);

addTool("list_documents",
  "List documents in a project's Docs & Files (documents only, not uploads or subfolders). " +
  "Omit folder for project root. Returns paginated results — check page.has_more. " +
  "Use all=true to fetch all documents at once. To see everything including folders and uploads, use list_files.",
  {
    project: z.string().describe("Project ID or name"),
    folder: z.string().optional().describe("Folder (vault) ID — omit for project root"),
    all: z.boolean().optional().describe("Fetch all documents; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ project, folder, all, limit, page }) => {
    const args = ["files", "documents", "list", "--in", project];
    if (folder) args.push("--vault", folder);
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
  }
);

addTool("list_uploads",
  "List uploaded files in a project's Docs & Files (uploads only, not documents or subfolders). " +
  "Returns file metadata including download URLs. " +
  "Omit folder for project root. Returns paginated results — check page.has_more.",
  {
    project: z.string().describe("Project ID or name"),
    folder: z.string().optional().describe("Folder (vault) ID — omit for project root"),
    all: z.boolean().optional().describe("Fetch all uploads; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ project, folder, all, limit, page }) => {
    const args = ["files", "uploads", "list", "--in", project];
    if (folder) args.push("--vault", folder);
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
  }
);

// ── SCHEDULE ──────────────────────────────────────────────────────────────────

addTool("list_schedule_entries",
  "List schedule entries in a project. For upcoming entries across all projects, use get_schedule instead. " +
  "Returns paginated results — check page.has_more.",
  {
    project: z.string().describe("Project ID or name"),
    all: z.boolean().optional().describe("Fetch all results; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ project, all, limit, page }) => {
    const args = ["schedule", "entries", "--in", project];
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
  }
);

// ── CHAT ─────────────────────────────────────────────────────────────────────

addTool("list_chat_messages",
  "List recent messages in a project's Campfire CHAT (real-time, no subject/title). NOT message board posts. " +
  "For structured message board posts with subjects, use list_messages. " +
  "Returns paginated results — check page.has_more. " +
  "Note: all=true is not supported by the CLI for chat; use limit to control page size (default 25).",
  {
    project: z.string().describe("Project ID or name"),
    limit: z.number().int().optional().describe("Max results (default 25; all=true not available for chat)"),
    room: z.string().optional().describe("Campfire room ID (for projects with multiple rooms)"),
  },
  async ({ project, limit, room }) => {
    const args = ["chat", "messages", "--in", project];
    if (limit != null) args.push("--limit", String(limit));
    if (room) args.push("--room", room);
    return ok(wrapPaginated(await runBasecamp(args), { limit }));
  }
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
  "Cross-project todo assignments FOR THE AUTHENTICATED USER (you), grouped by priority. " +
  "Scope filters by time window. " +
  "Empty result means you have no todos in that scope — does not mean you have no todos at all. " +
  "For a different person's todos, use get_assigned_todos. " +
  "For overdue todos across all assignees, use get_overdue_todos.",
  {
    scope: z.enum(["all", "overdue", "due_today", "due_tomorrow", "due_later_this_week", "due_next_week", "completed"])
      .optional()
      .describe("'all' (default), 'overdue', 'due_today', 'due_tomorrow', 'due_later_this_week', 'due_next_week', 'completed'"),
  },
  async ({ scope }) => {
    if (!scope || scope === "all") return ok(await runBasecamp(["assignments"]));
    if (scope === "completed") return ok(await runBasecamp(["assignments", "completed"]));
    return ok(await runBasecamp(["assignments", "due", scope]));
  }
);

addTool("get_assigned_todos",
  "Cross-project todos assigned to ANY person (not limited to yourself). " +
  "Pass assignee name/ID or 'me'. Results are NOT priority-grouped (unlike get_assignments). " +
  "Use this for team-member overviews; use get_assignments for your own priority-grouped view.",
  { assignee: z.string().optional().describe("Person name, ID, or 'me' (defaults to current user)") },
  async ({ assignee }) => {
    const args = ["reports", "assigned"];
    if (assignee) args.push("--assignee", assignee);
    return ok(await runBasecamp(args));
  }
);

addTool("get_overdue_todos",
  "Get overdue todos across all projects and all assignees (not filtered to the current user). " +
  "For your own overdue todos only, use get_assignments with scope='overdue' instead. " +
  "Use assignee to filter by person (name, ID, or 'me'), and project to scope to one project.",
  {
    project: z.string().optional().describe("Project ID or name"),
    assignee: z.string().optional().describe("Filter by assignee: name, ID, or 'me'"),
  },
  async ({ project, assignee }) => {
    const args = ["reports", "overdue"];
    if (project) args.push("--project", project);
    const raw = await runBasecamp(args);
    if (!assignee) return ok(raw);

    let matchId = null;
    if (assignee === "me") {
      const me = JSON.parse(await runBasecamp(["me"]));
      matchId = String((me.data || me).id);
    }

    const envelope = JSON.parse(raw);
    const data = envelope.data || envelope;
    const filtered = {};
    for (const [key, todos] of Object.entries(data)) {
      if (!Array.isArray(todos)) { filtered[key] = todos; continue; }
      filtered[key] = todos.filter(t =>
        (t.assignees || []).some(a =>
          (matchId && String(a.id) === matchId) ||
          (!matchId && (
            String(a.id) === String(assignee) ||
            (a.name || "").toLowerCase().includes(assignee.toLowerCase()) ||
            a.email_address === assignee
          ))
        )
      );
    }
    return ok(JSON.stringify({ ...envelope, data: filtered }, null, 2));
  }
);

addTool("get_schedule",
  "Get upcoming schedule entries across all projects. For a single project's schedule, use list_schedule_entries.",
  {},
  async () => ok(await runBasecamp(["reports", "schedule"]))
);

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

addTool("list_notifications",
  "List your Basecamp notifications. Returns { data: { memories, reads, unreads }, page: { has_more } } — a structured inbox, not a flat list. " +
  "page.has_more is null (unknown); increment page param to fetch the next page.",
  { page: z.number().int().optional().describe("Page number (default: 1)") },
  async ({ page }) => {
    const args = ["notifications"];
    if (page && page > 1) args.push("--page", String(page));
    const raw = await runBasecamp(args);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return ok(raw); }
    parsed.page = { has_more: null, note: "Increment page param to fetch next page" };
    return ok(JSON.stringify(parsed, null, 2));
  }
);

addTool("mark_notifications_read",
  "Mark one or more notifications as read in parallel. " +
  "Returns { succeeded: [id, ...], failed: [{ id, reason }, ...] }. " +
  "Use page to match the page you listed notifications from (all IDs must be from the same page).",
  {
    ids: z.array(z.string()).min(1).describe("Notification ID(s)"),
    page: z.number().int().optional().describe("Page the notifications were listed on (default: 1)"),
  },
  async ({ ids, page }) => {
    const results = await Promise.allSettled(ids.map(id => {
      const args = ["notifications", "read", id];
      if (page) args.push("--page", String(page));
      return runBasecamp(args);
    }));
    return ok(JSON.stringify(collectResults(ids, results), null, 2));
  }
);

// ── SEARCH ───────────────────────────────────────────────────────────────────

// Maps Basecamp API type strings to our scope enum values.
const SCOPE_TYPE_MAP = {
  "Todo": "todo",
  "Message": "message",
  "Comment": "comment",
  "Kanban::Card": "card",
  "Document": "document",
  "Upload": "upload",
};

addTool("search",
  "Full-text search across all Basecamp content. " +
  "Note: search may miss recently created content or return incomplete results for some types. " +
  "If search misses known content, use browse_content to list by type instead — it is exhaustive. " +
  "Without scopes: returns paginated results — check page.has_more. " +
  "With scopes: returns { scopes_searched, hits_by_scope, warnings } grouped by content type. " +
  "With project_ids: runs one search per project in parallel and merges results; per-project failures appear in warnings.",
  {
    query: z.string().describe("Search query"),
    scopes: z.array(z.enum(["todo","message","comment","card","document","upload"]))
      .optional().describe("Content types to search. When provided, returns hits grouped by type instead of a flat list."),
    project_ids: z.array(z.string()).optional().describe(
      "Limit search to these project IDs or names. Runs one search per project and merges results. " +
      "Failed projects are reported in warnings rather than aborting the whole search."
    ),
    all: z.boolean().optional().describe("Fetch all results; sets page.has_more=false (ignored when scopes is set)"),
    limit: z.number().int().optional().describe("Max results"),
    sort: z.enum(["created_at", "updated_at"]).optional().describe("Sort order (default: relevance)"),
  },
  async ({ query, scopes, project_ids, all, limit, sort }) => {
    const buildArgs = (projectId) => {
      const args = ["search", query];
      if (projectId) args.push("--project", projectId);
      if (all) args.push("--all");
      else if (limit != null) args.push("--limit", String(limit));
      if (sort) args.push("--sort", sort);
      return args;
    };

    const targets = project_ids?.length ? project_ids : [null];

    if (!scopes) {
      // Flat mode: run searches in parallel, merge items.
      const settled = await Promise.allSettled(targets.map(pid => runBasecamp(buildArgs(pid))));
      const warnings = [];
      const allItems = [];
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (r.status === "fulfilled") {
          let parsed;
          try { parsed = JSON.parse(r.value); } catch { continue; }
          const items = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
          allItems.push(...items);
        } else {
          const pid = targets[i];
          const reason = r.reason?.stderr?.trim() || r.reason?.message || String(r.reason);
          warnings.push(pid ? `search in project '${pid}' failed: ${reason}` : `search failed: ${reason}`);
        }
      }
      if (targets.length === 1 && !project_ids) {
        // Single global search — use standard wrapPaginated logic.
        const raw = settled[0].status === "fulfilled" ? settled[0].value : null;
        if (!raw) return ok(JSON.stringify({ items: [], count: 0, page: { has_more: false }, warnings }, null, 2));
        return ok(wrapPaginated(raw, { all, limit }));
      }
      const result = { items: allItems, count: allItems.length, page: { has_more: false } };
      if (warnings.length) result.warnings = warnings;
      return ok(JSON.stringify(result, null, 2));
    }

    // Scoped mode: run searches in parallel, group results by type.
    const settled = await Promise.allSettled(targets.map(pid => runBasecamp(buildArgs(pid))));
    const warnings = [];
    const hits_by_scope = Object.fromEntries(scopes.map(s => [s, []]));
    let anySearched = false;

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        anySearched = true;
        let parsed;
        try { parsed = JSON.parse(r.value); } catch { continue; }
        const items = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
        for (const item of items) {
          const scope = SCOPE_TYPE_MAP[item.type];
          if (scope && hits_by_scope[scope] !== undefined) {
            hits_by_scope[scope].push(item);
          }
        }
      } else {
        const pid = targets[i];
        const reason = r.reason?.stderr?.trim() || r.reason?.message || String(r.reason);
        warnings.push(pid ? `search in project '${pid}' failed: ${reason}` : `search failed: ${reason}`);
      }
    }

    return ok(JSON.stringify({
      scopes_searched: anySearched ? scopes : [],
      hits_by_scope,
      warnings,
    }, null, 2));
  }
);

// ── BROWSE BY TYPE ────────────────────────────────────────────────────────────

addTool("browse_content",
  "Browse content across all projects by type — more reliable than search for finding all items of a given type. " +
  "type is required: 'todo', 'message', 'document', 'comment', 'card', or 'upload'. " +
  "Scoped to a single project with project param. " +
  "Zero results means no content of that type was found — not a search miss. " +
  "Returns paginated results — check page.has_more. Use all=true to fetch exhaustively.",
  {
    type: z.enum(["todo", "message", "document", "comment", "card", "upload"])
      .describe("Content type to browse"),
    project: z.string().optional().describe("Project ID or name (omit for all projects)"),
    all: z.boolean().optional().describe("Fetch all results; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
    sort: z.enum(["updated_at", "created_at"]).optional().describe("Sort field (default: updated_at)"),
    status: z.enum(["active", "trashed", "archived"]).optional().describe("Status filter (default: active)"),
  },
  async ({ type, project, all, limit, page, sort, status }) => {
    const args = ["recordings", "list", "--type", type];
    if (project) args.push("--in", project);
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    if (sort) args.push("--sort", sort);
    if (status) args.push("--status", status);
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
  }
);

// ── TIMELINE ─────────────────────────────────────────────────────────────────

addTool("get_timeline",
  "Get recent activity. Omit project for account-wide timeline. " +
  "Default returns up to 100 events; use all=true to fetch everything (slow on large accounts).",
  {
    project: z.string().optional().describe("Project ID or name (omit for account-wide)"),
    person: z.string().optional().describe("Person ID (filter to their activity)"),
    me: z.boolean().optional().describe("Show only your own activity"),
    limit: z.number().int().optional().describe("Max results (default: 100)"),
    page: z.number().int().optional().describe("Page number (use with limit for manual pagination)"),
    all: z.boolean().optional().describe("Fetch all events (may be slow on large accounts)"),
  },
  async ({ project, person, me, limit, page, all }) => {
    const args = me ? ["timeline", "me"] : ["timeline"];
    if (project) args.push("--in", project);
    if (person) args.push("--person", person);
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(await runBasecamp(args));
  }
);

// ── PEOPLE ───────────────────────────────────────────────────────────────────

addTool("list_people",
  "List people in the account or on a specific project. Returns paginated results — check page.has_more.",
  {
    project: z.string().optional().describe("Project ID or name (omit for all account members)"),
    all: z.boolean().optional().describe("Fetch all results; sets page.has_more=false"),
    limit: z.number().int().optional().describe("Max results"),
    page: z.number().int().optional().describe("Page number"),
  },
  async ({ project, all, limit, page }) => {
    const args = ["people", "list"];
    if (project) args.push("--project", project);
    if (all) args.push("--all");
    else if (limit != null) args.push("--limit", String(limit));
    if (page != null) args.push("--page", String(page));
    return ok(wrapPaginated(await runBasecamp(args), { all, limit }));
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
  "webhooks, subscriptions, templates, " +
  "accounts, schedule create/update, todos position/sweep, messages pin/publish, " +
  "timesheet, forwards, boost/reactions, tools (project dock), attachments download. " +
  "Do NOT pass --json or --md yourself — they are appended automatically. " +
  "Pass args as an array, e.g. [\"gauges\", \"list\"] or [\"checkins\", \"questions\", \"--in\", \"MyProject\"].",
  {
    args: z.array(z.string()).describe(
      "CLI arguments after 'basecamp'. Examples: " +
      "[\"gauges\", \"list\"], " +
      "[\"lineup\", \"list\"], " +
      "[\"checkins\", \"questions\", \"--in\", \"MyProject\"], " +
      "[\"templates\", \"list\"], " +
      "[\"webhooks\", \"list\", \"--in\", \"MyProject\"], " +
      "[\"timesheet\", \"report\"], " +
      "[\"forwards\", \"list\", \"--in\", \"MyProject\"]"
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
