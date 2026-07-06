import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

export interface JsonReadResult {
  ok: boolean
  value?: unknown
  error?: string
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/")
}

export function relativePosix(root: string, file: string): string {
  return toPosixPath(path.relative(root, file))
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

export async function isDirectory(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isDirectory()
  } catch {
    return false
  }
}

export async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8")
  } catch {
    return null
  }
}

export async function readJson(file: string): Promise<JsonReadResult> {
  const text = await readText(file)
  if (text === null) return { ok: false, error: "file not found" }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

export async function listFiles(root: string, options: { maxDepth?: number } = {}): Promise<string[]> {
  const maxDepth = options.maxDepth ?? 6
  const files: string[] = []

  async function visit(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true, encoding: "utf8" })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") continue
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await visit(absolute, depth + 1)
      } else if (entry.isFile()) {
        files.push(absolute)
      }
    }
  }

  await visit(root, 0)
  return files
}
