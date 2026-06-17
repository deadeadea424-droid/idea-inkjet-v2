'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Result = { label: string; ok: boolean; msg: string };

const SQL_SCRIPT = `-- Idea Inkjet V2 — Full Setup
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  line_id TEXT DEFAULT '',
  contact_channel TEXT DEFAULT 'LINE',
  address TEXT DEFAULT '',
  tax_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  position TEXT DEFAULT '',
  role TEXT DEFAULT 'graphic',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT DEFAULT '',
  title TEXT DEFAULT '',
  status TEXT DEFAULT 'รับงานใหม่',
  due_date DATE,
  price NUMERIC DEFAULT 0,
  deposit NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  customer_id BIGINT REFERENCES customers(id),
  designer_id BIGINT REFERENCES employees(id),
  production_id BIGINT REFERENCES employees(id),
  receiver_id BIGINT REFERENCES employees(id),
  measurer_id BIGINT REFERENCES employees(id),
  delivery_id BIGINT REFERENCES employees(id),
  detail TEXT DEFAULT '',
  order_type TEXT DEFAULT '',
  size TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  material TEXT DEFAULT '',
  file_status TEXT DEFAULT '',
  delivery_method TEXT DEFAULT '',
  finishing TEXT DEFAULT '',
  payment_type TEXT DEFAULT 'เงินสด',
  credit_days INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS order_status_logs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  old_status TEXT DEFAULT '',
  new_status TEXT NOT NULL,
  note TEXT DEFAULT '',
  changed_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE order_status_logs DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  amount NUMERIC NOT NULL,
  method TEXT DEFAULT 'เงินสด',
  note TEXT DEFAULT '',
  received_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

INSERT INTO app_settings (key, value) VALUES
  ('owner_pin', '1234'),
  ('shop_name', 'Idea Inkjet'),
  ('shop_address', ''),
  ('shop_tax_id', ''),
  ('shop_phone', '')
ON CONFLICT (key) DO NOTHING;`;

const TABLES = ['app_settings','customers','employees','orders','order_status_logs','payments'];

export default function SetupPage() {
  const [results,   setResults]   = useState<Result[]>([]);
  const [running,   setRunning]   = useState(false);
  const [pinNew,    setPinNew]    = useState('');
  const [pinStatus, setPinStatus] = useState('');
  const [copied,    setCopied]    = useState(false);

  async function runCheck() {
    setRunning(true);
    const out: Result[] = [];
    for (const t of TABLES) {
      const { error } = await supabase.from(t).select('id').limit(1);
      out.push({ label: t, ok: !error, msg: error ? error.message : 'พร้อมใช้งาน ✓' });
    }
    setResults(out);
    setRunning(false);
  }

  async function resetPin() {
    if (!pinNew || pinNew.length < 4) { setPinStatus('กรุณาใส่รหัสผ่านอย่างน้อย 4 ตัว'); return; }
    setPinStatus('กำลังบันทึก...');
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'owner_pin', value: pinNew });
    if (error) {
      const { error: e2 } = await supabase.from('app_settings')
        .delete().eq('key','owner_pin');
      const { error: e3 } = await supabase.from('app_settings')
        .insert({ key:'owner_pin', value: pinNew });
      if (e3) { setPinStatus('ผิดพลาด: ' + e3.message); return; }
    }
    setPinStatus('✅ ตั้งรหัสผ่านเป็น "' + pinNew + '" แล้ว — กลับไปล็อกอินได้เลย');
  }

  function copySql() {
    navigator.clipboard?.writeText(SQL_SCRIPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 60px', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔧</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Setup ระบบ</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Idea Inkjet V2</div>
      </div>

      {/* ── ตั้ง PIN ──────────────────────────────────────── */}
      <div style={card}>
        <div style={cardTitle}>🔑 ตั้งรหัสผ่านเจ้าของร้าน</div>
        <input
          type="number" placeholder="รหัสผ่านใหม่ (ตัวเลข 4+ หลัก)"
          value={pinNew} onChange={e => setPinNew(e.target.value)}
          style={input}
        />
        <button onClick={resetPin} style={btnPrimary}>บันทึกรหัสผ่าน</button>
        {pinStatus && (
          <div style={{ marginTop: 10, fontSize: 14,
            color: pinStatus.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
            {pinStatus}
          </div>
        )}
      </div>

      {/* ── ตรวจสอบตาราง ──────────────────────────────────── */}
      <div style={card}>
        <div style={cardTitle}>🗄️ ตรวจสอบตารางในฐานข้อมูล</div>
        <button onClick={runCheck} disabled={running} style={btnSecondary}>
          {running ? 'กำลังตรวจสอบ...' : 'ตรวจสอบทุกตาราง'}
        </button>
        {results.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map(r => (
              <div key={r.label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                background: r.ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${r.ok ? '#bbf7d0' : '#fecaca'}`,
              }}>
                <span style={{ fontSize: 18 }}>{r.ok ? '✅' : '❌'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace',
                    color: r.ok ? '#15803d' : '#dc2626' }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{r.msg}</div>
                </div>
              </div>
            ))}
            {results.some(r => !r.ok) && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: '#fff7ed',
                border: '1px solid #fed7aa', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                ⚠️ ตารางที่แสดง ❌ ต้องสร้างใน Supabase SQL Editor
                ดู SQL ด้านล่างแล้วกด "คัดลอก SQL" ครับ
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SQL Script ──────────────────────────────────────── */}
      <div style={card}>
        <div style={cardTitle}>📋 SQL สำหรับสร้างตารางทั้งหมด</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
          คัดลอกแล้วไปรันใน <b>Supabase → SQL Editor</b>
        </div>
        <button onClick={copySql} style={{ ...btnPrimary, background: copied ? '#16a34a' : '#1d4ed8' }}>
          {copied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอก SQL ทั้งหมด'}
        </button>
        <textarea
          readOnly value={SQL_SCRIPT}
          style={{
            marginTop: 12, width: '100%', height: 200,
            fontFamily: 'monospace', fontSize: 11,
            border: '1px solid #e5e7eb', borderRadius: 8,
            padding: '10px', background: '#1e293b', color: '#86efac',
            resize: 'vertical', boxSizing: 'border-box',
          }}
          onFocus={e => e.target.select()}
        />
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
          กดค้างที่กล่องข้อความแล้วเลือก "เลือกทั้งหมด" ก็ได้ครับ
        </div>
      </div>

      <a href="/" style={{
        display: 'block', textAlign: 'center', padding: '14px',
        background: '#1e293b', color: 'white', borderRadius: 12,
        fontWeight: 700, textDecoration: 'none', fontSize: 15,
      }}>← กลับหน้าหลัก</a>
    </main>
  );
}

const card: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e7eb',
  borderRadius: 16, padding: '20px 18px', marginBottom: 16,
};
const cardTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 14,
};
const input: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid #d1d5db',
  borderRadius: 10, fontSize: 16, marginBottom: 10, boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  width: '100%', padding: '13px', background: '#1d4ed8', color: 'white',
  border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  width: '100%', padding: '13px', background: '#f1f5f9', color: '#1e293b',
  border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer',
};
