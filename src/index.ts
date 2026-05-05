#!/usr/bin/env node
/**
 * existdb-mcp — Main entry point
 *
 * An MCP server that assists XQuery development for eXist-db.
 * Exposes tools for:
 *   - Documentation lookup  (offline, from fundocs.json cache)
 *   - XQuery execution      (live, via eXist-db REST API)
 *   - Collection management (live, via eXist-db REST API)
 *
 * Configuration via environment variables:
 *   EXISTDB_ENDPOINT   default: http://localhost:8080/exist
 *   EXISTDB_USER       default: admin
 *   EXISTDB_PASSWORD   default: (empty)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import {
  lookupFunction,
  listNamespaceFunctions,
  searchFunctions,
  listNamespaces,
  getXQuerySnippet,
} from "./tools/docs.js";

import { executeQuery, validateXQuery } from "./tools/query.js";

import {
  listCollection,
  getDocument,
  storeDocument,
  deleteResource,
  createCollection,
} from "./tools/collections.js";

// ─── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  // ── Documentation tools ──────────────────────────────────────────────────────
  {
    name: "existdb_lookup_function",
    description:
      "Look up the documentation for one or more eXist-db / XQuery functions by name. " +
      "Returns the full signature, parameter descriptions, return type, and usage notes. " +
      "Accepts a local name (e.g. 'store'), a prefixed name (e.g. 'xmldb:store'), or a partial match.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Function name to look up, e.g. 'store', 'xmldb:store', or 'ft:query'",
        },
        namespace: {
          type: "string",
          description: "Optional namespace URI or prefix to restrict the search, e.g. 'xmldb' or 'http://exist-db.org/xquery/xmldb'",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "existdb_list_namespace_functions",
    description:
      "Lists all documented functions in a given eXist-db / XQuery namespace. " +
      "Accepts a namespace URI or a conventional prefix (e.g. 'xmldb', 'ft', 'util', 'sm', 'fn').",
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: "Namespace URI or prefix, e.g. 'xmldb', 'ft', 'http://exist-db.org/xquery/lucene'",
        },
      },
      required: ["namespace"],
    },
  },
  {
    name: "existdb_search_functions",
    description:
      "Full-text search across all eXist-db / XQuery function names and descriptions. " +
      "Useful for discovering functions when you know what you want to do but not the exact name.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Keyword to search for, e.g. 'index', 'collection', 'transform', 'schedule'",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 15)",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "existdb_list_namespaces",
    description:
      "Returns a summary table of all available namespaces in the documentation cache, " +
      "including their conventional prefix and the number of documented functions.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "w3c", "exist", "expath", "appmodule"],
          description: "Filter by namespace category: 'w3c' (XPath/XQuery standard), 'exist' (eXist-db extensions), 'expath' (EXPath/EXQuery), 'appmodule' (application-level modules)",
        },
      },
    },
  },
  {
    name: "existdb_get_xquery_snippet",
    description:
      "Returns a ready-to-use XQuery code snippet for a common eXist-db programming pattern. " +
      "Available topics: store-document, fulltext-search, restxq, http-client, security, transform-xslt, collection-query.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Snippet topic, e.g. 'store-document', 'fulltext-search', 'restxq', 'http-client', 'security', 'transform-xslt', 'collection-query'",
        },
      },
      required: ["topic"],
    },
  },

  // ── Query execution tools ─────────────────────────────────────────────────────
  {
    name: "existdb_execute_query",
    description:
      "Executes an XQuery expression against a live eXist-db instance via the REST API " +
      "and returns the results. Requires EXISTDB_ENDPOINT, EXISTDB_USER, EXISTDB_PASSWORD env vars, " +
      "or pass endpoint/username/password directly.",
    inputSchema: {
      type: "object",
      properties: {
        xquery: {
          type: "string",
          description: "The XQuery expression to execute",
        },
        collection: {
          type: "string",
          description: "Collection context path (default: '/')",
        },
        start: {
          type: "number",
          description: "Start position in result set (default: 1)",
        },
        max: {
          type: "number",
          description: "Maximum number of results to return (default: 50)",
        },
        endpoint: {
          type: "string",
          description: "eXist-db base URL (overrides EXISTDB_ENDPOINT env var)",
        },
        username: {
          type: "string",
          description: "eXist-db username (overrides EXISTDB_USER env var)",
        },
        password: {
          type: "string",
          description: "eXist-db password (overrides EXISTDB_PASSWORD env var)",
        },
        show_raw: {
          type: "boolean",
          description: "Include the raw XML REST API response (default: false)",
        },
      },
      required: ["xquery"],
    },
  },
  {
    name: "existdb_validate_xquery",
    description:
      "Validates the syntax of an XQuery expression against a live eXist-db instance " +
      "without executing it. Returns syntax errors with line/column information if present.",
    inputSchema: {
      type: "object",
      properties: {
        xquery: {
          type: "string",
          description: "The XQuery expression to validate",
        },
        endpoint: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
      },
      required: ["xquery"],
    },
  },

  // ── Collection management tools ───────────────────────────────────────────────
  {
    name: "existdb_list_collection",
    description:
      "Lists the contents of an eXist-db collection: sub-collections and XML documents " +
      "with metadata (size, permissions, modification date).",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Collection path, e.g. '/db' or '/db/myapp/data'",
        },
        endpoint: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "existdb_get_document",
    description:
      "Retrieves the XML content of a document stored in eXist-db.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Full document path, e.g. '/db/myapp/data/record.xml'",
        },
        endpoint: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "existdb_store_document",
    description:
      "Stores (creates or replaces) an XML document in an eXist-db collection via PUT.",
    inputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Target collection path, e.g. '/db/myapp/data'",
        },
        filename: {
          type: "string",
          description: "Document filename, e.g. 'record.xml'",
        },
        content: {
          type: "string",
          description: "Valid XML string content of the document",
        },
        endpoint: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
      },
      required: ["collection", "filename", "content"],
    },
  },
  {
    name: "existdb_delete_resource",
    description:
      "Deletes a document or collection from eXist-db. Use with caution — deletion is permanent.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Full path to the document or collection to delete",
        },
        endpoint: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "existdb_create_collection",
    description:
      "Creates a new sub-collection inside an existing eXist-db collection.",
    inputSchema: {
      type: "object",
      properties: {
        parent: {
          type: "string",
          description: "Parent collection path, e.g. '/db/myapp'",
        },
        name: {
          type: "string",
          description: "Name of the new sub-collection",
        },
        endpoint: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
      },
      required: ["parent", "name"],
    },
  },
];

// ─── Server bootstrap ──────────────────────────────────────────────────────────

const server = new Server(
  { name: "existdb-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// Dispatch tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    let content: string;

    switch (name) {
      // Documentation
      case "existdb_lookup_function":
        content = lookupFunction(a as Parameters<typeof lookupFunction>[0]);
        break;
      case "existdb_list_namespace_functions":
        content = listNamespaceFunctions(a as Parameters<typeof listNamespaceFunctions>[0]);
        break;
      case "existdb_search_functions":
        content = searchFunctions(a as Parameters<typeof searchFunctions>[0]);
        break;
      case "existdb_list_namespaces":
        content = listNamespaces(a as Parameters<typeof listNamespaces>[0]);
        break;
      case "existdb_get_xquery_snippet":
        content = getXQuerySnippet(a as Parameters<typeof getXQuerySnippet>[0]);
        break;

      // Query execution
      case "existdb_execute_query":
        content = await executeQuery(a as Parameters<typeof executeQuery>[0]);
        break;
      case "existdb_validate_xquery":
        content = await validateXQuery(a as Parameters<typeof validateXQuery>[0]);
        break;

      // Collection management
      case "existdb_list_collection":
        content = await listCollection(a as Parameters<typeof listCollection>[0]);
        break;
      case "existdb_get_document":
        content = await getDocument(a as Parameters<typeof getDocument>[0]);
        break;
      case "existdb_store_document":
        content = await storeDocument(a as Parameters<typeof storeDocument>[0]);
        break;
      case "existdb_delete_resource":
        content = await deleteResource(a as Parameters<typeof deleteResource>[0]);
        break;
      case "existdb_create_collection":
        content = await createCollection(a as Parameters<typeof createCollection>[0]);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: "text", text: content }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `**Error:** ${msg}` }],
      isError: true,
    };
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("existdb-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
