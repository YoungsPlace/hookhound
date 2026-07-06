import path from "node:path"
import { readFile } from "node:fs/promises"
import { describe, expect, test } from "vitest"
import { extractHookTargets } from "../src/core/hook-targets.js"
import { scan } from "../src/core/scanner.js"

const FIXTURES = path.join(import.meta.dirname, "fixtures")

async function findingsFor(fixture: string, strict = false) {
  const summary = await scan({ root: path.join(FIXTURES, fixture), strict })
  return summary.findings
}

async function findingIds(fixture: string, strict = false): Promise<string[]> {
  const findings = await findingsFor(fixture, strict)
  return findings.map((finding) => finding.id)
}

describe("HookHound scanner", () => {
  test("detects a clean plugin without error findings", async () => {
    const summary = await scan({ root: path.join(FIXTURES, "clean-plugin") })
    expect(summary.detections.map((item) => item.kind).sort()).toEqual(["generic-hooks", "package", "zcode-plugin"])
    expect(summary.findings.filter((finding) => finding.level === "error")).toEqual([])
  })

  test("reports missing generated hook artifacts", async () => {
    await expect(findingIds("missing-dist")).resolves.toContain("missing-generated-hook-artifact")
  })

  test("reports plugin manifest version drift", async () => {
    await expect(findingIds("version-drift")).resolves.toContain("plugin-version-drift")
  })

  test("reports hook targets omitted from npm payload", async () => {
    await expect(findingIds("unshipped-target")).resolves.toContain("unshipped-hook-target")
  })

  test("rejects hook command targets that escape the plugin root", async () => {
    const findings = await findingsFor("outside-root")
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "hook-target-outside-root",
          level: "error",
          evidence: expect.stringContaining("../shared/outside.js"),
        }),
      ]),
    )
  })

  test("extracts interpreter command script targets without missing-target errors", async () => {
    const fixtureRoot = path.join(FIXTURES, "interpreter-command")
    const manifestFile = path.join(fixtureRoot, "hooks/hooks.json")
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"))
    const targets = extractHookTargets(fixtureRoot, manifestFile, manifest)

    const relativePaths = targets.map((target) => target.relativePath)
    expect([...new Set(relativePaths)].sort()).toEqual([
      "hooks/scripts/check.py",
      "hooks/scripts/quoted.py",
      "hooks/scripts/session-start.js",
      "hooks/scripts/session-start.py",
    ])
    expect(relativePaths).not.toContain("hooks/scripts/setup.js")
    expect([...new Set(targets.map((target) => target.raw))].sort()).toEqual([
      "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session-start.py",
      "${PLUGIN_ROOT}/hooks/scripts/check.py",
      "${PLUGIN_ROOT}/hooks/scripts/quoted.py",
      "./hooks/scripts/session-start.js",
    ])
    await expect(findingIds("interpreter-command")).resolves.not.toContain("missing-hook-target")
    await expect(findingsFor("interpreter-command")).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ level: "error" })]),
    )
  })

  test("treats root-level dist targets as generated artifacts", async () => {
    await expect(findingIds("root-dist-missing")).resolves.toContain("missing-generated-hook-artifact")
  })

  test("reports malformed and non-object manifests without crashing", async () => {
    await expect(findingIds("malformed-manifest")).resolves.toContain("manifest-json-invalid")
    await expect(findingIds("non-object-manifest")).resolves.toContain("manifest-not-object")
  })

  test("reports missing required plugin manifest fields", async () => {
    const findings = await findingsFor("missing-required-field")
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "plugin-manifest-missing-field",
          level: "error",
          message: expect.stringContaining("description"),
        }),
        expect.objectContaining({
          id: "plugin-manifest-missing-field",
          level: "error",
          message: expect.stringContaining("license"),
        }),
      ]),
    )
  })

  test("reports invalid marketplace plugin entries", async () => {
    await expect(findingIds("invalid-marketplace")).resolves.toContain("marketplace-plugin-entry-invalid")
  })

  test("does not treat package.json alone as an agent plugin surface", async () => {
    const findings = await findingsFor("package-only", true)
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "no-agent-plugin-surface",
          level: "error",
        }),
      ]),
    )
  })
})
