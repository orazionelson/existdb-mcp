/**
 * tools/query-helpers.ts
 *
 * Shared helpers for talking to the eXist-db REST API:
 *   - resolves the connection config from arguments + environment variables
 *   - builds the HTTP Basic Authorization header
 */

import type { ExistConfig } from "../types/index.js";

const DEFAULT_ENDPOINT = "http://localhost:8080/exist";
const DEFAULT_USER = "admin";
const DEFAULT_PASSWORD = "";

/**
 * Returns a fully-resolved ExistConfig.
 *
 * Precedence (highest → lowest):
 *   1. Explicit arguments passed to the tool call
 *   2. Environment variables (EXISTDB_ENDPOINT / EXISTDB_USER / EXISTDB_PASSWORD)
 *   3. Sensible defaults (localhost:8080, admin, no password)
 *
 * The returned `endpoint` is normalised: any trailing slash is stripped so
 * callers can safely append `/rest...`.
 */
export function getExistConfig(args: {
  endpoint?: string;
  username?: string;
  password?: string;
}): ExistConfig {
  const endpoint =
    (args.endpoint ?? process.env.EXISTDB_ENDPOINT ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const username = args.username ?? process.env.EXISTDB_USER ?? DEFAULT_USER;
  const password = args.password ?? process.env.EXISTDB_PASSWORD ?? DEFAULT_PASSWORD;

  return { endpoint, username, password };
}

/**
 * Builds an HTTP Basic Authorization header value for the given config.
 */
export function makeAuthHeader(config: ExistConfig): string {
  const token = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return `Basic ${token}`;
}
