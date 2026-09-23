import { pathToFileURL } from "node:url";

const placeholder = /(your-|change[-_]?me|example\.|localhost|127\.0\.0\.1|user:password|database:5432)/i;

function isTrue(value) {
  return String(value).toLowerCase() === "true";
}

function validUrl(value, protocols) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && !placeholder.test(value);
  } catch {
    return false;
  }
}

function positiveNumber(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum;
}

function digestImage(value) {
  return /^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(String(value || "").trim());
}

export function validateEnvironment(env) {
  const errors = [];
  const warnings = [];
  const requireValue = (key) => {
    const value = String(env[key] || "").trim();
    if (!value || placeholder.test(value)) errors.push(`${key} must be set to a production value.`);
    return value;
  };

  if (env.NODE_ENV !== "production") errors.push("NODE_ENV must be production.");
  if (String(env.DEMO_MODE).toLowerCase() !== "false") errors.push("DEMO_MODE must be false.");

  const publicOrigin = requireValue("PUBLIC_ORIGIN");
  if (publicOrigin && !validUrl(publicOrigin, ["https:"])) errors.push("PUBLIC_ORIGIN must be a valid HTTPS origin.");

  const databaseUrl = requireValue("DATABASE_URL");
  if (databaseUrl && !validUrl(databaseUrl, ["postgres:", "postgresql:"])) errors.push("DATABASE_URL must be a production PostgreSQL URL.");

  try {
    if (new URL(databaseUrl).searchParams.get("sslmode") !== "verify-full") errors.push("DATABASE_URL must require verified TLS (sslmode=verify-full).");
  } catch { /* URL validation above reports the missing or malformed connection. */ }
  if (env.PORTAL_AUTO_MIGRATE !== "false") errors.push("PORTAL_AUTO_MIGRATE must be false; review and apply database changes separately.");
  warnings.push("Configuration checks do not prove target-project identity, schema compatibility, RLS isolation, or data reconciliation. Those require separate release evidence.");

  const portalDomain = requireValue("PORTAL_DOMAIN");
  if (portalDomain && (portalDomain.includes("://") || portalDomain.includes("/") || placeholder.test(portalDomain))) {
    errors.push("PORTAL_DOMAIN must be a production hostname without a scheme or path.");
  }

  if (!digestImage(env.NODE_IMAGE)) errors.push("NODE_IMAGE must use an approved immutable @sha256 image digest.");
  if (!digestImage(env.OLLAMA_IMAGE)) errors.push("OLLAMA_IMAGE must use an approved immutable @sha256 image digest.");
  if (!digestImage(env.CADDY_IMAGE)) errors.push("CADDY_IMAGE must use an approved immutable @sha256 image digest.");

  const supabaseUrl = requireValue("SUPABASE_URL");
  if (supabaseUrl && !validUrl(supabaseUrl, ["https:"])) errors.push("SUPABASE_URL must be a production HTTPS URL.");
  requireValue("SUPABASE_ANON_KEY");
  const serviceRole = requireValue("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRole && serviceRole === env.SUPABASE_ANON_KEY) errors.push("SUPABASE_SERVICE_ROLE_KEY must differ from SUPABASE_ANON_KEY.");

  if (!["true", "false"].includes(String(env.OLLAMA_ENABLED).toLowerCase())) errors.push("OLLAMA_ENABLED must be true or false.");
  if (isTrue(env.OLLAMA_ENABLED) && !validUrl(env.OLLAMA_BASE_URL, ["http:", "https:"])) errors.push("OLLAMA_BASE_URL must be a valid HTTP(S) URL when Ollama is enabled.");

  if (!["true", "false"].includes(String(env.OPENCLAW_ENABLED).toLowerCase())) errors.push("OPENCLAW_ENABLED must be true or false.");
  if (isTrue(env.OPENCLAW_ENABLED)) {
    if (!validUrl(env.OPENCLAW_BASE_URL, ["http:", "https:"])) errors.push("OPENCLAW_BASE_URL must be a valid HTTP(S) URL when OpenClaw is enabled.");
    const openClawMode = String(env.OPENCLAW_API_MODE || "ollama");
    if (!["ollama", "openai-completions"].includes(openClawMode)) errors.push("OPENCLAW_API_MODE must be ollama or openai-completions.");
    if (openClawMode === "openai-completions") requireValue("OPENCLAW_API_KEY");
  } else {
    warnings.push("OpenClaw orchestration is disabled.");
  }

  const workerInterval = Number(env.WORKER_INTERVAL_SECONDS);
  const readinessAge = Number(env.WORKER_READINESS_MAX_AGE_SECONDS);
  if (!positiveNumber(workerInterval, 15, 3600)) errors.push("WORKER_INTERVAL_SECONDS must be between 15 and 3600.");
  if (!positiveNumber(readinessAge, 60, 86400)) errors.push("WORKER_READINESS_MAX_AGE_SECONDS must be between 60 and 86400.");
  if (Number.isFinite(workerInterval) && Number.isFinite(readinessAge) && readinessAge < workerInterval * 2) {
    errors.push("WORKER_READINESS_MAX_AGE_SECONDS must be at least twice WORKER_INTERVAL_SECONDS.");
  }
  if (!positiveNumber(env.BACKUP_MAX_AGE_HOURS, 1, 72)) errors.push("BACKUP_MAX_AGE_HOURS must be between 1 and 72.");

  const delivery = String(env.NOTIFICATION_DELIVERY || "");
  if (!["in_app", "webhook"].includes(delivery)) errors.push("NOTIFICATION_DELIVERY must be in_app or webhook.");
  if (delivery === "webhook") {
    if (!validUrl(env.NOTIFICATION_WEBHOOK_URL, ["https:"])) errors.push("NOTIFICATION_WEBHOOK_URL must be HTTPS for webhook delivery.");
    requireValue("NOTIFICATION_WEBHOOK_TOKEN");
  }

  if (!["true", "false"].includes(String(env.SUBSCRIPTIONS_ENABLED).toLowerCase())) errors.push("SUBSCRIPTIONS_ENABLED must be true or false.");
  if (isTrue(env.SUBSCRIPTIONS_ENABLED)) {
    if (!isTrue(env.SUBSCRIPTION_TERMS_APPROVED)) errors.push("SUBSCRIPTION_TERMS_APPROVED must be true before subscriptions are enabled.");
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET",
      "STRIPE_CONSUMER_MONTHLY_PRICE_ID",
      "STRIPE_CONSUMER_ANNUAL_PRICE_ID",
      "STRIPE_VENDOR_MONTHLY_PRICE_ID",
      "STRIPE_VENDOR_ANNUAL_PRICE_ID"
    ]) requireValue(key);
  } else {
    warnings.push("Subscriptions are disabled.");
  }

  if (!String(env.OPENAI_API_KEY || "").trim()) warnings.push("Hosted OpenAI escalation is disabled; local routes remain available.");

  return { ok: errors.length === 0, errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateEnvironment(process.env);
  console.log("MGT portal production preflight");
  for (const warning of result.warnings) console.log(`WARN  ${warning}`);
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.log(result.ok ? "PASS  Environment is ready for build/deployment checks." : `FAIL  ${result.errors.length} blocking configuration issue(s).`);
  process.exitCode = result.ok ? 0 : 1;
}
