import assert from "node:assert/strict";
import test from "node:test";
import { validateEnvironment } from "./preflight.mjs";

const production = {
  NODE_ENV: "production",
  DEMO_MODE: "false",
  PUBLIC_ORIGIN: "https://portal.mgtskincare.test",
  DATABASE_URL: "postgresql://mgt:secure@db.internal:5432/mgt?sslmode=verify-full",
  PORTAL_AUTO_MIGRATE: "false",
  PORTAL_DOMAIN: "portal.mgtskincare.test",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-production-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-production-value",
  OLLAMA_ENABLED: "true",
  OLLAMA_BASE_URL: "http://ollama:11434",
  OPENCLAW_ENABLED: "false",
  WORKER_INTERVAL_SECONDS: "60",
  WORKER_READINESS_MAX_AGE_SECONDS: "300",
  BACKUP_MAX_AGE_HOURS: "26",
  NOTIFICATION_DELIVERY: "in_app",
  SUBSCRIPTIONS_ENABLED: "false",
  SUBSCRIPTION_TERMS_APPROVED: "false",
  NODE_IMAGE: `node@sha256:${"c".repeat(64)}`,
  OLLAMA_IMAGE: `ollama/ollama@sha256:${"a".repeat(64)}`,
  CADDY_IMAGE: `caddy@sha256:${"b".repeat(64)}`
};

test("accepts the proposed external database configuration without proving live readiness", () => {
  const result = validateEnvironment(production);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes("OpenAI")));
});

test("rejects unverified database TLS and automatic production migrations", () => {
  const result=validateEnvironment({...production,DATABASE_URL:production.DATABASE_URL.replace('verify-full','disable'),PORTAL_AUTO_MIGRATE:'true'});
  assert.equal(result.ok,false);
  assert(result.errors.some(error=>error.includes('verified TLS')));
  assert(result.errors.some(error=>error.startsWith('PORTAL_AUTO_MIGRATE')));
});

test("rejects placeholders and an unsafe worker readiness window", () => {
  const result = validateEnvironment({
    ...production,
    PUBLIC_ORIGIN: "https://YOUR-PORTAL-HOST",
    DATABASE_URL: "postgresql://USER:PASSWORD@DATABASE:5432/mgt",
    WORKER_READINESS_MAX_AGE_SECONDS: "90"
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith("PUBLIC_ORIGIN")));
  assert.ok(result.errors.some((error) => error.startsWith("DATABASE_URL")));
  assert.ok(result.errors.some((error) => error.includes("twice WORKER_INTERVAL_SECONDS")));
});

test("requires the complete billing contract when subscriptions are enabled", () => {
  const result = validateEnvironment({
    ...production,
    SUBSCRIPTIONS_ENABLED: "true",
    SUBSCRIPTION_TERMS_APPROVED: "false"
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("SUBSCRIPTION_TERMS_APPROVED")));
  assert.ok(result.errors.some((error) => error.startsWith("STRIPE_SECRET_KEY")));
  assert.ok(result.errors.some((error) => error.startsWith("STRIPE_VENDOR_ANNUAL_PRICE_ID")));
});

test("requires secure webhook delivery settings", () => {
  const result = validateEnvironment({
    ...production,
    NOTIFICATION_DELIVERY: "webhook",
    NOTIFICATION_WEBHOOK_URL: "http://notifications.internal",
    NOTIFICATION_WEBHOOK_TOKEN: ""
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith("NOTIFICATION_WEBHOOK_URL")));
  assert.ok(result.errors.some((error) => error.startsWith("NOTIFICATION_WEBHOOK_TOKEN")));
});

test("rejects floating or placeholder container image tags", () => {
  const result = validateEnvironment({ ...production, OLLAMA_IMAGE: "ollama/ollama:latest", CADDY_IMAGE: "caddy:2" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith("OLLAMA_IMAGE")));
  assert.ok(result.errors.some((error) => error.startsWith("CADDY_IMAGE")));
});

test("requires an immutable Node base image for application builds", () => {
  const result = validateEnvironment({ ...production, NODE_IMAGE: "node:24-bookworm-slim" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith("NODE_IMAGE")));
});

test("allows native Ollama mode without an OpenClaw key and gates proxy mode", () => {
  const native = validateEnvironment({ ...production, OPENCLAW_ENABLED: "true", OPENCLAW_BASE_URL: "http://ollama:11434", OPENCLAW_API_MODE: "ollama", OPENCLAW_API_KEY: "" });
  assert.equal(native.ok, true);
  const invalid = validateEnvironment({ ...production, OPENCLAW_ENABLED: "true", OPENCLAW_BASE_URL: "http://ollama:11434", OPENCLAW_API_MODE: "unsupported" });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes("OPENCLAW_API_MODE")));
  const proxy = validateEnvironment({ ...production, OPENCLAW_ENABLED: "true", OPENCLAW_BASE_URL: "http://proxy.internal", OPENCLAW_API_MODE: "openai-completions", OPENCLAW_API_KEY: "" });
  assert.equal(proxy.ok, false);
  assert.ok(proxy.errors.some((error) => error.startsWith("OPENCLAW_API_KEY")));
});
