export type FindingLevel = "error" | "warning" | "info"

export interface Finding {
  id: string
  level: FindingLevel
  title: string
  message: string
  file?: string
  evidence?: string
  hint?: string
}

export interface Detection {
  kind: string
  file: string
  confidence: "high" | "medium" | "low"
}

export interface ScanSummary {
  root: string
  detections: Detection[]
  findings: Finding[]
}

export interface ScanOptions {
  root: string
  strict?: boolean
  json?: boolean
}
