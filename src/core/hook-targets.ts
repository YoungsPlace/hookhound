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
interface NormalizedCandidate {
  value: string
  resolveFromRoot: boolean
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
const INTERPRETER_BASENAME = /^(?:node(?:js)?|python(?:\d+(?:\.\d+)?)?|ruby|php|bash|sh)$/
const INTERPRETER_NO_SCRIPT_FLAGS = new Set(["-c", "-e", "-m", "-p", "--eval", "--module", "--print"])
const INTERPRETER_VALUE_FLAGS = new Set(["-r", "--require", "--import", "--loader", "--experimental-loader", "--env-file"])


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

function unquoteToken(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  return (first === "\"" || first === "'") && first === last ? value.slice(1, -1) : value
}

function shellWords(value: string): string[] | null {
  const words: string[] = []
  let current = ""
  let quote: "\"" | "'" | null = null
  let escaped = false

  for (const char of value) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\" && quote !== "'") {
      escaped = true
      continue
    }

    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === "\"" || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current !== "") {
        words.push(current)
        current = ""
      }
      continue
    }

    current += char
  }

  if (escaped) current += "\\"
  if (quote !== null) return null
  if (current !== "") words.push(current)
  return words
}

function commandBasename(value: string): string {
  return path.basename(value).toLowerCase()
}

function isEnvAssignment(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(value)
}

function isInterpreter(value: string): boolean {
  return INTERPRETER_BASENAME.test(commandBasename(value))
}

function directCandidate(value: string): string | null {
  const unquoted = unquoteToken(value)
  if (unquoted.startsWith("node:")) return null
  if (unquoted.includes("\n")) return null
  if (unquoted.startsWith("-")) return null
  if (/\s/.test(unquoted)) return null
  if (unquoted.includes("${") || SCRIPT_LIKE.test(unquoted) || unquoted.startsWith("./") || unquoted.startsWith("../")) {
    return unquoted
  }
  return null
}
function flagName(value: string): string {
  return value.split("=", 1)[0] ?? value
}

function interpreterScriptCandidate(words: string[], commandIndex: number): string | null {
  for (let index = commandIndex + 1; index < words.length; index += 1) {
    const word = words[index]
    if (word === "--") {
      index += 1
      while (index < words.length) {
        const candidate = directCandidate(words[index])
        if (candidate !== null) return candidate
        index += 1
      }
      return null
    }

    if (word.startsWith("-")) {
      const name = flagName(word)
      if (INTERPRETER_NO_SCRIPT_FLAGS.has(name)) return null
      if (INTERPRETER_VALUE_FLAGS.has(name) && !word.includes("=")) index += 1
      continue
    }

    return directCandidate(word)
  }

  return null
}


function normalizeCandidate(value: string): NormalizedCandidate | null {
  const direct = directCandidate(value)
  if (direct !== null) return { value: direct, resolveFromRoot: false }

  const words = shellWords(value)
  if (words === null || words.length < 2) return null

  const firstWord = directCandidate(words[0])
  if (firstWord !== null) return { value: firstWord, resolveFromRoot: true }

  let commandIndex = 0
  if (commandBasename(words[0]) === "env") {
    commandIndex = 1
    while (commandIndex < words.length && (words[commandIndex].startsWith("-") || isEnvAssignment(words[commandIndex]))) {
      commandIndex += 1
    }
  }

  if (commandIndex >= words.length) return null

  if (!isInterpreter(words[commandIndex])) return null

  const scriptCandidate = interpreterScriptCandidate(words, commandIndex)
  if (scriptCandidate === null) return null
  return { value: scriptCandidate, resolveFromRoot: true }
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
    const interpolated = interpolateRootTemplates(candidate.value, root)
    if (interpolated === null) return
    const absolutePath = path.isAbsolute(interpolated)
      ? interpolated
      : path.resolve(candidate.resolveFromRoot ? root : path.dirname(manifestFile), interpolated)
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/")
    const command = typeof parent?.command === "string" ? parent.command : undefined
    const syntaxCheck = /\.(?:js|mjs|cjs)$/.test(absolutePath) || command === "node" ? "node" : "none"
    targets.push({ manifestFile, raw: candidate.value, absolutePath, relativePath, hookPath, command, syntaxCheck })
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
