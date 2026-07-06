import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { resolveActionRoot, runAction } from "../src/action.js"
import type { ScanSummary } from "../src/core/types.js"

const ROOT = path.join(import.meta.dirname, "..")
const FIXTURES = path.join(ROOT, "test", "fixtures")

function cleanSummary(root: string): ScanSummary {
  return {
    root,
    detections: [{ kind: "zcode-plugin", file: ".zcode-plugin/plugin.json", confidence: "high" }],
    findings: [],
  }
}

function outsideRootSummary(root: string): ScanSummary {
  return {
    root,
    detections: [{ kind: "generic-hooks", file: "hooks/hooks.json", confidence: "high" }],
    findings: [
      {
        id: "hook-target-outside-root",
        level: "error",
        title: "Hook target escapes plugin root",
        message: "Hook commands must stay inside the scanned root.",
        file: "hooks/hooks.json",
        evidence: "../shared/outside.js",
      },
    ],
  }
}

function packageOnlyStrictSummary(root: string): ScanSummary {
  return {
    root,
    detections: [{ kind: "package", file: "package.json", confidence: "medium" }],
    findings: [
      {
        id: "no-agent-plugin-surface",
        level: "error",
        title: "No agent plugin surface detected",
        message: "Strict mode requires at least one agent plugin surface.",
      },
    ],
  }
}

function captureOutput() {
  let text = ""
  return {
    stream: { write: (chunk: string) => { text += chunk; return true } },
    text: () => text,
  }
}

describe("GitHub Action wrapper", () => {
  test("clean fixture passes through the CLI JSON path and prints a summary", async () => {
    const root = path.join(FIXTURES, "clean-plugin")
    const stdout = captureOutput()
    const calls: Array<{ command: string; args: string[]; cwd: string }> = []

    const code = await runAction({
      env: { INPUT_ROOT: root, INPUT_STRICT: "false" },
      cwd: ROOT,
      cliPath: "/tmp/hookhound-cli.js",
      stdout: stdout.stream,
      invokeCli: async (command, args, cwd) => {
        calls.push({ command, args, cwd })
        return { code: 0, stdout: JSON.stringify(cleanSummary(root)), stderr: "" }
      },
    })

    expect(code).toBe(0)
    expect(calls).toEqual([
      {
        command: process.execPath,
        args: ["/tmp/hookhound-cli.js", "sniff", "--root", root, "--json"],
        cwd: ROOT,
      },
    ])
    expect(stdout.text()).toContain("## HookHound sniff report")
    expect(stdout.text()).toContain("Verdict: **PASSED**")
    expect(stdout.text()).not.toContain("::error")
  })

  test("outside-root fixture fails with annotation output and appended job summary", async () => {
    const root = path.join(FIXTURES, "outside-root")
    const stdout = captureOutput()
    const summaries: Array<{ file: string; content: string }> = []

    const code = await runAction({
      env: { INPUT_ROOT: root, GITHUB_STEP_SUMMARY: "/tmp/hookhound-summary.md" },
      cliPath: "/tmp/hookhound-cli.js",
      stdout: stdout.stream,
      appendSummary: async (file, content) => {
        summaries.push({ file, content })
      },
      invokeCli: async () => ({ code: 1, stdout: JSON.stringify(outsideRootSummary(root)), stderr: "" }),
    })

    expect(code).toBe(1)
    expect(stdout.text()).toContain("::error file=hooks/hooks.json,title=Hook target escapes plugin root::hook-target-outside-root [error]")
    expect(stdout.text()).not.toContain("## HookHound sniff report")
    expect(summaries).toEqual([
      {
        file: "/tmp/hookhound-summary.md",
        content: expect.stringContaining("Verdict: **FAILED**"),
      },
    ])
    expect(summaries[0]?.content).toContain("../shared/outside.js")
  })

  test("strict package-only fixture forwards --strict and fails on CLI error findings", async () => {
    const root = path.join(FIXTURES, "package-only")
    let invokedArgs: string[] = []

    const code = await runAction({
      env: { INPUT_ROOT: root, INPUT_STRICT: "true" },
      cliPath: "/tmp/hookhound-cli.js",
      stdout: captureOutput().stream,
      invokeCli: async (_command, args) => {
        invokedArgs = args
        return { code: 1, stdout: JSON.stringify(packageOnlyStrictSummary(root)), stderr: "" }
      },
    })

    expect(code).toBe(1)
    expect(invokedArgs).toEqual(["/tmp/hookhound-cli.js", "sniff", "--root", root, "--json", "--strict"])
  })

  test("resolves relative input roots from GITHUB_WORKSPACE", () => {
    expect(resolveActionRoot("test/fixtures/clean-plugin", "/work/repo", "/fallback")).toBe(path.join("/work/repo", "test", "fixtures", "clean-plugin"))
    expect(resolveActionRoot(undefined, "/work/repo", "/fallback")).toBe("/work/repo")
  })

  test("keeps scanner and check logic out of the action wrapper", async () => {
    const source = await readFile(path.join(ROOT, "src", "action.ts"), "utf8")

    expect(source).toContain("./core/report.js")
    expect(source).not.toContain("./core/scanner")
    expect(source).not.toContain("./checks/")
  })
})
