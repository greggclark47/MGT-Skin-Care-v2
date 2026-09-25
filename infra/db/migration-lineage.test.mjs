import assert from "node:assert/strict";
import { test } from "node:test";
import { buildManifest, collectMigrations, reconcileManifest, validateTargetManifest } from "./migration-lineage.mjs";

test("migration manifest inventories both independent lineages with hashes", () => {
  const manifest = buildManifest({ databaseDir: "infra/db/migrations", portalDir: "infra/portal/migrations" });
  assert.equal(manifest.schema, "mgt.migration-lineage.v1");
  assert.ok(manifest.lineages.database.length >= 7);
  assert.ok(manifest.lineages.portal.length >= 1);
  assert.ok(manifest.lineages.database.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
});

test("reconciliation accepts an exact target and rejects missing, changed, or unknown migrations", () => {
  const local = { lineages: { database: collectMigrations("infra/db/migrations"), portal: collectMigrations("infra/portal/migrations") } };
  const exact = { lineages: Object.fromEntries(Object.entries(local.lineages).map(([key, entries]) => [key, entries.map(({ id, name, sha256 }) => ({ id, name, sha256 }))])) };
  assert.deepEqual(reconcileManifest(local, exact), { ok: true, failures: [] });
  const altered = structuredClone(exact);
  altered.lineages.database = altered.lineages.database.slice(1);
  altered.lineages.database[0].sha256 = "0".repeat(64);
  altered.lineages.database.push({ id: "9999", name: "9999_unknown.sql", sha256: "1".repeat(64) });
  const result = reconcileManifest(local, altered);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.type === "missing_on_target"));
  assert.ok(result.failures.some((failure) => failure.type === "content_mismatch"));
  assert.ok(result.failures.some((failure) => failure.type === "unknown_on_target"));
});

test("target manifests fail closed when their shape, hash, or uniqueness is invalid", () => {
  const malformed = {
    lineages: {
      database: [
        { id: "1", name: "0001_schema.sql", sha256: "not-a-hash" },
        { id: "0001", name: "0001_schema.sql", sha256: "0".repeat(64) }
      ],
      portal: "not-an-array"
    }
  };
  const shape = validateTargetManifest(malformed);
  assert.equal(shape.ok, false);
  assert.ok(shape.errors.some((error) => error.includes("four digits")));
  assert.ok(shape.errors.some((error) => error.includes("lowercase SHA-256")));
  assert.ok(shape.errors.some((error) => error.includes("duplicate migration")));
  assert.ok(shape.errors.some((error) => error.includes("must be an array")));
  const local = { lineages: { database: [], portal: [] } };
  assert.equal(reconcileManifest(local, malformed).failures[0].type, "invalid_target_manifest");
});
