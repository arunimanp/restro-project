// api/orders/stream.js — GET /api/orders/stream  (SSE for Chef)
// Serverless SSE: each connection polls Neon on an interval and pushes diffs.
// Note: In a purely serverless environment, true push is not possible between
// function invocations. This endpoint uses a long-poll style: it holds the
// connection open for up to 25 seconds (Vercel's function timeout is 30s),
// pushing any new/changed orders found by polling.
// The client automatically reconnects via EventSource.

import sql from '../../lib/db.js';
import { verifyToken } from '../../lib/auth.js';

export const config = { maxDuration: 25 };  // Vercel Pro: extend timeout

export default async function handler(req, res) {
  // Set CORS manually (SSE doesn't use preflight)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  // EventSource cannot send custom headers — accept token from query param too
  const url = new URL(req.url, `http://${req.headers.host}`);
  const queryToken = url.searchParams.get('token');
  const headerToken = (req.headers['authorization'] || '').replace('Bearer ', '') || null;
  const token = queryToken || headerToken;

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  let user;
  try {
    user = verifyToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { role } = user;
  if (role !== 'chef') {
    res.status(403).json({ error: 'Chef access only' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  // Send initial snapshot
  try {
    const orders = await fetchActiveOrders();
    send('snapshot', { orders });
  } catch (err) {
    console.error('[stream:init]', err);
    send('error', { message: 'Failed to load initial orders' });
    res.end();
    return;
  }

  // Poll every 5 seconds for changes, push updates
  let lastPollTime = new Date().toISOString();
  let closed = false;
  req.on('close', () => { closed = true; });

  const intervalId = setInterval(async () => {
    if (closed) {
      clearInterval(intervalId);
      return;
    }
    try {
      const changed = await sql`
        SELECT
          o.id, o.table_id, o.room_number, o.status, o.note,
          o.created_at, o.updated_at,
          u.name  AS created_by_name,
          t.label AS table_label
        FROM orders o
        JOIN users u ON u.id = o.created_by
        LEFT JOIN tables t ON t.id = o.table_id
        WHERE o.updated_at > ${lastPollTime}
           OR (o.created_at > ${lastPollTime} AND o.status IN ('pending','in_progress','ready'))
        ORDER BY o.created_at ASC
      `;

      if (changed.length > 0) {
        // Attach items
        const orderIds = changed.map(o => o.id);
        const items = await sql`
          SELECT oi.order_id, oi.quantity, oi.unit_price, oi.special_note,
                 mi.name AS item_name
          FROM order_items oi
          JOIN menu_items mi ON mi.id = oi.menu_item_id
          WHERE oi.order_id = ANY(${orderIds})
        `;
        const byOrder = items.reduce((a, i) => {
          (a[i.order_id] = a[i.order_id] || []).push(i); return a;
        }, {});
        changed.forEach(o => { o.items = byOrder[o.id] || []; });

        send('update', { orders: changed });
        lastPollTime = new Date().toISOString();
      }
    } catch (err) {
      console.error('[stream:poll]', err);
    }
  }, 5000);

  // Keep-alive ping every 15s
  const pingId = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 15000);

  // Clean up when connection closes
  req.on('close', () => {
    clearInterval(intervalId);
    clearInterval(pingId);
  });
}

async function fetchActiveOrders() {
  const orders = await sql`
    SELECT
      o.id, o.table_id, o.room_number, o.status, o.note,
      o.created_at, o.updated_at,
      u.name  AS created_by_name,
      t.label AS table_label
    FROM orders o
    JOIN users u ON u.id = o.created_by
    LEFT JOIN tables t ON t.id = o.table_id
    WHERE o.status IN ('pending', 'in_progress', 'ready')
    ORDER BY o.created_at ASC
  `;

  if (orders.length === 0) return orders;

  const orderIds = orders.map(o => o.id);
  const items = await sql`
    SELECT oi.order_id, oi.quantity, oi.unit_price, oi.special_note,
           mi.name AS item_name
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = ANY(${orderIds})
  `;
  const byOrder = items.reduce((a, i) => {
    (a[i.order_id] = a[i.order_id] || []).push(i); return a;
  }, {});
  orders.forEach(o => { o.items = byOrder[o.id] || []; });
  return orders;
}
