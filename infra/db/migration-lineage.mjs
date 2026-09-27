import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPattern = /^(\d{4})_(.+)\.sql$/;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function collectMigrations(directory) {
  const absolute = resolve(directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(migrationPattern);
      if (!match) return null;
      const content = readFileSync(join(absolute, entry.name));
      return { id: match[1], name: entry.name, sha256: sha256(content), bytes: content.byteLength };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildManifest({ databaseDir, portalDir }) {
  return {
    schema: "mgt.migration-lineage.v1",
    generated_at: new Date().toISOString(),
    lineages: {
      database: collectMigrations(databaseDir),
      portal: collectMigrations(portalDir)
    }
  };
}

function normalizeTarget(target) {
  return Object.fromEntries(Object.entries(target?.lineages || {}).map(([lineage, entries]) => [
    lineage,
    Array.isArray(entries) ? entries.map((entry) => ({ id: String(entry.id || ""), name: String(entry.name || ""), sha256: entry.sha256 ? String(entry.sha256) : null })) : []
  ]));
}

export function validateTargetManifest(target) {
  const errors = [];
  if (!target || typeof target !== "object" || Array.isArray(target)) errors.push("manifest must be an object");
  if (!target?.lineages || typeof target.lineages !== "object" || Array.isArray(target.lineages)) errors.push("lineages must be an object");
  for (const [lineage, entries] of Object.entries(target?.lineages || {})) {
    if (!Array.isArray(entries)) {
      errors.push(`${lineage} must be an array`);
      continue;
    }
    const names = new Set();
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${lineage}[${index}] must be an object`);
        continue;
      }
      if (!/^\d{4}$/.test(String(entry.id || ""))) errors.push(`${lineage}[${index}].id must be four digits`);
      if (!migrationPattern.test(String(entry.name || ""))) errors.push(`${lineage}[${index}].name must be a numbered SQL migration`);
      if (names.has(entry.name)) errors.push(`${lineage} contains duplicate migration ${entry.name}`);
      names.add(entry.name);
      if (entry.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(String(entry.sha256))) errors.push(`${lineage}[${index}].sha256 must be a lowercase SHA-256 hash`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function reconcileManifest(local, target) {
  const shape = validateTargetManifest(target);
  if (!shape.ok) return { ok: false, failures: [{ type: "invalid_target_manifest", details: shape.errors }] };
  const failures = [];
  const targetLineages = normalizeTarget(target);
  for (const [lineage, desired] of Object.entries(local.lineages)) {
    const applied = targetLineages[lineage] || [];
    const appliedByName = new Map(applied.map((entry) => [entry.name, entry]));
    const desiredNames = new Set(desired.map((entry) => entry.name));
    for (const entry of desired) {
      const match = appliedByName.get(entry.name);
      if (!match) failures.push({ lineage, type: "missing_on_target", migration: entry.name });
      else if (match.sha256 && match.sha256 !== entry.sha256) failures.push({ lineage, type: "content_mismatch", migration: entry.name });
    }
    for (const entry of applied) if (!desiredNames.has(entry.name)) failures.push({ lineage, type: "unknown_on_target", migration: entry.name });
    const appliedOrder = applied.map((entry) => entry.name);
    const desiredOrder = desired.filter((entry) => appliedByName.has(entry.name)).map((entry) => entry.name);
    if (appliedOrder.join("\n") !== desiredOrder.join("\n")) failures.push({ lineage, type: "order_mismatch", migration: { applied: appliedOrder, expected: desiredOrder } });
  }
  for (const lineage of Object.keys(targetLineages)) if (!(lineage in local.lineages)) failures.push({ lineage, type: "unknown_lineage" });
  return { ok: failures.length === 0, failures };
}

function cli() {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf("--target-manifest");
  const targetPath = targetIndex >= 0 ? args[targetIndex + 1] : null;
  const manifest = buildManifest({ databaseDir: join(root, "infra/db/migrations"), portalDir: join(root, "infra/portal/migrations") });
  const result = { manifest, reconciliation: null };
  if (targetPath) {
    try {
      const target = JSON.parse(readFileSync(resolve(targetPath), "utf8"));
      result.reconciliation = reconcileManifest(manifest, target);
    } catch (error) {
      result.reconciliation = { ok: false, failures: [{ type: "invalid_target_manifest", details: [error instanceof Error ? error.message : "Unable to read target manifest"] }] };
    }
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.reconciliation && !result.reconciliation.ok ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
