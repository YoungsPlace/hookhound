import type { Detection, Finding, ScanSummary } from "./types.js"

const MARKS: Record<Finding["level"], string> = {
  error: "✗",
  warning: "!",
  info: "•",
}

type SarifRegion = {
  startLine?: number
  startColumn?: number
}

type SarifLocation = {
  physicalLocation: {
    artifactLocation: {
      uri: string
    }
    region?: SarifRegion
  }
}

function renderDetection(detection: Detection): string {
  return `✓ ${detection.kind}: ${detection.file}`
}

function renderFinding(finding: Finding): string {
  const location = finding.file ? ` (${finding.file})` : ""
  const evidence = finding.evidence ? `\n    evidence: ${finding.evidence}` : ""
  const hint = finding.hint ? `\n    hint: ${finding.hint}` : ""
  return `${MARKS[finding.level]} ${finding.title}${location}\n    ${finding.message}${evidence}${hint}`
}

function escapeCommandData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")
}

function escapeCommandProperty(value: string): string {
  return escapeCommandData(value).replaceAll(":", "%3A").replaceAll(",", "%2C")
}

function renderAnnotationMessage(finding: Finding): string {
  const lines = [
    `${finding.id} [${finding.level}] ${finding.title}`,
    finding.message,
  ]
  if (finding.evidence) lines.push(`Evidence: ${finding.evidence}`)
  if (finding.hint) lines.push(`Hint: ${finding.hint}`)
  return lines.join("\n")
}

function renderSarifMessage(finding: Finding): string {
  const lines = [finding.title, finding.message]
  if (finding.evidence) lines.push(`Evidence: ${finding.evidence}`)
  if (finding.hint) lines.push(`Hint: ${finding.hint}`)
  return lines.join("\n")
}

function renderSarifLocation(finding: Finding): SarifLocation | undefined {
  if (!finding.file) return undefined

  const physicalLocation: SarifLocation["physicalLocation"] = {
    artifactLocation: { uri: finding.file },
  }
  if (finding.line !== undefined || finding.column !== undefined) {
    physicalLocation.region = {}
    if (finding.line !== undefined) physicalLocation.region.startLine = finding.line
    if (finding.column !== undefined) physicalLocation.region.startColumn = finding.column
  }
  return { physicalLocation }
}

function renderSummaryFinding(finding: Finding): string[] {
  const location = finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}${finding.column ? `:${finding.column}` : ""}` : ""})` : ""
  const lines = [`- **${finding.level.toUpperCase()}** \`${finding.id}\` — ${finding.title}${location}`, `  - ${finding.message}`]
  if (finding.evidence) lines.push(`  - Evidence: ${finding.evidence}`)
  if (finding.hint) lines.push(`  - Hint: ${finding.hint}`)
  return lines
}

export function renderTextReport(summary: ScanSummary): string {
  const lines: string[] = []
  lines.push("HookHound sniff report")
  lines.push(`Root: ${summary.root}`)
  lines.push("")
  lines.push("Detected surfaces:")
  if (summary.detections.length === 0) {
    lines.push("  none")
  } else {
    lines.push(...summary.detections.map((detection) => `  ${renderDetection(detection)}`))
  }
  lines.push("")
  lines.push("Findings:")
  if (summary.findings.length === 0) {
    lines.push("  ✓ No findings")
  } else {
    lines.push(...summary.findings.map((finding) => `  ${renderFinding(finding).replaceAll("\n", "\n  ")}`))
  }
  const failed = summary.findings.some((finding) => finding.level === "error")
  lines.push("")
  lines.push(`Verdict: ${failed ? "FAILED" : "PASSED"}`)
  return lines.join("\n")
}

export function renderGithubAnnotations(summary: ScanSummary): string {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const finding of summary.findings) {
    if ((finding.level !== "error" && finding.level !== "warning") || !finding.file) continue

    const key = [finding.id, finding.level, finding.file, finding.message, finding.evidence ?? ""].join("\0")
    if (seen.has(key)) continue
    seen.add(key)

    const properties = [`file=${escapeCommandProperty(finding.file)}`, `title=${escapeCommandProperty(finding.title)}`]
    if (finding.line !== undefined) properties.push(`line=${finding.line}`)
    if (finding.column !== undefined) properties.push(`col=${finding.column}`)
    lines.push(`::${finding.level} ${properties.join(",")}::${escapeCommandData(renderAnnotationMessage(finding))}`)
  }
  return lines.join("\n")
}

export function renderGithubJobSummary(summary: ScanSummary): string {
  const lines: string[] = []
  lines.push("## HookHound sniff report")
  lines.push("")
  lines.push(`Root: \`${summary.root}\``)
  lines.push("")
  lines.push("### Findings")
  if (summary.findings.length === 0) {
    lines.push("")
    lines.push("No findings.")
  } else {
    lines.push("")
    for (const finding of summary.findings) {
      lines.push(...renderSummaryFinding(finding))
    }
  }
  lines.push("")
  lines.push(`Verdict: **${summary.findings.some((finding) => finding.level === "error") ? "FAILED" : "PASSED"}**`)
  return lines.join("\n")
}

export function renderGithubReport(summary: ScanSummary): string {
  const annotations = renderGithubAnnotations(summary)
  const jobSummary = renderGithubJobSummary(summary)
  return annotations ? `${annotations}\n${jobSummary}` : jobSummary
}

export function renderSarifReport(summary: ScanSummary): string {
  const rulesById = new Map<string, Finding>()
  for (const finding of summary.findings) {
    if (!rulesById.has(finding.id)) rulesById.set(finding.id, finding)
  }

  const results = summary.findings.map((finding) => {
    const location = renderSarifLocation(finding)
    return {
      ruleId: finding.id,
      level: finding.level === "info" ? "note" : finding.level,
      message: {
        text: renderSarifMessage(finding),
      },
      ...(location ? { locations: [location] } : {}),
    }
  })

  return JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "HookHound",
              informationUri: "https://github.com/YoungsPlace/hookhound",
              rules: Array.from(rulesById.values()).map((finding) => ({
                id: finding.id,
                shortDescription: {
                  text: finding.title,
                },
                fullDescription: {
                  text: finding.message,
                },
              })),
            },
          },
          results,
        },
      ],
    },
    null,
    2,
  )
}
