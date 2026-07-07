import { spawn } from "node:child_process"
import path from "node:path"
import { pathExists, readJson, readText, relativePosix } from "../core/files.js"
import { extractHookTargets, hookObjectsWithoutTimeout, type HookTarget } from "../core/hook-targets.js"
import type { Detection, Finding, HookHoundGeneratedMapping } from "../core/types.js"

const HOOK_SURFACES = new Set(["generic-hooks", "codex-hooks"])
const AGENT_REFERENCE = /agents\/([a-zA-Z0-9_.-]+\.md)/g

function isOutsideRoot(relativePath: string): boolean {
  return relativePath === "" || relativePath === ".." || relativePath.startsWith("../")
}

function isDistPath(relativePath: string): boolean {
  return relativePath === "dist" || relativePath.startsWith("dist/") || relativePath.includes("/dist/")
}

function relativePathMatches(relativePath: string, prefix: string): string | null {
  const normalizedPrefix = prefix.replace(/\/+$/, "")
  if (relativePath === normalizedPrefix) return ""
  if (relativePath.startsWith(`${normalizedPrefix}/`)) return relativePath.slice(normalizedPrefix.length + 1)
  return null
}

async function generatedSourceExists(root: string, relativePath: string, mappings: HookHoundGeneratedMapping[]): Promise<boolean> {
  for (const mapping of mappings) {
    const rest = relativePathMatches(relativePath, mapping.to)
    if (rest === null) continue
    const source = path.join(root, mapping.from, rest)
    if (await pathExists(source)) return true
  }
  return false
}

interface HookCheckResult {
  findings: Finding[]
  targets: HookTarget[]
}

async function nodeCheck(file: string): Promise<{ ok: boolean; output: string }> {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: ["ignore", "pipe", "pipe"] })
    let output = ""
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ ok: false, output: "node --check timed out" })
    }, 10_000)
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output: output.trim() })
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ ok: false, output: error.message })
    })
  })
}

export async function checkHookTargets(root: string, detections: Detection[], generatedMappings: HookHoundGeneratedMapping[] = []): Promise<HookCheckResult> {
  const findings: Finding[] = []
  const targets: HookTarget[] = []

  for (const detection of detections.filter((item) => HOOK_SURFACES.has(item.kind))) {
    const manifestFile = path.join(root, detection.file)
    const parsed = await readJson(manifestFile)
    if (!parsed.ok) continue

    const manifestTargets = extractHookTargets(root, manifestFile, parsed.value)
    targets.push(...manifestTargets)

    for (const hookPath of hookObjectsWithoutTimeout(parsed.value)) {
      findings.push({
        id: "hook-timeout-missing",
        level: "warning",
        title: "Hook timeout is missing",
        file: detection.file,
        evidence: hookPath,
        message: "Process hooks without timeouts can hang agent sessions.",
        hint: "Add timeoutMs to every process hook.",
      })
    }

    for (const target of manifestTargets) {
      if (isOutsideRoot(target.relativePath)) {
        findings.push({
          id: "hook-target-outside-root",
          level: "error",
          title: "Hook command target escapes the plugin root",
          file: detection.file,
          evidence: `${target.hookPath}: ${target.raw}`,
          message: `Resolved target ${target.relativePath} is outside the plugin root and cannot be shipped with the package.`,
          hint: "Keep hook command targets inside the plugin payload root, or package the dependency as an explicit runtime binary/component.",
        })
        continue
      }

      const exists = await pathExists(target.absolutePath)
      if (!exists) {
        findings.push({
          id: isDistPath(target.relativePath) ? "missing-generated-hook-artifact" : "missing-hook-target",
          level: "error",
          title: "Hook command target is missing",
          file: detection.file,
          evidence: `${target.hookPath}: ${target.raw}`,
          message: `Resolved target ${target.relativePath} does not exist.`,
          hint: isDistPath(target.relativePath)
            ? "Build the generated artifact or make the hook point at a checked-in source script."
            : "Fix the hook path or include the referenced script in the plugin payload.",
        })
        continue
      }

      if (target.syntaxCheck === "node") {
        const result = await nodeCheck(target.absolutePath)
        if (!result.ok) {
          findings.push({
            id: "hook-script-syntax-error",
            level: "error",
            title: "Hook script fails node syntax check",
            file: target.relativePath,
            message: result.output || "node --check failed.",
          })
        }
      }
    }
  }

  const markdownFiles = detections
    .filter((item) => item.kind === "skill" || item.kind === "agent")
    .map((item) => path.join(root, item.file))

  for (const file of markdownFiles) {
    const text = await readText(file)
    if (text === null) continue
    for (const match of text.matchAll(AGENT_REFERENCE)) {
      const expected = path.join(root, "agents", match[1])
      if (!(await pathExists(expected)) && !(await generatedSourceExists(root, `agents/${match[1]}`, generatedMappings))) {
        findings.push({
          id: "referenced-agent-file-missing",
          level: "error",
          title: "Referenced agent file is missing",
          file: relativePosix(root, file),
          evidence: match[0],
          message: `Expected ${relativePosix(root, expected)} to exist.`,
        })
      }
    }
  }

  return { findings, targets }
}
