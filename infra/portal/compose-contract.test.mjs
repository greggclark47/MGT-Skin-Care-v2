import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(new URL("./compose.yaml", import.meta.url), "utf8");
const apiDockerfile = readFileSync(new URL("./Dockerfile.api", import.meta.url), "utf8");
const webDockerfile = readFileSync(new URL("./Dockerfile.web", import.meta.url), "utf8");

test("compose keeps container images immutable and configurable", () => {
  assert.match(compose, /image: \$\{OLLAMA_IMAGE:\?Set the approved Ollama image digest\}/);
  assert.match(compose, /image: \$\{CADDY_IMAGE:\?Set the approved Caddy image digest\}/);
  assert.doesNotMatch(compose, /ollama\/ollama:(latest|\w+)/);
  assert.doesNotMatch(compose, /caddy:\d/);
});

test("compose exposes controlled local compute sync and persistent edge config", () => {
  assert.match(compose, /model-sync:/);
  assert.match(compose, /profiles: \["model-sync"\]/);
  assert.match(compose, /ollama pull/);
  assert.match(compose, /OLLAMA_NUM_PARALLEL/);
  assert.match(compose, /caddy_config:\/config/);
  assert.match(compose, /caddy.*validate/s);
});

test("application images consume the immutable Node build input", () => {
  assert.equal((compose.match(/NODE_IMAGE:\s+\$\{NODE_IMAGE:\?Set the approved Node image digest\}/g) || []).length, 3);
  assert.match(apiDockerfile, /ARG NODE_IMAGE\s+FROM \$\{NODE_IMAGE\}/);
  assert.match(webDockerfile, /ARG NODE_IMAGE\s+FROM \$\{NODE_IMAGE\}/);
});
