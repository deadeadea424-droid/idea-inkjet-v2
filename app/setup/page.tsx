'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type TestResult = { name: string; select: 'ok'|'err'|''; insert: 'ok'|'err'|''; msg: string };

const RLS_SQL = `ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;`;

const SCHEMA_FIX_SQL = `-- ลบ foreign key ก่อน แล้วเปลี่ยน type เป็น TEXT
ALTER TABLE order_status_logs DROP CONSTRAINT IF EXISTS order_status_logs_changed_by_fkey;
ALTER TABLE order_status_logs ALTER COLUMN changed_by TYPE TEXT USING changed_by::text;`;

export default function SetupPage() {
  const [tests,        setTests]        = useState<TestResult[]>([]);
  const [testing,      setTesting]      = useState(false);
  const [pinNew,       setPinNew]       = useState('');
  const [pinStatus,    setPinStatus]    = useState('');
  const [copied,       setCopied]       = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [showGuide,    setShowGuide]    = useState(false);

  async function runAllTests() {
    setTesting(true);
    const out: TestResult[] = [];

    // Test app_settings
    {
      const s = await supabase.from('app_settings').select('key').limit(1);
      const i = await supabase.from('app_settings').upsert({ key: '__test__', value: 'test' });
      if (!i.error) await supabase.from('app_settings').delete().eq('key', '__test__');
      const rlsErr = (e: any) => e?.message?.includes('security') || e?.message?.includes('policy');
      out.push({
        name: 'app_settings',
        select: s.error ? 'err' : 'ok',
        insert: i.error ? 'err' : 'ok',
        msg: i.error ? (rlsErr(i.error) ? '🔴 RLS บล็อก INSERT' : i.error.message) : '',
      });
    }

    // Test order_status_logs
    {
      const s = await supabase.from('order_status_logs').select('id').limit(1);
      const i = await supabase.from('order_status_logs').insert({ order_id: 0, new_status: '__test__', note: 'test', changed_by: 'setup_test' });
      if (!i.error) await supabase.from('order_status_logs').delete().eq('new_status', '__test__');
      const rlsErr  = (e: any) => e?.message?.includes('security') || e?.message?.includes('policy');
      const typeErr = (e: any) => e?.message?.includes('invalid input syntax') || e?.message?.includes('bigint');
      let msg = '';
      if (i.error) {
        if (rlsErr(i.error))  msg = '🔴 RLS บล็อก INSERT — ต้องปิด RLS ก่อน';
        else if (typeErr(i.error)) msg = '🟠 Schema ผิด: changed_by เป็น BIGINT — ต้องรัน SQL แก้ schema';
        else msg = i.error.message;
      }
      out.push({
        name: 'order_status_logs',
        select: s.error ? 'err' : 'ok',
        insert: i.error ? 'err' : 'ok',
        msg,
      });
    }

    // Test customers
    {
      const s = await supabase.from('customers').select('id').limit(1);
      out.push({ name: 'customers', select: s.error ? 'err' : 'ok', insert: '', msg: s.error?.message || '' });
    }

    setTests(out);
    setTesting(false);
  }

  async function resetPin() {
    if (!pinNew || pinNew.length < 4) { setPinStatus('ใส่รหัสผ่านอย่างน้อย 4 ตัว'); return; }
    setPinStatus('กำลังบันทึก...');
    const { error } = await supabase.from('app_settings').upsert({ key: 'owner_pin', value: pinNew });
    if (error) {
      await supabase.from('app_settings').delete().eq('key', 'owner_pin');
      const { error: e2 } = await supabase.from('app_settings').insert({ key: 'owner_pin', value: pinNew });
      if (e2) { setPinStatus('❌ ผิดพลาด: ' + e2.message + '\n\nต้องปิด RLS ของ app_settings ก่อนครับ'); return; }
    }
    setPinStatus('✅ ตั้งรหัสผ่าน "' + pinNew + '" แล้ว — กลับหน้าหลักได้เลย');
  }

  function copySql() {
    navigator.clipboard?.writeText(RLS_SQL).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 3000);
    });
  }

  function copySchema() {
    navigator.clipboard?.writeText(SCHEMA_FIX_SQL).then(() => {
      setCopiedSchema(true); setTimeout(() => setCopiedSchema(false), 3000);
    });
  }

  const hasSchemaError = tests.some(t => t.msg.includes('Schema ผิด') || t.msg.includes('bigint'));

  const hasRlsError = tests.some(t => t.insert === 'err');

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '20px 14px 60px', background: '#f8fafc', minHeight: '100vh' }}>

      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 34 }}>🔧</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>Setup ระบบ</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Idea Inkjet V2</div>
      </div>

      {/* ── STEP 1: ทดสอบ ─────────────────────────────────── */}
      <div style={card}>
        <div style={step}>ขั้นตอนที่ 1</div>
        <div style={cardTitle}>🧪 ทดสอบการเชื่อมต่อฐานข้อมูล</div>
        <button onClick={runAllTests} disabled={testing} style={btnPrimary}>
          {testing ? '⏳ กำลังทดสอบ...' : '▶ ทดสอบเลย'}
        </button>

        {tests.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tests.map(t => (
              <div key={t.name} style={{
                padding: '10px 14px', borderRadius: 10,
                background: (t.insert === 'err' || t.select === 'err') ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${(t.insert === 'err' || t.select === 'err') ? '#fecaca' : '#bbf7d0'}`,
              }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                  color: (t.insert === 'err' || t.select === 'err') ? '#dc2626' : '#15803d' }}>
                  {t.name}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12 }}>
                  {t.select && <span>อ่านข้อมูล: {t.select === 'ok' ? '✅' : '❌'}</span>}
                  {t.insert && <span>บันทึกข้อมูล: {t.insert === 'ok' ? '✅' : '❌'}</span>}
                </div>
                {t.msg && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{t.msg}</div>}
              </div>
            ))}

            {!hasRlsError && (
              <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                ✅ ฐานข้อมูลพร้อมใช้งานทั้งหมด!
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── STEP 2: วิธีปิด RLS ───────────────────────────── */}
      {(hasRlsError || showGuide) && (
        <div style={{ ...card, borderColor: '#fecaca', borderWidth: 2 }}>
          <div style={step}>ขั้นตอนที่ 2</div>
          <div style={cardTitle}>🔓 ปิด RLS ใน Supabase</div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 12 }}>
            ⚠️ RLS บล็อกการบันทึกข้อมูล — ต้องปิดก่อนครับ
          </div>

          {/* วิธีที่ 1: ผ่าน UI */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', marginBottom: 10 }}>
              วิธีที่ 1 — ผ่านหน้าเว็บ Supabase (ง่ายกว่า)
            </div>
            {[
              'เปิด supabase.com แล้ว Login',
              'เลือก Project ของคุณ',
              'กดเมนู "Table Editor" (แถบซ้าย)',
              'กดเลือกตาราง "app_settings"',
              'มองหา "RLS" หรือไอคอนกุญแจ 🔒 แล้วกด Disable',
              'ทำซ้ำกับตาราง "order_status_logs"',
              'กลับมากด "ทดสอบเลย" อีกครั้ง',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 24, height: 24, background: '#1d4ed8', color: 'white',
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: 13, paddingTop: 3 }}>{s}</div>
              </div>
            ))}
          </div>

          {/* วิธีที่ 2: SQL */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#15803d', marginBottom: 8 }}>
              วิธีที่ 2 — ผ่าน SQL Editor
            </div>
            <div style={{ fontSize: 12, color: '#166534', marginBottom: 8 }}>
              Supabase → SQL Editor → New query → วาง → กด Run
            </div>
            <button onClick={copySql} style={{ ...btnPrimary, background: copied ? '#16a34a' : '#15803d', fontSize: 14, padding: '11px' }}>
              {copied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอก SQL (1 คลิก)'}
            </button>
            <textarea readOnly value={RLS_SQL} onFocus={e => e.target.select()}
              style={{ marginTop: 8, width: '100%', height: 110, fontFamily: 'monospace', fontSize: 11,
                borderRadius: 8, padding: 10, background: '#1e293b', color: '#86efac',
                border: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}

      {/* ── Schema Fix ────────────────────────────────────── */}
      {hasSchemaError && (
        <div style={{ ...card, borderColor: '#fed7aa', borderWidth: 2 }}>
          <div style={step}>แก้ Schema</div>
          <div style={cardTitle}>🟠 column changed_by ต้องเป็น TEXT</div>
          <div style={{ fontSize: 13, color: '#92400e', marginBottom: 12 }}>
            ตาราง <code>order_status_logs</code> มี column <code>changed_by</code> เป็น BIGINT แต่ต้องเป็น TEXT
            กด copy แล้วรันใน Supabase SQL Editor ครับ
          </div>
          <button onClick={copySchema} style={{ ...btnPrimary, background: copiedSchema ? '#16a34a' : '#ea580c', fontSize: 14, padding: '11px' }}>
            {copiedSchema ? '✅ คัดลอกแล้ว!' : '📋 คัดลอก SQL แก้ Schema'}
          </button>
          <textarea readOnly value={SCHEMA_FIX_SQL} onFocus={e => e.target.select()}
            style={{ marginTop: 8, width: '100%', height: 70, fontFamily: 'monospace', fontSize: 12,
              borderRadius: 8, padding: 10, background: '#1e293b', color: '#fed7aa',
              border: 'none', resize: 'none', boxSizing: 'border-box' }} />
        </div>
      )}

      {!hasRlsError && !showGuide && tests.length > 0 && (
        <button onClick={() => setShowGuide(true)} style={{ ...btnSecondary, marginBottom: 16 }}>
          ดูวิธีปิด RLS
        </button>
      )}

      {/* ── STEP 3: ตั้ง PIN ──────────────────────────────── */}
      <div style={card}>
        <div style={step}>ขั้นตอนที่ 3</div>
        <div style={cardTitle}>🔑 ตั้งรหัสผ่านเจ้าของร้าน</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
          ทำหลังจากปิด RLS ของ app_settings แล้วครับ
        </div>
        <input
          type="number" placeholder="รหัสผ่านใหม่ (ตัวเลข 4+ หลัก)"
          value={pinNew} onChange={e => setPinNew(e.target.value)}
          style={input}
        />
        <button onClick={resetPin} style={btnPrimary}>บันทึกรหัสผ่าน</button>
        {pinStatus && (
          <div style={{ marginTop: 10, fontSize: 13, whiteSpace: 'pre-line',
            color: pinStatus.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
            {pinStatus}
          </div>
        )}
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
  borderRadius: 16, padding: '18px 16px', marginBottom: 14,
};
const step: React.CSSProperties = {
  display: 'inline-block', background: '#eff6ff', color: '#1d4ed8',
  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, marginBottom: 8,
};
const cardTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 12,
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
  border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
