-- ========================
-- Customer Assessment Table
-- ========================

CREATE TABLE IF NOT EXISTS assessments (
  id                   BIGSERIAL PRIMARY KEY,
  order_id             BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  customer_id          BIGINT REFERENCES customers(id),
  overall_rating       SMALLINT CHECK (overall_rating BETWEEN 1 AND 5),
  quality_rating       SMALLINT CHECK (quality_rating BETWEEN 1 AND 5),
  service_rating       SMALLINT CHECK (service_rating BETWEEN 1 AND 5),
  timeliness_rating    SMALLINT CHECK (timeliness_rating BETWEEN 1 AND 5),
  communication_rating SMALLINT CHECK (communication_rating BETWEEN 1 AND 5),
  comment              TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_id)
);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON assessments FOR ALL USING (true) WITH CHECK (true);
