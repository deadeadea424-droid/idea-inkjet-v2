'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fmtDate, orderCode } from '@/lib/shared';

const CRITERIA = [
  { key: 'quality_rating',       label: 'คุณภาพงาน',       desc: 'ความเรียบร้อย ถูกต้อง ตรงกับที่สั่ง' },
  { key: 'service_rating',       label: 'การบริการ',         desc: 'ความสุภาพ ใส่ใจ พร้อมช่วยเหลือ' },
  { key: 'timeliness_rating',    label: 'ความตรงเวลา',       desc: 'ส่งงานตามกำหนดนัด' },
  { key: 'communication_rating', label: 'การสื่อสาร',        desc: 'แจ้งสถานะ อัปเดตข้อมูลอย่างสม่ำเสมอ' },
] as const;

type CriterionKey = typeof CRITERIA[number]['key'];

const STAR_LABELS: Record<number, string> = {
  1: 'ต้องปรับปรุง',
  2: 'พอใช้',
  3: 'ดี',
  4: 'ดีมาก',
  5: 'ยอดเยี่ยม',
};

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            style={{
              fontSize: 32,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 2px',
              lineHeight: 1,
              filter: n <= display ? 'none' : 'grayscale(1) opacity(0.3)',
              transform: hover === n ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 0.1s',
            }}
          >
            ★
          </button>
        ))}
      </div>
      {display > 0 && (
        <div style={{ fontSize: 13, color: display >= 4 ? '#16a34a' : display === 3 ? '#d97706' : '#dc2626', fontWeight: 600 }}>
          {STAR_LABELS[display]}
        </div>
      )}
    </div>
  );
}

export default function AssessPage() {
  const params  = useParams();
  const orderId = Number(params.orderId);

  const [order,    setOrder]    = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [done,     setDone]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [errMsg,   setErrMsg]   = useState('');
  const [already,  setAlready]  = useState(false);

  const [ratings, setRatings] = useState<Record<CriterionKey, number>>({
    quality_rating:       0,
    service_rating:       0,
    timeliness_rating:    0,
    communication_rating: 0,
  });
  const [overall,  setOverall]  = useState(0);
  const [comment,  setComment]  = useState('');

  useEffect(() => {
    if (!orderId) return;
    load();
  }, [orderId]);

  async function load() {
    setLoading(true);

    const [ordRes, existRes] = await Promise.all([
      supabase.from('orders').select('id, order_code, title, status, due_date, customers(name)').eq('id', orderId).single(),
      supabase.from('assessments').select('id').eq('order_id', orderId).maybeSingle(),
    ]);

    setLoading(false);

    if (ordRes.error || !ordRes.data) { setNotFound(true); return; }
    setOrder(ordRes.data);
    if (existRes.data) setAlready(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (overall === 0) { setErrMsg('กรุณาให้คะแนนความพึงพอใจโดยรวม'); return; }
    const unrated = CRITERIA.find(c => ratings[c.key] === 0);
    if (unrated) { setErrMsg(`กรุณาให้คะแนน "${unrated.label}"`); return; }
    setErrMsg('');
    setSaving(true);

    const payload = {
      order_id:             orderId,
      customer_id:          order?.customer_id ?? null,
      overall_rating:       overall,
      quality_rating:       ratings.quality_rating,
      service_rating:       ratings.service_rating,
      timeliness_rating:    ratings.timeliness_rating,
      communication_rating: ratings.communication_rating,
      comment:              comment.trim() || null,
    };

    const { error } = await supabase.from('assessments').insert(payload);
    setSaving(false);

    if (error) {
      setErrMsg('เกิดข้อผิดพลาด: ' + error.message);
    } else {
      setDone(true);
    }
  }

  if (loading) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ color: '#6b7280' }}>กำลังโหลด...</div>
    </main>
  );

  if (notFound) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>ไม่พบข้อมูลงาน</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>กรุณาตรวจสอบลิงก์อีกครั้ง</div>
      </div>
    </main>
  );

  if (done) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0fdf4' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 16px' }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>🙏</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#15803d', marginBottom: 8 }}>ขอบคุณสำหรับการประเมิน!</div>
        <div style={{ fontSize: 15, color: '#374151', marginBottom: 4 }}>ความคิดเห็นของคุณมีคุณค่าสำหรับเรามาก</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>เราจะนำข้อมูลไปปรับปรุงการให้บริการให้ดียิ่งขึ้น</div>
        <div style={{ marginTop: 32, padding: '12px 20px', background: 'white', borderRadius: 12, border: '1px solid #d1fae5' }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>คะแนนความพึงพอใจโดยรวม</div>
          <div style={{ fontSize: 32 }}>{'★'.repeat(overall)}{'☆'.repeat(5 - overall)}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>{STAR_LABELS[overall]}</div>
        </div>
      </div>
    </main>
  );

  if (already) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center', maxWidth: 380, padding: '0 16px' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', marginBottom: 8 }}>ส่งการประเมินแล้ว</div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>คุณได้ประเมินงานนี้แล้ว ขอบคุณสำหรับความคิดเห็น!</div>
      </div>
    </main>
  );

  const avgRating = overall > 0
    ? ((overall + Object.values(ratings).reduce((s, v) => s + v, 0)) / (1 + CRITERIA.length)).toFixed(1)
    : null;

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 60px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Idea Inkjet</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>แบบประเมินความพึงพอใจ</div>
      </div>

      {/* Order card */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
          {order?.order_code || `JOB-${String(orderId).padStart(4, '0')}`}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 6 }}>{order?.title}</div>
        {order?.customers?.name && (
          <div style={{ fontSize: 13, color: '#374151' }}>ลูกค้า: {order.customers.name}</div>
        )}
        {order?.due_date && (
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>กำหนดส่ง: {fmtDate(order.due_date)}</div>
        )}
      </div>

      <form onSubmit={submit}>
        {/* Overall rating */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 4 }}>
            ความพึงพอใจโดยรวม <span style={{ color: '#dc2626' }}>*</span>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>ให้คะแนนภาพรวมของการใช้บริการครั้งนี้</div>
          <StarPicker value={overall} onChange={setOverall} />
        </div>

        {/* Criteria */}
        {CRITERIA.map(c => (
          <div key={c.key} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 4 }}>
              {c.label} <span style={{ color: '#dc2626' }}>*</span>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{c.desc}</div>
            <StarPicker
              value={ratings[c.key]}
              onChange={v => setRatings(prev => ({ ...prev, [c.key]: v }))}
            />
          </div>
        ))}

        {/* Comment */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 4 }}>ข้อเสนอแนะ / ความคิดเห็นเพิ่มเติม</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>บอกเราว่าเราทำอะไรได้ดี และอะไรที่ควรปรับปรุง (ไม่บังคับ)</div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={4}
            placeholder="เช่น งานสวย สีสดใส ส่งตรงเวลา หรือข้อเสนอแนะอื่นๆ..."
            style={{
              width: '100%', borderRadius: 8, border: '1px solid #d1d5db',
              padding: '10px 12px', fontSize: 14, resize: 'vertical',
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {errMsg && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#dc2626', fontSize: 14 }}>
            {errMsg}
          </div>
        )}

        {avgRating && (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
            คะแนนเฉลี่ย: <b style={{ color: '#1d4ed8', fontSize: 16 }}>{avgRating}/5</b>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
            background: saving ? '#93c5fd' : '#1d4ed8', color: 'white',
            fontSize: 16, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'กำลังบันทึก...' : 'ส่งการประเมิน'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: '#9ca3af' }}>
        Idea Inkjet · ระบบจัดการงานพิมพ์
      </div>
    </main>
  );
}
