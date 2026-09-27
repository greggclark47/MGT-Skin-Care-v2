export const EVAL_HARNESS_VERSION = '1.0.0';

// AI evaluation harness (Section H SC-P2 CREATE item; Section 0.4 AI-platform row).
// This is the deterministic validator layer that sits between the AI Gateway's provider
// response and the caller — it never calls a model itself. Two checks the v1 KPI dashboard
// names explicitly: 0 unsupported-claim outputs, 100% citation validity.

// Cosmetic/compliance blocked terms — anything implying diagnosis, disease treatment, or a
// medical claim. Seed list; SC-P4's compliance track (Section H) expands this with counsel.
export const BLOCKED_TERMS = [
  'cure', 'cures', 'treats disease', 'diagnose', 'diagnosis', 'prescription strength',
  'fda approved', 'clinically proven to cure', 'eliminates acne permanently', 'anti-inflammatory drug',
  'dermatologist certified', // unqualified certification claims — flagged for compliance review, not necessarily false
];

export interface BlockedTermScanResult {
  passed: boolean;
  matches: { term: string; index: number }[];
}

export function scanBlockedTerms(text: string): BlockedTermScanResult {
  const lower = text.toLowerCase();
  const matches: { term: string; index: number }[] = [];
  for (const term of BLOCKED_TERMS) {
    const index = lower.indexOf(term);
    if (index !== -1) matches.push({ term, index });
  }
  return { passed: matches.length === 0, matches };
}

export interface CitationCheckInput {
  citedKnowledgeIds: string[];
  retrievedKnowledgeIds: string[]; // the set actually returned by the RAG retrieval step for this call
}
export interface CitationCheckResult {
  passed: boolean;
  invalid_citations: string[]; // cited but not in the retrieved set — a fabricated/ungrounded reference
}

// Every cited knowledge id must exist in the retrieved set (Section C.6: "checks that every
// cited knowledge id exists in the retrieved set"). A citation outside the retrieved set means
// the model referenced something it wasn't actually given — an ungrounded claim by definition.
export function checkCitations(input: CitationCheckInput): CitationCheckResult {
  const retrievedSet = new Set(input.retrievedKnowledgeIds);
  const invalid_citations = input.citedKnowledgeIds.filter((id) => !retrievedSet.has(id));
  return { passed: invalid_citations.length === 0, invalid_citations };
}

export interface EvalCase {
  id: string;
  task_type: string;
  output_text: string;
  cited_knowledge_ids: string[];
  retrieved_knowledge_ids: string[];
}

export interface EvalCaseResult {
  case_id: string;
  blocked_terms: BlockedTermScanResult;
  citations: CitationCheckResult;
  passed: boolean;
}

// Runs the full validator pass over a golden set (Section H SC-P2: "eval_cases golden set
// (200)"). CI hook target: fail the build if any case regresses.
export function runEvalSuite(cases: EvalCase[]): { results: EvalCaseResult[]; pass_rate: number; unsupported_claim_rate: number } {
  const results = cases.map((c) => {
    const blocked_terms = scanBlockedTerms(c.output_text);
    const citations = checkCitations({ citedKnowledgeIds: c.cited_knowledge_ids, retrievedKnowledgeIds: c.retrieved_knowledge_ids });
    return { case_id: c.id, blocked_terms, citations, passed: blocked_terms.passed && citations.passed };
  });
  const pass_rate = results.length ? results.filter((r) => r.passed).length / results.length : 1;
  const unsupported_claim_rate = results.length ? results.filter((r) => !r.citations.passed).length / results.length : 0;
  return { results, pass_rate, unsupported_claim_rate };
}
