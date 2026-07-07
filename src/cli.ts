#!/usr/bin/env node
import { scan } from "./core/scanner.js"
import { renderGithubReport, renderSarifReport, renderTextReport } from "./core/report.js"

interface CliArgs {
  root: string
  json: boolean
  strict: boolean
  format: "text" | "github" | "sarif"
  configPath?: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { root: process.cwd(), json: false, strict: false, format: "text" }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") {
      args.json = true
    } else if (arg === "--strict") {
      args.strict = true
    } else if (arg === "--format") {
      const value = argv[index + 1]
      if (!value) throw new Error("--format requires a value")
      if (value !== "text" && value !== "github" && value !== "sarif") throw new Error(`Unsupported format: ${value}`)
      args.format = value
      index += 1
    } else if (arg === "--config") {
      const value = argv[index + 1]
      if (!value) throw new Error("--config requires a path")
      args.configPath = value
      index += 1
    } else if (arg === "--root") {
      const value = argv[index + 1]
      if (!value) throw new Error("--root requires a path")
      args.root = value
      index += 1
    } else if (arg === "--help" || arg === "-h") {
      console.log(`HookHound — sniff broken agent plugins before users do.\n\nUsage:\n  hookhound sniff [--root <path>] [--config <path>] [--strict] [--json] [--format text|github|sarif]\n\nCommands:\n  sniff    Detect plugin surfaces and run release-gate checks\n`)
      process.exit(0)
    } else if (arg === "sniff") {
      continue
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const summary = await scan(args)
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else if (args.format === "github") {
    console.log(renderGithubReport(summary))
  } else if (args.format === "sarif") {
    console.log(renderSarifReport(summary))
  } else {
    console.log(renderTextReport(summary))
  }
  if (summary.findings.some((finding) => finding.level === "error")) {
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`HookHound failed: ${message}`)
  process.exit(1)
})
