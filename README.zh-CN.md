# HookHound

<p align="center">
  <img src="https://raw.githubusercontent.com/YoungsPlace/hookhound/main/assets/hookie-hookhound-hero.webp" alt="HookHound 吉祥物 Hookie 在发布前检查 agent 插件行李" width="100%">
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

**让 agent 插件真的能顺利登机发布。** HookHound 会在用户踩坑之前，嗅出损坏的 hooks、缺失的 manifests、没有打包进 npm payload 的 `dist/` 文件，以及 release 包内容错误。

HookHound 是一个面向 CI 的 agent plugin 发布闸门，适用于 Claude、ZCode、Codex、GJC、OmO 风格的插件仓库。它会在发布前检查插件 manifest、hook 命令、skill/agent 引用和 npm package payload。

> 吉祥物：Hookie，一只机场安检比格犬。如果 hook script 被漏在发布行李外，Hookie 会在 release day 前叫出来。

## 快速开始

```sh
npm install
npm run build
node dist/cli.js sniff --root .
```

不全局安装，直接运行已发布包：

```sh
npm exec --package hookhound@0.1.2 -- hookhound sniff --root .
npm exec --package hookhound@0.1.2 -- hookhound sniff --root . --strict
npm exec --package hookhound@0.1.2 -- hookhound sniff --root . --json
npm exec --package hookhound@0.1.2 -- hookhound sniff --root . --format github
```

全局安装：

```sh
npm install -g hookhound
hookhound sniff --root .
```

只要存在 `error` 级别 finding，退出码就是非零。`warning` 和 `info` 会报告，但不会让运行失败。

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

| 输入 | 默认值 | 说明 |
| --- | --- | --- |
| `root` | `.` | 要扫描的插件根目录。相对路径会从 GitHub workspace 解析。 |
| `strict` | `false` | 没有检测到 agent plugin surface 时也让 Action 失败。 |

Action 会运行 HookHound CLI 的 JSON 路径，为带文件位置的 error/warning 输出 GitHub annotation，并写入 markdown job summary。没有文件位置的仓库级 finding 会留在 summary 里，不会伪造成文件行号。

## Demo proof loop

干净 fixture：

```sh
node dist/cli.js sniff --root test/fixtures/clean-plugin
# Verdict: PASSED
```

缺失 generated hook artifact：

```sh
node dist/cli.js sniff --root test/fixtures/missing-dist --json
# exits 1 and reports: missing-generated-hook-artifact
```

hook 路径逃出插件根目录：

```sh
node dist/cli.js sniff --root test/fixtures/outside-root --format github
# emits ::error ... hook-target-outside-root ... and exits 1
```

本地模拟 Action：

```sh
GITHUB_WORKSPACE="$PWD" \
INPUT_ROOT="test/fixtures/outside-root" \
GITHUB_STEP_SUMMARY="/tmp/hookhound-summary.md" \
node dist/action.js
# exits 1, prints GitHub annotation commands, and writes the job summary
```

## 当前检查能力

### 插件 surface

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.zcode-plugin/plugin.json`
- `.zcode-plugin/marketplace.json`
- `.codex/hooks.json`
- `hooks/hooks.json`
- `skills/*/SKILL.md` 和 `.codex/skills/*/SKILL.md`
- `agents/*.md` 和 `.claude-plugin/agents/*.md`
- `package.json` 的 npm payload 建模

### Manifest / marketplace

- 非法 JSON 和非对象 manifest
- 缺失插件元数据：`name`、`version`、`description`、`license`
- 多个 plugin manifest 版本漂移
- license 漂移和缺失根目录 `LICENSE`
- marketplace plugin entry 不是对象
- 缺失或无法解析的 marketplace `source` 路径

### Hook / skill

- 支持 `${PLUGIN_ROOT}`、`${ZCODE_PLUGIN_ROOT}`、`${CLAUDE_PLUGIN_ROOT}`、`${CODEX_PLUGIN_ROOT}`、`${GJC_PLUGIN_ROOT}`、`${OMO_PLUGIN_ROOT}`
- 解释器 / wrapper hook command，例如 `python3 "${PLUGIN_ROOT}/scripts/check.py"` 和 `/usr/bin/env node ./hooks/check.js`
- 缺失 hook command target
- 缺失 generated `dist/` hook artifact
- hook target 逃出插件根目录
- Node hook script 语法检查：`node --check`
- process hook 缺少 timeout
- Markdown 中引用了不存在的 `agents/*.md`

### Package payload

- `npm pack --dry-run --json --ignore-scripts` payload 建模
- 本地存在但没有进入 npm package payload 的 hook target
- 可能被 `package.json.files` 排除的 generated hook artifact
- 针对已接受 finding 的项目级 config suppression
- 将 source tree 复制到 plugin payload 路径的 generated path mapping


## 输出模式

```sh
hookhound sniff --root .                 # 人类可读文本报告
hookhound sniff --root . --json          # 机器可读 ScanSummary
hookhound sniff --root . --format github # GitHub annotations + markdown summary
hookhound sniff --root . --format sarif  # SARIF 2.1.0，供 code-scanning 工具使用
```

## 项目配置

HookHound 会自动读取 scan root 下的 `hookhound.yml` 或 `hookhound.yaml`。你可以在不削弱默认检查的前提下，让 release gate 适配真实仓库结构。

```yaml
ignore:
  - id: referenced-agent-file-missing
    file: "skills/*/SKILL.md"
    evidence: "agents/*.md"
    reason: "agents are generated into the release payload"

generated:
  - from: src/ouroboros/agents
    to: agents
```

`ignore` 通过 finding `id` 以及可选的 `file` / `evidence` glob-like pattern suppress finding。`generated` 告诉 HookHound：release pipeline 会把 source file 复制到 payload path，因此 `agents/reviewer.md` 这样的 Markdown 引用可以由 `src/ouroboros/agents/reviewer.md` 满足。

也可以显式指定 config 文件。

```sh
hookhound sniff --root . --config ./hookhound.yml
```

Config parser 不依赖第三方库，并且只支持一个很小的 YAML subset：top-level `ignore:` / `generated:` list，以及 scalar string 值。无效 config 会变成 `error` finding，避免 typoed suppression 或 mapping 被静默忽略。

## 当前边界

HookHound 目前提供本地文本输出、机器可读 `ScanSummary` JSON、GitHub annotations/job summary，以及面向 code-scanning consumer 的 SARIF。它目前**不提供**：

- hosted dashboard
- telemetry 或 report upload
- 跨生态的完整 marketplace schema 覆盖
- 大型 adapter framework
- npm 以外的 package-manager payload simulation

这些能力会等真实 CI 使用反馈出现后再做。当前目标很简单：不上传项目数据，在本地和 GitHub CI 中抓住损坏的 agent plugin release。

## Dogfooding

真实项目 dogfooding 记录见 [`docs/dogfood.md`](docs/dogfood.md)。该报告包含真实 positive、预期的 non-plugin warning，以及已发现的 false-positive/UX backlog。

## 开发

```sh
npm install
npm run build
npm test
npm run check
```

## License

MIT
