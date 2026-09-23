import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/verification.yml", import.meta.url), "utf8");

test("continuous verification is triggered for review and protected branch changes", () => {
  assert.match(workflow, /^\s*pull_request:\s*$/m);
  assert.match(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /^\s*- main\s*$/m);
});

test("continuous verification is read-only and runs the local release gate", () => {
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm test:infra && pnpm test:compose-contract && pnpm test:lineage/);
  assert.match(workflow, /pnpm test:verification/);
  assert.doesNotMatch(workflow, /^\s*run:\s*.*\b(?:deploy|publish)\b/im);
  assert.doesNotMatch(workflow, /^\s*secrets\s*:/m);
});
