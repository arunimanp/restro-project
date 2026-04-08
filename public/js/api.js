// public/js/api.js — Shared API helper

const API_BASE = '/api';

/**
 * Make an authenticated fetch to the API.
 * @param {string} path - e.g. '/menu'
 * @param {RequestInit} options
 * @returns {Promise<any>} parsed JSON response
 */
export async function fetchApi(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expired or invalid — redirect to login
    localStorage.clear();
    window.location.href = '/login.html';
    return;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

/**
 * Open an EventSource connection with Authorization via URL param
 * (EventSource doesn't support custom headers directly).
 */
export function openStream(token) {
  return new EventSource(`${API_BASE}/orders/stream?token=${encodeURIComponent(token)}`);
}
