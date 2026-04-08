// lib/middleware.js — verifyToken, requireRole, CORS helpers

import { verifyToken } from './auth.js';

/**
 * Set CORS headers on the response.
 * Call this at the start of every API handler.
 * @param {import('http').ServerResponse} res
 */
export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Handle OPTIONS preflight and return true if caller should stop.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean}
 */
export function handleCors(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Parse and verify the Bearer token from the Authorization header.
 * Attaches decoded payload to req.user on success.
 * Sends 401 and returns false on failure.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if authenticated
 */
export function authenticate(req, res) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return false;
  }

  try {
    req.user = verifyToken(token);
    return true;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return false;
  }
}

/**
 * Check that req.user.role is one of the allowed roles.
 * Sends 403 and returns false if not.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {...string} roles
 * @returns {boolean} true if authorized
 */
export function requireRole(req, res, ...roles) {
  if (!roles.includes(req.user?.role)) {
    res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
    return false;
  }
  return true;
}

/**
 * Parse JSON body from request stream.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<any>}
 */
export function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send a JSON error response.
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
export function sendError(res, status, message) {
  res.status(status).json({ error: message });
}
