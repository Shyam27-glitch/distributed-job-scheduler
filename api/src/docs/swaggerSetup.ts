import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

export function mountApiDocs(app: Express): void {
  const specPath = path.join(__dirname, '../../../docs/openapi.yaml');
  const spec = yaml.load(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
