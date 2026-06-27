-- ========================
-- Per-employee ratings from customers
-- ========================

CREATE TABLE IF NOT EXISTS employee_ratings (
  id            BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT REFERENCES assessments(id) ON DELETE CASCADE,
  order_id      BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  employee_id   BIGINT REFERENCES employees(id),
  employee_role TEXT,   -- ออกแบบ, ผลิต, รับงาน, วัดงาน, ส่งงาน
  rating        SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employee_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON employee_ratings FOR ALL USING (true) WITH CHECK (true);
