import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
  __setCacheForTesting,
  lookupFunction,
  listNamespaceFunctions,
  searchFunctions,
  listNamespaces,
  getXQuerySnippet,
} from "../src/tools/docs.js";
import { TEST_CACHE } from "./fixtures.js";

before(() => {
  __setCacheForTesting(TEST_CACHE);
});

describe("lookupFunction", () => {
  it("finds a function by qualified name", () => {
    const out = lookupFunction({ name: "xmldb:store" });
    assert.match(out, /## xmldb:store/);
    assert.match(out, /\$collection-uri/);
    assert.match(out, /Stores a new resource/);
  });

  it("finds a function by local name", () => {
    const out = lookupFunction({ name: "store" });
    assert.match(out, /xmldb:store/);
  });

  it("supports a partial substring match", () => {
    const out = lookupFunction({ name: "remov" });
    assert.match(out, /xmldb:remove/);
  });

  it("respects the namespace filter", () => {
    const out = lookupFunction({ name: "query", namespace: "lucene" });
    assert.match(out, /ft:query/);
    assert.doesNotMatch(out, /xmldb:/);
  });

  it("reports a friendly miss", () => {
    const out = lookupFunction({ name: "nonexistent-fn-xyz" });
    assert.match(out, /No function found/);
  });
});

describe("listNamespaceFunctions", () => {
  it("lists functions by prefix", () => {
    const out = listNamespaceFunctions({ namespace: "xmldb" });
    assert.match(out, /Namespace: `xmldb`/);
    assert.match(out, /xmldb:store/);
    assert.match(out, /xmldb:remove/);
  });

  it("lists functions by URI", () => {
    const out = listNamespaceFunctions({
      namespace: "http://exist-db.org/xquery/lucene",
    });
    assert.match(out, /ft:query/);
  });

  it("falls back to listing available namespaces on miss", () => {
    const out = listNamespaceFunctions({ namespace: "nope" });
    assert.match(out, /not found/);
    assert.match(out, /xmldb/);
    assert.match(out, /ft/);
  });
});

describe("searchFunctions", () => {
  it("ranks name matches above description matches", () => {
    const out = searchFunctions({ keyword: "store" });
    const storeIdx = out.indexOf("xmldb:store");
    assert.notEqual(storeIdx, -1);
  });

  it("respects the limit parameter", () => {
    const out = searchFunctions({ keyword: "x", limit: 1 });
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    assert.equal(lines.length, 1);
  });

  it("reports no matches", () => {
    const out = searchFunctions({ keyword: "zzzzznotacrosskeyword" });
    assert.match(out, /No functions found/);
  });
});

describe("listNamespaces", () => {
  it("lists all namespaces by default", () => {
    const out = listNamespaces({});
    assert.match(out, /xmldb/);
    assert.match(out, /ft/);
    assert.match(out, /fn/);
  });

  it("filters to W3C namespaces", () => {
    const out = listNamespaces({ filter: "w3c" });
    assert.match(out, /fn/);
    assert.doesNotMatch(out, /\| `xmldb` \|/);
  });

  it("filters to eXist-db namespaces", () => {
    const out = listNamespaces({ filter: "exist" });
    assert.match(out, /xmldb/);
    assert.match(out, /ft/);
    assert.doesNotMatch(out, /\| `fn` \|/);
  });
});

describe("getXQuerySnippet", () => {
  it("returns a known snippet", () => {
    const out = getXQuerySnippet({ topic: "store-document" });
    assert.match(out, /xmldb:store/);
    assert.match(out, /```xquery/);
  });

  it("normalises whitespace in the topic key", () => {
    const out = getXQuerySnippet({ topic: "Store Document" });
    assert.match(out, /xmldb:store/);
  });

  it("lists available topics on miss", () => {
    const out = getXQuerySnippet({ topic: "unknown-topic-xyz" });
    assert.match(out, /No snippet found/);
    assert.match(out, /restxq/);
  });
});
