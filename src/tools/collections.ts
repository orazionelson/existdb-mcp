/**
 * tools/collections.ts
 *
 * MCP tools for managing eXist-db collections and documents via the REST API.
 *
 * eXist-db REST API reference:
 *   https://exist-db.org/exist/apps/doc/devguide_rest
 */

import type {
  CollectionListing,
  CollectionEntry,
} from "../types/index.js";
import { getExistConfig, makeAuthHeader } from "./query-helpers.js";
import { executeQuery } from "./query.js";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatListing(listing: CollectionListing): string {
  if (listing.entries.length === 0) {
    return `Collection \`${listing.path}\` is empty.`;
  }

  const collections = listing.entries.filter((e) => e.type === "collection");
  const resources   = listing.entries.filter((e) => e.type === "resource");

  const lines: string[] = [`## Collection: \`${listing.path}\`\n`];

  if (collections.length > 0) {
    lines.push(`### Sub-collections (${collections.length})`);
    for (const c of collections) {
      lines.push(`- 📁 \`${c.name}\``);
    }
    lines.push("");
  }

  if (resources.length > 0) {
    lines.push(`### Resources (${resources.length})`);
    for (const r of resources) {
      const meta: string[] = [];
      if (r.size)        meta.push(`${r.size} bytes`);
      if (r.modified)    meta.push(`modified: ${r.modified}`);
      if (r.permissions) meta.push(`perms: ${r.permissions}`);
      lines.push(`- 📄 \`${r.name}\`${meta.length ? ` *(${meta.join(", ")})*` : ""}`);
    }
  }

  return lines.join("\n");
}

// ─── XML collection descriptor parser ─────────────────────────────────────────

function parseCollectionDescriptor(xml: string, path: string): CollectionListing {
  const entries: CollectionEntry[] = [];

  // Sub-collections
  const colRe = /<collection[^>]*name="([^"]*)"[^/]*/gi;
  let m: RegExpExecArray | null;
  while ((m = colRe.exec(xml)) !== null) {
    const name = m[1];
    if (name && name !== path) {
      entries.push({ name, type: "collection" });
    }
  }

  // Resources
  const resRe = /<resource[^>]*name="([^"]*)"(?:[^>]*size="([^"]*)")?(?:[^>]*modified="([^"]*)")?(?:[^>]*permissions="([^"]*)")?/gi;
  while ((m = resRe.exec(xml)) !== null) {
    entries.push({
      name:        m[1],
      type:        "resource",
      size:        m[2] ? parseInt(m[2], 10) : undefined,
      modified:    m[3],
      permissions: m[4],
    });
  }

  return { path, entries };
}

// ─── Tool implementations ──────────────────────────────────────────────────────

/**
 * existdb_list_collection
 * Lists the contents of a collection (sub-collections and documents).
 */
export async function listCollection(args: {
  path: string;           // e.g. "/db/myapp"
  endpoint?: string;
  username?: string;
  password?: string;
}): Promise<string> {
  const config = getExistConfig(args);
  const url = `${config.endpoint}/rest${args.path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "Authorization": makeAuthHeader(config),
        "Accept": "application/xml",
      },
    });
  } catch (err) {
    return `**Connection error:** ${err}`;
  }

  if (response.status === 404) {
    return `Collection \`${args.path}\` does not exist.`;
  }

  if (!response.ok) {
    return `**Error (HTTP ${response.status}):** ${await response.text()}`;
  }

  const xml = await response.text();
  const listing = parseCollectionDescriptor(xml, args.path);
  return formatListing(listing);
}

/**
 * existdb_get_document
 * Retrieves the XML content of a document from eXist-db.
 */
export async function getDocument(args: {
  path: string;           // e.g. "/db/myapp/data/doc.xml"
  endpoint?: string;
  username?: string;
  password?: string;
}): Promise<string> {
  const config = getExistConfig(args);
  const url = `${config.endpoint}/rest${args.path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "Authorization": makeAuthHeader(config),
        "Accept": "application/xml",
      },
    });
  } catch (err) {
    return `**Connection error:** ${err}`;
  }

  if (response.status === 404) {
    return `Document \`${args.path}\` not found.`;
  }

  if (!response.ok) {
    return `**Error (HTTP ${response.status}):** ${await response.text()}`;
  }

  const xml = await response.text();
  return `## Document: \`${args.path}\`\n\n\`\`\`xml\n${xml}\n\`\`\``;
}

/**
 * existdb_store_document
 * Stores an XML document into an eXist-db collection.
 */
export async function storeDocument(args: {
  collection: string;     // e.g. "/db/myapp/data"
  filename: string;       // e.g. "mydoc.xml"
  content: string;        // valid XML string
  endpoint?: string;
  username?: string;
  password?: string;
}): Promise<string> {
  const config = getExistConfig(args);
  const url = `${config.endpoint}/rest${args.collection}/${args.filename}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": makeAuthHeader(config),
        "Content-Type": "application/xml",
      },
      body: args.content,
    });
  } catch (err) {
    return `**Connection error:** ${err}`;
  }

  if (response.ok || response.status === 201) {
    const path = `${args.collection}/${args.filename}`;
    return `✅ Document stored successfully at \`${path}\``;
  }

  return `**Store error (HTTP ${response.status}):** ${await response.text()}`;
}

/**
 * existdb_delete_resource
 * Deletes a document or collection from eXist-db.
 */
export async function deleteResource(args: {
  path: string;           // e.g. "/db/myapp/data/old.xml" or "/db/myapp/old-collection"
  endpoint?: string;
  username?: string;
  password?: string;
}): Promise<string> {
  const config = getExistConfig(args);
  const url = `${config.endpoint}/rest${args.path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": makeAuthHeader(config) },
    });
  } catch (err) {
    return `**Connection error:** ${err}`;
  }

  if (response.ok) {
    return `✅ Resource \`${args.path}\` deleted successfully.`;
  }

  if (response.status === 404) {
    return `Resource \`${args.path}\` not found.`;
  }

  return `**Delete error (HTTP ${response.status}):** ${await response.text()}`;
}

/**
 * existdb_create_collection
 * Creates a new collection inside an existing parent collection.
 */
export async function createCollection(args: {
  parent: string;         // e.g. "/db/myapp"
  name: string;           // e.g. "newsubcollection"
  endpoint?: string;
  username?: string;
  password?: string;
}): Promise<string> {
  // eXist-db has no plain-REST way to create an empty collection, so we go
  // through the XQuery xmldb:create-collection function.
  const xquery = `
    import module namespace xmldb = "http://exist-db.org/xquery/xmldb";
    xmldb:create-collection("${args.parent}", "${args.name}")
  `;

  return executeQuery({
    xquery,
    endpoint: args.endpoint,
    username: args.username,
    password: args.password,
  });
}
