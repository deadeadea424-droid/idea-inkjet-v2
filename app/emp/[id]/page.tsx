'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Employee, Order, StatusLog, STATUS_STYLE, STATUSES, statusesForOrder, fmtDate, fmtMoney, orderCode, savePin } from '@/lib/shared';

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const [bg, color] = STATUS_STYLE[status] || ['#e5e7eb', '#374151'];
  return (
    <span style={{ background: bg, color, fontSize: 11, padding: '2px 9px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

// ─── Log timeline ─────────────────────────────────────────────────────────────
function LogTimeline({ logs, loading, logsFor, orderId }: { logs: StatusLog[]; loading: boolean; logsFor: number | null; orderId: number }) {
  if (loading && logsFor === orderId) return <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>กำลังโหลดประวัติ...</div>;
  if (logsFor !== orderId || !logs.length) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>ประวัติสถานะ</div>
      {logs.map(l => (
        <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', marginTop: 3, flexShrink: 0 }} />
          <div>
            <span style={{ color: '#374151' }}>
              {l.old_status ? <>{l.old_status} → </> : null}<b>{l.new_status}</b>
            </span>
            {l.changed_by && <span style={{ marginLeft: 6, color: '#6b7280' }}>· โดย {l.changed_by}</span>}
            {l.note && <span style={{ marginLeft: 6, color: '#6b7280' }}>{l.note}</span>}
            <div style={{ color: '#9ca3af', fontSize: 11 }}>
              {new Date(l.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Employee View ────────────────────────────────────────────────────────────
function EmployeeView({ emp, orders, onLogout, onLoad, loading }: {
  emp: Employee;
  orders: Order[];
  onLogout: () => void;
  onLoad: () => void;
  loading: boolean;
}) {
  const [filter, setFilter]       = useState<'active' | 'all' | 'done'>('active');
  const [expandedId, setExpanded] = useState<number | null>(null);
  const [showPin, setShowPin]     = useState(false);
  const [pinNew1, setPinNew1]     = useState('');
  const [pinNew2, setPinNew2]     = useState('');
  const [pinMsg, setPinMsg]       = useState('');
  const [orderLogs, setOrderLogs] = useState<StatusLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFor, setLogsFor]     = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [changingId, setChangingId] = useState<number | null>(null);

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const DONE  = ['ชำระเงินแล้ว', 'ยกเลิก'];
  const active = orders.filter(o => !DONE.includes(o.status));
  const done   = orders.filter(o =>  DONE.includes(o.status));
  const dueToday = active.filter(o => o.due_date === today).length;
  const overdue  = active.filter(o => o.due_date && o.due_date < today && o.due_date !== today).length;
  const displayed = filter === 'active' ? active : filter === 'done' ? done : orders;

  async function loadLogs(orderId: number) {
    setLogsLoading(true); setLogsFor(orderId);
    const { data } = await supabase.from('order_status_logs')
      .select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    setOrderLogs(data || []); setLogsLoading(false);
  }

  async function changeStatus(order: Order, newStatus: string) {
    setChangingId(order.id);
    const oldStatus = order.status;
    await supabase.from('order_status_logs').insert({ order_id: order.id, old_status: oldStatus, new_status: newStatus, note: '', changed_by: emp.name });
    await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
    setStatusMsg('อัปเดตสถานะแล้ว ✓');
    setChangingId(null);
    setTimeout(() => setStatusMsg(''), 2000);
    onLoad();
  }

  async function handleSavePin() {
    if (!pinNew1) { setPinMsg('กรุณาใส่รหัสผ่านใหม่'); return; }
    if (pinNew1 !== pinNew2) { setPinMsg('รหัสผ่านไม่ตรงกัน'); return; }
    const err = await savePin(emp.id, pinNew1);
    if (err) { setPinMsg('บันทึกไม่สำเร็จ: ' + err); return; }
    setPinNew1(''); setPinNew2(''); setPinMsg('บันทึกรหัสผ่านแล้ว ✓');
    setTimeout(() => { setPinMsg(''); setShowPin(false); }, 1500);
  }

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '16px 16px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>สวัสดี, {emp.name}</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{emp.position || emp.role} · Idea Inkjet</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onLoad} disabled={loading}
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>
            {loading ? 'โหลด...' : 'รีเฟรช'}
          </button>
          <button onClick={onLogout}
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>
            ออกจากระบบ
          </button>
        </div>
      </div>

      {statusMsg && (
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          {statusMsg}
        </div>
      )}

      {/* Change PIN */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>🔑 รหัสผ่านของฉัน</span>
          <button onClick={() => { setShowPin(p => !p); setPinMsg(''); setPinNew1(''); setPinNew2(''); }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>
            {showPin ? 'ยกเลิก' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </div>
        {showPin && (
          <div style={{ marginTop: 10 }}>
            {pinMsg && <div style={{ color: pinMsg.includes('✓') ? '#065f46' : '#dc2626', fontSize: 12, marginBottom: 6 }}>{pinMsg}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input type="password" placeholder="รหัสผ่านใหม่" value={pinNew1}
                onChange={e => { setPinNew1(e.target.value); setPinMsg(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSavePin()}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }} />
              <input type="password" placeholder="ยืนยันรหัสผ่าน" value={pinNew2}
                onChange={e => { setPinNew2(e.target.value); setPinMsg(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSavePin()}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }} />
              <button onClick={handleSavePin}
                style={{ padding: '8px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                บันทึกรหัสผ่านใหม่
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
        {([
          ['งานทั้งหมด', orders.length, undefined],
          ['กำลังทำ',    active.length, '#1d4ed8'],
          ['วันนี้',     dueToday,      dueToday > 0 ? '#c2410c' : undefined],
          ['เลยกำหนด',  overdue,       overdue > 0 ? '#dc2626' : undefined],
        ] as [string, number, string | undefined][]).map(([label, val, color]) => (
          <div key={label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
            <b style={{ fontSize: 20, color }}>{val}</b>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {([['active', `ต้องทำ (${active.length})`], ['all', `ทั้งหมด (${orders.length})`], ['done', `เสร็จ (${done.length})`]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: filter === v ? 700 : 400,
              background: filter === v ? '#3b82f6' : '#f3f4f6', color: filter === v ? 'white' : '#374151',
              border: 'none', cursor: 'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Orders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayed.length === 0 && (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 36, textAlign: 'center', color: '#6b7280' }}>
            {filter === 'active' ? 'ไม่มีงานที่ต้องทำ 🎉' : 'ยังไม่มีงาน'}
          </div>
        )}
        {displayed.map(o => {
          const isDes     = o.designer_id   === emp.id;
          const isPro     = o.production_id === emp.id;
          const isOverdue = !!o.due_date && o.due_date < today && !DONE.includes(o.status);
          const isToday   = o.due_date === today && !DONE.includes(o.status);
          const isExp     = expandedId === o.id;
          return (
            <div key={o.id} style={{ background: 'white', border: `1px solid ${isOverdue ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 13 }}>{orderCode(o)}</span>
                <StatusPill status={o.status} />
                {isDes && <span style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 20 }}>ออกแบบ</span>}
                {isPro && <span style={{ fontSize: 11, background: '#fae8ff', color: '#7e22ce', padding: '2px 8px', borderRadius: 20 }}>ผลิต</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{o.title}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                ลูกค้า: {o.customers?.name || '-'}
                {o.due_date && (
                  <span style={{ marginLeft: 12, color: isOverdue ? '#dc2626' : isToday ? '#c2410c' : undefined }}>
                    นัดส่ง: {fmtDate(o.due_date)}{isOverdue ? ' ⚠️' : isToday ? ' 🔔' : ''}
                  </span>
                )}
              </div>

              {/* Status update */}
              {!DONE.includes(o.status) && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>เปลี่ยนสถานะ:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {statusesForOrder(o).filter(s => s !== o.status).map(s => {
                      const [bg, color] = STATUS_STYLE[s] || ['#e5e7eb', '#374151'];
                      return (
                        <button key={s} onClick={() => changeStatus(o, s)}
                          disabled={changingId === o.id}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 16, border: `1px solid ${color}20`,
                            background: bg, color, cursor: 'pointer', opacity: changingId === o.id ? 0.5 : 1 }}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <button onClick={() => {
                  const next = isExp ? null : o.id;
                  setExpanded(next);
                  if (next) loadLogs(next);
                }} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {isExp ? '▲ ซ่อน' : '▼ รายละเอียด'}
                </button>
                {isExp && (
                  <div style={{ marginTop: 8, borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                    {o.detail && <p style={{ fontSize: 13, margin: '0 0 6px' }}><b>หมายเหตุ:</b> {o.detail}</p>}
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {o.order_type && <span style={{ marginRight: 12 }}><b>ประเภท:</b> {o.order_type}</span>}
                      {o.size       && <span style={{ marginRight: 12 }}><b>ขนาด:</b> {o.size}</span>}
                      {o.material   && <span><b>วัสดุ:</b> {o.material}</span>}
                    </div>
                    <LogTimeline logs={orderLogs} loading={logsLoading} logsFor={logsFor} orderId={o.id} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmpPage() {
  const params  = useParams();
  const empId   = Number(params.id);

  const [emp,       setEmp]       = useState<Employee | null>(null);
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [loggedIn,  setLoggedIn]  = useState(false);
  const [pinInput,  setPinInput]  = useState('');
  const [pin1,      setPin1]      = useState('');
  const [pin2,      setPin2]      = useState('');
  const [err,       setErr]       = useState('');
  const [loading,   setLoading]   = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [notFound,  setNotFound]  = useState(false);

  useEffect(() => {
    if (!empId) return;
    loadEmployee();
  }, [empId]);

  async function loadEmployee() {
    setLoading(true);
    const [empRes, pinRes] = await Promise.all([
      supabase.from('employees').select('*').eq('id', empId).single(),
      supabase.from('app_settings').select('value').eq('key', `pin_emp_${empId}`).single(),
    ]);
    setLoading(false);
    if (empRes.error || !empRes.data) { setNotFound(true); return; }
    const d = empRes.data as any;
    setEmp({ id: d.id, name: d.name ?? d.employee_name ?? '', position: d.position ?? '', role: d.role ?? 'graphic' });
    setStoredPin(pinRes.data?.value ?? null);
  }

  async function loadOrders() {
    setLoadingOrders(true);
    const [ordRes, custRes, empRes] = await Promise.all([
      supabase.from('orders').select('*').or(`designer_id.eq.${empId},production_id.eq.${empId}`).order('id', { ascending: false }),
      supabase.from('customers').select('*'),
      supabase.from('employees').select('*'),
    ]);
    setLoadingOrders(false);
    const custMap = Object.fromEntries((custRes.data || []).map((c: any) => [c.id, { id: c.id, name: c.name ?? c.customer_name ?? '', phone: c.phone ?? '', line_id: c.line_id ?? '', contact_channel: c.contact_channel ?? '' }]));
    const empMap  = Object.fromEntries((empRes.data  || []).map((e: any) => [e.id, { id: e.id, name: e.name ?? e.employee_name ?? '', position: e.position ?? '', role: e.role ?? '' }]));
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
      customers:  custMap[row.customer_id]  ?? undefined,
      designer:   empMap[row.designer_id]   ?? undefined,
      production: empMap[row.production_id] ?? undefined,
    }));
    setOrders(norm);
  }

  async function handleLogin() {
    if (!pinInput) { setErr('กรุณาใส่รหัสผ่าน'); return; }
    if (pinInput !== storedPin) { setErr('รหัสผ่านไม่ถูกต้อง'); return; }
    setErr('');
    setLoggedIn(true);
    loadOrders();
  }

  async function handleSetup() {
    if (!pin1) { setErr('กรุณาตั้งรหัสผ่าน'); return; }
    if (pin1 !== pin2) { setErr('รหัสผ่านไม่ตรงกัน'); return; }
    const e = await savePin(empId, pin1);
    if (e) { setErr('บันทึกไม่สำเร็จ: ' + e); return; }
    setStoredPin(pin1);
    setErr('');
    setLoggedIn(true);
    loadOrders();
  }

  function handleLogout() {
    setLoggedIn(false);
    setPinInput(''); setPin1(''); setPin2(''); setErr('');
    setOrders([]);
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
        <div>ไม่พบข้อมูลพนักงาน</div>
      </div>
    </main>
  );

  if (loggedIn && emp) return (
    <EmployeeView emp={emp} orders={orders} onLogout={handleLogout} onLoad={loadOrders} loading={loadingOrders} />
  );

  return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1e293b' }}>Idea Inkjet</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>ระบบจัดการงานพิมพ์</div>
        </div>

        <div style={{ background: 'white', border: '2px solid #bfdbfe', borderRadius: 16, padding: '24px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>👷 {emp?.name}</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>{emp?.position || emp?.role}</div>

          {err && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              {err}
            </div>
          )}

          {storedPin ? (
            /* Has PIN — enter it */
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>รหัสผ่าน</label>
              <input type="password" placeholder="ใส่รหัสผ่านของคุณ" autoFocus
                value={pinInput} onChange={e => { setPinInput(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', marginBottom: 12 }} />
              <button onClick={handleLogin}
                style={{ width: '100%', padding: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                เข้าสู่ระบบ
              </button>
            </div>
          ) : (
            /* No PIN — first-time setup */
            <div>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#92400e' }}>
                ยังไม่มีรหัสผ่าน — กรุณาตั้งรหัสก่อนเข้าใช้งาน
              </div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>รหัสผ่านใหม่</label>
              <input type="password" placeholder="ตั้งรหัสผ่าน" autoFocus
                value={pin1} onChange={e => { setPin1(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSetup()}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', marginBottom: 8 }} />
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>ยืนยันรหัสผ่าน</label>
              <input type="password" placeholder="ใส่รหัสผ่านอีกครั้ง"
                value={pin2} onChange={e => { setPin2(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSetup()}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', marginBottom: 12 }} />
              <button onClick={handleSetup}
                style={{ width: '100%', padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                ตั้งรหัสและเข้าสู่ระบบ
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
