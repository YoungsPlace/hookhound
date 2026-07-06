import path from "node:path"
import { describe, expect, test } from "vitest"
import { scan } from "../src/core/scanner.js"

const FIXTURES = path.join(import.meta.dirname, "fixtures")

async function findingIds(fixture: string): Promise<string[]> {
  const summary = await scan({ root: path.join(FIXTURES, fixture) })
  return summary.findings.map((finding) => finding.id)
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
})
