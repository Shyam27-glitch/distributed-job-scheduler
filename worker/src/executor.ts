import { runJob } from './handlers/defaultHandler';

export class JobTimeoutError extends Error {
  constructor() {
    super('job execution timed out');
    this.name = 'JobTimeoutError';
  }
}

export async function executeJob(payload: Record<string, unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new JobTimeoutError()), timeoutMs);
  });
  try {
    await Promise.race([runJob(payload), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
