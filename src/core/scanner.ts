import { stat } from "node:fs/promises"
import path from "node:path"
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

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

export async function scan(options: ScanOptions): Promise<ScanSummary> {
  const root = path.resolve(options.root)
  const detections: Detection[] = []
  const findings: Finding[] = []

  for (const surface of KNOWN_SURFACES) {
    const absolute = path.join(root, surface.file)
    if (await exists(absolute)) {
      detections.push(surface)
    }
  }

  if (detections.length === 0) {
    findings.push({
      id: "no-agent-plugin-surface",
      level: options.strict ? "error" : "warning",
      title: "No agent plugin surface detected",
      message: "HookHound did not find Claude, ZCode, Codex, hook, or package manifests in this folder.",
      hint: "Run HookHound at the plugin repository root or pass --root <path>.",
    })
  }

  return { root, detections, findings }
}
