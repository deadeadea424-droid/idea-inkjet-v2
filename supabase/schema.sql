-- ========================
-- Idea Inkjet V2 - Schema
-- ========================

CREATE TABLE customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  line_id TEXT,
  facebook TEXT,
  contact_channel TEXT DEFAULT 'LINE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employees (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT,
  role TEXT DEFAULT 'graphic',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'รับงานใหม่',
  order_type TEXT DEFAULT 'ป้ายไวนิล',
  size TEXT,
  quantity INTEGER DEFAULT 1,
  material TEXT,
  price NUMERIC DEFAULT 0,
  deposit NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  detail TEXT,
  due_date DATE,
  customer_id BIGINT REFERENCES customers(id),
  designer_id BIGINT REFERENCES employees(id),
  production_id BIGINT REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate order_code as JOB-0001, JOB-0002, ...
CREATE OR REPLACE FUNCTION set_order_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_code := 'JOB-' || LPAD(NEW.id::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_set_code
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_order_code();

CREATE TABLE order_status_logs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'paid',
  payment_date TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_slips (
  id             BIGSERIAL PRIMARY KEY,
  order_id       BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  customer_id    BIGINT REFERENCES customers(id),
  amount         NUMERIC NOT NULL,
  transferred_at TIMESTAMPTZ,
  reference_no   TEXT,
  slip_url       TEXT,
  note           TEXT,
  status         TEXT DEFAULT 'pending',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE assessments (
  id                  BIGSERIAL PRIMARY KEY,
  order_id            BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  customer_id         BIGINT REFERENCES customers(id),
  overall_rating      SMALLINT CHECK (overall_rating BETWEEN 1 AND 5),
  quality_rating      SMALLINT CHECK (quality_rating BETWEEN 1 AND 5),
  service_rating      SMALLINT CHECK (service_rating BETWEEN 1 AND 5),
  timeliness_rating   SMALLINT CHECK (timeliness_rating BETWEEN 1 AND 5),
  communication_rating SMALLINT CHECK (communication_rating BETWEEN 1 AND 5),
  comment             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_id)
);

-- ========================
-- Row Level Security
-- (open policy for development - restrict per user role in production)
-- ========================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON order_status_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON payments FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE payment_slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON payment_slips FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE employee_ratings (
  id            BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT REFERENCES assessments(id) ON DELETE CASCADE,
  order_id      BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  employee_id   BIGINT REFERENCES employees(id),
  employee_role TEXT,
  rating        SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employee_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON employee_ratings FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON assessments FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE calc_access_logs (
  id            BIGSERIAL PRIMARY KEY,
  employee_id   BIGINT REFERENCES employees(id),
  employee_name TEXT NOT NULL,
  accessed_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calc_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON calc_access_logs FOR ALL USING (true) WITH CHECK (true);
