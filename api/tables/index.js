// api/tables/index.js — GET /api/tables
import sql from '../../lib/db.js';
import { handleCors, authenticate, sendError } from '../../lib/middleware.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed');
  }

  if (!authenticate(req, res)) return;

  try {
    const tables = await sql`
      SELECT id, label, capacity, status
      FROM tables
      ORDER BY id
    `;

    res.status(200).json({ tables });
  } catch (err) {
    console.error('[tables]', err);
    return sendError(res, 500, 'Internal server error');
  }
}
