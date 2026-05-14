#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SYNTHIA_API_BASE = (process.env.SYNTHIA_API_BASE || "https://synthia-server.onrender.com").replace(/\/$/, "");
const SYNTHIA_API_KEY = process.env.SYNTHIA_API_KEY || "";

const server = new McpServer({
  name: "trident-mcp",
  version: "1.1.0",
});

type ToolContent = { content: Array<{ type: "text"; text: string }> };
type Head = "auto" | "code" | "math" | "research";

function requestHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(SYNTHIA_API_KEY ? { Authorization: `Bearer ${SYNTHIA_API_KEY}` } : {}),
  };
}

function stringify(data: unknown): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

function toolText(data: unknown): ToolContent {
  return { content: [{ type: "text", text: stringify(data) }] };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function apiGet(path: string): Promise<ToolContent> {
  try {
    const response = await fetch(`${SYNTHIA_API_BASE}${path}`, { headers: requestHeaders() });
    const data = await readBody(response);
    if (!response.ok) {
      return toolText(`GET ${path} failed: ${response.status}\n${stringify(data)}`);
    }
    return toolText(data);
  } catch (error) {
    return toolText(`GET ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function apiPost(path: string, body: unknown): Promise<ToolContent> {
  try {
    const response = await fetch(`${SYNTHIA_API_BASE}${path}`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(body ?? {}),
    });
    const data = await readBody(response);
    if (!response.ok) {
      return toolText(`POST ${path} failed: ${response.status}\n${stringify(data)}`);
    }
    return toolText(data);
  } catch (error) {
    return toolText(`POST ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function tridentPrompt(prompt: string, head: Head = "auto", use_rag = true): Promise<ToolContent> {
  return apiPost("/trident/generate", { prompt, head, use_rag });
}

function suitePrompt(title: string, body: string): string {
  return `${title}\n\n${body}`.trim();
}

server.registerTool(
  "trident_generate",
  {
    description: "Generate a response using Trident's Code, Math, or Research head.",
    inputSchema: {
      prompt: z.string().describe("Prompt to send to Trident."),
      head: z.enum(["auto", "code", "math", "research"]).default("auto").describe("Specialist head to use."),
      use_rag: z.boolean().default(true).describe("Whether to include RAG context."),
    },
  },
  async ({ prompt, head, use_rag }) => apiPost("/trident/generate", { prompt, head, use_rag }),
);

server.registerTool(
  "trident_router",
  {
    description: "Route a prompt to Trident's best specialist head.",
    inputSchema: {
      prompt: z.string().describe("Prompt to classify."),
    },
  },
  async ({ prompt }) => apiPost("/trident/router", { prompt }),
);

server.registerTool(
  "trident_rag_add",
  {
    description: "Add a knowledge chunk to Trident RAG.",
    inputSchema: {
      text: z.string().describe("Knowledge text to store."),
      source: z.string().optional().describe("Optional source label."),
      metadata: z.record(z.any()).optional().describe("Optional metadata."),
    },
  },
  async ({ text, source, metadata }) => apiPost("/trident/rag/add", { text, source, metadata }),
);

server.registerTool(
  "trident_rag_search",
  {
    description: "Search Trident RAG knowledge.",
    inputSchema: {
      query: z.string().describe("Search query."),
      top_k: z.number().int().min(1).max(20).default(5).describe("Number of matches to return."),
    },
  },
  async ({ query, top_k }) => apiPost("/trident/rag/search", { query, top_k }),
);

server.registerTool(
  "trident_rag_list",
  {
    description: "List Trident RAG chunks.",
    inputSchema: {},
  },
  async () => apiGet("/trident/rag/list"),
);

server.registerTool(
  "code_review",
  {
    description: "Review code for bugs, deploy blockers, security issues, and minimal fixes.",
    inputSchema: {
      code: z.string().describe("Code to review."),
      language: z.string().optional().describe("Language or framework."),
      goal: z.string().optional().describe("What the code should do."),
    },
  },
  async ({ code, language, goal }) => tridentPrompt(
    suitePrompt("CODE REVIEW", `Language/framework: ${language || "unknown"}\nGoal: ${goal || "not specified"}\n\nReview for blocking errors, security issues, deploy problems, and minimal fixes only.\n\nCODE:\n${code}`),
    "code",
    true,
  ),
);

server.registerTool(
  "code_fix_patch",
  {
    description: "Produce a minimal patch for broken code without broad refactoring.",
    inputSchema: {
      code: z.string().describe("Broken code."),
      error: z.string().optional().describe("Error message or failure symptom."),
      constraints: z.string().optional().describe("Constraints such as no refactor or keep APIs stable."),
    },
  },
  async ({ code, error, constraints }) => tridentPrompt(
    suitePrompt("MINIMAL CODE PATCH", `Error/symptom: ${error || "not provided"}\nConstraints: ${constraints || "minimal changes only"}\n\nReturn a precise patch or corrected file. Preserve intent.\n\nCODE:\n${code}`),
    "code",
    true,
  ),
);

server.registerTool(
  "repo_deploy_plan",
  {
    description: "Create a deployment plan for a repo or file tree.",
    inputSchema: {
      file_tree: z.string().describe("Repo file tree or project structure."),
      platform: z.enum(["netlify", "render", "railway", "vercel", "generic"]).default("generic"),
      goal: z.string().optional().describe("Deployment goal."),
    },
  },
  async ({ file_tree, platform, goal }) => tridentPrompt(
    suitePrompt("DEPLOYMENT PLAN", `Platform: ${platform}\nGoal: ${goal || "make runnable and deployable"}\n\nGiven this file tree, identify exact build command, publish directory, env vars, blockers, and minimal fixes.\n\nTREE:\n${file_tree}`),
    "code",
    true,
  ),
);

server.registerTool(
  "oracle_ask",
  {
    description: "Ask the Synthia oracle through the live Synthia server.",
    inputSchema: {
      question: z.string().describe("Question for the oracle."),
      user_id: z.string().optional().describe("Optional user id."),
    },
  },
  async ({ question, user_id }) => apiPost("/oracle/ask", { question, user_id }),
);

server.registerTool(
  "memory_save",
  {
    description: "Save a memory entry to Synthia memory.",
    inputSchema: {
      user_id: z.string().describe("User id."),
      key: z.string().describe("Memory key."),
      value: z.any().describe("Memory value."),
    },
  },
  async ({ user_id, key, value }) => apiPost("/memory/save", { user_id, key, value }),
);

server.registerTool(
  "memory_get",
  {
    description: "Retrieve Synthia memory for a user.",
    inputSchema: {
      user_id: z.string().describe("User id."),
    },
  },
  async ({ user_id }) => apiGet(`/memory/${encodeURIComponent(user_id)}`),
);

server.registerTool(
  "consciousness_gate",
  {
    description: "Get information for a consciousness gate.",
    inputSchema: {
      gate: z.number().int().min(1).max(64).describe("Gate number from 1 to 64."),
    },
  },
  async ({ gate }) => apiGet(`/consciousness/gate/${gate}`),
);

server.registerTool(
  "consciousness_channels",
  {
    description: "List consciousness channels.",
    inputSchema: {},
  },
  async () => apiGet("/consciousness/channels"),
);

server.registerTool(
  "tool_suite_manifest",
  {
    description: "List the Trident-carried MCP tool suite by domain.",
    inputSchema: {},
  },
  async () => toolText({
    carrier: "Trident",
    protocol: "MCP over stdio",
    backend: SYNTHIA_API_BASE,
    domains: {
      core: ["trident_generate", "trident_router", "trident_rag_add", "trident_rag_search", "trident_rag_list"],
      code: ["code_review", "code_fix_patch", "repo_deploy_plan"],
      oracle_memory: ["oracle_ask", "memory_save", "memory_get"],
      consciousness: ["consciousness_gate", "consciousness_channels"],
    },
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Trident MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
