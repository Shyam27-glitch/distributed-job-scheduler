import { loadConfig, createLogger, getPool } from '@job-scheduler/shared';

const config = loadConfig();
const logger = createLogger('worker', config.LOG_LEVEL);
getPool(config.DATABASE_URL);

// Poller, heartbeat, reaper, and scheduler loops are added in later increments
// (claiming/worker core, retries+DLQ+reaper, scheduler).
logger.info('worker scaffolding started');
