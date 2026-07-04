import { loadConfig, createLogger, getPool } from '@job-scheduler/shared';
import { createApp } from './app';

const config = loadConfig();
const logger = createLogger('api', config.LOG_LEVEL);
getPool(config.DATABASE_URL);

const app = createApp(logger);

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'api listening');
});
