'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Step = 'form' | 'success';

const CONTACT_OPTIONS = ['LINE', 'โทรศัพท์', 'Facebook', 'อื่นๆ'];

function applyMap(data: Record<string, string>, map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...data };
  for (const [k, v] of Object.entries(map)) {
    if (k in out) { out[v] = out[k]; delete out[k]; }
  }
  return out;
}

export default function RegisterPage() {
  const [step, setStep]     = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');

  const [form, setForm] = useState({
    name: '', phone: '', line_id: '',
    contact_channel: 'LINE', address: '', tax_id: '',
  });

  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('กรุณากรอกชื่อ'); return; }
    setError(''); setLoading(true);

    let data: Record<string, string> = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      line_id: form.line_id.trim(),
      contact_channel: form.contact_channel,
      address: form.address.trim(),
      tax_id: form.tax_id.trim(),
    };

    // Column alias map: if DB uses prefixed names (customer_name, customer_phone etc.)
    const colMap: Record<string, string> = {};

    let res = await supabase.from('customers').insert(applyMap(data, colMap)).select('id').single();

    for (let i = 0; i < 10 && res.error; i++) {
      const msg = res.error.message;

      // "null value in column 'customer_name'" → remap name → customer_name
      const nullM = msg.match(/null value in column "([^"]+)"/);
      if (nullM) {
        const dbCol = nullM[1];
        const short = dbCol.startsWith('customer_') ? dbCol.slice('customer_'.length) : null;
        if (short && short in data) { colMap[short] = dbCol; }
        else break;
        res = await supabase.from('customers').insert(applyMap(data, colMap)).select('id').single();
        continue;
      }

      // "Could not find the 'address' column" → strip unknown column
      const unknownM = msg.match(/Could not find the '([^']+)' column/);
      if (unknownM) {
        const col = unknownM[1];
        const mapped = applyMap(data, colMap);
        if (!(col in mapped)) break;
        const { [col]: _r, ...rest } = mapped as any;
        data = Object.fromEntries(
          Object.entries(data).filter(([k]) => applyMap({ [k]: '' }, colMap)[k] !== col)
        ) as Record<string, string>;
        res = await supabase.from('customers').insert(rest).select('id').single();
        continue;
      }
      break;
    }

    setLoading(false);
    if (res.error) { setError('เกิดข้อผิดพลาด: ' + res.error.message); return; }

    setCustomerId(res.data.id);
    setCustomerName(form.name.trim());
    setStep('success');
  }

  const trackingUrl = customerId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/customer/${customerId}`
    : '';

  if (step === 'success') {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '40px 16px 60px', minHeight: '100vh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>ลงทะเบียนสำเร็จ!</div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>ยินดีต้อนรับ คุณ{customerName}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 12 }}>
            🔗 ลิงค์ติดตามสถานะงานของคุณ
          </div>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#0369a1', wordBreak: 'break-all', marginBottom: 12 }}>
            {trackingUrl}
          </div>
          <button
            onClick={() => { navigator.clipboard?.writeText(trackingUrl); }}
            style={{ width: '100%', padding: '12px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            📋 คัดลอกลิงค์
          </button>
        </div>

        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#78350f', marginBottom: 20 }}>
          <b>💡 บันทึกลิงค์นี้ไว้นะครับ</b><br />
          ใช้ลิงค์นี้เพื่อติดตามสถานะงานและดูรายละเอียดออเดอร์ของคุณได้ทุกเมื่อ
        </div>

        <a href={trackingUrl}
          style={{ display: 'block', textAlign: 'center', padding: '14px', background: '#16a34a', color: 'white', borderRadius: 12, fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>
          ดูหน้าติดตามงาน →
        </a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px 60px', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Idea Inkjet</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>ลงทะเบียนเพื่อติดตามสถานะงาน</div>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: '24px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: '#1e293b', marginBottom: 20 }}>ข้อมูลลูกค้า</div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ชื่อ */}
          <div>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              ชื่อ / บริษัท <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท"
              style={inputStyle}
            />
          </div>

          {/* เบอร์โทร */}
          <div>
            <label style={labelStyle}>เบอร์โทรศัพท์</label>
            <input
              type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="0812345678"
              style={inputStyle}
            />
          </div>

          {/* Line ID */}
          <div>
            <label style={labelStyle}>Line ID</label>
            <input
              value={form.line_id} onChange={e => set('line_id', e.target.value)}
              placeholder="Line ID ของคุณ"
              style={inputStyle}
            />
          </div>

          {/* ช่องทางติดต่อหลัก */}
          <div>
            <label style={labelStyle}>ช่องทางติดต่อที่สะดวก</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {CONTACT_OPTIONS.map(opt => (
                <button
                  key={opt} type="button"
                  onClick={() => set('contact_channel', opt)}
                  style={{
                    padding: '8px 16px', borderRadius: 20, border: '1px solid',
                    borderColor: form.contact_channel === opt ? '#1d4ed8' : '#d1d5db',
                    background: form.contact_channel === opt ? '#eff6ff' : 'white',
                    color: form.contact_channel === opt ? '#1d4ed8' : '#374151',
                    fontWeight: form.contact_channel === opt ? 700 : 400,
                    cursor: 'pointer', fontSize: 13,
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 4 }}>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>ข้อมูลสำหรับใบกำกับภาษี (ไม่บังคับ)</div>
          </div>

          {/* ที่อยู่ */}
          <div>
            <label style={labelStyle}>ที่อยู่</label>
            <textarea
              value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="ที่อยู่สำหรับออกใบกำกับภาษี"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
            />
          </div>

          {/* เลขผู้เสียภาษี */}
          <div>
            <label style={labelStyle}>เลขผู้เสียภาษี</label>
            <input
              value={form.tax_id} onChange={e => set('tax_id', e.target.value)}
              placeholder="13 หลัก"
              maxLength={13}
              style={inputStyle}
            />
          </div>

          <button
            type="submit" disabled={loading}
            style={{
              padding: '14px', background: loading ? '#93c5fd' : '#1d4ed8',
              color: 'white', border: 'none', borderRadius: 12,
              fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 15, marginTop: 4,
            }}
          >
            {loading ? 'กำลังบันทึก...' : 'ลงทะเบียน →'}
          </button>
        </form>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#9ca3af' }}>
        Idea Inkjet · ระบบจัดการงานพิมพ์
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  border: '1px solid #d1d5db', borderRadius: 10,
  fontSize: 15, background: 'white',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13, color: '#374151', fontWeight: 600,
  display: 'block', marginBottom: 6,
};
