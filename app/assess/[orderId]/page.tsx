'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fmtDate } from '@/lib/shared';

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
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            style={{
              fontSize: 30, background: 'none', border: 'none', cursor: 'pointer', padding: '0 1px', lineHeight: 1,
              color: n <= display ? '#f59e0b' : '#d1d5db',
              transform: hover === n ? 'scale(1.2)' : 'scale(1)',
              transition: 'transform 0.1s, color 0.1s',
            }}>★</button>
        ))}
      </div>
      {display > 0 && (
        <div style={{ fontSize: 12, marginTop: 3, fontWeight: 600, color: display >= 4 ? '#16a34a' : display === 3 ? '#d97706' : '#dc2626' }}>
          {STAR_LABELS[display]}
        </div>
      )}
    </div>
  );
}

type EmpEntry = { employee_id: number; name: string; role: string };

export default function AssessPage() {
  const params  = useParams();
  const orderId = Number(params.orderId);

  const [order,    setOrder]    = useState<any>(null);
  const [emps,     setEmps]     = useState<EmpEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [done,     setDone]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [errMsg,   setErrMsg]   = useState('');
  const [already,  setAlready]  = useState(false);

  // overall
  const [overall,  setOverall]  = useState(0);
  const [genComment, setGenComment] = useState('');

  // per-employee ratings: { [employee_id]: { rating, comment } }
  const [empRatings, setEmpRatings] = useState<Record<number, { rating: number; comment: string }>>({});

  useEffect(() => { if (orderId) load(); }, [orderId]);

  async function load() {
    setLoading(true);
    const [ordRes, existRes] = await Promise.all([
      supabase.from('orders').select(`
        id, order_code, title, status, due_date, customer_id,
        customers(name),
        designer:designer_id(id, name),
        production:production_id(id, name),
        receiver:receiver_id(id, name),
        measurer:measurer_id(id, name),
        delivery:delivery_id(id, name)
      `).eq('id', orderId).single(),
      supabase.from('assessments').select('id').eq('order_id', orderId).maybeSingle(),
    ]);
    setLoading(false);
    if (ordRes.error || !ordRes.data) { setNotFound(true); return; }
    const o = ordRes.data as any;
    setOrder(o);
    if (existRes.data) { setAlready(true); return; }

    // Build unique employee list from assigned roles
    const seen = new Set<number>();
    const list: EmpEntry[] = [];
    const add = (emp: any, role: string) => {
      if (emp?.id && !seen.has(emp.id)) {
        seen.add(emp.id);
        list.push({ employee_id: emp.id, name: emp.name, role });
      }
    };
    add(o.receiver,   'รับงาน');
    add(o.measurer,   'วัดงาน');
    add(o.designer,   'ออกแบบ');
    add(o.production, 'ผลิต');
    add(o.delivery,   'ส่งงาน');
    setEmps(list);

    // Init ratings map
    const init: Record<number, { rating: number; comment: string }> = {};
    list.forEach(e => { init[e.employee_id] = { rating: 0, comment: '' }; });
    setEmpRatings(init);
  }

  function setEmpRating(empId: number, rating: number) {
    setEmpRatings(prev => ({ ...prev, [empId]: { ...prev[empId], rating } }));
  }
  function setEmpComment(empId: number, comment: string) {
    setEmpRatings(prev => ({ ...prev, [empId]: { ...prev[empId], comment } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (overall === 0) { setErrMsg('กรุณาให้คะแนนความพึงพอใจโดยรวม'); return; }
    const unrated = emps.find(emp => (empRatings[emp.employee_id]?.rating ?? 0) === 0);
    if (unrated) { setErrMsg(`กรุณาให้คะแนนพนักงาน "${unrated.name}" (${unrated.role})`); return; }
    setErrMsg(''); setSaving(true);

    // Insert assessment row
    const { data: asmtData, error: asmtErr } = await supabase
      .from('assessments')
      .insert({
        order_id:    orderId,
        customer_id: order?.customer_id ?? null,
        overall_rating: overall,
        comment:     genComment.trim() || null,
      })
      .select('id')
      .single();

    if (asmtErr || !asmtData) {
      setSaving(false);
      setErrMsg('เกิดข้อผิดพลาด: ' + (asmtErr?.message ?? 'ไม่ทราบสาเหตุ'));
      return;
    }

    // Insert per-employee ratings
    if (emps.length > 0) {
      const rows = emps.map(emp => ({
        assessment_id: asmtData.id,
        order_id:      orderId,
        employee_id:   emp.employee_id,
        employee_role: emp.role,
        rating:        empRatings[emp.employee_id]?.rating,
        comment:       empRatings[emp.employee_id]?.comment?.trim() || null,
      }));
      const { error: ratingErr } = await supabase.from('employee_ratings').insert(rows);
      if (ratingErr) {
        setSaving(false);
        setErrMsg('บันทึกคะแนนพนักงานไม่สำเร็จ: ' + ratingErr.message);
        return;
      }
    }

    setSaving(false);
    setDone(true);
  }

  // ── Loading / error states ───────────────────────────────────────────────────
  if (loading) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ color: '#6b7280' }}>กำลังโหลด...</div>
    </main>
  );

  if (notFound) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>ไม่พบข้อมูลงาน</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>กรุณาตรวจสอบลิงก์อีกครั้ง</div>
      </div>
    </main>
  );

  if (already) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center', maxWidth: 380, padding: '0 16px' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', marginBottom: 8 }}>ส่งการประเมินแล้ว</div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>คุณได้ประเมินงานนี้แล้ว ขอบคุณมากครับ!</div>
      </div>
    </main>
  );

  if (done) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0fdf4' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 16px' }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>🙏</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#15803d', marginBottom: 8 }}>ขอบคุณสำหรับการประเมิน!</div>
        <div style={{ fontSize: 15, color: '#374151' }}>ความคิดเห็นของคุณช่วยให้ทีมงานพัฒนาตัวเองได้ดีขึ้น</div>
        <div style={{ marginTop: 24, background: 'white', borderRadius: 14, padding: '18px 20px', border: '1px solid #d1fae5' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>ความพึงพอใจโดยรวม</div>
          <div style={{ fontSize: 34, color: '#f59e0b' }}>{'★'.repeat(overall)}{'☆'.repeat(5 - overall)}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d', marginTop: 4 }}>{STAR_LABELS[overall]}</div>
        </div>
        {emps.length > 0 && (
          <div style={{ marginTop: 14, background: 'white', borderRadius: 14, padding: '14px 20px', border: '1px solid #d1fae5', textAlign: 'left' }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>คะแนนพนักงาน</div>
            {emps.map(emp => (
              <div key={emp.employee_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</span>
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 6 }}>({emp.role})</span>
                </div>
                <span style={{ color: '#f59e0b', fontSize: 18 }}>{'★'.repeat(empRatings[emp.employee_id]?.rating ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );

  // ── Main form ────────────────────────────────────────────────────────────────
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 60px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Idea Inkjet</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>แบบประเมินความพึงพอใจ</div>
      </div>

      {/* Order info */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
          {order?.order_code || `JOB-${String(orderId).padStart(4,'0')}`}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{order?.title}</div>
        {order?.customers?.name && (
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>ลูกค้า: {order.customers.name}</div>
        )}
        {order?.due_date && (
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>กำหนดส่ง: {fmtDate(order.due_date)}</div>
        )}
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Overall satisfaction */}
        <div style={{ background: 'white', border: '2px solid #1d4ed8', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1d4ed8', marginBottom: 4 }}>
            ความพึงพอใจโดยรวม <span style={{ color: '#dc2626' }}>*</span>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>ให้คะแนนภาพรวมของการใช้บริการครั้งนี้</div>
          <StarPicker value={overall} onChange={setOverall} />
        </div>

        {/* Per-employee ratings */}
        {emps.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', marginBottom: 10 }}>
              ประเมินพนักงานที่รับผิดชอบงานของคุณ <span style={{ color: '#dc2626' }}>*</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {emps.map(emp => {
                const r = empRatings[emp.employee_id] ?? { rating: 0, comment: '' };
                return (
                  <div key={emp.employee_id} style={{ background: 'white', border: `1px solid ${r.rating > 0 ? '#d1fae5' : '#e5e7eb'}`, borderRadius: 14, padding: '16px 18px', transition: 'border-color 0.2s' }}>
                    {/* Employee header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#1d4ed8', flexShrink: 0 }}>
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{emp.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          {emp.role === 'รับงาน'   && '📋 รับออร์เดอร์'}
                          {emp.role === 'วัดงาน'   && '📐 วัดขนาด'}
                          {emp.role === 'ออกแบบ'   && '🎨 ออกแบบงาน'}
                          {emp.role === 'ผลิต'     && '🖨 ฝ่ายผลิต'}
                          {emp.role === 'ส่งงาน'   && '🚚 จัดส่งงาน'}
                        </div>
                      </div>
                      {r.rating > 0 && (
                        <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#d1fae5', color: '#15803d' }}>
                          {STAR_LABELS[r.rating]}
                        </div>
                      )}
                    </div>

                    <StarPicker value={r.rating} onChange={v => setEmpRating(emp.employee_id, v)} />

                    <div style={{ marginTop: 12 }}>
                      <input type="text" placeholder={`ความคิดเห็นเกี่ยวกับ ${emp.name} (ไม่บังคับ)`}
                        value={r.comment} onChange={e => setEmpComment(emp.employee_id, e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box', background: '#f8fafc' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {emps.length === 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#92400e' }}>
            ℹ️ งานนี้ยังไม่ได้มอบหมายพนักงาน — ให้คะแนนภาพรวมได้เลยครับ
          </div>
        )}

        {/* General comment */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 4 }}>ข้อเสนอแนะเพิ่มเติม</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>บอกเราเพิ่มเติมได้เลย เราอ่านทุกความคิดเห็นครับ (ไม่บังคับ)</div>
          <textarea value={genComment} onChange={e => setGenComment(e.target.value)} rows={3}
            placeholder="เช่น งานสวย ส่งตรงเวลา ทีมงานดูแลดี หรืออยากให้ปรับปรุงเรื่องใด..."
            style={{ width: '100%', borderRadius: 8, border: '1px solid #d1d5db', padding: '10px 12px', fontSize: 14, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>

        {errMsg && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 14 }}>
            {errMsg}
          </div>
        )}

        <button type="submit" disabled={saving}
          style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: saving ? '#93c5fd' : '#1d4ed8', color: 'white', fontSize: 16, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'กำลังบันทึก...' : 'ส่งแบบประเมิน'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: '#9ca3af' }}>
        Idea Inkjet · ระบบจัดการงานพิมพ์
      </div>
    </main>
  );
}
