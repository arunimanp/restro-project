// public/js/frontdesk.js — Frontdesk portal logic

import { fetchApi } from './api.js';
import { guardPage, logout } from './auth.js';

let cart = [];
let allItems = [];

export async function initFrontdesk() {
  const user = guardPage('frontdesk');
  if (!user) return;

  document.getElementById('user-name').textContent = user.name;
  document.getElementById('logout-btn').addEventListener('click', logout);

  await Promise.all([loadMenu(), loadOrders()]);
  setupCart();
}

// ----------------------------------------------------------------
// MENU
// ----------------------------------------------------------------
async function loadMenu() {
  try {
    const { categories, items } = await fetchApi('/menu');
    allItems = items;
    renderCategories(categories);
    renderMenuItems(items);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderCategories(categories) {
  const container = document.getElementById('category-filters');
  container.innerHTML = `<button class="btn-filter active" data-cat="all">All</button>`;
  Object.keys(categories).forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'btn-filter';
    btn.dataset.cat = cat;
    btn.textContent = cat;
    container.appendChild(btn);
  });

  container.addEventListener('click', (e) => {
    if (!e.target.matches('.btn-filter')) return;
    container.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    const cat = e.target.dataset.cat;
    const filtered = cat === 'all' ? allItems : allItems.filter(i => i.category === cat);
    renderMenuItems(filtered);
  });
}

function renderMenuItems(items) {
  const grid = document.getElementById('menu-grid');
  grid.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.innerHTML = `
      <div class="menu-card-img">
        ${item.image_url
          ? `<img src="${item.image_url}" alt="${item.name}">`
          : `<div class="menu-card-placeholder">${item.category[0]}</div>`}
      </div>
      <div class="menu-card-body">
        <span class="menu-card-cat">${item.category}</span>
        <h4 class="menu-card-name">${item.name}</h4>
        <div class="menu-card-footer">
          <span class="menu-card-price">$${Number(item.price).toFixed(2)}</span>
          <button class="btn-add" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">Add</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-add');
    if (!btn) return;
    addToCart({ id: btn.dataset.id, name: btn.dataset.name, price: parseFloat(btn.dataset.price) });
  });
}

// ----------------------------------------------------------------
// CART
// ----------------------------------------------------------------
function setupCart() {
  document.getElementById('place-order-btn').addEventListener('click', placeOrder);
}

function addToCart(item) {
  const existing = cart.find(c => c.id === item.id);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ ...item, qty: 1, note: '' });
  }
  renderCart();
  showToast(`${item.name} added to cart`);
}

function renderCart() {
  const list = document.getElementById('cart-list');
  const totalEl = document.getElementById('cart-total');
  list.innerHTML = '';

  if (cart.length === 0) {
    list.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
    totalEl.textContent = '$0.00';
    return;
  }

  let total = 0;
  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name">${item.name}</span>
        <input class="cart-item-note" placeholder="Special note…" value="${item.note}"
          data-idx="${idx}" type="text">
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" data-action="dec" data-idx="${idx}">−</button>
        <span class="qty-val">${item.qty}</span>
        <button class="qty-btn" data-action="inc" data-idx="${idx}">+</button>
        <span class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</span>
        <button class="btn-remove" data-idx="${idx}">✕</button>
      </div>`;
    list.appendChild(row);
  });

  totalEl.textContent = `$${total.toFixed(2)}`;

  // Event delegation
  list.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (btn.dataset.action === 'inc') cart[idx].qty++;
      else cart[idx].qty = Math.max(0, cart[idx].qty - 1);
      if (cart[idx].qty === 0) cart.splice(idx, 1);
      renderCart();
    });
  });
  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      cart.splice(Number(btn.dataset.idx), 1);
      renderCart();
    });
  });
  list.querySelectorAll('.cart-item-note').forEach(input => {
    input.addEventListener('change', () => {
      cart[Number(input.dataset.idx)].note = input.value;
    });
  });
}

// ----------------------------------------------------------------
// PLACE ORDER
// ----------------------------------------------------------------
async function placeOrder() {
  const roomNumber = document.getElementById('room-number').value.trim();
  const orderNote  = document.getElementById('order-note').value.trim();

  if (!roomNumber) {
    showToast('Please enter a room number', 'error');
    return;
  }
  if (cart.length === 0) {
    showToast('Cart is empty', 'error');
    return;
  }

  const payload = {
    room_number: roomNumber,
    note: orderNote || null,
    items: cart.map(c => ({
      menu_item_id: c.id,
      quantity: c.qty,
      special_note: c.note || null,
    })),
  };

  const btn = document.getElementById('place-order-btn');
  btn.disabled = true;
  btn.textContent = 'Placing…';

  try {
    const res = await fetchApi('/orders', { method: 'POST', body: JSON.stringify(payload) });
    cart = [];
    renderCart();
    document.getElementById('room-number').value = '';
    document.getElementById('order-note').value = '';
    showToast(`Order #${res.order.id} placed successfully!`, 'success');
    await loadOrders();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Place Order';
  }
}

// ----------------------------------------------------------------
// MY ORDERS
// ----------------------------------------------------------------
async function loadOrders() {
  try {
    const { orders } = await fetchApi('/orders');
    renderOrders(orders);
  } catch (err) {
    console.error(err);
  }
}

function renderOrders(orders) {
  const list = document.getElementById('orders-list');
  if (!orders || orders.length === 0) {
    list.innerHTML = '<p class="no-orders">No orders today</p>';
    return;
  }
  list.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-card-header">
        <span class="order-id">#${o.id}</span>
        <span class="badge badge--${o.status}">${o.status.replace('_', ' ')}</span>
        <span class="order-room">Room ${o.room_number}</span>
      </div>
      <div class="order-items-list">
        ${(o.items || []).map(i => `<span>${i.quantity}× ${i.item_name}</span>`).join(', ')}
      </div>
      <div class="order-time">${timeAgo(o.created_at)}</div>
    </div>`).join('');
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
  setTimeout(() => {
    toast.classList.remove('toast--show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

// Auto-refresh orders every 30s
setInterval(() => {
  if (localStorage.getItem('role') === 'frontdesk') loadOrders();
}, 30000);

// Init on page load
initFrontdesk();
