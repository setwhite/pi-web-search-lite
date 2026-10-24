[简体中文](README.md) | **English**

# pi-web-search-lite

![A pi session: web_search returns 5 results via exa, then web_fetch extracts the first page](https://raw.githubusercontent.com/setwhite/pi-web-search-lite/main/assets/cover.png)

The extension adds two tools to pi. `web_search` searches the web. `web_fetch` extracts the text of a page. All requests from the extension use one proxy setting.

## Design goals

- Set one search key after installation. The default extractor chain (`html` / `jina`) needs no key.
- Each failure gives the information that you need: the missing key, the missing field, the HTTP status code or the timeout source.
- The extension truncates a result that is too large. `context.spillToFile` is on by default: the full text goes to a temp file, and the result contains the path for `read`.

The full list of trade-offs and non-goals: [docs/adr/](docs/adr/).

## Install

```bash
pi install npm:pi-web-search-lite                        # from npm
pi install git:github.com/setwhite/pi-web-search-lite    # from a git repo
```

Set one search key after installation. No build step is necessary.

## Configuration

The configuration is one JSON file: `<PI_CODING_AGENT_DIR or ~/.pi/agent>/pi-web-search-lite/config.json`. If the file does not exist, all values use their defaults. If a type, enum value or unknown key is not correct, startup fails and the error names the field. An out-of-range number does not fail: the extension clamps it to the allowed range (see `RANGES` in `config/schema.ts` and `config/validate.ts`). The `//` comments in the examples are for explanation only. The real file must be strict JSON. Remove the comments before you copy the file.

**Minimal configuration**: select one search backend and set its key. The default backend is tavily.

```json
{
  "provider": "exa",
  "apiKeys": { "exa": "your-key" }
}
```

You can also set keys in environment variables (`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` / `FIRECRAWL_API_KEY` / `PERPLEXITY_API_KEY` / `PARALLEL_API_KEY` / `KEENABLE_API_KEY` / `DEEPSEEK_API_KEY` / `JINA_API_KEY`). The environment variables win over the file. `WEB_SEARCH_PROVIDER` overrides `provider` temporarily.

**Full example**: all options with comments. The key values, `userAgent`, `proxy` and the guidance fields are examples. All other values are the defaults.

```jsonc
{
  // Search backend: tavily | brave | exa | firecrawl | perplexity | parallel | keenable | deepseek; override with the WEB_SEARCH_PROVIDER env var
  "provider": "tavily",
  // API keys: fill in the ones you need, or use environment variables (they win over the file)
  // Env vars: TAVILY_API_KEY / BRAVE_API_KEY / EXA_API_KEY / FIRECRAWL_API_KEY / PERPLEXITY_API_KEY / PARALLEL_API_KEY / KEENABLE_API_KEY / DEEPSEEK_API_KEY / JINA_API_KEY
  "apiKeys": {
    "tavily": "tvly-your-key",
    "brave": "your-key",
    "exa": "your-key",
    "firecrawl": "fc-your-key",
    "perplexity": "pplx-your-key",
    "parallel": "your-key",
    "keenable": "keen_your-key",
    "deepseek": "sk-your-key",
    "jina": "jina-your-key"
  },

  // Proxy: the single egress point for the extension's own requests; "" = direct. The gh subprocess also inherits the host's HTTP(S)_PROXY; setting this writes the same variables
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
  // Fetching: extractors form a chain — tried in order, the first usable body wins; a missing key, an error or a body under minChars falls through
  // Recommended order html → your provider → jina: html and jina need no key; tavily / exa / firecrawl / parallel / keenable / deepseek are both search backends and extractors
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

All keys are optional. For the ranges (clamp) and field semantics, see `config/schema.ts` and `config/validate.ts`. To override the prompts, set fields under `guidance.web_search` / `guidance.web_fetch`.

### The three max gates

Three independent caps apply between a fetch and the model. Each result passes one or two of them.

| Key | Applies to | On overflow |
|---|---|---|
| `fetch.maxCharsPerPage` | text returned by the extractor chain (not the GitHub handler) | sliced with a `[... truncated ...]` note; the full text is not kept |
| `handlers.github.maxChars` | gh output after it is rendered to markdown | same; GitHub handler only |
| `context.maxInlineChars` / `maxInlineLines` | the envelope handed to the model (both tools) | sliced; with `spillToFile` the full text goes to a temp file and the path is included in the result |

The extension applies `Math.min` to the two `context.*` caps and the host caps, so a larger value has no effect. GitHub pages pass gates 2 and 3. Ordinary pages pass gates 1 and 3. `raw` passes gate 3 only. For the supported GitHub / Reddit URL shapes, see `parseGitHubUrl` in `handlers/github/index.ts` and `test/handlers/github-url.test.ts`.

## Features

- Search: select one of tavily / brave / exa / firecrawl / perplexity / parallel / keenable / deepseek. The extension does not switch to another backend. If a key is missing, the error gives the location to set it.
- Fetch: the extension tries the extractors in `fetch.extractors` order and uses the first extractor that works. The default order is `html` → `jina`; neither extractor needs a key. You can insert `tavily` / `exa` / `firecrawl` / `parallel` / `keenable` / `deepseek` in the middle. GitHub pages use `gh` first. By default, reddit URLs use a redlib instance with a different host (both in [docs/modules/handlers.md](docs/modules/handlers.md)). `fetch.allowRaw` enables the `raw` argument. `raw` skips the chain.
- Security: the extension rejects private and loopback addresses and checks each redirect hop. The check reads literal values only and does not resolve DNS. A domain that resolves to a private IP is still allowed. The extension truncates a result that is too large. If `context.spillToFile` is true, the full text goes to a temp file, and the result contains the path.
- Context control: you can rename or disable a tool, or switch it to on-demand discovery. This action reduces the prompt that is always in context.
- Small prompts: the built-in prompts are single-line English. Errors and results contain the continuation hint, the key location and the argument ranges, so the prompt stays small. If you rename a tool, the prompts change automatically.

## Requirements

- A pi host. Node.js 22.19.0 or later is necessary (see `engines` in `package.json`; the host can require a newer version).
- The `gh` CLI is optional. Only GitHub page fetching uses it.

## Credits

- [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) — where the extractor chain and dedicated page handlers came from.
- [juicesharp/rpiv-mono · rpiv-web-tools](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-web-tools) — reference for the thin provider layer, the prompt config surface and TUI rendering.

Both projects are fully open source. The trade-offs in this project come from their code.

## Documentation

- Trade-offs and non-goals: [docs/adr/](docs/adr/) (index: [docs/adr/README.md](docs/adr/README.md))
- Module layout and dependency direction: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Glossary: [docs/GLOSSARY.md](docs/GLOSSARY.md)
- Release notes: [CHANGELOG.md](CHANGELOG.md)

The docs are currently in Chinese.

## Development

```bash
pnpm install
pnpm lint          # biome: lint + format check (a warning fails too; add --write to fix in place)
pnpm check:imports # dependency-direction gate: executable form of docs/ARCHITECTURE.md §2
pnpm typecheck
pnpm test          # unit tests, no real network
pnpm test:e2e      # optional: live smoke test; needs keys and network; run manually before a release; not in CI
```

CI runs lint / check:imports / typecheck / test on Linux (Node 22 / 24) and Windows (Node 22). `.gitattributes` pins line endings to LF, so biome gives the same result on both systems. `packageManager` pins the pnpm version. The lint and format rules are in `biome.json` (`lineWidth` 100).

The pre-commit gate is optional and applies per clone. Run `git config core.hooksPath .githooks` once. After that, each commit runs lint / `check:imports` / typecheck / test. This step takes about 10 seconds.

Release: change `version` in `package.json`, add a `CHANGELOG.md` entry, and push to `main`. `.github/workflows/npm-publish.yml` publishes the package. If the version is already on the registry, the workflow skips the whole run.
