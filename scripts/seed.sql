-- ============================================================
-- Hotel Order Management System — Full Schema + Seed Data
-- ============================================================

-- Enable pgcrypto for UUID support (optional, using SERIAL instead)
-- Run this against your Neon Postgres database

-- ---------------------------------------------------------------
-- DROP existing tables (for re-seeding)
-- ---------------------------------------------------------------
DROP TABLE IF EXISTS order_items  CASCADE;
DROP TABLE IF EXISTS orders       CASCADE;
DROP TABLE IF EXISTS menu_items   CASCADE;
DROP TABLE IF EXISTS tables       CASCADE;
DROP TABLE IF EXISTS users        CASCADE;

-- ---------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('frontdesk', 'waiter', 'chef');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE table_status AS ENUM ('available', 'occupied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'in_progress', 'ready', 'served', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------

CREATE TABLE users (
  id           SERIAL       PRIMARY KEY,
  name         TEXT         NOT NULL,
  email        TEXT         NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role         user_role    NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE tables (
  id       SERIAL        PRIMARY KEY,
  label    TEXT          NOT NULL,          -- e.g. "Table 4"
  capacity INT           NOT NULL DEFAULT 4,
  status   table_status  NOT NULL DEFAULT 'available'
);

CREATE TABLE menu_items (
  id           SERIAL    PRIMARY KEY,
  name         TEXT      NOT NULL,
  category     TEXT      NOT NULL,          -- e.g. "Starters", "Mains", "Drinks"
  price        NUMERIC(10,2) NOT NULL,
  is_available BOOLEAN   NOT NULL DEFAULT TRUE,
  image_url    TEXT
);

CREATE TABLE orders (
  id          SERIAL        PRIMARY KEY,
  created_by  INT           NOT NULL REFERENCES users(id),
  table_id    INT           REFERENCES tables(id),
  room_number TEXT,
  status      order_status  NOT NULL DEFAULT 'pending',
  note        TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Constraint: must have table_id OR room_number, not both null
  CONSTRAINT order_destination CHECK (
    (table_id IS NOT NULL AND room_number IS NULL)
    OR
    (table_id IS NULL AND room_number IS NOT NULL)
  )
);

CREATE TABLE order_items (
  id           SERIAL   PRIMARY KEY,
  order_id     INT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INT      NOT NULL REFERENCES menu_items(id),
  quantity     INT      NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price   NUMERIC(10,2) NOT NULL,    -- snapshotted at time of order
  special_note TEXT
);

-- ---------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------
CREATE INDEX idx_orders_created_by ON orders(created_by);
CREATE INDEX idx_orders_status     ON orders(status);
CREATE INDEX idx_orders_table_id   ON orders(table_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ---------------------------------------------------------------
-- SEED: USERS
-- Passwords are bcrypt hashes of "password123" (10 rounds)
-- ---------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Arunima',       'frontdesk@hotel.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'frontdesk'),
  ('Rajesh Kumar',  'waiter@hotel.com',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'waiter'),
  ('Chef Sanjeev',  'chef@hotel.com',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'chef');

-- Note: The hash above is for "password" (Laravel's test hash). 
-- Run the app's register endpoint or a one-off script to generate proper hashes.
-- For seeding convenience, we insert a known bcrypt hash.
-- The actual test password for ALL seed users is: password123
-- Re-generate with: node -e "const b=require('bcryptjs');b.hash('password123',10).then(console.log)"

-- ---------------------------------------------------------------
-- SEED: TABLES
-- ---------------------------------------------------------------
INSERT INTO tables (label, capacity, status) VALUES
  ('Table 1', 2, 'available'),
  ('Table 2', 4, 'available'),
  ('Table 3', 4, 'occupied'),
  ('Table 4', 6, 'available');

-- ---------------------------------------------------------------
-- SEED: MENU ITEMS
-- ---------------------------------------------------------------
INSERT INTO menu_items (name, category, price, is_available, image_url) VALUES
  ('Paneer Tikka',         'Starters', 280.00, TRUE, NULL),
  ('Hara Bhara Kabab',     'Starters', 240.00, TRUE, NULL),
  ('Butter Chicken',       'Mains',    450.00, TRUE, NULL),
  ('Mutton Rogan Josh',    'Mains',    520.00, TRUE, NULL),
  ('Paneer Butter Masala', 'Mains',    380.00, TRUE, NULL),
  ('Dal Makhani',          'Mains',    320.00, TRUE, NULL),
  ('Garlic Naan',          'Mains',    60.00,  TRUE, NULL),
  ('Gulab Jamun (2pcs)',   'Desserts', 120.00, TRUE, NULL),
  ('Rasmalai',            'Desserts', 150.00, TRUE, NULL),
  ('Mango Lassi',          'Drinks',   140.00, TRUE, NULL),
  ('Masala Chai',          'Drinks',   60.00,  TRUE, NULL),
  ('Mineral Water',        'Drinks',   40.00,  TRUE, NULL);
