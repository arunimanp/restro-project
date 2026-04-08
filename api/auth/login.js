// api/auth/login.js — POST /api/auth/login
import sql from '../../lib/db.js';
import { comparePassword, signToken } from '../../lib/auth.js';
import { handleCors, parseBody, sendError } from '../../lib/middleware.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const { email, password } = body;
  if (!email || !password) {
    return sendError(res, 400, 'Email and password are required');
  }

  try {
    const rows = await sql`
      SELECT id, name, email, password_hash, role
      FROM users
      WHERE email = ${email.toLowerCase().trim()}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const user = rows[0];
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const token = signToken({ userId: user.id, role: user.role });

    res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[login]', err);
    return sendError(res, 500, 'Internal server error');
  }
}
