import type { Detection, Finding, ScanSummary } from "./types.js"

const MARKS: Record<Finding["level"], string> = {
  error: "✗",
  warning: "!",
  info: "•",
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
