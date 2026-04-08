// public/js/chef.js — Chef Kanban board with SSE + polling fallback

import { fetchApi } from './api.js';
import { guardPage, logout } from './auth.js';

const COLUMNS = ['pending', 'in_progress', 'ready'];
const STATUS_NEXT = { pending: 'in_progress', in_progress: 'ready', ready: 'served' };
let knownOrderIds = new Set();
let eventSource = null;

export async function initChef() {
  const user = guardPage('chef');
  if (!user) return;

  document.getElementById('user-name').textContent = user.name;
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (eventSource) eventSource.close();
    logout();
  });

  await loadOrders();
  setupSSE(user.token);
}

// ----------------------------------------------------------------
// LOAD ORDERS (initial + polling fallback)
// ----------------------------------------------------------------
async function loadOrders() {
  try {
    const { orders } = await fetchApi('/orders');
    renderKanban(orders);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------------------
// SSE
// ----------------------------------------------------------------
function setupSSE(token) {
  const url = `/api/orders/stream?token=${encodeURIComponent(token)}`;
  eventSource = new EventSource(url);

  eventSource.addEventListener('snapshot', (e) => {
    const { orders } = JSON.parse(e.data);
    renderKanban(orders);
  });

  eventSource.addEventListener('update', (e) => {
    const { orders } = JSON.parse(e.data);
    applyUpdates(orders);
  });

  eventSource.onerror = () => {
    // SSE failed — fall back to polling every 8 seconds
    if (eventSource) eventSource.close();
    eventSource = null;
    console.warn('[chef] SSE disconnected, switching to polling');
    startPolling();
  };
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(loadOrders, 8000);
}

// ----------------------------------------------------------------
// KANBAN RENDERING
// ----------------------------------------------------------------
function renderKanban(orders) {
  COLUMNS.forEach(status => {
    const col = document.getElementById(`col-${status}`);
    const colOrders = orders.filter(o => o.status === status);

    // Update count badges
    document.getElementById(`count-${status}`).textContent = colOrders.length;

    col.innerHTML = '';
    colOrders.forEach(o => {
      const card = buildCard(o);
      if (!knownOrderIds.has(o.id)) {
        card.classList.add('card--slide-in');
        knownOrderIds.add(o.id);
      }
      col.appendChild(card);
    });
  });
}

function applyUpdates(updatedOrders) {
  updatedOrders.forEach(o => {
    // Remove card from any column it might be in
    const existing = document.querySelector(`[data-order-id="${o.id}"]`);
    if (existing) existing.remove();

    if (!COLUMNS.includes(o.status)) return; // served/cancelled — remove

    const col = document.getElementById(`col-${o.status}`);
    if (!col) return;
    const card = buildCard(o);
    if (!knownOrderIds.has(o.id)) {
      card.classList.add('card--slide-in');
      knownOrderIds.add(o.id);
      showToast(`New order #${o.id} arrived!`, 'success');
    }
    col.prepend(card);

    // Update count badges
    COLUMNS.forEach(status => {
      document.getElementById(`count-${status}`).textContent =
        document.querySelectorAll(`#col-${status} .order-card`).length;
    });
  });
}

function buildCard(order) {
  const card = document.createElement('div');
  card.className = 'order-card chef-card';
  card.dataset.orderId = order.id;

  const itemsList = (order.items || [])
    .map(i => `<li><strong>${i.quantity}×</strong> ${i.item_name}${i.special_note ? ` <em>(${i.special_note})</em>` : ''}</li>`)
    .join('');

  const destination = order.table_label || (order.room_number ? `Room ${order.room_number}` : '—');
  const nextStatus = STATUS_NEXT[order.status];

  card.innerHTML = `
    <div class="chef-card-header">
      <span class="order-id">#${order.id}</span>
      <span class="chef-destination">${destination}</span>
      <span class="chef-time">${timeAgo(order.created_at)}</span>
    </div>
    <div class="chef-card-by">by ${order.created_by_name || '—'}</div>
    ${order.note ? `<div class="chef-card-note">📝 ${order.note}</div>` : ''}
    <ul class="chef-items">${itemsList}</ul>
    <div class="chef-card-actions">
      ${nextStatus ? `<button class="btn-advance" data-order-id="${order.id}" data-status="${nextStatus}">
        Mark ${nextStatus.replace('_', ' ')}
      </button>` : ''}
      ${order.status !== 'served' ? `<button class="btn-cancel" data-order-id="${order.id}" data-status="cancelled">
        Cancel
      </button>` : ''}
    </div>`;

  card.querySelectorAll('button[data-order-id]').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(Number(btn.dataset.orderId), btn.dataset.status));
  });

  return card;
}

// ----------------------------------------------------------------
// STATUS UPDATES
// ----------------------------------------------------------------
async function updateStatus(orderId, newStatus) {
  try {
    await fetchApi(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(`Order #${orderId} → ${newStatus.replace('_', ' ')}`, 'success');
    await loadOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------------------
// UTILS
// ----------------------------------------------------------------
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--show'));
  setTimeout(() => { toast.classList.remove('toast--show'); setTimeout(() => toast.remove(), 400); }, 3500);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

initChef();
