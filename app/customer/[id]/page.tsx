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

export default function CustomerPage() {
  const params     = useParams();
  const customerId = Number(params.id);

  const [customer,  setCustomer]  = useState<Customer | null>(null);
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [expanded,  setExpanded]  = useState<number | null>(null);

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

  const DONE   = ['ชำระเงินแล้ว', 'ยกเลิก'];
  const active = orders.filter(o => !DONE.includes(o.status));
  const done   = orders.filter(o =>  DONE.includes(o.status));
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
              <div key={o.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', opacity: 0.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{orderCode(o)}</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{o.title}</div>
                  </div>
                  <StatusPill status={o.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 32, fontSize: 12, color: '#9ca3af' }}>
        Idea Inkjet · ระบบจัดการงานพิมพ์
      </div>
    </main>
  );
}
