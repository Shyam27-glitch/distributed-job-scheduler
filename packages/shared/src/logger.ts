import pino from 'pino';

export function createLogger(name: string, level: string = process.env.LOG_LEVEL ?? 'info') {
  return pino({
    name,
    level,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;
