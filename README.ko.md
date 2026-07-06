# HookHound

<p align="center">
  <img src="https://raw.githubusercontent.com/YoungsPlace/hookhound/main/assets/hookie-hookhound-hero.webp" alt="HookHound 마스코트 Hookie가 릴리즈 전 agent plugin 짐을 검사하는 모습" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ko.md">한국어</a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/hookhound"><img src="https://img.shields.io/npm/v/hookhound?color=0ea5e9&label=npm" alt="npm version"></a>
  <a href="https://github.com/YoungsPlace/hookhound/releases/tag/v0.1.1"><img src="https://img.shields.io/badge/release-v0.1.1-14b8a6" alt="release v0.1.1"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/hookhound" alt="license"></a>
</p>

**제대로 탑승 가능한 agent plugin을 릴리즈하세요.** HookHound는 사용자가 깨진 플러그인을 만나기 전에 망가진 hook, 빠진 manifest, npm payload에 안 들어간 `dist/` 파일, 패키징 실수를 먼저 sniff합니다.

HookHound는 Claude, ZCode, Codex, GJC, OmO 스타일 agent plugin 저장소를 위한 CI 친화적 release gate입니다. 릴리즈 전에 plugin manifest, hook command, skill/agent reference, npm package payload를 검사합니다.

> 마스코트: Hookie, agent plugin 공항 보안견입니다. hook script가 릴리즈 가방 밖에 빠져 있으면 release day 전에 짖어줍니다.

## 빠른 시작

```sh
npm install
npm run build
node dist/cli.js sniff --root .
```

글로벌 설치 없이 공개 패키지 실행:

```sh
npm exec --package hookhound@0.1.1 -- hookhound sniff --root .
npm exec --package hookhound@0.1.1 -- hookhound sniff --root . --strict
npm exec --package hookhound@0.1.1 -- hookhound sniff --root . --json
npm exec --package hookhound@0.1.1 -- hookhound sniff --root . --format github
```

글로벌 설치:

```sh
npm install -g hookhound
hookhound sniff --root .
```

`error` finding이 하나라도 있으면 exit code가 non-zero가 됩니다. `warning`과 `info`는 보고하지만 실행을 실패시키지는 않습니다.

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
      - uses: YoungsPlace/hookhound@v0.1.1
        with:
          root: .
          strict: "true"
```

| 입력 | 기본값 | 설명 |
| --- | --- | --- |
| `root` | `.` | 검사할 plugin root입니다. 상대 경로는 GitHub workspace 기준으로 해석됩니다. |
| `strict` | `false` | agent plugin surface가 없을 때도 Action을 실패시킵니다. |

Action은 HookHound CLI JSON 경로를 실행하고, 파일 위치가 있는 error/warning은 GitHub annotation으로 출력하며, markdown job summary를 작성합니다. 파일 위치가 없는 repo-level finding은 가짜 파일/라인에 붙이지 않고 summary에만 남깁니다.

## Demo proof loop

깨끗한 fixture:

```sh
node dist/cli.js sniff --root test/fixtures/clean-plugin
# Verdict: PASSED
```

generated hook artifact가 빠진 fixture:

```sh
node dist/cli.js sniff --root test/fixtures/missing-dist --json
# exits 1 and reports: missing-generated-hook-artifact
```

plugin root 밖으로 나가는 hook:

```sh
node dist/cli.js sniff --root test/fixtures/outside-root --format github
# emits ::error ... hook-target-outside-root ... and exits 1
```

Action entrypoint 로컬 실행:

```sh
GITHUB_WORKSPACE="$PWD" \
INPUT_ROOT="test/fixtures/outside-root" \
GITHUB_STEP_SUMMARY="/tmp/hookhound-summary.md" \
node dist/action.js
# exits 1, prints GitHub annotation commands, and writes the job summary
```

## 현재 검사 항목

### Plugin surfaces

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.zcode-plugin/plugin.json`
- `.zcode-plugin/marketplace.json`
- `.codex/hooks.json`
- `hooks/hooks.json`
- `skills/*/SKILL.md` 및 `.codex/skills/*/SKILL.md`
- `agents/*.md` 및 `.claude-plugin/agents/*.md`
- npm payload 모델링용 `package.json`

### Manifest / marketplace

- 잘못된 JSON 및 object가 아닌 manifest
- 필수 plugin metadata 누락: `name`, `version`, `description`, `license`
- 여러 plugin manifest 간 version drift
- license drift 및 root `LICENSE` 누락
- marketplace plugin entry가 object가 아닌 경우
- marketplace `source` 경로 누락 또는 해석 실패

### Hook / skill

- `${PLUGIN_ROOT}`, `${ZCODE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_ROOT}`, `${CODEX_PLUGIN_ROOT}`, `${GJC_PLUGIN_ROOT}`, `${OMO_PLUGIN_ROOT}` 지원
- `python3 "${PLUGIN_ROOT}/scripts/check.py"`, `/usr/bin/env node ./hooks/check.js` 같은 interpreter/wrapper hook command
- hook command target 누락
- generated `dist/` hook artifact 누락
- plugin root 밖으로 나가는 hook target
- Node hook script syntax 검사: `node --check`
- timeout 없는 process hook
- Markdown에서 존재하지 않는 `agents/*.md` reference

### Package payload

- `npm pack --dry-run --json --ignore-scripts` payload 모델링
- 로컬에는 있지만 npm package payload에 들어가지 않는 hook target
- `package.json.files`에서 빠질 가능성이 있는 generated hook artifact

## 출력 모드

```sh
hookhound sniff --root .                 # 사람이 읽는 text report
hookhound sniff --root . --json          # machine-readable ScanSummary
hookhound sniff --root . --format github # GitHub annotations + markdown summary
hookhound sniff --root . --format sarif  # code-scanning 도구용 SARIF 2.1.0
```

## 현재 범위

HookHound는 현재 local text output, machine-readable `ScanSummary` JSON, GitHub annotations/job summary, code-scanning consumer용 SARIF를 제공합니다. 아직 다음은 제공하지 않습니다.

- hosted dashboard
- telemetry 또는 report upload
- 광범위한 marketplace schema coverage
- broad adapter framework
- npm 외 package-manager payload simulation

이 기능들은 실제 CI 사용에서 수요가 확인된 뒤에 다룹니다. 지금 목표는 단순합니다. 프로젝트 데이터를 업로드하지 않고 로컬과 GitHub CI에서 깨진 agent plugin release를 먼저 잡는 것입니다.

## Dogfooding

실제 프로젝트 dogfooding 기록은 [`docs/dogfood.md`](docs/dogfood.md)에 있습니다. 이 보고서에는 true positive, 예상된 non-plugin warning, 현재 false-positive/UX backlog가 포함됩니다.

## 개발

```sh
npm install
npm run build
npm test
npm run check
```

## License

MIT
