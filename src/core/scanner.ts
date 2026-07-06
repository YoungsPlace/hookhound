import path from "node:path"
import { checkHookTargets } from "../checks/hook-target-check.js"
import { checkManifests } from "../checks/manifest-check.js"
import { checkPayload } from "../checks/payload-check.js"
import { isDirectory, listFiles, pathExists, relativePosix } from "./files.js"
import type { Detection, Finding, ScanOptions, ScanSummary } from "./types.js"

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

export async function scan(options: ScanOptions): Promise<ScanSummary> {
  const root = path.resolve(options.root)
  const detections = [...(await detectKnownSurfaces(root)), ...(await detectMarkdownSurfaces(root))]
  const findings: Finding[] = []

  findings.push(...(await detectProjectShape(root)))

  if (detections.length === 0) {
    findings.push({
      id: "no-agent-plugin-surface",
      level: options.strict ? "error" : "warning",
      title: "No agent plugin surface detected",
      message: "HookHound did not find Claude, ZCode, Codex, hook, skill, agent, or package manifests in this folder.",
      hint: "Run HookHound at the plugin repository root or pass --root <path>.",
    })
    return { root, detections, findings }
  }

  findings.push(...(await checkManifests(root, detections)))
  const hookResult = await checkHookTargets(root, detections)
  findings.push(...hookResult.findings)
  findings.push(...(await checkPayload(root, hookResult.targets)))

  return { root, detections, findings }
}
