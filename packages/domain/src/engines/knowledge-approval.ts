export const KNOWLEDGE_APPROVAL_VERSION = '1.0.0';

// Knowledge-object lifecycle (blueprint Section 0.2 "Vector store / RAG" row, §9).
// Every AI factual claim must be traceable to an APPROVED object with a stated evidence
// level and a named reviewer. This state machine is the gate that makes that true; conflict
// C5 deferred Firecrawl web ingestion precisely because scraped pages cannot pass it.

export type KnowledgeStatus = 'draft' | 'in_review' | 'approved' | 'retired';

// Evidence level is recorded per object so a claim can be weighted, and so the compliance
// reviewer can find every 'anecdotal' object at once if a claim is challenged.
export type EvidenceLevel = 'peer_reviewed' | 'regulatory_guidance' | 'manufacturer_data' | 'expert_consensus' | 'anecdotal';

export interface KnowledgeObject {
  id: string;
  title: string;
  body: string;
  evidence_level: EvidenceLevel;
  source_url: string | null;
  source_date: string | null;   // when the underlying source was published
  version: number;
  status: KnowledgeStatus;
  sme_approved_by: string | null;
  sme_approved_at: string | null;
  retired_reason: string | null;
}

const ALLOWED_TRANSITIONS: Record<KnowledgeStatus, KnowledgeStatus[]> = {
  draft:     ['in_review', 'retired'],
  in_review: ['approved', 'draft', 'retired'], // back to draft = changes requested
  approved:  ['retired', 'in_review'],         // re-review on edit; never straight back to draft
  retired:   ['draft'],                        // revive as a fresh draft, never as approved
};

export interface TransitionRequest {
  object: KnowledgeObject;
  to: KnowledgeStatus;
  actor_id: string;
  actor_is_sme: boolean;
  reason?: string;
  now?: Date;
}

export type TransitionResult =
  | { ok: true; object: KnowledgeObject }
  | { ok: false; error: string };

export function transition(req: TransitionRequest): TransitionResult {
  const { object, to, actor_id, actor_is_sme, reason } = req;
  const now = req.now ?? new Date();

  if (object.status === to) return { ok: false, error: `already_${to}` };
  if (!ALLOWED_TRANSITIONS[object.status].includes(to)) {
    return { ok: false, error: `illegal_transition:${object.status}->${to}` };
  }

  // Only an SME may approve. This is the whole point of the workflow — an admin who can
  // edit content must not also be able to bless it, or "SME-approved" means nothing.
  if (to === 'approved' && !actor_is_sme) {
    return { ok: false, error: 'sme_role_required' };
  }

  // An object cannot be approved without the provenance that makes a claim defensible.
  if (to === 'approved') {
    if (!object.source_date) return { ok: false, error: 'missing_source_date' };
    if (!object.body?.trim()) return { ok: false, error: 'missing_body' };
  }

  if (to === 'retired' && !reason?.trim()) {
    return { ok: false, error: 'retire_reason_required' };
  }

  const next: KnowledgeObject = { ...object, status: to };

  if (to === 'approved') {
    next.sme_approved_by = actor_id;
    next.sme_approved_at = now.toISOString();
    next.retired_reason = null;
  }
  if (to === 'retired') {
    next.retired_reason = reason!.trim();
  }
  if (to === 'draft' || to === 'in_review') {
    // Leaving approved invalidates the approval: the reviewer signed off on a specific
    // version, not on the object's name. Carrying a stale sme_approved_by forward is how an
    // unreviewed edit ends up looking reviewed.
    next.sme_approved_by = null;
    next.sme_approved_at = null;
  }
  if (to === 'draft' && object.status === 'retired') {
    next.retired_reason = null;
    next.version = object.version + 1;
  }

  return { ok: true, object: next };
}

// Editing an approved object forces it back into review. Called by the content-edit path.
export function applyEdit(object: KnowledgeObject, changes: Partial<Pick<KnowledgeObject, 'title' | 'body' | 'evidence_level' | 'source_url' | 'source_date'>>): KnowledgeObject {
  const edited = { ...object, ...changes, version: object.version + 1 };
  if (object.status === 'approved') {
    edited.status = 'in_review';
    edited.sme_approved_by = null;
    edited.sme_approved_at = null;
  }
  return edited;
}

// The retrieval filter. RAG may ONLY see approved objects — the AI Gateway's citation check
// verifies a cited id was in the retrieved set, but that guarantee is hollow if the retrieved
// set itself contains unreviewed content. This is the other half of that contract.
export function isRetrievable(object: Pick<KnowledgeObject, 'status'>): boolean {
  return object.status === 'approved';
}
