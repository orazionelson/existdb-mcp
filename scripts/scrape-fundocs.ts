#!/usr/bin/env tsx
/**
 * scrape-fundocs.ts
 *
 * Scrapes https://exist-db.org/exist/apps/fundocs and builds
 * src/cache/fundocs.json — the offline documentation cache used by the MCP server.
 *
 * Usage:
 *   npm run scrape              # fetch live from exist-db.org
 *   npm run scrape -- --offline # dry-run with embedded minimal fixture
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  FundocsCache,
  NamespaceDoc,
  FunctionSignature,
  FunctionParam,
} from "../src/types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, "../src/cache/fundocs.json");
const BROWSE_URL =
  "https://exist-db.org/exist/apps/fundocs/browse?w3c=true&extensions=true&appmodules=true";
const VIEW_BASE = "https://exist-db.org/exist/apps/fundocs/view";

// Namespaces we always want — the core built-in modules
const PRIORITY_NAMESPACES = new Set([
  "http://www.w3.org/2005/xpath-functions",
  "http://www.w3.org/2005/xpath-functions/math",
  "http://www.w3.org/2005/xpath-functions/map",
  "http://www.w3.org/2005/xpath-functions/array",
  "http://exist-db.org/xquery/util",
  "http://exist-db.org/xquery/xmldb",
  "http://exist-db.org/xquery/lucene",
  "http://exist-db.org/xquery/ft",
  "http://exist-db.org/xquery/system",
  "http://exist-db.org/xquery/request",
  "http://exist-db.org/xquery/response",
  "http://exist-db.org/xquery/session",
  "http://exist-db.org/xquery/transform",
  "http://exist-db.org/xquery/validation",
  "http://exist-db.org/xquery/compression",
  "http://exist-db.org/xquery/image",
  "http://exist-db.org/xquery/inspection",
  "http://exist-db.org/xquery/securitymanager",
  "http://exist-db.org/xquery/file",
  "http://exist-db.org/xquery/mail",
  "http://exist-db.org/xquery/sql",
  "http://exist-db.org/xquery/scheduler",
  "http://exist-db.org/xquery/cache",
  "http://exist-db.org/xquery/range",
  "http://exist-db.org/xquery/ngram",
  "http://exist-db.org/xquery/sort",
  "http://exist-db.org/xquery/repo",
  "http://exist-db.org/xquery/console",
  "http://exist-db.org/xquery/counter",
  "http://exist-db.org/xquery/process",
  "http://expath.org/ns/http-client",
  "http://expath.org/ns/zip",
  "http://exquery.org/ns/restxq",
  "http://www.functx.com",
]);

// ─── HTML parsing helpers (no cheerio dep, pure regex on fundocs markup) ─────

function extractText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNamespaceLinks(html: string): Array<{ uri: string; location: string }> {
  const links: Array<{ uri: string; location: string }> = [];
  // Match table rows: <td><a href="...?uri=...&location=...">...</a></td><td>location</td>
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const hrefRe = /href="[^"]*\?uri=([^&"]+)(?:&amp;|&)location=([^"]+)"/i;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    const cellReCopy = new RegExp(cellRe.source, "gi");
    while ((cellMatch = cellReCopy.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }
    if (cells.length >= 1) {
      const hm = hrefRe.exec(cells[0]);
      if (hm) {
        links.push({
          uri: decodeURIComponent(hm[1]),
          location: decodeURIComponent(hm[2]),
        });
      }
    }
  }
  return links;
}

/**
 * Parse the individual fundocs view page for one namespace.
 * The page renders function entries in <div class="function"> blocks.
 */
function parseFunctionPage(
  html: string,
  namespaceUri: string
): FunctionSignature[] {
  const functions: FunctionSignature[] = [];

  // Each function block starts with an <h3> containing the function name
  // followed by description, signature table, etc.
  const blockRe = /<div[^>]*class="[^"]*function[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*function|$)/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRe.exec(html)) !== null) {
    const block = blockMatch[1];

    // Function name from <h3> or <h4>
    const nameMatch = /<h[34][^>]*>\s*([^<]+)\s*<\/h[34]>/i.exec(block);
    if (!nameMatch) continue;
    const rawName = extractText(nameMatch[1]).trim();

    // Prefix is derived from namespace URI
    const prefix = derivePrefix(namespaceUri);
    const localName = rawName.includes(":") ? rawName.split(":")[1] : rawName;
    const qualifiedName = rawName.includes(":") ? rawName : `${prefix}:${rawName}`;

    // Description: first <p> after the heading
    const descMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const description = descMatch ? extractText(descMatch[1]) : "";

    // Return type
    const returnMatch = /Returns:\s*<[^>]+>\s*([^<]+)</i.exec(block);
    const returnType = returnMatch ? extractText(returnMatch[1]) : "item()*";

    // Parameters: look for <table> rows with param info
    const params: FunctionParam[] = [];
    const paramRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let paramMatch: RegExpExecArray | null;
    const paramReCopy = new RegExp(paramRe.source, "gi");
    while ((paramMatch = paramReCopy.exec(block)) !== null) {
      const cells = [...paramMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (m) => extractText(m[1])
      );
      if (cells.length >= 3 && cells[0].startsWith("$")) {
        params.push({
          name: cells[0],
          type: cells[1] || "item()",
          cardinality: cells[2] || "exactly one",
          description: cells[3] || "",
        });
      }
    }

    // Deprecated notice
    const deprecatedMatch = /deprecated[^<]*<[^>]+>([^<]+)/i.exec(block);
    const deprecated = deprecatedMatch ? extractText(deprecatedMatch[1]) : undefined;

    functions.push({
      name: qualifiedName,
      namespace: namespaceUri,
      prefix,
      localName,
      returnType,
      returnCardinality: "zero or more",
      params,
      description,
      deprecated,
    });
  }

  return functions;
}

/** Derive a conventional prefix from a namespace URI */
function derivePrefix(uri: string): string {
  const known: Record<string, string> = {
    "http://www.w3.org/2005/xpath-functions": "fn",
    "http://www.w3.org/2005/xpath-functions/math": "math",
    "http://www.w3.org/2005/xpath-functions/map": "map",
    "http://www.w3.org/2005/xpath-functions/array": "array",
    "http://exist-db.org/xquery/util": "util",
    "http://exist-db.org/xquery/xmldb": "xmldb",
    "http://exist-db.org/xquery/lucene": "ft",
    "http://exist-db.org/xquery/system": "system",
    "http://exist-db.org/xquery/request": "request",
    "http://exist-db.org/xquery/response": "response",
    "http://exist-db.org/xquery/session": "session",
    "http://exist-db.org/xquery/transform": "transform",
    "http://exist-db.org/xquery/validation": "validation",
    "http://exist-db.org/xquery/compression": "compression",
    "http://exist-db.org/xquery/image": "image",
    "http://exist-db.org/xquery/inspection": "inspect",
    "http://exist-db.org/xquery/securitymanager": "sm",
    "http://exist-db.org/xquery/file": "file",
    "http://exist-db.org/xquery/mail": "mail",
    "http://exist-db.org/xquery/sql": "sql",
    "http://exist-db.org/xquery/scheduler": "scheduler",
    "http://exist-db.org/xquery/cache": "cache",
    "http://exist-db.org/xquery/range": "range",
    "http://exist-db.org/xquery/ngram": "ngram",
    "http://exist-db.org/xquery/sort": "sort",
    "http://exist-db.org/xquery/repo": "repo",
    "http://exist-db.org/xquery/console": "console",
    "http://exist-db.org/xquery/counter": "counter",
    "http://exist-db.org/xquery/process": "proc",
    "http://expath.org/ns/http-client": "http",
    "http://expath.org/ns/zip": "zip",
    "http://exquery.org/ns/restxq": "rest",
    "http://www.functx.com": "functx",
  };
  if (known[uri]) return known[uri];
  // Derive from last path segment
  const segment = uri.replace(/\/$/, "").split(/[/:]+/).pop() ?? "ns";
  return segment.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Offline fixture — minimal data for --offline mode ────────────────────────

function buildOfflineFixture(): FundocsCache {
  console.log("[scrape] --offline mode: writing minimal fixture cache");
  return {
    generated: new Date().toISOString(),
    existdbVersion: "offline-fixture",
    namespaces: [
      {
        uri: "http://exist-db.org/xquery/xmldb",
        prefix: "xmldb",
        location: "java:org.exist.xquery.functions.xmldb.XMLDBModule",
        functions: [
          {
            name: "xmldb:store",
            namespace: "http://exist-db.org/xquery/xmldb",
            prefix: "xmldb",
            localName: "store",
            returnType: "xs:string",
            returnCardinality: "zero or one",
            params: [
              { name: "$collection-uri", type: "xs:string", cardinality: "exactly one", description: "URI of the target collection" },
              { name: "$resource-name", type: "xs:string?", cardinality: "zero or one", description: "Name of the resource (auto-generated if empty)" },
              { name: "$contents", type: "item()", cardinality: "exactly one", description: "The document or string to store" },
            ],
            description: "Stores a new resource in the database. Returns the path of the stored resource.",
          },
          {
            name: "xmldb:create-collection",
            namespace: "http://exist-db.org/xquery/xmldb",
            prefix: "xmldb",
            localName: "create-collection",
            returnType: "xs:string",
            returnCardinality: "zero or one",
            params: [
              { name: "$collection-uri", type: "xs:string", cardinality: "exactly one", description: "Parent collection URI" },
              { name: "$name", type: "xs:string", cardinality: "exactly one", description: "Name of the new collection" },
            ],
            description: "Creates a new collection as a child of the given collection.",
          },
          {
            name: "xmldb:remove",
            namespace: "http://exist-db.org/xquery/xmldb",
            prefix: "xmldb",
            localName: "remove",
            returnType: "empty-sequence()",
            returnCardinality: "exactly one",
            params: [
              { name: "$collection-uri", type: "xs:string", cardinality: "exactly one", description: "Collection URI" },
              { name: "$resource", type: "xs:string", cardinality: "zero or one", description: "Resource name; if absent the whole collection is removed" },
            ],
            description: "Removes a resource or collection from the database.",
          },
          {
            name: "xmldb:get-child-resources",
            namespace: "http://exist-db.org/xquery/xmldb",
            prefix: "xmldb",
            localName: "get-child-resources",
            returnType: "xs:string*",
            returnCardinality: "zero or more",
            params: [
              { name: "$collection-uri", type: "xs:string", cardinality: "exactly one", description: "Collection URI" },
            ],
            description: "Returns the names of all resources (documents) in the given collection.",
          },
        ],
      },
      {
        uri: "http://exist-db.org/xquery/lucene",
        prefix: "ft",
        location: "java:org.exist.xquery.modules.lucene.LuceneModule",
        functions: [
          {
            name: "ft:query",
            namespace: "http://exist-db.org/xquery/lucene",
            prefix: "ft",
            localName: "query",
            returnType: "node()*",
            returnCardinality: "zero or more",
            params: [
              { name: "$nodes", type: "node()*", cardinality: "zero or more", description: "Nodes to query against" },
              { name: "$query", type: "item()", cardinality: "exactly one", description: "Lucene query string or XML query element" },
            ],
            description: "Queries a node set using the full-text (Lucene) index. Returns matching nodes ordered by relevance score.",
          },
          {
            name: "ft:score",
            namespace: "http://exist-db.org/xquery/lucene",
            prefix: "ft",
            localName: "score",
            returnType: "xs:float",
            returnCardinality: "exactly one",
            params: [
              { name: "$node", type: "node()", cardinality: "exactly one", description: "A node returned by ft:query" },
            ],
            description: "Returns the Lucene relevance score for a node previously retrieved by ft:query.",
          },
        ],
      },
    ],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const offline = process.argv.includes("--offline");

  mkdirSync(dirname(CACHE_PATH), { recursive: true });

  if (offline) {
    const fixture = buildOfflineFixture();
    writeFileSync(CACHE_PATH, JSON.stringify(fixture, null, 2));
    console.log(`[scrape] Written offline fixture to ${CACHE_PATH}`);
    return;
  }

  // Dynamic import of fetch (Node 18+ has it globally, but we keep compat)
  const fetchFn =
    typeof fetch !== "undefined"
      ? fetch
      : (await import("node-fetch")).default;

  console.log("[scrape] Fetching namespace list from fundocs...");
  const browseHtml = await fetchFn(BROWSE_URL).then((r) => r.text());
  const allLinks = parseNamespaceLinks(browseHtml as string);

  console.log(`[scrape] Found ${allLinks.length} namespace entries`);

  // De-duplicate by URI (multiple locations → take first)
  const seen = new Map<string, string>();
  for (const { uri, location } of allLinks) {
    if (!seen.has(uri)) seen.set(uri, location);
  }

  const namespaces: NamespaceDoc[] = [];
  let count = 0;

  for (const [uri, location] of seen) {
    count++;
    const viewUrl = `${VIEW_BASE}?uri=${encodeURIComponent(uri)}&location=${encodeURIComponent(location)}`;
    process.stdout.write(`[scrape] (${count}/${seen.size}) ${uri} ... `);

    try {
      const html = await (fetchFn(viewUrl) as Promise<{ text: () => Promise<string> }>).then((r) => r.text());
      const functions = parseFunctionPage(html, uri);
      const prefix = derivePrefix(uri);

      namespaces.push({ uri, prefix, location, functions });
      console.log(`${functions.length} functions`);
    } catch (err) {
      console.log(`ERROR: ${err}`);
    }

    // Polite delay to avoid hammering the server
    await new Promise((r) => setTimeout(r, 300));
  }

  const cache: FundocsCache = {
    generated: new Date().toISOString(),
    existdbVersion: "5.x",
    namespaces,
  };

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  const totalFunctions = namespaces.reduce((s, n) => s + n.functions.length, 0);
  console.log(`\n[scrape] Done. ${namespaces.length} namespaces, ${totalFunctions} functions → ${CACHE_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
