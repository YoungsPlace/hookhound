import { describe, expect, test } from "vitest"
import { renderGithubAnnotations, renderGithubJobSummary, renderGithubReport, renderSarifReport } from "../src/core/report.js"
import type { Finding, ScanSummary } from "../src/core/types.js"

function summary(findings: Finding[]): ScanSummary {
  return { root: "/repo", detections: [], findings }
}

describe("GitHub report renderer", () => {
  test("renders file-scoped error and warning annotations", () => {
    const report = summary([
      {
        id: "missing-hook",
        level: "error",
        title: "Hook missing",
        message: "Hook target does not exist.",
        file: "hooks/hooks.json",
        line: 12,
        column: 3,
      },
      {
        id: "slow-hook",
        level: "warning",
        title: "Hook timeout is missing",
        message: "Process hook can hang.",
        file: "hooks/hooks.json",
      },
    ])

    expect(renderGithubAnnotations(report).split("\n")).toEqual([
      "::error file=hooks/hooks.json,title=Hook missing,line=12,col=3::missing-hook [error] Hook missing%0AHook target does not exist.",
      "::warning file=hooks/hooks.json,title=Hook timeout is missing::slow-hook [warning] Hook timeout is missing%0AProcess hook can hang.",
    ])
  })

  test("keeps repo-level and info findings in summary without fake annotations", () => {
    const report = summary([
      {
        id: "no-surfaces-detected",
        level: "error",
        title: "No plugin surfaces detected",
        message: "HookHound did not find plugin surfaces.",
      },
      {
        id: "gjc-state-directory-detected",
        level: "info",
        title: "GJC runtime state detected",
        message: "Runtime state is informational.",
        file: ".gjc/",
      },
    ])

    expect(renderGithubAnnotations(report)).toBe("")
    const rendered = renderGithubReport(report)
    expect(rendered).not.toContain("::error")
    expect(rendered).not.toContain("::notice")
    expect(rendered).toContain("`no-surfaces-detected`")
    expect(rendered).toContain("No plugin surfaces detected")
    expect(rendered).toContain("`gjc-state-directory-detected`")
    expect(rendered).toContain("(.gjc/)")
  })

  test("includes evidence and hint in annotations and job summary", () => {
    const report = summary([
      {
        id: "unshipped-hook-target",
        level: "error",
        title: "Hook target is not included in npm payload",
        message: "The file exists locally but npm pack would not ship it.",
        file: "components/worker/dist/cli.js",
        evidence: "hooks/hooks.json: node components/worker/dist/cli.js",
        hint: "Update package files before publishing.",
      },
    ])

    const annotations = renderGithubAnnotations(report)
    expect(annotations).toContain("Evidence: hooks/hooks.json: node components/worker/dist/cli.js")
    expect(annotations).toContain("Hint: Update package files before publishing.")

    const jobSummary = renderGithubJobSummary(report)
    expect(jobSummary).toContain("Evidence: hooks/hooks.json: node components/worker/dist/cli.js")
    expect(jobSummary).toContain("Hint: Update package files before publishing.")
  })

  test("escapes workflow command data and properties", () => {
    const report = summary([
      {
        id: "escape-case",
        level: "error",
        title: "Bad: title, 100%",
        message: "line one\nline two\r100%",
        file: "src/a,b:c%.ts",
        evidence: "value, with: punctuation%",
      },
    ])

    expect(renderGithubAnnotations(report)).toBe(
      "::error file=src/a%2Cb%3Ac%25.ts,title=Bad%3A title%2C 100%25::escape-case [error] Bad: title, 100%25%0Aline one%0Aline two%0D100%25%0AEvidence: value, with: punctuation%25",
    )
  })

  test("suppresses duplicate annotations by finding identity", () => {
    const duplicated = {
      id: "manifest-json-invalid",
      level: "error" as const,
      title: "Manifest JSON is invalid",
      message: "Unexpected token.",
      file: ".zcode-plugin/plugin.json",
      evidence: "Unexpected token at 1:2",
    }
    const report = summary([
      duplicated,
      { ...duplicated, title: "Manifest still invalid" },
      { ...duplicated, evidence: "Unexpected token at 3:4" },
    ])

    const annotationLines = renderGithubAnnotations(report).split("\n")
    expect(annotationLines).toHaveLength(2)
    expect(annotationLines[0]).toContain("title=Manifest JSON is invalid")
    expect(annotationLines[1]).toContain("Evidence: Unexpected token at 3:4")
  })
})

describe("SARIF report renderer", () => {
  test("renders valid SARIF with unique rules and mapped finding results", () => {
    const report = summary([
      {
        id: "missing-hook",
        level: "error",
        title: "Hook missing",
        message: "Hook target does not exist.",
        file: "hooks/hooks.json",
        line: 12,
        column: 3,
        evidence: "node missing.js",
        hint: "Build the hook target before publishing.",
      },
      {
        id: "missing-hook",
        level: "warning",
        title: "Hook still missing",
        message: "Duplicate rule id should not duplicate rules.",
      },
      {
        id: "runtime-state",
        level: "info",
        title: "Runtime state detected",
        message: "Runtime state is informational.",
        file: ".gjc/",
      },
    ])

    const sarif = JSON.parse(renderSarifReport(report))

    expect(sarif.version).toBe("2.1.0")
    expect(sarif.runs).toHaveLength(1)
    expect(sarif.runs[0].tool.driver.name).toBe("HookHound")
    expect(sarif.runs[0].tool.driver.rules).toEqual([
      expect.objectContaining({
        id: "missing-hook",
        shortDescription: { text: "Hook missing" },
      }),
      expect.objectContaining({
        id: "runtime-state",
        shortDescription: { text: "Runtime state detected" },
      }),
    ])
    expect(sarif.runs[0].results).toEqual([
      expect.objectContaining({
        ruleId: "missing-hook",
        level: "error",
        message: {
          text: "Hook missing\nHook target does not exist.\nEvidence: node missing.js\nHint: Build the hook target before publishing.",
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: "hooks/hooks.json" },
              region: { startLine: 12, startColumn: 3 },
            },
          },
        ],
      }),
      expect.objectContaining({
        ruleId: "missing-hook",
        level: "warning",
        message: {
          text: "Hook still missing\nDuplicate rule id should not duplicate rules.",
        },
      }),
      expect.objectContaining({
        ruleId: "runtime-state",
        level: "note",
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: ".gjc/" },
            },
          },
        ],
      }),
    ])
  })
})
