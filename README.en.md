[简体中文](README.md) | **English**

# pi-web-search-lite

Adds two tools to pi: `web_search` for the web, `web_fetch` for page text; every outbound request goes through a single proxy setting.

## Install

```bash
pi install npm:pi-web-search-lite                        # from npm
pi install git:github.com/setwhite/pi-web-search-lite    # from a git repo
```

Add a search key and you are ready — no build step.

## Configuration

One JSON file: `<PI_CODING_AGENT_DIR or ~/.pi/agent>/pi-web-search-lite/config.json`. If it does not exist, everything falls back to defaults; a bad field fails startup and tells you which field it was.

**Minimal config** — fill in your key and it works:

```json
{
  "apiKeys": { "tavily": "tvly-your-key" }
}
```

Keys can also come from environment variables (`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY`, which win over the file); change `provider` to switch the default backend.

**Full example** — every option, commented; apart from the key values and the guidance overrides, the values shown are the defaults:

```jsonc
{
  // Search backend: tavily | brave | exa; can also be set per call via the provider argument
  "provider": "tavily",
  // API keys: fill in the ones you need, or use environment variables (they win over the file)
  // Env vars: TAVILY_API_KEY / BRAVE_API_KEY / EXA_API_KEY
  "apiKeys": {
    "tavily": "tvly-your-key",
    "brave": "your-key",
    "exa": "your-key"
  },

  // Proxy: the single egress point for every request; "" = direct
  "proxy": "",
  // Request timeout in milliseconds
  "timeoutMs": 30000,
  // Outbound User-Agent: defaults to "<package>/<version>" when omitted
  "userAgent": "pi-web-search-lite/0.1.0",

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
  // How much of a result may reach the model: null = host defaults; overflow is truncated and the full text is written to a temp file by default
  "context": { "maxInlineChars": null, "maxInlineLines": null, "spillToFile": true },
  // Search results: how many by default, and the ceiling
  "search": { "defaultMaxResults": 5, "maxResultsLimit": 10 },
  // Fetching: try html first, then the two provider extractors; content shorter than minChars counts as unusable; the raw argument only exists when allowRaw is on (off by default)
  "fetch": {
    "extractors": ["html", "tavily", "exa"],
    "minChars": 200,
    "allowRaw": false,
    "maxCharsPerPage": 150000
  },
  // GitHub pages are handled by the gh CLI: swap the command or raise the caps here
  "handlers": { "github": { "enabled": true, "command": "gh", "timeoutMs": 30000, "maxChars": 150000 } }
}
```

Every key is optional. Defaults and ranges: `config/README.md`; to override prompts, fill fields under `guidance.web_search` / `guidance.web_fetch`.

## Features

- Search: pick one of tavily / brave / exa — no silent switching; a missing key tells you exactly where to set it.
- Fetch: extractors are tried in the order you configure until one produces usable content (html first by default, then the provider extractors); GitHub pages go through `gh`; turn on `fetch.allowRaw` to get the `raw` argument for raw response bodies.
- Safe by default: private and loopback addresses are rejected, and every redirect hop is re-checked; oversized results are truncated with the full text spilled to a temp file.
- Controllable context: tools can be renamed, disabled or switched to on-demand discovery.
- Lean prompts: built-in prompts are single-line English; details such as "how to continue after truncation", "where to put the key" or "argument ranges" live in errors and results instead of the prompt, and renamed tools are reflected in the prompts automatically.

## Requirements

- pi host (the Node version follows the host's requirement).
- `gh` CLI **optional**: only GitHub page fetching uses it.

## Credits

- [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) — where the extractor chain and dedicated page handlers came from.
- [juicesharp/rpiv-mono · rpiv-web-tools](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-web-tools) — reference for the thin provider layer, the prompt config surface and TUI rendering.

Thanks to both authors for open-sourcing their work; this project's trade-offs come from reading their code.

## Documentation

- Goals and trade-offs: `docs/PLAN.md`
- Module layout and dependency direction: `docs/ARCHITECTURE.md`
- Task ledger: `docs/TODO.md`
- Verification records: `docs/VERIFICATION.md`
- Per-module API and contracts: the `README.md` inside each directory (`config/`, `http/`, `ssrf/`, `providers/`, `handlers/`, `extractors/`, `tools/`)

Docs are currently written in Chinese.

## Development

```bash
pnpm install
pnpm test        # unit tests, no real network
pnpm typecheck
```

CI runs the same two commands (Linux / Windows, several Node versions); the pnpm version is pinned via `packageManager`.
