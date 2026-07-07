# HookHound

<p align="center">
  <img src="https://raw.githubusercontent.com/YoungsPlace/hookhound/main/assets/hookie-hookhound-hero.webp" alt="HookHound mascot Hookie sniffing agent plugin baggage before release" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ko.md">한국어</a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/hookhound"><img src="https://img.shields.io/npm/v/hookhound?color=0ea5e9&label=npm" alt="npm version"></a>
  <a href="https://github.com/YoungsPlace/hookhound/releases/tag/v0.1.2"><img src="https://img.shields.io/badge/release-v0.1.2-14b8a6" alt="release v0.1.2"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/hookhound" alt="license"></a>
</p>

**Ship agent plugins that actually board.** HookHound sniffs broken hooks, missing manifests, unshipped `dist/` files, and package payload mistakes before users discover them.

HookHound is a CI-friendly release gate for Claude, ZCode, Codex, GJC, and OmO-style agent plugin repositories. It checks plugin manifests, hook commands, skill/agent references, and npm package payloads before a broken plugin reaches release.

> Mascot: Hookie, the airport beagle for agent plugins. If a hook script is missing from the suitcase, Hookie barks before release day.

## Quick start

```sh
npm install
npm run build
node dist/cli.js sniff --root .
```

Use the published package without installing it globally:

```sh
npm exec --package hookhound@0.1.2 -- hookhound sniff --root .
npm exec --package hookhound@0.1.2 -- hookhound sniff --root . --strict
npm exec --package hookhound@0.1.2 -- hookhound sniff --root . --json
npm exec --package hookhound@0.1.2 -- hookhound sniff --root . --format github
```

Or install the CLI globally:

```sh
npm install -g hookhound
hookhound sniff --root .
```

Exit code is non-zero when any `error` finding exists. Warnings and info findings are reported without failing the run.

## GitHub Action

```yaml
name: HookHound

on:
  pull_request:
  push:
    branches: [main]

jobs:
  sniff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: YoungsPlace/hookhound@v0.1.2
        with:
          root: .
          strict: "true"
```

Inputs:

| Input | Default | Description |
| --- | --- | --- |
| `root` | `.` | Plugin root to scan. Relative paths resolve from the GitHub workspace. |
| `strict` | `false` | Fail when no agent plugin surface is detected. |

The Action runs the HookHound CLI JSON path, emits GitHub workflow annotations for file-scoped errors and warnings, and writes a markdown job summary. Repository-level findings stay in the summary instead of being attached to fake files or lines.

## Demo proof loop

Run a clean fixture:

```sh
node dist/cli.js sniff --root test/fixtures/clean-plugin
# Verdict: PASSED
```

Run a broken generated hook fixture:

```sh
node dist/cli.js sniff --root test/fixtures/missing-dist --json
# exits 1 and reports: missing-generated-hook-artifact
```

Run a hook that escapes the plugin root with GitHub-format output:

```sh
node dist/cli.js sniff --root test/fixtures/outside-root --format github
# emits ::error ... hook-target-outside-root ... and exits 1
```
Run SARIF output locally after building:
```sh
node dist/cli.js sniff --root test/fixtures/outside-root --format sarif
# emits SARIF 2.1.0 JSON for code-scanning tools
```


Run the Action entrypoint locally after building:

```sh
GITHUB_WORKSPACE="$PWD" \
INPUT_ROOT="test/fixtures/outside-root" \
GITHUB_STEP_SUMMARY="/tmp/hookhound-summary.md" \
node dist/action.js
# exits 1, prints GitHub annotation commands, and writes the job summary
```

## What HookHound checks today

### Plugin surfaces

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.zcode-plugin/plugin.json`
- `.zcode-plugin/marketplace.json`
- `.codex/hooks.json`
- `hooks/hooks.json`
- `skills/*/SKILL.md` and `.codex/skills/*/SKILL.md`
- `agents/*.md` and `.claude-plugin/agents/*.md`
- `package.json` for npm payload modeling

### Manifest and marketplace checks

- Invalid JSON and non-object manifests
- Missing plugin metadata: `name`, `version`, `description`, `license`
- Version drift across plugin manifests
- License drift and missing root `LICENSE`
- Marketplace plugin entries that are not objects
- Missing or unresolved marketplace `source` paths

### Hook and skill checks

- Supported root template interpolation, including `${PLUGIN_ROOT}`, `${ZCODE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_ROOT}`, `${CODEX_PLUGIN_ROOT}`, `${GJC_PLUGIN_ROOT}`, and `${OMO_PLUGIN_ROOT}`
- Interpreter/wrapper hook commands such as `python3 "${PLUGIN_ROOT}/scripts/check.py"` and `/usr/bin/env node ./hooks/check.js`
- Missing hook command targets
- Missing generated `dist/` hook artifacts
- Hook targets that escape the plugin root
- Node hook script syntax errors via `node --check`
- Process hooks without timeouts
- Markdown references to missing `agents/*.md` files

### Package payload checks

- `npm pack --dry-run --json --ignore-scripts` payload modeling
- Hook targets that exist locally but are omitted from the npm package payload
- Generated hook artifacts that appear likely to be excluded by `package.json.files`

## Output modes

```sh
hookhound sniff --root .                 # human text report
hookhound sniff --root . --json          # machine-readable ScanSummary
hookhound sniff --root . --format github # GitHub annotations + markdown summary
hookhound sniff --root . --format sarif  # SARIF 2.1.0 for code scanning tools
```

The JSON shape is the stable integration surface for wrappers:

```ts
interface Finding {
  id: string
  level: "error" | "warning" | "info"
  title: string
  message: string
  file?: string
  evidence?: string
  hint?: string
  line?: number
  column?: number
}
```

`--format sarif` emits SARIF 2.1.0 with HookHound findings mapped to SARIF rules/results for adoption in code-scanning dashboards.

## Scope boundaries

HookHound currently provides local text output, machine-readable `ScanSummary` JSON, GitHub annotations/job summaries, and SARIF for code-scanning consumers. It does **not** provide:

- hosted dashboards
- telemetry or report uploads
- broad marketplace schema coverage
- a broad adapter framework
- package-manager payload simulations beyond npm

Those are intentionally deferred until real CI usage shows demand. The current goal is boring and useful: catch broken agent plugin releases in local and GitHub CI workflows without uploading project data.

## Dogfooding

HookHound has been tested against real external agent/tooling repositories. See [`docs/dogfood.md`](docs/dogfood.md) for true positives, false-positive notes, and the next scanner UX backlog.

## Marketing review

The launch positioning and README conversion review lives in [`docs/marketing-review.md`](docs/marketing-review.md). It records the applied copy, mascot, multilingual, and scope-boundary improvements.

## Roadmap

1. Harden GitHub Action usage against real plugin repositories.
2. Add fixture-backed adapter seams only when repeated implementation pressure appears.
3. Expand checks from observed failures, not imagined ecosystems.
4. Expand SARIF/code-scanning polish from real adopter feedback.

## Development

```sh
npm install
npm run build
npm test
npm run check
```

Useful fixture commands:

```sh
node dist/cli.js sniff --root test/fixtures/clean-plugin
node dist/cli.js sniff --root test/fixtures/missing-dist --json
node dist/cli.js sniff --root test/fixtures/unshipped-target --json
node dist/cli.js sniff --root test/fixtures/package-only --strict --json
```

## License

MIT
