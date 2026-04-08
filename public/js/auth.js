// public/js/auth.js — Login form handler + role guard

import { fetchApi } from './api.js';

const ROLE_PAGES = {
  frontdesk: '/frontdesk.html',
  waiter:    '/waiter.html',
  chef:      '/chef.html',
};

/**
 * Guard a page for a specific role.
 * Redirects to login if no token, or to correct role page if wrong role.
 * @param {string} requiredRole
 * @returns {{ userId: number, role: string, name: string }} stored user info
 */
export function guardPage(requiredRole) {
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('role');
  const name  = localStorage.getItem('userName');

  if (!token || !role) {
    window.location.href = '/login.html';
    return null;
  }

  if (role !== requiredRole) {
    window.location.href = ROLE_PAGES[role] || '/login.html';
    return null;
  }

  return {
    userId: Number(localStorage.getItem('userId')),
    role,
    name,
    token,
  };
}

/** Log out the current user. */
export function logout() {
  localStorage.clear();
  window.location.href = '/login.html';
}

// ----------------------------------------------------------------
// Login page initializer — call on login.html
// ----------------------------------------------------------------
export async function initLoginPage() {
  // Already logged in? Redirect
  const role = localStorage.getItem('role');
  if (role && ROLE_PAGES[role]) {
    window.location.href = ROLE_PAGES[role];
    return;
  }

  const form  = document.getElementById('login-form');
  const email = document.getElementById('email');
  const pass  = document.getElementById('password');
  const err   = document.getElementById('error-msg');
  const btn   = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const data = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.value.trim(), password: pass.value }),
      });

      localStorage.setItem('token',    data.token);
      localStorage.setItem('role',     data.user.role);
      localStorage.setItem('userName', data.user.name);
      localStorage.setItem('userId',   data.user.id);

      window.location.href = ROLE_PAGES[data.user.role] || '/login.html';
    } catch (ex) {
      err.textContent = ex.message || 'Login failed';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}
