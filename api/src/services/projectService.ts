import type { Pool } from 'pg';
import { conflict, notFound } from '../errors';
import type { CreateProjectInput, UpdateProjectInput } from '../validators/projectValidators';

export interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toProject(row: ProjectRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(pool: Pool, organizationId: string) {
  const result = await pool.query<ProjectRow>(
    'SELECT * FROM projects WHERE organization_id = $1 ORDER BY created_at DESC',
    [organizationId],
  );
  return result.rows.map(toProject);
}

export async function getProject(pool: Pool, organizationId: string, projectId: string) {
  const result = await pool.query<ProjectRow>(
    'SELECT * FROM projects WHERE organization_id = $1 AND id = $2',
    [organizationId, projectId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('project not found');
  return toProject(row);
}

export async function createProject(
  pool: Pool,
  organizationId: string,
  createdBy: string,
  input: CreateProjectInput,
) {
  try {
    const result = await pool.query<ProjectRow>(
      `INSERT INTO projects (organization_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [organizationId, input.name, input.description ?? null, createdBy],
    );
    return toProject(result.rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('a project with this name already exists in your organization');
    }
    throw err;
  }
}

export async function updateProject(
  pool: Pool,
  organizationId: string,
  projectId: string,
  input: UpdateProjectInput,
) {
  await getProject(pool, organizationId, projectId);
  try {
    const result = await pool.query<ProjectRow>(
      `UPDATE projects SET
         name = COALESCE($3, name),
         description = CASE WHEN $4::boolean THEN $5 ELSE description END,
         updated_at = now()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, projectId, input.name ?? null, 'description' in input, input.description ?? null],
    );
    return toProject(result.rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('a project with this name already exists in your organization');
    }
    throw err;
  }
}

export async function deleteProject(pool: Pool, organizationId: string, projectId: string) {
  await getProject(pool, organizationId, projectId);
  await pool.query('DELETE FROM projects WHERE organization_id = $1 AND id = $2', [organizationId, projectId]);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
