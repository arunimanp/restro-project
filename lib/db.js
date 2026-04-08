// lib/db.js — Neon serverless client singleton
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// neon() returns a tagged-template sql function
const sql = neon(process.env.DATABASE_URL);

export default sql;
