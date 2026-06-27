-- calc_access_logs: records each time an employee logs into the price calculator
CREATE TABLE IF NOT EXISTS calc_access_logs (
  id           BIGSERIAL PRIMARY KEY,
  employee_id  BIGINT REFERENCES employees(id),
  employee_name TEXT NOT NULL,
  accessed_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calc_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON calc_access_logs FOR ALL USING (true) WITH CHECK (true);
