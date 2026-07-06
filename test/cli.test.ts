import { execFile } from "node:child_process"
import path from "node:path"
import { beforeAll, describe, expect, test } from "vitest"

const ROOT = path.join(import.meta.dirname, "..")
const CLI = path.join(ROOT, "dist", "cli.js")
const FIXTURES = path.join(ROOT, "test", "fixtures")
const TSC = path.join(ROOT, "node_modules", "typescript", "bin", "tsc")

interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}

function execFileAsync(command: string, args: string[], cwd = ROOT): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code !== "number") {
        reject(error)
        return
      }
      resolve({
        code: error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number" ? (error as NodeJS.ErrnoException & { code: number }).code : 0,
        stdout,
        stderr,
      })
    })
  })
}

async function runCli(fixture: string, extraArgs: string[] = []): Promise<CliResult & { json: { findings?: Array<{ id: string; level: string; evidence?: string }> } }> {
  const result = await execFileAsync(process.execPath, [CLI, "sniff", "--root", path.join(FIXTURES, fixture), "--json", ...extraArgs])
  return { ...result, json: JSON.parse(result.stdout) }
}

beforeAll(async () => {
  const build = await execFileAsync(process.execPath, [TSC, "-p", path.join(ROOT, "tsconfig.json")])
  expect(build.code).toBe(0)
})

describe("HookHound CLI JSON contract", () => {
  test("clean fixtures exit zero with parseable JSON and no errors", async () => {
    const result = await runCli("clean-plugin")
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.json.findings?.filter((finding) => finding.level === "error")).toEqual([])
  })

  test("missing generated hook targets exit non-zero with actionable evidence", async () => {
    const result = await runCli("missing-dist")
    expect(result.code).toBe(1)
    expect(result.stderr).toBe("")
    expect(result.json.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-generated-hook-artifact",
          level: "error",
          evidence: expect.stringContaining("components/worker/dist/cli.js"),
        }),
      ]),
    )
  })

  test("payload failures report unshipped targets instead of only pack failures", async () => {
    const result = await runCli("unshipped-target")
    const ids = result.json.findings?.map((finding) => finding.id) ?? []
    expect(result.code).toBe(1)
    expect(ids).toContain("unshipped-hook-target")
    expect(ids).not.toContain("npm-pack-dry-run-failed")
  })

  test("malformed manifests keep stdout valid JSON and do not crash", async () => {
    const result = await runCli("malformed-manifest")
    const ids = result.json.findings?.map((finding) => finding.id) ?? []
    expect(result.code).toBe(1)
    expect(result.stderr).toBe("")
    expect(ids).toContain("manifest-json-invalid")
  })
})
