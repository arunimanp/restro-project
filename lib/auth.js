// lib/auth.js — JWT helpers + bcrypt wrappers
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 10;
const JWT_EXPIRY = '8h';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

/**
 * Hash a plain-text password.
 * @param {string} plain
 * @returns {Promise<string>}
 */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Compare a plain-text password against a stored hash.
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Sign a JWT with the given payload.
 * @param {{ userId: number, role: string }} payload
 * @returns {string}
 */
export function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRY });
}

/**
 * Verify and decode a JWT string.
 * @param {string} token
 * @returns {{ userId: number, role: string }}
 */
export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}
