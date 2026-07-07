import path from "node:path"
import { loadConfig } from "./config.js"
import { checkHookTargets } from "../checks/hook-target-check.js"
import { checkManifests } from "../checks/manifest-check.js"
import { checkPayload } from "../checks/payload-check.js"
import { isDirectory, listFiles, pathExists, relativePosix } from "./files.js"
import type { Detection, Finding, HookHoundSuppression, ScanOptions, ScanSummary } from "./types.js"

const KNOWN_SURFACES: Array<{ kind: string; file: string; confidence: Detection["confidence"] }> = [
  { kind: "claude-plugin", file: ".claude-plugin/plugin.json", confidence: "high" },
  { kind: "claude-marketplace", file: ".claude-plugin/marketplace.json", confidence: "medium" },
  { kind: "zcode-plugin", file: ".zcode-plugin/plugin.json", confidence: "high" },
  { kind: "zcode-marketplace", file: ".zcode-plugin/marketplace.json", confidence: "medium" },
  { kind: "codex-hooks", file: ".codex/hooks.json", confidence: "medium" },
  { kind: "generic-hooks", file: "hooks/hooks.json", confidence: "high" },
  { kind: "package", file: "package.json", confidence: "medium" },
]

async function detectKnownSurfaces(root: string): Promise<Detection[]> {
  const detections: Detection[] = []
  for (const surface of KNOWN_SURFACES) {
    const absolute = path.join(root, surface.file)
    if (await pathExists(absolute)) detections.push(surface)
  }
  return detections
}

async function detectMarkdownSurfaces(root: string): Promise<Detection[]> {
  const detections: Detection[] = []
  const files = await listFiles(root, { maxDepth: 5 })
  for (const file of files) {
    const relative = relativePosix(root, file)
    if (/^(?:\.claude-plugin\/)?skills\/[^/]+\/SKILL\.md$/.test(relative) || /^\.codex\/skills\/[^/]+\/SKILL\.md$/.test(relative)) {
      detections.push({ kind: "skill", file: relative, confidence: "high" })
    } else if (/^(?:\.claude-plugin\/)?agents\/[^/]+\.md$/.test(relative) || /^agents\/[^/]+\.md$/.test(relative)) {
      detections.push({ kind: "agent", file: relative, confidence: "medium" })
    }
  }
  return detections
}

async function detectProjectShape(root: string): Promise<Finding[]> {
  const findings: Finding[] = []
  if (await isDirectory(path.join(root, ".gjc"))) {
    findings.push({
      id: "gjc-state-directory-detected",
      level: "info",
      title: "GJC runtime state detected",
      file: ".gjc/",
      message: "HookHound treats .gjc as runtime state unless a future adapter opts into validating exported GJC skills.",
    })
  }
  return findings
}

function applySuppressions(findings: Finding[], suppressions: HookHoundSuppression[] = []): Finding[] {
  if (suppressions.length === 0) return findings
  return findings.filter((finding) => !suppressions.some((suppression) => matchesSuppression(finding, suppression)))
}

function matchesSuppression(finding: Finding, suppression: HookHoundSuppression): boolean {
  if (finding.id !== suppression.id) return false
  if (suppression.file !== undefined && !matchesPattern(finding.file ?? "", suppression.file)) return false
  if (suppression.evidence !== undefined && !matchesPattern(finding.evidence ?? "", suppression.evidence)) return false
  return true
}

function matchesPattern(value: string, pattern: string): boolean {
  const regex = new RegExp(`^${escapePattern(pattern)}$`)
  return regex.test(value)
}

function escapePattern(pattern: string): string {
  let output = ""
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        output += ".*"
        index += 1
      } else {
        output += "[^/]*"
      }
    } else {
      output += char.replace(/[\\^$+?.()|{}\[\]]/g, "\\$&")
    }
  }
  return output
}

export async function scan(options: ScanOptions): Promise<ScanSummary> {
  const root = path.resolve(options.root)
  const configResult = await loadConfig(root, options.configPath)
  const detections = [...(await detectKnownSurfaces(root)), ...(await detectMarkdownSurfaces(root))]
  const findings: Finding[] = []

  findings.push(...configResult.findings)
  findings.push(...(await detectProjectShape(root)))

  if (detections.filter((detection) => detection.kind !== "package").length === 0) {
    findings.push({
      id: "no-agent-plugin-surface",
      level: options.strict ? "error" : "warning",
      title: "No agent plugin surface detected",
      message: "HookHound did not find Claude, ZCode, Codex, hook, skill, or agent plugin surfaces in this folder.",
      hint: "Run HookHound at the plugin repository root or pass --root <path>.",
    })
    return { root, detections, findings: applySuppressions(findings, configResult.config.ignore) }
  }

  findings.push(...(await checkManifests(root, detections)))
  const hookResult = await checkHookTargets(root, detections, configResult.config.generated ?? [])
  findings.push(...hookResult.findings)
  findings.push(...(await checkPayload(root, hookResult.targets)))

  return { root, detections, findings: applySuppressions(findings, configResult.config.ignore) }
}
