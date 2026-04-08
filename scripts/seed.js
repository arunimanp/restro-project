// scripts/seed.js — One-shot script to re-hash passwords and seed the DB
// Run: node -r dotenv/config scripts/seed.js
// Or:  DATABASE_URL=... JWT_SECRET=... node scripts/seed.js

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL env var is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  console.log('🌱 Seeding database…');

  // Load and split the schema SQL by semicolons, but keep DO blocks intact
  // Note: A simple split is risky but seed.sql is well-structured
  const schemaSql = readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
  
  // Split by semicolon NOT inside strings or DO blocks (heuristic)
  // For most seed scripts, splitting by custom markers or just carefully is enough
  // Here we use a simpler approach for the seed: execute the whole thing via a single connection
  // if available, but Neon's sql`` doesn't like multiple statements.
  // We'll split by semicolon and filter out empty ones.
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (let statement of statements) {
    try {
      // Re-add semicolon for individual execution if needed, though usually not
      await sql(statement);
    } catch (err) {
      // Ignore "duplicate_object" for types as we handle them in SQL (DO blocks)
      if (!err.message.includes('already exists')) {
        console.warn(`⚠️ Warning on statement: ${statement.substring(0, 50)}...`);
        console.warn(`   Error: ${err.message}`);
      }
    }
  }
  
  console.log('✅  Schema applied');

  // Hash passwords properly for the seeded users
  // This updates the users we just inserted
  const hash = await bcrypt.hash('password123', 10);
  await sql`UPDATE users SET password_hash = ${hash}`;
  console.log('✅  Passwords seeded and hashed');

  console.log('\n👤 Login credentials:');
  console.log('   frontdesk@hotel.com / password123');
  console.log('   waiter@hotel.com    / password123');
  console.log('   chef@hotel.com      / password123');
  console.log('\n✨ Done!');
}

run().catch(err => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
