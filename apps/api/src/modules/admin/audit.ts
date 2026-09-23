import type { AdminAuditRepository } from '../../persistence/repositories';

// Every admin mutation is audited with before/after. Wrapping the mutation rather than
// leaving an audit call at each call site means an un-audited write requires actively
// bypassing this helper, instead of merely forgetting a line.
export async function audited<T>(
  audit: AdminAuditRepository,
  params: { actor_id: string; action: string; target_type: string; target_id: string; before: unknown | null },
  mutate: () => Promise<{ after: unknown; result: T }>,
): Promise<T> {
  const { after, result } = await mutate();
  await audit.record({
    actor_id: params.actor_id, action: params.action,
    target_type: params.target_type, target_id: params.target_id,
    before: params.before, after,
    created_at: new Date().toISOString(),
  });
  return result;
}
