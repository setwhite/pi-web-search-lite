[简体中文](README.md) | **English**

# pi-web-search-lite

![A pi session: web_search returns 5 results via exa, then web_fetch extracts the first page](https://raw.githubusercontent.com/setwhite/pi-web-search-lite/main/assets/cover.png)

Adds two tools to pi: `web_search` for the web, `web_fetch` for page text; every outbound request goes through a single proxy setting.

## Install

```bash
pi install npm:pi-web-search-lite                        # from npm
pi install git:github.com/setwhite/pi-web-search-lite    # from a git repo
```

Add a search key and you are ready — no build step.

## Configuration

One JSON file: `<PI_CODING_AGENT_DIR or ~/.pi/agent>/pi-web-search-lite/config.json`. If it does not exist, everything falls back to defaults. A wrong type, enum value or unknown key fails startup and names the field; out-of-range numbers are silently clamped to the range (see `config/README.md`). The example below uses `//` comments; the real file must be strict JSON, so strip them before copying.

**Minimal config** — fill in your key and it works:

```json
{
  "apiKeys": { "tavily": "tvly-your-key" }
}
```

Keys can also come from environment variables (`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` / `FIRECRAWL_API_KEY` / `PERPLEXITY_API_KEY` / `JINA_API_KEY`, which win over the file); change `provider` to switch the default backend, or override it for one run with the `WEB_SEARCH_PROVIDER` env var.

**Full example** — every option with a comment; apart from the key values, userAgent, `proxy` and the guidance overrides, the rest are the defaults:

```jsonc
{
  // Search backend: tavily | brave | exa | firecrawl | perplexity; can also be set per call via the provider argument
  "provider": "tavily",
  // API keys: fill in the ones you need, or use environment variables (they win over the file)
  // Env vars: TAVILY_API_KEY / BRAVE_API_KEY / EXA_API_KEY / FIRECRAWL_API_KEY / PERPLEXITY_API_KEY / JINA_API_KEY
  "apiKeys": {
    "tavily": "tvly-your-key",
    "brave": "your-key",
    "exa": "your-key",
    "firecrawl": "fc-your-key",
    "perplexity": "pplx-your-key",
    "jina": "jina-your-key"
  },

  // Proxy: the single egress point for every request; "" = direct
  "proxy": "",
  // Request timeout in milliseconds
  "timeoutMs": 30000,
  // Outbound User-Agent: defaults to "<package>/<version>" when omitted
  "userAgent": "my-agent/1.0",

  // Tool switches and renaming; rename to avoid clashing with other extensions
  "tools": {
    "web_search": { "enabled": true, "name": "web_search" },
    "web_fetch": { "enabled": true, "name": "web_fetch" }
  },
  // eager: tools always in context; deferred: discovered on demand via the host's tool_search, saving context
  "activation": "eager",

  // Override the built-in prompts; omit to keep the built-in single-line English text. Fields per tool (web_search / web_fetch):
  //   description        tool description, part of the tool-search corpus; English recommended
  //   promptSnippet      the one-line entry in the tool list
  //   promptGuidelines   rules appended to the system prompt guidelines, array of strings
  "guidance": {
    "web_search": {
      "description": "Search the web; returns titles, URLs and snippets.",
      "promptSnippet": "Search the web",
      "promptGuidelines": ["web_search: cite sources as [Title](URL) links."]
    },
    "web_fetch": {
      "description": "Extract content of URL.",
      "promptSnippet": "Extract URL text",
      "promptGuidelines": ["web_fetch: use to get full text of a URL, e.g. docs or URLs found by web_search."]
    }
  },
  // The last gate before the model: content beyond either cap is truncated; null = host defaults, and values above the host caps have no effect
  "context": {
    "maxInlineChars": null,  // byte cap (lower bound 1000; smaller values are raised to 1000)
    "maxInlineLines": null,  // line cap (lower bound 50)
    "spillToFile": true      // on truncation, write the full text to <tmp>/pi-web-search-lite-*/web-{search,fetch}.md and return the path for read; false = full text is dropped
  },
  // Search results: how many by default, and the ceiling
  "search": { "defaultMaxResults": 5, "maxResultsLimit": 10 },
  // Fetching: extractors are a fallback chain — tried in order, the first usable body wins; a missing key, an error or a body under minChars falls through
  // Recommended order html → your provider (tavily / exa / firecrawl) → jina; html and jina both work without a key
  "fetch": {
    "extractors": ["html", "jina"],
    "minChars": 200,
    "allowRaw": false,               // enables the raw argument (raw response, skipping the handler and the extractor chain)
    "maxCharsPerPage": 150000        // per-page body cap, see "The three max gates" below
  },
  // Dedicated pages go to the matching handler first: github uses the gh output as is, reddit only swaps the host and hands off to the extractor chain; a skip (failure or disabled) → transparent fallthrough, reason recorded in details.handlerSkips
  "handlers": {
    "github": {
      "enabled": true,     // false = never touch gh, GitHub URLs take the extractor chain
      "command": "gh",     // executed via execFile, no shell: an executable only (PATH name or absolute path), no arguments; .cmd/.bat fails on Windows
      "timeoutMs": 30000,  // per gh subprocess; the availability probe is cached per command inside the process, so /reload after changing it
      "maxChars": 150000   // cap after gh output is rendered to markdown, see "The three max gates" below
    },
    "reddit": {
      "enabled": true,    // false = no host substitution, reddit URLs take the extractor chain as-is (turn it off if you do not want links handed to a third-party instance)
      "baseUrl": "https://redlib.catsarch.com"  // reddit only swaps the host (path is copied) for a redlib instance; the extractor chain still fetches the text; point it at your own instance, subpaths are fine
    }
  }
}
```

Every key is optional. Defaults and ranges: `config/README.md`; to override prompts, fill fields under `guidance.web_search` / `guidance.web_fetch`.

### The three max gates

A fetch result passes three independent caps on its way to the model:

| Key | Applies to | On overflow |
|---|---|---|
| `fetch.maxCharsPerPage` | text returned by the extractor chain (not the GitHub handler) | sliced with a `[... truncated ...]` note; the full text is not kept |
| `handlers.github.maxChars` | gh output after it is rendered to markdown | same; GitHub handler only |
| `context.maxInlineChars` / `maxInlineLines` | the envelope handed to the model (both tools) | sliced; with `spillToFile` the full text goes to a temp file and the path is included in the result |

Both `context.*` caps are clamped with `Math.min` against the host caps, so larger values have no effect. GitHub pages pass gates 2 and 3; ordinary pages pass 1 and 3. Supported GitHub URL shapes: `handlers/README.md`.

## Features

- Search: pick one of tavily / brave / exa / firecrawl / perplexity — no silent switching; a missing key tells you exactly where to set it.
- Fetch: extractors are a fallback chain, tried in order until one works (default `html` → `jina`, neither needs a key; insert `tavily` / `exa` / `firecrawl` in the middle). GitHub pages go through `gh`, reddit URLs are rewritten to a redlib instance by default (both in `handlers/README.md`); `fetch.allowRaw` unlocks the `raw` argument, which skips the chain.
- Safe by default: private and loopback addresses are rejected, and every redirect hop is re-checked; oversized results are truncated with the full text spilled to a temp file when `context.spillToFile` is on (the path is included in the result).
- Controllable context: tools can be renamed, disabled or switched to on-demand discovery.
- Lean prompts: built-in prompts are single-line English; how to continue after truncation, where to put the key or what the argument ranges are live in errors and results instead of the prompt, and renamed tools are reflected in the prompts automatically.

## Requirements

- pi host (the Node version follows the host's requirement).
- `gh` CLI **optional**: only GitHub page fetching uses it.

## Credits

- [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) — where the extractor chain and dedicated page handlers came from.
- [juicesharp/rpiv-mono · rpiv-web-tools](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-web-tools) — reference for the thin provider layer, the prompt config surface and TUI rendering.

Both are fully open-sourced; this project's trade-offs come from reading their code.

## Documentation

- Goals and trade-offs: `docs/PLAN.md`
- Module layout and dependency direction: `docs/ARCHITECTURE.md`
- Task ledger: `docs/TODO.md`
- Per-module API and contracts: the `README.md` inside each directory (`config/`, `http/`, `ssrf/`, `providers/`, `handlers/`, `extractors/`, `tools/`)

Docs are currently written in Chinese.

## Development

```bash
pnpm install
pnpm test        # unit tests, no real network
pnpm typecheck
```

CI runs the same two commands on Linux and Windows; the pnpm version is pinned via `packageManager`.
