'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Customer, Order, STATUS_STYLE, fmtDate, fmtMoney, orderCode } from '@/lib/shared';

function StatusPill({ status }: { status: string }) {
  const [bg, color] = STATUS_STYLE[status] || ['#e5e7eb', '#374151'];
  return (
    <span style={{ background: bg, color, fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  return (
    <button onClick={copy}
      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid #bfdbfe', background: copied ? '#dbeafe' : 'white', color: copied ? '#1d4ed8' : '#6b7280', cursor: 'pointer', marginLeft: 6, whiteSpace: 'nowrap' }}>
      {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
    </button>
  );
}

function SlipForm({ orderId, balance, customerId, onDone }: { orderId: number; balance: number; customerId: number; onDone: () => void }) {
  const [amount,        setAmount]        = useState(String(balance));
  const [transferredAt, setTransferredAt] = useState('');
  const [referenceNo,   setReferenceNo]   = useState('');
  const [note,          setNote]          = useState('');
  const [file,          setFile]          = useState<File | null>(null);
  const [preview,       setPreview]       = useState('');
  const [saving,        setSaving]        = useState(false);
  const [errMsg,        setErrMsg]        = useState('');
  const [done,          setDone]          = useState(false);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) { setErrMsg('กรุณาระบุยอดที่โอน'); return; }
    setErrMsg(''); setSaving(true);

    let slipUrl: string | null = null;

    if (file) {
      const ext  = file.name.split('.').pop() || 'jpg';
      const path = `${orderId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('payment-slips').upload(path, file, { upsert: true });
      if (upErr) {
        setSaving(false);
        setErrMsg('อัปโหลดสลิปไม่สำเร็จ: ' + upErr.message);
        return;
      }
      const { data: urlData } = supabase.storage.from('payment-slips').getPublicUrl(path);
      slipUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from('payment_slips').insert({
      order_id:       orderId,
      customer_id:    customerId,
      amount:         Number(amount),
      transferred_at: transferredAt ? new Date(transferredAt).toISOString() : null,
      reference_no:   referenceNo.trim() || null,
      slip_url:       slipUrl,
      note:           note.trim() || null,
      status:         'pending',
    });

    setSaving(false);
    if (error) { setErrMsg('เกิดข้อผิดพลาด: ' + error.message); return; }
    setDone(true);
    setTimeout(onDone, 2000);
  }

  if (done) return (
    <div style={{ textAlign: 'center', padding: '16px 0', color: '#15803d' }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
      <div style={{ fontWeight: 700 }}>แจ้งโอนเรียบร้อยแล้ว!</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>ทางร้านจะตรวจสอบและยืนยันให้ค่ะ</div>
    </div>
  );

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>ยอดที่โอน (บาท) *</label>
        <input type="number" min="1" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, fontWeight: 700, boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>วันเวลาที่โอน</label>
        <input type="datetime-local" value={transferredAt} onChange={e => setTransferredAt(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>เลขอ้างอิง / เลขที่รายการ (ถ้ามี)</label>
        <input type="text" placeholder="เช่น 2706123456789" value={referenceNo} onChange={e => setReferenceNo(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>แนบสลิปการโอน</label>
        <input type="file" accept="image/*" onChange={pickFile}
          style={{ width: '100%', fontSize: 13 }} />
        {preview && (
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <img src={preview} alt="ตัวอย่างสลิป" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid #e5e7eb', objectFit: 'contain' }} />
          </div>
        )}
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>หมายเหตุเพิ่มเติม (ถ้ามี)</label>
        <input type="text" placeholder="เช่น โอนเพิ่ม, ชำระบางส่วน..." value={note} onChange={e => setNote(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
      </div>
      {errMsg && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>{errMsg}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving}
          style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: saving ? '#93c5fd' : '#1d4ed8', color: 'white', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'กำลังส่ง...' : 'ส่งหลักฐานการโอน'}
        </button>
      </div>
    </form>
  );
}

function PaymentInfo() {
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', marginBottom: 10 }}>💳 ช่องทางการชำระเงิน</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: 'white', borderRadius: 10, padding: '10px 12px', border: '1px solid #dbeafe' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>ธนาคารกรุงไทย · บัญชีออมทรัพย์</div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', letterSpacing: 1 }}>2130555411</span>
            <CopyBtn text="2130555411" />
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 3 }}>ไอเดียอิงค์เจ็ท โดย นายอภิสิทธิ์ รักษ์วิริยะ</div>
        </div>
        <div style={{ background: 'white', borderRadius: 10, padding: '10px 12px', border: '1px solid #dbeafe' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>พร้อมเพย์</div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', letterSpacing: 1 }}>0806544492</span>
            <CopyBtn text="0806544492" />
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 3 }}>ไอเดียอิงค์เจ็ท โดย นายอภิสิทธิ์ รักษ์วิริยะ</div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerPage() {
  const params     = useParams();
  const customerId = Number(params.id);

  const [customer,  setCustomer]  = useState<Customer | null>(null);
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [expanded,  setExpanded]  = useState<number | null>(null);
  const [slipOpen,  setSlipOpen]  = useState<number | null>(null);

  useEffect(() => {
    if (!customerId) return;
    load();
  }, [customerId]);

  async function load() {
    setLoading(true);
    const [custRes, ordRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('orders').select('*').eq('customer_id', customerId).order('id', { ascending: false }),
    ]);
    setLoading(false);
    if (custRes.error || !custRes.data) { setNotFound(true); return; }
    const d = custRes.data as any;
    setCustomer({ id: d.id, name: d.name ?? d.customer_name ?? '', phone: d.phone ?? '', line_id: d.line_id ?? '', contact_channel: d.contact_channel ?? '' });
    const norm = (ordRes.data || []).map((row: any) => ({
      ...row,
      title:    row.title    ?? row.order_title   ?? '',
      status:   row.status   ?? row.order_status  ?? 'รับงานใหม่',
      size:     row.size     ?? row.order_size     ?? '',
      quantity: row.quantity ?? row.order_quantity ?? 1,
      material: row.material ?? row.order_material ?? '',
      price:    Number(row.price   ?? row.order_price   ?? 0),
      deposit:  Number(row.deposit ?? row.order_deposit  ?? 0),
      balance:  Number(row.balance ?? row.order_balance  ?? 0),
      detail:   row.detail   ?? row.order_detail   ?? '',
      due_date: row.due_date ?? row.order_due_date ?? null,
    }));
    setOrders(norm);
  }

  if (loading) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ color: '#6b7280' }}>กำลังโหลด...</div>
    </main>
  );

  if (notFound) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div>ไม่พบข้อมูลลูกค้า</div>
      </div>
    </main>
  );

  const DONE     = ['ชำระเงินแล้ว', 'ยกเลิก'];
  const ASSESSED = ['ลูกค้ารับแล้ว', 'ชำระเงินแล้ว'];
  const active   = orders.filter(o => !DONE.includes(o.status));
  const done     = orders.filter(o =>  DONE.includes(o.status));
  const today  = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 60px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Idea Inkjet</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>ติดตามสถานะงาน</div>
      </div>

      {/* Customer info */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: '#1e293b', marginBottom: 4 }}>สวัสดีคุณ {customer?.name}</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {customer?.phone && <span>📞 {customer.phone}</span>}
          {customer?.line_id && <span style={{ marginLeft: 12 }}>LINE: {customer.line_id}</span>}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
            งานทั้งหมด {orders.length} งาน
          </span>
          {active.length > 0 && (
            <span style={{ background: '#fef9c3', color: '#854d0e', fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
              กำลังดำเนินการ {active.length} งาน
            </span>
          )}
          {done.length > 0 && (
            <span style={{ background: '#d1fae5', color: '#065f46', fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
              เสร็จแล้ว {done.length} งาน
            </span>
          )}
        </div>
      </div>

      {/* Refresh button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={load} disabled={loading}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', color: '#374151' }}>
          {loading ? 'โหลด...' : '🔄 รีเฟรช'}
        </button>
      </div>

      {orders.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 36, textAlign: 'center', color: '#6b7280' }}>
          ยังไม่มีงานในระบบ
        </div>
      )}

      {/* Active orders */}
      {active.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', marginBottom: 8 }}>งานที่กำลังดำเนินการ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map(o => {
              const isOverdue = !!o.due_date && o.due_date < today;
              const isToday   = o.due_date === today;
              const isExp     = expanded === o.id;
              return (
                <div key={o.id} style={{ background: 'white', border: `1px solid ${isOverdue ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{orderCode(o)}</div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{o.title}</div>
                    </div>
                    <StatusPill status={o.status} />
                  </div>
                  {o.due_date && (
                    <div style={{ fontSize: 13, color: isOverdue ? '#dc2626' : isToday ? '#c2410c' : '#6b7280', marginTop: 6 }}>
                      นัดส่ง: {fmtDate(o.due_date)}{isOverdue ? ' ⚠️ เลยกำหนด' : isToday ? ' 🔔 วันนี้' : ''}
                    </div>
                  )}
                  <div style={{ marginTop: 10, borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#6b7280' }}>ราคารวม</span>
                      <b>{fmtMoney(o.price)} บาท</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 2 }}>
                      <span style={{ color: '#6b7280' }}>มัดจำ</span>
                      <b>{fmtMoney(o.deposit)} บาท</b>
                    </div>
                    {Number(o.balance) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 2, color: '#dc2626' }}>
                        <span>ยอดค้างชำระ</span>
                        <b>{fmtMoney(o.balance)} บาท</b>
                      </div>
                    )}
                  </div>
                  {Number(o.balance) > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <PaymentInfo />
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '12px 14px' }}>
                        {slipOpen === o.id ? (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#15803d', marginBottom: 10 }}>📎 แจ้งหลักฐานการโอนเงิน</div>
                            <SlipForm orderId={o.id} balance={Number(o.balance)} customerId={customerId} onDone={() => setSlipOpen(null)} />
                            <button onClick={() => setSlipOpen(null)}
                              style={{ marginTop: 8, fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              ✕ ยกเลิก
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setSlipOpen(o.id)}
                            style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#16a34a', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                            📎 แจ้งโอนเงิน / ส่งสลิป
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {o.detail && (
                    <div>
                      <button onClick={() => setExpanded(isExp ? null : o.id)}
                        style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 4 }}>
                        {isExp ? '▲ ซ่อนรายละเอียด' : '▼ รายละเอียดเพิ่มเติม'}
                      </button>
                      {isExp && (
                        <div style={{ marginTop: 4, fontSize: 13, color: '#374151', background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                          {o.detail}
                        </div>
                      )}
                    </div>
                  )}
                  {ASSESSED.includes(o.status) && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 2 }}>🙏 ขอบคุณที่ใช้บริการ!</div>
                        <div style={{ fontSize: 12, color: '#78350f' }}>กรุณาประเมินความพึงพอใจและให้คะแนนทีมงาน เพื่อช่วยให้เราพัฒนาบริการให้ดียิ่งขึ้น</div>
                      </div>
                      <a href={`/assess/${o.id}`}
                        style={{ display: 'block', textAlign: 'center', padding: '11px 0', borderRadius: 10, background: '#f59e0b', color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                        ⭐ ประเมินความพึงพอใจ / ให้คะแนนพนักงาน
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Done orders */}
      {done.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', marginBottom: 8 }}>งานที่เสร็จแล้ว</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {done.map(o => (
              <div key={o.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{orderCode(o)}</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{o.title}</div>
                  </div>
                  <StatusPill status={o.status} />
                </div>
                {o.status !== 'ยกเลิก' && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                    <a href={`/assess/${o.id}`}
                      style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 600, textDecoration: 'none', border: '1px solid #bbf7d0' }}>
                      ⭐ ประเมินความพึงพอใจ
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment channels footer */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', marginBottom: 8 }}>ช่องทางการชำระเงิน</div>
        <PaymentInfo />
      </div>

      <div style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: '#9ca3af' }}>
        Idea Inkjet · ระบบจัดการงานพิมพ์
      </div>
    </main>
  );
}
