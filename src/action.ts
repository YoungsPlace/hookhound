#!/usr/bin/env node
import { execFile } from "node:child_process"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { renderGithubAnnotations, renderGithubJobSummary } from "./core/report.js"
import type { ScanSummary } from "./core/types.js"

interface CliResult {
  code: number
  stdout: string
  stderr: string
}

interface ActionEnv {
  INPUT_ROOT?: string
  INPUT_STRICT?: string
  GITHUB_WORKSPACE?: string
  GITHUB_STEP_SUMMARY?: string
}

interface RunActionOptions {
  env?: ActionEnv
  cwd?: string
  cliPath?: string
  invokeCli?: (command: string, args: string[], cwd: string) => Promise<CliResult>
  stdout?: Pick<NodeJS.WriteStream, "write">
  stderr?: Pick<NodeJS.WriteStream, "write">
  appendSummary?: (file: string, content: string) => Promise<void>
}

const DEFAULT_CLI_PATH = fileURLToPath(new URL("./cli.js", import.meta.url))

function parseBooleanInput(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true"
}

export function resolveActionRoot(inputRoot: string | undefined, workspace: string | undefined, cwd = process.cwd()): string {
  const root = inputRoot?.trim() || "."
  if (path.isAbsolute(root)) return path.normalize(root)
  return path.resolve(workspace || cwd, root)
}

function execFileAsync(command: string, args: string[], cwd: string): Promise<CliResult> {
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

function parseScanSummary(stdout: string): ScanSummary {
  try {
    const parsed = JSON.parse(stdout) as Partial<ScanSummary>
    if (typeof parsed.root !== "string" || !Array.isArray(parsed.detections) || !Array.isArray(parsed.findings)) {
      throw new Error("JSON did not match HookHound scan summary shape")
    }
    return parsed as ScanSummary
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`HookHound CLI returned invalid JSON: ${message}`)
  }
}

export async function runAction(options: RunActionOptions = {}): Promise<number> {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const output = options.stdout ?? process.stdout
  const errorOutput = options.stderr ?? process.stderr
  const appendSummary = options.appendSummary ?? ((file, content) => appendFile(file, content))
  const invokeCli = options.invokeCli ?? execFileAsync
  const root = resolveActionRoot(env.INPUT_ROOT, env.GITHUB_WORKSPACE, cwd)
  const args = ["sniff", "--root", root, "--json"]
  if (parseBooleanInput(env.INPUT_STRICT)) args.push("--strict")

  const cliResult = await invokeCli(process.execPath, [options.cliPath ?? DEFAULT_CLI_PATH, ...args], cwd)
  if (cliResult.stderr) errorOutput.write(cliResult.stderr)

  const summary = parseScanSummary(cliResult.stdout)
  const annotations = renderGithubAnnotations(summary)
  const jobSummary = renderGithubJobSummary(summary)
  if (annotations) output.write(`${annotations}\n`)

  if (env.GITHUB_STEP_SUMMARY) {
    await appendSummary(env.GITHUB_STEP_SUMMARY, `${jobSummary}\n`)
  } else {
    output.write(`${jobSummary}\n`)
  }

  return summary.findings.some((finding) => finding.level === "error") || cliResult.code !== 0 ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runAction()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`HookHound action failed: ${message}`)
      process.exit(1)
    })
}
