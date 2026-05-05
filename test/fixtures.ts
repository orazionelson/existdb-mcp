import type { FundocsCache } from "../src/types/index.js";

/**
 * Compact, deterministic fundocs cache used by the unit tests.
 * Mirrors the shape produced by `npm run scrape -- --offline` but kept
 * separate so tests don't depend on the scraper.
 */
export const TEST_CACHE: FundocsCache = {
  generated: "2025-01-01T00:00:00.000Z",
  existdbVersion: "test-fixture",
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
            { name: "$resource-name", type: "xs:string?", cardinality: "zero or one", description: "Name of the resource" },
            { name: "$contents", type: "item()", cardinality: "exactly one", description: "Document or string to store" },
          ],
          description: "Stores a new resource in the database.",
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
          ],
          description: "Removes a resource or collection from the database.",
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
            { name: "$query", type: "item()", cardinality: "exactly one", description: "Lucene query string" },
          ],
          description: "Queries a node set using the full-text Lucene index.",
        },
      ],
    },
    {
      uri: "http://www.w3.org/2005/xpath-functions",
      prefix: "fn",
      location: "built-in",
      functions: [
        {
          name: "fn:contains",
          namespace: "http://www.w3.org/2005/xpath-functions",
          prefix: "fn",
          localName: "contains",
          returnType: "xs:boolean",
          returnCardinality: "exactly one",
          params: [
            { name: "$arg1", type: "xs:string?", cardinality: "zero or one", description: "Source string" },
            { name: "$arg2", type: "xs:string?", cardinality: "zero or one", description: "Substring to look for" },
          ],
          description: "Returns true if $arg1 contains $arg2 as a substring.",
        },
      ],
    },
  ],
};
