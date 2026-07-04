import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { conflict, unauthorized } from '../errors';
import type { LoginInput, RegisterInput } from '../validators/authValidators';

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = '12h';

export interface AuthResult {
  token: string;
  user: { id: string; email: string; name: string | null; organizationId: string };
  organization: { id: string; name: string };
}

function issueToken(params: { userId: string; organizationId: string; email: string }, jwtSecret: string): string {
  return jwt.sign(
    { sub: params.userId, organizationId: params.organizationId, email: params.email },
    jwtSecret,
    { expiresIn: TOKEN_TTL },
  );
}

export async function register(pool: Pool, jwtSecret: string, input: RegisterInput): Promise<AuthResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingOrg = await client.query('SELECT id FROM organizations WHERE name = $1', [input.organizationName]);
    if (existingOrg.rowCount) {
      throw conflict('an organization with this name already exists');
    }
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [input.email]);
    if (existingUser.rowCount) {
      throw conflict('a user with this email already exists');
    }

    const orgResult = await client.query<{ id: string; name: string }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name',
      [input.organizationName],
    );
    const organization = orgResult.rows[0];

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const userResult = await client.query<{ id: string; email: string; name: string | null }>(
      'INSERT INTO users (organization_id, email, password_hash, name) VALUES ($1, $2, $3, $4) RETURNING id, email, name',
      [organization.id, input.email, passwordHash, input.name ?? null],
    );
    const user = userResult.rows[0];

    await client.query('COMMIT');

    const token = issueToken({ userId: user.id, organizationId: organization.id, email: user.email }, jwtSecret);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, organizationId: organization.id },
      organization,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function login(pool: Pool, jwtSecret: string, input: LoginInput): Promise<AuthResult> {
  const result = await pool.query<{
    id: string;
    email: string;
    name: string | null;
    password_hash: string;
    organization_id: string;
    organization_name: string;
  }>(
    `SELECT u.id, u.email, u.name, u.password_hash, o.id AS organization_id, o.name AS organization_name
     FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.email = $1`,
    [input.email],
  );
  const row = result.rows[0];
  if (!row) {
    throw unauthorized('invalid email or password');
  }
  const passwordMatches = await bcrypt.compare(input.password, row.password_hash);
  if (!passwordMatches) {
    throw unauthorized('invalid email or password');
  }

  const token = issueToken({ userId: row.id, organizationId: row.organization_id, email: row.email }, jwtSecret);
  return {
    token,
    user: { id: row.id, email: row.email, name: row.name, organizationId: row.organization_id },
    organization: { id: row.organization_id, name: row.organization_name },
  };
}
