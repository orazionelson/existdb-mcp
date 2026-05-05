/**
 * tools/query.ts
 *
 * MCP tools for executing XQuery against a live eXist-db instance via its REST API.
 *
 * eXist-db REST API reference:
 *   https://exist-db.org/exist/apps/doc/devguide_rest
 *
 * The REST endpoint accepts XQuery via:
 *   POST /exist/rest/<collection>?_query=<encoded-xquery>
 *   or
 *   POST /exist/rest/<collection> with Content-Type: application/xml (wrapped query doc)
 */

import type { QueryResult, QueryResultItem } from "../types/index.js";
import { getExistConfig, makeAuthHeader } from "./query-helpers.js";

export { getExistConfig };

// ─── XQuery wrapper document (eXist REST API format) ──────────────────────────

function buildQueryDocument(xquery: string, start = 1, max = 100): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<query xmlns="http://exist.sourceforge.net/NS/exist"
       start="${start}"
       max="${max}"
       wrap="yes"
       cache="no">
  <text><![CDATA[${xquery}]]></text>
  <properties>
    <property name="indent" value="yes"/>
  </properties>
</query>`;
}

// ─── Response parsing ──────────────────────────────────────────────────────────

function parseExistResponse(xml: string): QueryResult {
  // eXist wraps results in <exist:result hits="N" start="1" count="N">
  const hitsMatch  = /hits="(\d+)"/i.exec(xml);
  const startMatch = /start="(\d+)"/i.exec(xml);
  const hits  = hitsMatch  ? parseInt(hitsMatch[1], 10)  : 0;
  const start = startMatch ? parseInt(startMatch[1], 10) : 1;

  // Extract individual <exist:value> or node items
  const items: QueryResultItem[] = [];
  const valueRe = /<exist:value[^>]*type="([^"]*)"[^>]*>([\s\S]*?)<\/exist:value>/gi;
  let m: RegExpExecArray | null;
  let idx = 1;

  while ((m = valueRe.exec(xml)) !== null) {
    const type = m[1].includes("node") ? "node" : "atomic";
    items.push({ index: idx++, type, content: m[2].trim() });
  }

  // If no typed values found, try to extract content between wrapper tags
  if (items.length === 0) {
    const innerMatch = /<exist:result[^>]*>([\s\S]*?)<\/exist:result>/i.exec(xml);
    if (innerMatch) {
      items.push({ index: 1, type: "node", content: innerMatch[1].trim() });
    }
  }

  return { hits, start, items, raw: xml };
}

function formatQueryResult(result: QueryResult, showRaw: boolean): string {
  if (result.items.length === 0) {
    return `Query returned empty sequence. Total hits: ${result.hits}`;
  }

  const lines: string[] = [
    `**Hits:** ${result.hits} | **Showing:** ${result.items.length} item(s) from position ${result.start}`,
    "",
  ];

  for (const item of result.items) {
    lines.push(`### Item ${item.index} *(${item.type})*`);
    const lang = item.type === "node" ? "xml" : "text";
    lines.push("```" + lang);
    lines.push(item.content);
    lines.push("```");
    lines.push("");
  }

  if (showRaw) {
    lines.push("### Raw XML response");
    lines.push("```xml");
    lines.push(result.raw ?? "");
    lines.push("```");
  }

  return lines.join("\n");
}

// ─── Tool implementations ──────────────────────────────────────────────────────

/**
 * existdb_execute_query
 * Executes an XQuery expression against a configured eXist-db instance.
 */
export async function executeQuery(args: {
  xquery: string;
  collection?: string;    // default "/"
  start?: number;
  max?: number;
  endpoint?: string;
  username?: string;
  password?: string;
  show_raw?: boolean;
}): Promise<string> {
  const config = getExistConfig({
    endpoint: args.endpoint,
    username: args.username,
    password: args.password,
  });

  const collection = args.collection ?? "/";
  const restPath   = `${config.endpoint}/rest${collection}`;
  const start      = args.start ?? 1;
  const max        = args.max ?? 50;

  const body = buildQueryDocument(args.xquery, start, max);

  let response: Response;
  try {
    response = await fetch(restPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        "Authorization": makeAuthHeader(config),
      },
      body,
    });
  } catch (err) {
    return (
      `**Connection error:** Cannot reach eXist-db at \`${config.endpoint}\`.\n\n` +
      `Make sure eXist-db is running and the EXISTDB_ENDPOINT environment variable is set correctly.\n\n` +
      `Error: ${err}`
    );
  }

  const text = await response.text();

  if (!response.ok) {
    // eXist returns error details in the body
    const msgMatch = /<message>([\s\S]*?)<\/message>/i.exec(text);
    const msg = msgMatch ? msgMatch[1] : text.slice(0, 500);
    return (
      `**Query error (HTTP ${response.status}):**\n\`\`\`\n${msg}\n\`\`\``
    );
  }

  const result = parseExistResponse(text);
  return formatQueryResult(result, args.show_raw ?? false);
}

/**
 * existdb_validate_xquery
 * Performs a syntax check on an XQuery expression without executing it,
 * using eXist-db's compile endpoint.
 */
export async function validateXQuery(args: {
  xquery: string;
  endpoint?: string;
  username?: string;
  password?: string;
}): Promise<string> {
  const config = getExistConfig({
    endpoint: args.endpoint,
    username: args.username,
    password: args.password,
  });

  // eXist-db REST API: POST to /exist/rest/ with _query param and _howmany=0 returns
  // parse errors without full execution
  const url = `${config.endpoint}/rest/?_query=${encodeURIComponent(args.xquery)}&_howmany=0`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "Authorization": makeAuthHeader(config) },
    });
  } catch (err) {
    return `**Connection error:** Cannot reach eXist-db at \`${config.endpoint}\`. Error: ${err}`;
  }

  const text = await response.text();

  if (!response.ok) {
    const msgMatch = /<message>([\s\S]*?)<\/message>/i.exec(text);
    const lineMatch = /<line>(\d+)<\/line>/i.exec(text);
    const colMatch  = /<column>(\d+)<\/column>/i.exec(text);

    const msg  = msgMatch  ? msgMatch[1]  : text.slice(0, 500);
    const line = lineMatch ? ` at line ${lineMatch[1]}` : "";
    const col  = colMatch  ? `, column ${colMatch[1]}` : "";

    return `**XQuery syntax error${line}${col}:**\n\`\`\`\n${msg}\n\`\`\``;
  }

  return "✅ XQuery is syntactically valid.";
}
