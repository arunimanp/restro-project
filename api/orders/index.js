// api/orders/index.js — GET /api/orders + POST /api/orders
import sql from '../../lib/db.js';
import { handleCors, authenticate, requireRole, parseBody, sendError } from '../../lib/middleware.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!authenticate(req, res)) return;

  if (req.method === 'GET') return getOrders(req, res);
  if (req.method === 'POST') return createOrder(req, res);
  return sendError(res, 405, 'Method not allowed');
}

// ----------------------------------------------------------------
// GET /api/orders
// Chef: all pending/in_progress/ready orders with items
// Waiter/Frontdesk: own orders (today)
// ----------------------------------------------------------------
async function getOrders(req, res) {
  const { userId, role } = req.user;

  try {
    let orders;

    if (role === 'chef') {
      orders = await sql`
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
    } else {
      orders = await sql`
        SELECT
          o.id, o.table_id, o.room_number, o.status, o.note,
          o.created_at, o.updated_at,
          t.label AS table_label
        FROM orders o
        LEFT JOIN tables t ON t.id = o.table_id
        WHERE o.created_by = ${userId}
          AND o.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY o.created_at DESC
      `;
    }

    // Attach items to each order
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const items = await sql`
        SELECT
          oi.order_id, oi.id, oi.quantity, oi.unit_price, oi.special_note,
          mi.name AS item_name, mi.category
        FROM order_items oi
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = ANY(${orderIds})
      `;

      const itemsByOrder = items.reduce((acc, item) => {
        if (!acc[item.order_id]) acc[item.order_id] = [];
        acc[item.order_id].push(item);
        return acc;
      }, {});

      orders.forEach(o => { o.items = itemsByOrder[o.id] || []; });
    }

    res.status(200).json({ orders });
  } catch (err) {
    console.error('[orders:GET]', err);
    return sendError(res, 500, 'Internal server error');
  }
}

// ----------------------------------------------------------------
// POST /api/orders
// Body: { table_id?, room_number?, note?, items: [{menu_item_id, quantity, special_note?}] }
// ----------------------------------------------------------------
async function createOrder(req, res) {
  if (!requireRole(req, res, 'frontdesk', 'waiter')) return;

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const { table_id, room_number, note, items } = body;
  const { userId, role } = req.user;

  // Validate destination
  if (!table_id && !room_number) {
    return sendError(res, 400, 'Either table_id or room_number is required');
  }
  if (table_id && room_number) {
    return sendError(res, 400, 'Provide either table_id or room_number, not both');
  }
  if (role === 'frontdesk' && !room_number) {
    return sendError(res, 400, 'Frontdesk orders must include a room_number');
  }
  if (role === 'waiter' && !table_id) {
    return sendError(res, 400, 'Waiter orders must include a table_id');
  }

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 400, 'At least one order item is required');
  }

  try {
    // Fetch current prices for snapshot
    const menuItemIds = items.map(i => Number(i.menu_item_id));
    const menuItems = await sql`
      SELECT id, price, is_available FROM menu_items WHERE id = ANY(${menuItemIds})
    `;
    const priceMap = Object.fromEntries(menuItems.map(m => [m.id, m]));

    // Validate all items exist and are available
    for (const item of items) {
      const mi = priceMap[item.menu_item_id];
      if (!mi) return sendError(res, 400, `Menu item ${item.menu_item_id} not found`);
      if (!mi.is_available) return sendError(res, 400, `Menu item ${item.menu_item_id} is not available`);
    }

    // Insert order
    const [order] = await sql`
      INSERT INTO orders (created_by, table_id, room_number, note, status)
      VALUES (
        ${userId},
        ${table_id || null},
        ${room_number || null},
        ${note || null},
        'pending'
      )
      RETURNING id, created_at
    `;

    // Insert order items (snapshot unit_price)
    const itemRows = items.map(item => ({
      order_id: order.id,
      menu_item_id: Number(item.menu_item_id),
      quantity: Number(item.quantity) || 1,
      unit_price: priceMap[item.menu_item_id].price,
      special_note: item.special_note || null,
    }));

    for (const row of itemRows) {
      await sql`
        INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, special_note)
        VALUES (${row.order_id}, ${row.menu_item_id}, ${row.quantity}, ${row.unit_price}, ${row.special_note})
      `;
    }

    // If waiter order, mark table as occupied
    if (table_id) {
      await sql`UPDATE tables SET status = 'occupied' WHERE id = ${table_id}`;
    }

    res.status(201).json({ order: { id: order.id, created_at: order.created_at } });
  } catch (err) {
    console.error('[orders:POST]', err);
    return sendError(res, 500, 'Internal server error');
  }
}
