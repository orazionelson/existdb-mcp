# existdb-mcp

An **MCP (Model Context Protocol) server** that connects Claude to
[eXist-db](https://exist-db.org) — the native XML database widely used in
the **digital humanities** as the backbone of TEI Publisher, scholarly
editions, linguistic corpora and institutional archives.

If you work with **TEI/XML corpora**, manage a **DH project**, or develop
**XQuery applications**, this server lets Claude:

- read your offline copy of the eXist-db function reference,
- run XQueries against your live database,
- inspect, retrieve, store and delete documents and collections —

all through natural-language prompts in **Claude Code** or
**Claude Desktop**. No more context-switching between the chat, eXide and
the REST endpoint.

### What you get

- 📚 **Offline documentation lookup** — full signatures for every built-in
  function, served from a local cache of the eXist-db fundocs (no internet
  needed once scraped)
- ⚙️ **Live XQuery execution** — run queries against your eXist-db instance
  via the REST API, with paginated results
- 🗄️ **Collection management** — list, create, store, retrieve and delete
  collections and documents (think `/db/corpus`, `/db/apps/edition`, …)
- 🧠 **XQuery snippets** — ready-to-paste templates for common patterns
  (RESTXQ endpoints, Lucene full-text, XSLT pipelines, HTTP client, …)

### Who is this for?

- 👩‍💻 **XQuery / eXist-db developers** building apps, RESTXQ APIs or data
  pipelines.
  > *"Look up `xmldb:store`, then store this XML as `/db/myapp/data/01.xml`."*

- 📜 **Researchers & digital humanists** working on TEI editions, corpora
  or critical editions.
  > *"Extract all `<persName>` values from `/db/corpus` and return a
  > frequency-ordered list."*

- 🗂️ **Archivists & curators** managing XML-encoded collections (EAD, TEI,
  METS, EpiDoc, …).
  > *"List every document in `/db/archive/finding-aids` modified in the
  > last 30 days, with size and last editor."*

---

## Table of contents

- [Quick start](#quick-start)
- [Configuring Claude](#configuring-claude)
- [Environment variables](#environment-variables)
- [Available tools](#available-tools)
- [Example prompts](#example-prompts)
  - [Working with TEI corpora](#working-with-tei-corpora)
- [Ecosystem](#ecosystem)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Regenerating the documentation cache](#regenerating-the-documentation-cache)
- [Project structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/your-username/existdb-mcp.git
cd existdb-mcp
npm install
```

### 2. Build the documentation cache

This scrapes
[exist-db.org/exist/apps/fundocs](https://exist-db.org/exist/apps/fundocs)
and writes `src/cache/fundocs.json`:

```bash
npm run scrape
```

> **No internet, or want to try the server right away?**
> Use the offline fixture instead — it ships a tiny but real cache so the
> documentation tools work out of the box:
> ```bash
> npm run scrape -- --offline
> ```

### 3. Build the TypeScript

```bash
npm run build
```

The build step compiles `src/` to `dist/` and copies the documentation cache
into `dist/cache/` so the server can find it at runtime.

### 4. Try it

```bash
npm start
# > existdb-mcp running on stdio
```

The server speaks the MCP stdio protocol — point an MCP client at it (see
below) to start using the tools.

---

## Configuring Claude

### Claude Code

Add to your project's `.claude/mcp.json` (or `~/.claude/mcp.json` for a
global install):

```json
{
  "mcpServers": {
    "existdb": {
      "command": "node",
      "args": ["/absolute/path/to/existdb-mcp/dist/index.js"],
      "env": {
        "EXISTDB_ENDPOINT": "http://localhost:8080/exist",
        "EXISTDB_USER": "admin",
        "EXISTDB_PASSWORD": "your-password"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "existdb": {
      "command": "node",
      "args": ["/absolute/path/to/existdb-mcp/dist/index.js"],
      "env": {
        "EXISTDB_ENDPOINT": "http://localhost:8080/exist",
        "EXISTDB_USER": "admin",
        "EXISTDB_PASSWORD": "your-password"
      }
    }
  }
}
```

Restart Claude Desktop / Claude Code and the `existdb` tools will appear in
the available-tools list.

> **Tip — docs only, no eXist-db running?** You can omit the `env` block
> entirely. The documentation tools work offline; only the query/collection
> tools require a live server.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `EXISTDB_ENDPOINT` | `http://localhost:8080/exist` | eXist-db base URL (no trailing `/rest`) |
| `EXISTDB_USER`     | `admin`                       | eXist-db username |
| `EXISTDB_PASSWORD` | *(empty)*                     | eXist-db password |

All three can also be passed inline as arguments to any tool call (`endpoint`,
`username`, `password`) — useful when you want Claude to connect to a
different instance for one-off queries.

---

## Available tools

### Documentation (offline — no eXist-db needed)

| Tool | Description |
|---|---|
| `existdb_lookup_function`           | Full docs for a function: signature, params, return type |
| `existdb_list_namespace_functions`  | All functions in a namespace (e.g. `xmldb`, `ft`, `util`) |
| `existdb_search_functions`          | Full-text search across function names and descriptions |
| `existdb_list_namespaces`           | Summary table of all available namespaces |
| `existdb_get_xquery_snippet`        | Ready-to-use XQuery snippet for a common pattern |

Snippet topics: `store-document`, `fulltext-search`, `restxq`, `http-client`,
`security`, `transform-xslt`, `collection-query`.

### Query execution (requires a live eXist-db)

| Tool | Description |
|---|---|
| `existdb_execute_query`     | Execute an XQuery expression, returns paginated results |
| `existdb_validate_xquery`   | Check XQuery syntax without executing |

### Collection management (requires a live eXist-db)

| Tool | Description |
|---|---|
| `existdb_list_collection`   | List sub-collections and documents in a collection |
| `existdb_get_document`      | Retrieve the XML content of a document |
| `existdb_store_document`    | Create or replace a document via PUT |
| `existdb_delete_resource`   | Delete a document or collection |
| `existdb_create_collection` | Create a new sub-collection |

---

## Example prompts

Once connected to Claude, you can ask things like:

**Discover the API**
```
What parameters does xmldb:store accept?
List all functions in the Lucene full-text namespace.
Search for functions related to scheduling.
Show me a RESTXQ endpoint snippet.
What namespaces are available for security?
```

**Query a live database**
```
On my local eXist-db, run:
  for $doc in collection("/db/myapp")//record
  return $doc/title/string(.)
```

```
Validate this XQuery without running it:
  let $x := 1
  return $x +
```

```
Count how many documents are in /db/apps/dashboard.
```

**Manage collections and documents**
```
List the contents of /db/myapp/data.

Create a new collection called "drafts" inside /db/myapp.

Store this XML as /db/myapp/config/settings.xml:
  <settings><theme>dark</theme></settings>

Show me the contents of /db/myapp/config/settings.xml.

Delete the resource at /db/myapp/tmp/old-import.xml.
```

**Combine the two**
```
Look up xmldb:store, then use it to save
  <todo><item>Write tests</item></todo>
as /db/scratch/todo.xml.
```

### Working with TEI corpora

If your collections contain TEI/XML, you can drive most of the day-to-day
philological work straight from the chat.

**Metadata from `<teiHeader>`**
```
List the title, author and publication date for every document in
/db/corpus by reading the teiHeader.
```

**Named entities**
```
Extract all <persName> values from /db/corpus, deduplicate them and
return a frequency-ordered list.
```

```
Find every occurrence of <placeName ref="..."/> in /db/corpus/letters
and group them by the `ref` attribute.
```

**Provenance and curation**
```
Show me documents in /db/corpus that have been modified in the last 7
days, ordered by modification date.
```

```
Validate that every TEI file in /db/corpus has a non-empty
<sourceDesc>; list the offending paths.
```

**Lightweight stylometry / text analysis**
```
Count the occurrences of <said> per speaker across /db/corpus/plays
using the Lucene full-text index for speed.
```

**Importing and exporting**
```
Store this TEI fragment as /db/corpus/drafts/letter-042.xml:
  <TEI xmlns="http://www.tei-c.org/ns/1.0"> ... </TEI>
```

```
Apply /db/corpus/xslt/tei-to-html.xsl to
/db/corpus/letters/letter-001.xml and return the HTML.
```

> **Tip** — for namespace-aware queries (every TEI document lives under
> `xmlns="http://www.tei-c.org/ns/1.0"`), ask Claude to declare
> `declare default element namespace "http://www.tei-c.org/ns/1.0";` at
> the top of the XQuery. The model is happy to do this when you mention
> "TEI" in the prompt.

---

## Ecosystem

A few projects you'll likely want next to this one:

- [TEI Publisher](https://teipublisher.com) — the most common front-end
  for TEI editions on top of eXist-db
- [TEI Guidelines](https://tei-c.org/guidelines/) — the canonical reference
  for the encoding scheme
- [eXide](https://exist-db.org/exist/apps/eXide/) — the in-browser IDE
  bundled with eXist-db; useful when Claude hands you a query you want to
  tweak by hand

---

## Testing

The project ships with unit tests for the offline pieces (documentation
lookup and config resolution). They use Node's built-in test runner, so
there's no extra dependency:

```bash
npm test
```

Tests inject a small fixture cache directly, so you don't need to run the
scraper or have an eXist-db instance up.

For end-to-end checks against a real database, the easiest path is:

```bash
# 1. Start eXist-db (Docker is the quickest)
docker run -d --rm -p 8080:8080 --name exist existdb/existdb:latest

# 2. Wait until http://localhost:8080/exist returns 200, then:
EXISTDB_PASSWORD=  node dist/index.js
# and exercise the tools through your MCP client
```

---

## Troubleshooting

**`fundocs.json not found at …/dist/cache/fundocs.json`**
The build step couldn't find the documentation cache. Run
`npm run scrape` (or `npm run scrape -- --offline` for the fixture) and then
`npm run build` again — the post-build step copies the cache into `dist/`.

**`Connection error: Cannot reach eXist-db at …`**
The query/collection tools couldn't open a TCP connection. Check that:
- eXist-db is running and reachable at `EXISTDB_ENDPOINT`
- the URL has **no** trailing `/rest` (the server appends it automatically)
- a firewall isn't blocking the port

**`Query error (HTTP 401)`**
The credentials are wrong or missing. Set `EXISTDB_USER` / `EXISTDB_PASSWORD`,
or pass `username` / `password` explicitly in the tool call. The default
`admin` user has an empty password on a fresh install.

**`XQuery syntax error at line N, column M`**
This is the eXist-db parser talking — the query has invalid XQuery. Use
`existdb_validate_xquery` to iterate quickly without executing.

**The server starts but Claude doesn't see the tools**
- Make sure the `args` path in your MCP config points to the **compiled**
  `dist/index.js`, not the TypeScript source
- Restart Claude Code / Claude Desktop after editing the MCP config
- Check Claude's MCP logs for stderr from the server

---

## Regenerating the documentation cache

The cache is tied to the eXist-db version it was scraped from. Regenerate
it whenever you upgrade or want fresher docs:

```bash
npm run scrape   # ~2–3 minutes, polite 300 ms delay between namespaces
npm run build
```

---

## Project structure

```
existdb-mcp/
├── src/
│   ├── index.ts                  # MCP server entry point
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   ├── tools/
│   │   ├── docs.ts               # Documentation lookup tools
│   │   ├── query.ts              # XQuery execution tools
│   │   ├── query-helpers.ts      # Shared auth / config helpers
│   │   └── collections.ts        # Collection management tools
│   └── cache/
│       └── fundocs.json          # Generated by `npm run scrape`
├── scripts/
│   ├── scrape-fundocs.ts         # Fundocs scraper
│   └── copy-cache.mjs            # Post-build cache copy
├── test/
│   ├── fixtures.ts               # Deterministic fundocs fixture
│   ├── docs.test.ts              # Documentation tools tests
│   └── query-helpers.test.ts     # Config / auth helpers tests
├── dist/                         # Compiled output (npm run build)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Contributing

Issues and pull requests are welcome. Please run `npm test` and
`npm run build` before submitting.

---

## License

MIT — see [LICENSE](LICENSE).
