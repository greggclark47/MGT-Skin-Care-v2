import { scanBlockedTerms, checkCitations } from '@mgt/domain';
import type { JsonSchema, TaskConfig } from './types';

// Validator (Section C.6): JSON schema -> blocked-term scan -> citation check, in that order.
// Reuses @mgt/domain's eval-harness for the last two so the CI golden-set suite and the live
// request path apply BYTE-IDENTICAL rules. If these ever diverge, the eval suite stops
// predicting production behaviour, which is the failure mode worth designing out.

export interface ValidationResult {
  ok: boolean;
  parsed: unknown | null;
  failure_reason: string | null;
}

export function validateSchema(text: string, schema: JsonSchema | undefined): { ok: boolean; parsed: unknown | null; reason: string | null } {
  if (!schema) return { ok: true, parsed: null, reason: null };
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, parsed: null, reason: 'structured_output_not_json' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, parsed: null, reason: 'structured_output_not_object' };
  }
  for (const key of schema.required) {
    if (!(key in parsed)) return { ok: false, parsed: null, reason: `structured_output_missing:${key}` };
  }
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!(key in parsed)) continue;
    const value = parsed[key];
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (actual !== spec.type) return { ok: false, parsed: null, reason: `structured_output_type:${key}` };
  }
  return { ok: true, parsed, reason: null };
}

export function validate(text: string, config: TaskConfig, retrievedKnowledgeIds: string[]): ValidationResult {
  const schemaResult = validateSchema(text, config.response_schema);
  if (!schemaResult.ok) return { ok: false, parsed: null, failure_reason: schemaResult.reason };

  const scan = scanBlockedTerms(text);
  if (!scan.passed) {
    return { ok: false, parsed: null, failure_reason: `blocked_term:${scan.matches[0].term}` };
  }

  if (config.grounded) {
    // Citations may come from the parsed structured output or be absent entirely. An
    // ungrounded-but-grounded-task response with zero citations is allowed through here only
    // when the model made no factual citation claim at all; a citation OUTSIDE the retrieved
    // set is always a failure (that is the fabricated-reference case).
    const parsed = schemaResult.parsed as { cited_knowledge_ids?: unknown } | null;
    const cited = Array.isArray(parsed?.cited_knowledge_ids) ? (parsed!.cited_knowledge_ids as string[]) : [];
    const citationResult = checkCitations({ citedKnowledgeIds: cited, retrievedKnowledgeIds });
    if (!citationResult.passed) {
      return { ok: false, parsed: null, failure_reason: `invalid_citation:${citationResult.invalid_citations[0]}` };
    }
  }

  return { ok: true, parsed: schemaResult.parsed, failure_reason: null };
}
