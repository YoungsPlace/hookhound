import { spawn } from "node:child_process"
import path from "node:path"
import { pathExists, readJson, relativePosix } from "../core/files.js"
import type { HookTarget } from "../core/hook-targets.js"
import type { Finding } from "../core/types.js"

interface PackedFile {
  path: string
}

async function npmPackDryRun(root: string): Promise<{ ok: true; files: string[] } | { ok: false; output: string }> {
  return await new Promise((resolve) => {
    const child = spawn("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ ok: false, output: "npm pack --dry-run timed out" })
    }, 20_000)
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        resolve({ ok: false, output: (stderr || stdout).trim() })
        return
      }
      try {
        const parsed = JSON.parse(stdout) as Array<{ files?: PackedFile[] }>
        const files = parsed.flatMap((entry) => entry.files ?? []).map((file) => file.path)
        resolve({ ok: true, files })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        resolve({ ok: false, output: message })
      }
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ ok: false, output: error.message })
    })
  })
}

function isInsideRoot(relativePath: string): boolean {
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
}

export async function checkPayload(root: string, targets: HookTarget[]): Promise<Finding[]> {
  const findings: Finding[] = []
  const packagePath = path.join(root, "package.json")
  if (!(await pathExists(packagePath))) return findings

  const parsedPackage = await readJson(packagePath)
  if (!parsedPackage.ok) return findings

  const pack = await npmPackDryRun(root)
  if (!pack.ok) {
    findings.push({
      id: "npm-pack-dry-run-failed",
      level: "warning",
      title: "Could not simulate npm package payload",
      file: "package.json",
      message: pack.output,
      hint: "HookHound will still run manifest and hook checks, but shippability checks are incomplete.",
    })
    return findings
  }

  const packed = new Set(pack.files)
  for (const target of targets) {
    if (!isInsideRoot(target.relativePath)) continue
    if (!(await pathExists(target.absolutePath))) continue
    if (!packed.has(target.relativePath)) {
      findings.push({
        id: "unshipped-hook-target",
        level: "error",
        title: "Hook target is not included in npm payload",
        file: target.relativePath,
        evidence: `${target.manifestFile}: ${target.raw}`,
        message: `The file exists locally but npm pack would not ship ${target.relativePath}.`,
        hint: "Update package.json files, npm ignore rules, or the release sync pipeline so the hook target reaches users.",
      })
    }
  }

  const generatedTargets = targets.filter((target) => target.relativePath.includes("/dist/"))
  if (generatedTargets.length > 0 && Array.isArray((parsedPackage.value as { files?: unknown }).files)) {
    const files = (parsedPackage.value as { files: unknown[] }).files.map(String)
    const mentionsDist = files.some((entry) => entry === "dist" || entry.includes("dist") || entry.includes("components"))
    if (!mentionsDist) {
      findings.push({
        id: "package-files-may-exclude-generated-hooks",
        level: "warning",
        title: "package.json files may exclude generated hook artifacts",
        file: "package.json",
        message: "At least one hook target lives under dist/, but package.json files does not obviously include dist or component payloads.",
        hint: "Run hookhound sniff after building artifacts and confirm every generated hook target appears in npm pack output.",
      })
    }
  }

  return findings
}
