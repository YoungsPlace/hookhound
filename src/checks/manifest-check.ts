import path from "node:path"
import { pathExists, readJson, relativePosix } from "../core/files.js"
import type { Detection, Finding } from "../core/types.js"

const REQUIRED_PLUGIN_FIELDS = ["name", "version", "description", "license"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

export async function checkManifests(root: string, detections: Detection[]): Promise<Finding[]> {
  const findings: Finding[] = []
  const pluginVersions = new Map<string, string>()
  const pluginLicenses = new Map<string, string>()

  for (const detection of detections.filter((item) => item.file.endsWith(".json"))) {
    const absolute = path.join(root, detection.file)
    const parsed = await readJson(absolute)
    if (!parsed.ok) {
      findings.push({
        id: "manifest-json-invalid",
        level: "error",
        title: "Manifest JSON is invalid",
        file: detection.file,
        message: parsed.error ?? "Could not parse manifest JSON.",
      })
      continue
    }

    if (!isRecord(parsed.value)) {
      findings.push({
        id: "manifest-not-object",
        level: "error",
        title: "Manifest must be a JSON object",
        file: detection.file,
        message: "Agent plugin manifests must parse to a JSON object.",
      })
      continue
    }

    if (detection.file.endsWith("plugin.json")) {
      for (const field of REQUIRED_PLUGIN_FIELDS) {
        if (asString(parsed.value[field]) === null) {
          findings.push({
            id: "plugin-manifest-missing-field",
            level: "error",
            title: `Plugin manifest missing ${field}`,
            file: detection.file,
            message: `Expected non-empty string field '${field}'.`,
          })
        }
      }

      const version = asString(parsed.value.version)
      const license = asString(parsed.value.license)
      if (version) pluginVersions.set(detection.file, version)
      if (license) pluginLicenses.set(detection.file, license)
    }

    if (detection.file.endsWith("marketplace.json")) {
      const plugins = parsed.value.plugins
      if (!Array.isArray(plugins)) {
        findings.push({
          id: "marketplace-plugins-missing",
          level: "warning",
          title: "Marketplace manifest has no plugins array",
          file: detection.file,
          message: "Expected a plugins array so marketplace sources can be validated.",
        })
      } else {
        for (const [index, plugin] of plugins.entries()) {
          if (!isRecord(plugin)) {
            findings.push({
              id: "marketplace-plugin-entry-invalid",
              level: "error",
              title: "Marketplace plugin entry must be an object",
              file: detection.file,
              message: `plugins[${index}] must be a JSON object with at least a source field.`,
            })
            continue
          }
          const source = asString(plugin.source)
          if (!source) {
            findings.push({
              id: "marketplace-source-missing",
              level: "error",
              title: "Marketplace plugin source missing",
              file: detection.file,
              message: `plugins[${index}].source must point at a local plugin payload root.`,
            })
            continue
          }
          const sourcePath = path.resolve(path.dirname(absolute), source)
          if (!(await pathExists(sourcePath))) {
            findings.push({
              id: "marketplace-source-not-found",
              level: "error",
              title: "Marketplace plugin source does not exist",
              file: detection.file,
              message: `plugins[${index}].source resolves to ${relativePosix(root, sourcePath)}, which does not exist.`,
              hint: "Fix the marketplace source path or include the referenced payload directory.",
            })
          }
        }
      }
    }
  }

  const uniqueVersions = new Set(pluginVersions.values())
  if (uniqueVersions.size > 1) {
    findings.push({
      id: "plugin-version-drift",
      level: "error",
      title: "Plugin manifest versions drift",
      message: [...pluginVersions.entries()].map(([file, version]) => `${file}=${version}`).join(", "),
      hint: "Keep Claude/ZCode/Codex manifest versions synchronized before release.",
    })
  }

  const uniqueLicenses = new Set(pluginLicenses.values())
  if (uniqueLicenses.size > 1) {
    findings.push({
      id: "plugin-license-drift",
      level: "warning",
      title: "Plugin manifest licenses drift",
      message: [...pluginLicenses.entries()].map(([file, license]) => `${file}=${license}`).join(", "),
    })
  }

  if (pluginLicenses.size > 0 && !(await pathExists(path.join(root, "LICENSE")))) {
    findings.push({
      id: "license-file-missing",
      level: "warning",
      title: "Manifest declares a license but no root LICENSE file exists",
      message: "Package managers and GitHub license detection work best when the license text is included at repository root.",
      hint: "Add a LICENSE file matching the manifest license before publishing.",
    })
  }

  return findings
}
