// api/menu/index.js — GET /api/menu
import sql from '../../lib/db.js';
import { handleCors, authenticate, sendError } from '../../lib/middleware.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed');
  }

  if (!authenticate(req, res)) return;

  try {
    const items = await sql`
      SELECT id, name, category, price, is_available, image_url
      FROM menu_items
      WHERE is_available = TRUE
      ORDER BY category, name
    `;

    // Group by category
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});

    res.status(200).json({ categories: grouped, items });
  } catch (err) {
    console.error('[menu]', err);
    return sendError(res, 500, 'Internal server error');
  }
}
