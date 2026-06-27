-- ========================
-- Payment Slips Table
-- ========================

CREATE TABLE IF NOT EXISTS payment_slips (
  id             BIGSERIAL PRIMARY KEY,
  order_id       BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  customer_id    BIGINT REFERENCES customers(id),
  amount         NUMERIC NOT NULL,
  transferred_at TIMESTAMPTZ,
  reference_no   TEXT,
  slip_url       TEXT,
  note           TEXT,
  status         TEXT DEFAULT 'pending',  -- pending | reviewed
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payment_slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON payment_slips FOR ALL USING (true) WITH CHECK (true);

-- ========================
-- Supabase Storage bucket for slip images
-- Run this in Supabase SQL Editor (requires storage schema):
-- ========================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('payment-slips', 'payment-slips', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read payment slips"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-slips');

CREATE POLICY "Anyone can upload payment slips"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-slips');
