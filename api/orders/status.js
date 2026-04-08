// api/orders/status.js — PATCH /api/orders/status?id=123  (Chef only)
// Vercel rewrite maps: /api/orders/:id/status -> /api/orders/status?id=:id
import sql from '../../lib/db.js';
import { handleCors, authenticate, requireRole, parseBody, sendError } from '../../lib/middleware.js';

const VALID_TRANSITIONS = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!authenticate(req, res)) return;
  if (!requireRole(req, res, 'chef')) return;

  if (req.method !== 'PATCH') {
    return sendError(res, 405, 'Method not allowed');
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const orderId = Number(url.searchParams.get('id'));
  if (!orderId || isNaN(orderId)) {
    return sendError(res, 400, 'Invalid order ID');
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const { status } = body;
  if (!status) {
    return sendError(res, 400, 'status field is required');
  }

  try {
    const rows = await sql`SELECT id, status, table_id FROM orders WHERE id = ${orderId}`;
    if (rows.length === 0) return sendError(res, 404, 'Order not found');

    const order = rows[0];
    const allowed = VALID_TRANSITIONS[order.status] || [];

    if (!allowed.includes(status)) {
      return sendError(res, 400, `Cannot transition from ${order.status} to ${status}`);
    }

    await sql`
      UPDATE orders
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${orderId}
    `;

    if ((status === 'served' || status === 'cancelled') && order.table_id) {
      const active = await sql`
        SELECT id FROM orders
        WHERE table_id = ${order.table_id}
          AND status IN ('pending', 'in_progress', 'ready')
          AND id != ${orderId}
      `;
      if (active.length === 0) {
        await sql`UPDATE tables SET status = 'available' WHERE id = ${order.table_id}`;
      }
    }

    res.status(200).json({ success: true, orderId, newStatus: status });
  } catch (err) {
    console.error('[orders:status]', err);
    return sendError(res, 500, 'Internal server error');
  }
}

