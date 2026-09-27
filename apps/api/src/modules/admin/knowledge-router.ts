import { Router } from 'express';
import { transition, applyEdit, can, type KnowledgeObject, type KnowledgeStatus } from '@mgt/domain';
import { ApiError } from '../../middleware/error';
import { requirePermission, type AdminRequest } from './rbac-middleware';
import { audited } from './audit';
import type { AdminAuditRepository, KnowledgeRepository } from '../../persistence/repositories';

// Knowledge approval workflow (§9). This is what makes "every AI claim is traceable to
// SME-approved content" an enforced property rather than an aspiration.
export function knowledgeRouter(knowledge: KnowledgeRepository, audit: AdminAuditRepository) {
  const router = Router();

  router.get('/', requirePermission('knowledge.read'), async (req, res, next) => {
    try {
      const status = req.query.status as KnowledgeStatus | undefined;
      res.json({ objects: await knowledge.list(status) });
    } catch (err) { next(err); }
  });

  router.post('/', requirePermission('knowledge.write'), async (req, res, next) => {
    try {
      const r = req as AdminRequest;
      const body = req.body as Partial<KnowledgeObject> & { id: string; title: string; body: string };
      if (!body.id || !body.title) throw new ApiError(400, 'invalid_input', 'id and title are required.');

      // New objects always start as drafts. There is no create-as-approved path, by design.
      const object: KnowledgeObject = {
        id: body.id, title: body.title, body: body.body ?? '',
        evidence_level: body.evidence_level ?? 'expert_consensus',
        source_url: body.source_url ?? null, source_date: body.source_date ?? null,
        version: 1, status: 'draft', sme_approved_by: null, sme_approved_at: null, retired_reason: null,
      };

      await audited(audit, { actor_id: r.adminId, action: 'knowledge.create', target_type: 'knowledge_object', target_id: object.id, before: null },
        async () => { await knowledge.save(object); return { after: object, result: null }; });

      res.status(201).json({ object });
    } catch (err) { next(err); }
  });

  router.patch('/:id', requirePermission('knowledge.write'), async (req, res, next) => {
    try {
      const r = req as AdminRequest;
      const id = String(req.params.id);
      const existing = await knowledge.get(id);
      if (!existing) throw new ApiError(404, 'not_found', `No knowledge object ${id}.`);

      const edited = applyEdit(existing, req.body ?? {});
      await audited(audit, { actor_id: r.adminId, action: 'knowledge.edit', target_type: 'knowledge_object', target_id: existing.id, before: existing },
        async () => { await knowledge.save(edited); return { after: edited, result: null }; });

      res.json({ object: edited, note: existing.status === 'approved' ? 'Editing an approved object returned it to review.' : undefined });
    } catch (err) { next(err); }
  });

  // Status transitions. Approval requires knowledge.approve, which only the SME role carries.
  router.post('/:id/transition', requirePermission('knowledge.read'), async (req, res, next) => {
    try {
      const r = req as AdminRequest;
      const { to, reason } = req.body as { to: KnowledgeStatus; reason?: string };
      const id = String(req.params.id);
      const existing = await knowledge.get(id);
      if (!existing) throw new ApiError(404, 'not_found', `No knowledge object ${id}.`);

      // Permission is checked against the TARGET state: moving to approved needs the approve
      // permission; every other move needs write.
      const needed = to === 'approved' ? 'knowledge.approve' as const : 'knowledge.write' as const;
      if (!can(r.adminRoles, needed)) throw new ApiError(403, 'forbidden', `Missing permission: ${needed}`);

      const result = transition({ object: existing, to, actor_id: r.adminId, actor_is_sme: r.adminIsSme, reason });
      if (!result.ok) throw new ApiError(409, result.error, `Cannot move to ${to}: ${result.error}`);

      await audited(audit, { actor_id: r.adminId, action: `knowledge.${to}`, target_type: 'knowledge_object', target_id: existing.id, before: existing },
        async () => { await knowledge.save(result.object); return { after: result.object, result: null }; });

      res.json({ object: result.object });
    } catch (err) { next(err); }
  });

  router.get('/:id/audit', requirePermission('knowledge.read'), async (req, res, next) => {
    try {
      res.json({ entries: await audit.listForTarget('knowledge_object', String(req.params.id)) });
    } catch (err) { next(err); }
  });

  return router;
}
