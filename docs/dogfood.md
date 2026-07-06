# HookHound Dogfooding Report

Date: 2026-07-06
HookHound build: local `main` after v0.1.0, before v0.1.1

## Scope

HookHound was run against three real external repositories to test signal quality, false positives, and first-run UX:

| Repository | Why it was selected | Command |
| --- | --- | --- |
| `tmdgusya/glm-hammer` | Real Claude/ZCode-style plugin with hooks, skills, and agents | `node dist/cli.js sniff --root /tmp/hookhound-dogfood-glm-hammer --json` |
| `Q00/ouroboros` | Real agent workflow project with Claude/Codex hooks and many skills | `node dist/cli.js sniff --root /tmp/hookhound-dogfood-ouroboros --json` |
| `777genius/agent-teams-ai` | Adjacent AI-agent app that is not an agent plugin package | `node dist/cli.js sniff --root /tmp/hookhound-dogfood-agent-teams-ai --json` |

## Results

### `tmdgusya/glm-hammer`

Detected plugin surfaces correctly:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.zcode-plugin/plugin.json`
- `.zcode-plugin/marketplace.json`
- `hooks/hooks.json`
- 14 agent markdown files
- 4 skills

Findings:

| Finding | Classification | Notes |
| --- | --- | --- |
| `license-file-missing` warning | True positive | Manifests declare a license, but no root `LICENSE` file was present in the cloned repository. This matches the earlier manual review of the project. |

UX notes:

- This is the best demo fixture among real projects: HookHound identifies rich plugin surfaces and emits one clear, non-fatal warning.
- Good candidate for README/demo screenshots once permission/social context is considered.

### `Q00/ouroboros`

Detected plugin surfaces correctly:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.codex/hooks.json`
- `hooks/hooks.json`
- many `.claude-plugin/skills/*/SKILL.md` files
- many `skills/*/SKILL.md` files

Findings:

| Finding | Classification | Notes |
| --- | --- | --- |
| `missing-hook-target` for `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/*.py"` | Fixed on `main` after v0.1.1 / parser gap closed | HookHound now tokenizes interpreter/wrapper command strings and resolves the templated script argument instead of treating the whole shell command as a path. |
| `referenced-agent-file-missing` for `agents/*.md` references | Likely UX gap / packaging gap | Matching files exist under `src/ouroboros/agents/*.md`, not root `agents/*.md`. HookHound cannot yet distinguish source-tree references that are copied into plugin payloads by a release process from genuinely missing packaged files. |

UX notes:

- The scan found real structural ambiguity but originally over-reported shell interpreter commands as hard errors.
- Parser follow-up is now covered by the `interpreter-command` fixture: `python3`, `node`, `/usr/bin/env`, quoted root-template paths, and flags resolve to real script targets.
- The referenced-agent check still needs package-root awareness or an allowlist/config escape hatch for generated/synced payloads.

### `777genius/agent-teams-ai`

Detected surfaces:

- `package.json` only

Findings:

| Finding | Classification | Notes |
| --- | --- | --- |
| `no-agent-plugin-surface` warning | Expected non-plugin result | This is an AI-agent desktop app, not an agent plugin package. Non-strict mode correctly warns rather than fails. |

UX notes:

- The warning is useful but could be friendlier: “This does not look like an agent plugin repo” is clearer than “Run HookHound at the plugin repository root” for adjacent non-plugin projects.
- README should show that HookHound is intentionally plugin-package focused, not a general AI-agent app linter.

## Follow-up backlog

1. **Shell command target parsing** — fixed on `main` after v0.1.1
   - Parses command strings like `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.py"`.
   - Inspects templated path-like arguments after interpreter or `/usr/bin/env` wrapper tokens.
   - Avoids resolving the full command string as a filesystem path.

2. **Payload/source reference awareness**
   - Add configuration or adapter hints for generated plugin payloads where `src/**/agents/*.md` are copied into root `agents/*.md` during packaging.
   - Avoid hard errors when a reference is plausibly source-generated unless the package payload check can prove it is omitted.

3. **Non-plugin UX copy**
   - Improve `no-agent-plugin-surface` messaging for adjacent AI projects.
   - Keep strict mode failing; keep non-strict mode warning-only.

4. **Dogfood fixture candidates**
   - `glm-hammer`: good low-noise positive fixture.
   - `ouroboros`: good adversarial fixture for command parsing and generated payload references.
   - `agent-teams-ai`: good non-plugin baseline.

## Summary

HookHound is useful today on real plugin repos. Dogfooding exposed one important false-positive class — shell command strings with interpreters — and that gap is now covered on `main` by shell-aware command target parsing. The remaining highest-value UX gap is package/source reference awareness for generated agent payloads.
