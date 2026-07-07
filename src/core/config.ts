import path from "node:path"
import { pathExists, readText, relativePosix } from "./files.js"
import type { Finding, HookHoundConfig, HookHoundGeneratedMapping, HookHoundSuppression } from "./types.js"

interface ConfigLoadResult {
  config: HookHoundConfig
  findings: Finding[]
}

const CONFIG_FILES = ["hookhound.yml", "hookhound.yaml"]
const SECTION_KEYS = new Set(["ignore", "generated"])
const ROOT_KEYS = new Set(["ignore", "generated"])
const IGNORE_KEYS = new Set(["id", "file", "evidence", "reason"])
const GENERATED_KEYS = new Set(["from", "to", "reason"])

type ConfigItem = Record<string, string | boolean>

export async function loadConfig(root: string, configPath?: string): Promise<ConfigLoadResult> {
  const resolved = await resolveConfigPath(root, configPath)
  if (resolved === null) return { config: {}, findings: [] }

  const text = await readText(resolved)
  if (text === null) {
    return { config: {}, findings: [configWarning(root, resolved, `Config file ${relativePosix(root, resolved)} could not be read.`)] }
  }

  const parsed = parseConfig(text, path.extname(resolved).toLowerCase())
  if (!parsed.ok) return { config: {}, findings: [configWarning(root, resolved, parsed.error)] }

  return { config: parsed.config, findings: [] }
}

function configWarning(root: string, file: string, message: string): Finding {
  return {
    id: "hookhound-config-invalid",
    level: "error",
    title: "HookHound config is invalid",
    file: relativePosix(root, file),
    message,
  }
}

async function resolveConfigPath(root: string, configPath?: string): Promise<string | null> {
  if (configPath) return path.resolve(root, configPath)
  for (const file of CONFIG_FILES) {
    const absolute = path.join(root, file)
    if (await pathExists(absolute)) return absolute
  }
  return null
}

function parseConfig(text: string, extension: string): { ok: true; config: HookHoundConfig } | { ok: false; error: string } {
  if (extension === ".json") return parseJsonConfig(text)
  return parseYamlConfig(text)
}

function parseJsonConfig(text: string): { ok: true; config: HookHoundConfig } | { ok: false; error: string } {
  try {
    return normalizeConfig(JSON.parse(text))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `JSON config could not be parsed: ${message}` }
  }
}

function parseYamlConfig(text: string): { ok: true; config: HookHoundConfig } | { ok: false; error: string } {
  const raw: Record<string, ConfigItem[]> = {}
  let section: string | null = null
  let current: ConfigItem | null = null

  for (const [index, originalLine] of text.split(/\r?\n/).entries()) {
    const withoutComment = stripYamlComment(originalLine).trimEnd()
    if (withoutComment.trim() === "") continue

    if (!originalLine.startsWith(" ") && !originalLine.startsWith("\t")) {
      const match = withoutComment.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/)
      if (!match) return { ok: false, error: `Unsupported YAML syntax on line ${index + 1}.` }
      section = match[1]
      current = null
      if (!SECTION_KEYS.has(section)) return { ok: false, error: `Unsupported config key: ${section}.` }
      raw[section] = []
      continue
    }

    if (section === null) return { ok: false, error: `YAML list item found before a section on line ${index + 1}.` }
    const trimmed = withoutComment.trim()
    if (trimmed.startsWith("- ")) {
      current = {}
      raw[section].push(current)
      const rest = trimmed.slice(2).trim()
      if (rest !== "" && !addYamlPair(current, rest)) return { ok: false, error: `Unsupported YAML item on line ${index + 1}.` }
    } else {
      if (current === null) return { ok: false, error: `YAML property found before a list item on line ${index + 1}.` }
      if (!addYamlPair(current, trimmed)) return { ok: false, error: `Unsupported YAML property on line ${index + 1}.` }
    }
  }

  return normalizeConfig(raw)
}

function stripYamlComment(line: string): string {
  let quote: string | null = null
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char
    } else if (char === "#" && quote === null) {
      return line.slice(0, index)
    }
  }
  return line
}

function addYamlPair(target: ConfigItem, text: string): boolean {
  const match = text.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/)
  if (!match) return false
  target[match[1]] = parseYamlScalar(match[2])
  return true
}

function parseYamlScalar(value: string): string | boolean {
  if (value === "true") return true
  if (value === "false") return false
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function normalizeRelativeConfigPath(value: string, key: string): { ok: true; path: string } | { ok: false; error: string } {
  const raw = value.replaceAll("\\", "/").trim()
  if (raw === "") return { ok: false, error: `${key} path must not be empty.` }
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) return { ok: false, error: `${key} path must be relative to the scan root.` }
  if (raw.split("/").includes("..")) return { ok: false, error: `${key} path must not contain '..' segments.` }

  const normalized = path.posix.normalize(raw).replace(/^\.\//, "")
  if (normalized === "." || normalized === "") return { ok: false, error: `${key} path must not resolve to the scan root.` }
  return { ok: true, path: normalized }
}

function rejectUnknownKeys(candidate: Record<string, unknown>, allowed: Set<string>, label: string): { ok: true } | { ok: false; error: string } {
  const unknown = Object.keys(candidate).filter((key) => !allowed.has(key))
  if (unknown.length === 0) return { ok: true }
  return { ok: false, error: `${label} contains unsupported key: ${unknown[0]}.` }
}

function normalizeConfig(value: unknown): { ok: true; config: HookHoundConfig } | { ok: false; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Config root must be an object." }
  const record = value as Record<string, unknown>
  const config: HookHoundConfig = {}
  const unknownRoot = Object.keys(record).filter((key) => !ROOT_KEYS.has(key))
  if (unknownRoot.length > 0) return { ok: false, error: `Unsupported config key: ${unknownRoot[0]}.` }
  if (record.ignore !== undefined) {
    if (!Array.isArray(record.ignore)) return { ok: false, error: "Config key ignore must be an array." }
    const ignore: HookHoundSuppression[] = []
    for (const item of record.ignore) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) return { ok: false, error: "Each ignore item must be an object." }
      const candidate = item as Record<string, unknown>
      const unknownKeys = rejectUnknownKeys(candidate, IGNORE_KEYS, "Ignore item")
      if (!unknownKeys.ok) return unknownKeys
      if (typeof candidate.id !== "string" || candidate.id === "") return { ok: false, error: "Each ignore item requires a string id." }
      if (candidate.file !== undefined && typeof candidate.file !== "string") return { ok: false, error: "Ignore file must be a string when provided." }
      if (candidate.evidence !== undefined && typeof candidate.evidence !== "string") return { ok: false, error: "Ignore evidence must be a string when provided." }
      ignore.push({ id: candidate.id, file: candidate.file, evidence: candidate.evidence })
    }
    config.ignore = ignore
  }

  if (record.generated !== undefined) {
    if (!Array.isArray(record.generated)) return { ok: false, error: "Config key generated must be an array." }
    const generated: HookHoundGeneratedMapping[] = []
    for (const item of record.generated) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) return { ok: false, error: "Each generated item must be an object." }
      const candidate = item as Record<string, unknown>
      const unknownKeys = rejectUnknownKeys(candidate, GENERATED_KEYS, "Generated item")
      if (!unknownKeys.ok) return unknownKeys
      if (typeof candidate.from !== "string" || candidate.from === "") return { ok: false, error: "Each generated item requires a string from path." }
      if (typeof candidate.to !== "string" || candidate.to === "") return { ok: false, error: "Each generated item requires a string to path." }
      const from = normalizeRelativeConfigPath(candidate.from, "Generated from")
      if (!from.ok) return { ok: false, error: from.error }
      const to = normalizeRelativeConfigPath(candidate.to, "Generated to")
      if (!to.ok) return { ok: false, error: to.error }
      generated.push({ from: from.path, to: to.path })
    }
    config.generated = generated
  }

  return { ok: true, config }
}
