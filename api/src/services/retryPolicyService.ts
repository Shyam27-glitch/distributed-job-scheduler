import type { Pool } from 'pg';
import type { CreateRetryPolicyInput } from '../validators/retryPolicyValidators';

export interface RetryPolicyRow {
  id: string;
  organization_id: string;
  name: string;
  strategy: string;
  base_delay_ms: number;
  max_delay_ms: number;
  multiplier: string;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

function toRetryPolicy(row: RetryPolicyRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    strategy: row.strategy,
    baseDelayMs: row.base_delay_ms,
    maxDelayMs: row.max_delay_ms,
    multiplier: Number(row.multiplier),
    maxRetries: row.max_retries,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRetryPolicies(pool: Pool, organizationId: string) {
  const result = await pool.query<RetryPolicyRow>(
    'SELECT * FROM retry_policies WHERE organization_id = $1 ORDER BY created_at DESC',
    [organizationId],
  );
  return result.rows.map(toRetryPolicy);
}

export async function createRetryPolicy(pool: Pool, organizationId: string, input: CreateRetryPolicyInput) {
  const result = await pool.query<RetryPolicyRow>(
    `INSERT INTO retry_policies
       (organization_id, name, strategy, base_delay_ms, max_delay_ms, multiplier, max_retries)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      organizationId,
      input.name,
      input.strategy,
      input.baseDelayMs,
      input.maxDelayMs,
      input.multiplier,
      input.maxRetries,
    ],
  );
  return toRetryPolicy(result.rows[0]);
}
