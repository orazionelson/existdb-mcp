/**
 * Shared TypeScript types used across the MCP server tools and the
 * fundocs scraper.
 */

// ─── Documentation cache ───────────────────────────────────────────────────────

export interface FunctionParam {
  name: string;
  type: string;
  cardinality: string;
  description: string;
}

export interface FunctionSignature {
  name: string;
  namespace: string;
  prefix: string;
  localName: string;
  returnType: string;
  returnCardinality: string;
  params: FunctionParam[];
  description: string;
  deprecated?: string;
}

export interface NamespaceDoc {
  uri: string;
  prefix: string;
  location: string;
  functions: FunctionSignature[];
}

export interface FundocsCache {
  generated: string;
  existdbVersion: string;
  namespaces: NamespaceDoc[];
}

// ─── Live eXist-db API ─────────────────────────────────────────────────────────

export interface ExistConfig {
  endpoint: string;
  username: string;
  password: string;
}

export interface QueryResultItem {
  index: number;
  type: "node" | "atomic";
  content: string;
}

export interface QueryResult {
  hits: number;
  start: number;
  items: QueryResultItem[];
  raw?: string;
}

export interface CollectionEntry {
  name: string;
  type: "collection" | "resource";
  size?: number;
  modified?: string;
  permissions?: string;
}

export interface CollectionListing {
  path: string;
  entries: CollectionEntry[];
}

export interface StoreResult {
  path: string;
  ok: boolean;
}
