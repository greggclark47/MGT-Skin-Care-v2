import { Router } from 'express';
import { can, compileMatrix, EmptySafetyMatrixError, type VersionedIngredientRule, type KnowledgeStatus } from '@mgt/domain';
import { ApiError } from '../../middleware/error';
import { requirePermission, type AdminRequest } from './rbac-middleware';
import { audited } from './audit';
import type { AdminAuditRepository, IngredientRuleRepository } from '../../persistence/repositories';

// Ingredient-rules admin. Same approval discipline as knowledge objects, but the stakes are
// higher: these rules are the hard safety filter on every recommendation, so a bad edit here
// does not produce a weak blurb — it produces an unsafe product match.
export function ingredientRulesRouter(rules: IngredientRuleRepository, audit: AdminAuditRepository) {
  const router = Router();

  router.get('/', requirePermission('ingredient_rules.read'), async (req, res, next) => {
    try {
      const status = req.query.status as KnowledgeStatus | undefined;
      res.json({ rules: await rules.list(status) });
    } catch (err) { next(err); }
  });

  // The compiled matrix actually in force, plus its digest. This is the "what is live right
  // now" view — the number an SME needs before changing a threshold.
  router.get('/active', requirePermission('ingredient_rules.read'), async (_req, res, next) => {
    try {
      const active = await rules.listActive();
      const compiled = compileMatrix(active);
      res.json({ matrix_version: compiled.matrix_version, rule_count: compiled.rules.size, rules: active });
    } catch (err) {
      if (err instanceof EmptySafetyMatrixError) {
        // Surfaced as 503, not an empty 200: an empty safety matrix is an outage condition,
        // because scoring refuses to run without one.
        return next(new ApiError(503, 'empty_safety_matrix', 'No approved ingredient rules are loaded. Recommendation scoring is halted until at least one rule is approved.'));
      }
      next(err);
    }
  });

  router.put('/:key', requirePermission('ingredient_rules.write'), async (req, res, next) => {
    try {
      const r = req as AdminRequest;
      const key = String(req.params.key);
      const body = req.body as Partial<VersionedIngredientRule>;
      if (typeof body.sensitivity_ceiling_required !== 'number' || body.sensitivity_ceiling_required < 0 || body.sensitivity_ceiling_required > 1) {
        throw new ApiError(400, 'invalid_input', 'sensitivity_ceiling_required must be a number between 0 and 1.');
      }
      if (!body.rationale?.trim()) {
        // A safety threshold with no stated reason cannot be reviewed, only rubber-stamped.
        throw new ApiError(400, 'rationale_required', 'A rationale is required for every ingredient rule.');
      }

      const existing = await rules.get(key);
      const next_rule: VersionedIngredientRule = {
        ingredient_key: key,
        display_name: body.display_name ?? existing?.display_name ?? key,
        sensitivity_ceiling_required: body.sensitivity_ceiling_required,
        triggers_avoid_flag: body.triggers_avoid_flag ?? null,
        rationale: body.rationale.trim(),
        version: (existing?.version ?? 0) + 1,
        // Any write lands as a draft, including an edit to a live rule. The previously
        // approved version stays in force until an SME approves the new one, so editing a
        // safety rule can never weaken the live matrix as a side effect.
        status: 'draft',
        sme_approved_by: null,
        sme_approved_at: null,
      };

      await audited(audit, { actor_id: r.adminId, action: 'ingredient_rule.write', target_type: 'ingredient_rule', target_id: key, before: existing },
        async () => { await rules.saveDraft(next_rule); return { after: next_rule, result: null }; });

      res.json({ rule: next_rule, note: existing?.status === 'approved' ? 'The previously approved rule remains in force until this draft is approved.' : undefined });
    } catch (err) { next(err); }
  });

  router.post('/:key/approve', requirePermission('ingredient_rules.read'), async (req, res, next) => {
    try {
      const r = req as AdminRequest;
      if (!can(r.adminRoles, 'ingredient_rules.approve')) {
        throw new ApiError(403, 'forbidden', 'Missing permission: ingredient_rules.approve');
      }
      const key = String(req.params.key);
      const draft = await rules.getDraft(key);
      if (!draft) throw new ApiError(404, 'no_pending_draft', `No pending draft for ${key}.`);

      const approved: VersionedIngredientRule = {
        ...draft, status: 'approved',
        sme_approved_by: r.adminId, sme_approved_at: new Date().toISOString(),
      };

      await audited(audit, { actor_id: r.adminId, action: 'ingredient_rule.approve', target_type: 'ingredient_rule', target_id: key, before: draft },
        async () => { await rules.approve(approved); return { after: approved, result: null }; });

      res.json({ rule: approved });
    } catch (err) { next(err); }
  });

  return router;
}
