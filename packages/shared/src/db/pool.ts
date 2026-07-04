import { Pool, type PoolConfig } from 'pg';

let pool: Pool | undefined;

export function createPool(config: PoolConfig): Pool {
  return new Pool(config);
}

export function getPool(connectionString?: string): Pool {
  if (!pool) {
    if (!connectionString) {
      throw new Error('getPool() called before initialization: pass a connectionString once at startup');
    }
    pool = createPool({ connectionString });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
