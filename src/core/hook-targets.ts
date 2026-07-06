import path from "node:path"

export interface HookTarget {
  manifestFile: string
  raw: string
  absolutePath: string
  relativePath: string
  hookPath: string
  command?: string
  syntaxCheck: "node" | "none"
}

const ROOT_TEMPLATES = new Set([
  "PLUGIN_ROOT",
  "ZCODE_PLUGIN_ROOT",
  "CLAUDE_PLUGIN_ROOT",
  "CODEX_PLUGIN_ROOT",
  "GJC_PLUGIN_ROOT",
  "OMO_PLUGIN_ROOT",
])

const SCRIPT_LIKE = /(?:^|[/\\])[^/\\]+\.(?:js|mjs|cjs|ts|tsx|sh|py|rb|php)$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function interpolateRootTemplates(value: string, root: string): string | null {
  let sawSupported = false
  const replaced = value.replace(/\$\{([A-Z0-9_]+)\}/g, (match, name: string) => {
    if (ROOT_TEMPLATES.has(name)) {
      sawSupported = true
      return root
    }
    return match
  })
  if (replaced.includes("${")) return null
  if (!sawSupported && !SCRIPT_LIKE.test(value)) return null
  return replaced
}

function normalizeCandidate(value: string): string | null {
  if (value.startsWith("node:")) return null
  if (value.includes("\n")) return null
  if (value.startsWith("-")) return null
  if (value.includes("${") || SCRIPT_LIKE.test(value) || value.startsWith("./") || value.startsWith("../")) {
    return value
  }
  return null
}

function walk(value: unknown, visit: (node: unknown, path: string, parent?: Record<string, unknown>) => void, nodePath = "$", parent?: Record<string, unknown>): void {
  visit(value, nodePath, parent)
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${nodePath}[${index}]`, parent))
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      walk(child, visit, `${nodePath}.${key}`, value)
    }
  }
}

export function extractHookTargets(root: string, manifestFile: string, manifest: unknown): HookTarget[] {
  const targets: HookTarget[] = []

  walk(manifest, (node, hookPath, parent) => {
    if (typeof node !== "string") return
    const candidate = normalizeCandidate(node)
    if (candidate === null) return
    const interpolated = interpolateRootTemplates(candidate, root)
    if (interpolated === null) return
    const absolutePath = path.isAbsolute(interpolated) ? interpolated : path.resolve(path.dirname(manifestFile), interpolated)
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/")
    const command = typeof parent?.command === "string" ? parent.command : undefined
    const syntaxCheck = /\.(?:js|mjs|cjs)$/.test(absolutePath) || command === "node" ? "node" : "none"
    targets.push({ manifestFile, raw: node, absolutePath, relativePath, hookPath, command, syntaxCheck })
  })

  return targets
}

export function hookObjectsWithoutTimeout(manifest: unknown): string[] {
  const offenders: string[] = []
  walk(manifest, (node, hookPath) => {
    if (!isRecord(node)) return
    const hasCommand = typeof node.command === "string" || Array.isArray(node.args)
    const hasProcessType = node.type === "process" || node.type === "command"
    if ((hasCommand || hasProcessType) && node.timeoutMs === undefined && node.timeout === undefined) {
      offenders.push(hookPath)
    }
  })
  return offenders
}
