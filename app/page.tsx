'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Customer = { id: number; name: string; phone: string; line_id: string; contact_channel: string };
type Employee = { id: number; name: string; position: string; role: string };
type Order = {
  id: number; order_code: string; title: string; status: string;
  due_date: string; price: number; deposit: number; balance: number;
  customer_id: number; designer_id: number | null; production_id: number | null;
  detail: string; order_type: string; size: string; quantity: number; material: string;
  customers?: Customer; designer?: Employee; production?: Employee;
};

const STATUSES = [
  'รับงานใหม่','กำลังออกแบบ','รอลูกค้าตรวจแบบ','ลูกค้าอนุมัติแล้ว',
  'กำลังผลิต','ผลิตเสร็จ','แจ้งลูกค้ามารับ','ลูกค้ารับแล้ว',
  'ชำระเงินแล้ว','ค้างชำระ','ยกเลิก',
];

const STATUS_STYLE: Record<string, [string, string]> = {
  'รับงานใหม่':          ['#dbeafe','#1d4ed8'],
  'กำลังออกแบบ':         ['#fef9c3','#854d0e'],
  'รอลูกค้าตรวจแบบ':    ['#ffedd5','#c2410c'],
  'ลูกค้าอนุมัติแล้ว':  ['#dcfce7','#15803d'],
  'กำลังผลิต':           ['#fae8ff','#7e22ce'],
  'ผลิตเสร็จ':           ['#d1fae5','#065f46'],
  'แจ้งลูกค้ามารับ':    ['#ede9fe','#5b21b6'],
  'ลูกค้ารับแล้ว':      ['#ccfbf1','#0f766e'],
  'ชำระเงินแล้ว':       ['#f0fdf4','#16a34a'],
  'ค้างชำระ':            ['#fee2e2','#dc2626'],
  'ยกเลิก':              ['#f3f4f6','#6b7280'],
};

const EMPTY_ORDER = {
  customer_id:'', title:'', order_type:'ป้ายไวนิล', detail:'',
  size:'', quantity:'1', material:'', price:'0', deposit:'0',
  due_date:'', designer_id:'', production_id:'',
};

export default function Home() {
  const [tab, setTab] = useState('dashboard');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [customerForm, setCustomerForm] = useState({ name:'', phone:'', line_id:'', contact_channel:'LINE' });
  const [employeeForm, setEmployeeForm] = useState({ name:'', position:'', role:'graphic' });
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER);

  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function load() {
    setLoading(true); setError('');
    const [c, e, o] = await Promise.all([
      supabase.from('customers').select('*').order('id', { ascending: false }),
      supabase.from('employees').select('*').order('id', { ascending: false }),
      supabase.from('orders')
        .select('*, customers(*), designer:employees!orders_designer_id_fkey(*), production:employees!orders_production_id_fkey(*)')
        .order('id', { ascending: false }),
    ]);
    setLoading(false);
    if (c.error || e.error || o.error) {
      setError(c.error?.message || e.error?.message || o.error?.message || 'โหลดข้อมูลไม่สำเร็จ');
      return;
    }
    setCustomers(c.data || []);
    setEmployees(e.data || []);
    setOrders(o.data || []);
  }

  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => ({
    total: orders.length,
    new: orders.filter(x => x.status === 'รับงานใหม่').length,
    design: orders.filter(x => x.status === 'กำลังออกแบบ').length,
    production: orders.filter(x => x.status === 'กำลังผลิต').length,
    overdue: orders.filter(x => x.due_date && new Date(x.due_date) < new Date() && !['ชำระเงินแล้ว','ยกเลิก'].includes(x.status)).length,
    unpaid: orders.filter(x => x.status === 'ค้างชำระ' || Number(x.balance) > 0).length,
    sales: orders.reduce((s, x) => s + Number(x.price || 0), 0),
  }), [orders]);

  const todayOrders = useMemo(() =>
    orders.filter(x => x.due_date === today && !['ชำระเงินแล้ว','ยกเลิก'].includes(x.status)),
    [orders, today]
  );

  const filtered = useMemo(() => orders.filter(o => {
    const q = orderSearch.toLowerCase();
    const matchQ = !q
      || o.title.toLowerCase().includes(q)
      || (o.customers?.name || '').toLowerCase().includes(q)
      || (o.order_code || '').toLowerCase().includes(q);
    return matchQ && (!statusFilter || o.status === statusFilter);
  }), [orders, orderSearch, statusFilter]);

  function show(msg: string) { setMessage(msg); setTimeout(() => setMessage(''), 2500); }

  async function addCustomer(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await supabase.from('customers').insert(customerForm);
    if (res.error) { setError(res.error.message); return; }
    setCustomerForm({ name:'', phone:'', line_id:'', contact_channel:'LINE' });
    show('เพิ่มลูกค้าแล้ว'); load();
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await supabase.from('employees').insert(employeeForm);
    if (res.error) { setError(res.error.message); return; }
    setEmployeeForm({ name:'', position:'', role:'graphic' });
    show('เพิ่มพนักงานแล้ว'); load();
  }

  async function addOrder(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const price = Number(orderForm.price || 0);
    const deposit = Number(orderForm.deposit || 0);
    const row: Record<string, unknown> = {
      ...orderForm,
      customer_id: Number(orderForm.customer_id),
      quantity: Number(orderForm.quantity || 1),
      price, deposit, balance: price - deposit,
      status: 'รับงานใหม่',
      designer_id: orderForm.designer_id ? Number(orderForm.designer_id) : null,
      production_id: orderForm.production_id ? Number(orderForm.production_id) : null,
    };
    const res = await supabase.from('orders').insert(row).select().single();
    if (res.error) { setError(res.error.message); return; }
    await supabase.from('order_status_logs').insert({
      order_id: res.data.id, old_status: '', new_status: 'รับงานใหม่', note: 'เปิดงานใหม่',
    });
    setOrderForm(EMPTY_ORDER);
    show('เปิดงานใหม่แล้ว'); setTab('orders'); load();
  }

  async function changeStatus(order: Order, newStatus: string) {
    setError('');
    const res = await supabase.from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', order.id);
    if (res.error) { setError(res.error.message); return; }
    await supabase.from('order_status_logs').insert({
      order_id: order.id, old_status: order.status, new_status: newStatus, note: 'เปลี่ยนสถานะ',
    });
    show('เปลี่ยนสถานะแล้ว'); load();
  }

  async function markPaid(order: Order) {
    setError('');
    const amount = Number(order.balance || 0) || Number(order.price || 0);
    const p = await supabase.from('payments').insert({
      order_id: order.id, amount,
      payment_method: 'เงินสด/โอน', payment_status: 'paid',
      payment_date: new Date().toISOString(), note: 'บันทึกจ่ายครบ',
    });
    if (p.error) { setError(p.error.message); return; }
    await supabase.from('orders').update({
      balance: 0, status: 'ชำระเงินแล้ว', updated_at: new Date().toISOString(),
    }).eq('id', order.id);
    await supabase.from('order_status_logs').insert({
      order_id: order.id, old_status: order.status, new_status: 'ชำระเงินแล้ว', note: 'บันทึกรับเงิน',
    });
    show('บันทึกรับเงินแล้ว'); load();
  }

  async function deleteCustomer(id: number) {
    if (!confirm('ลบลูกค้านี้?')) return;
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    show('ลบลูกค้าแล้ว'); load();
  }

  async function deleteEmployee(id: number) {
    if (!confirm('ลบพนักงานนี้?')) return;
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    show('ลบพนักงานแล้ว'); load();
  }

  const TABS = [
    ['dashboard','Dashboard'], ['new-order','เปิดงานใหม่'],
    ['orders','งานทั้งหมด'], ['customers','ลูกค้า'], ['employees','พนักงาน'],
  ];

  return (
    <main className="container">
      <div className="top">
        <div>
          <div className="brand">Idea Inkjet Cloud V2</div>
          <div className="sub">ระบบรับงาน + ติดตามสถานะงาน + Supabase Cloud</div>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</button>
      </div>

      {message && <div className="notice">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="tabs">
        {TABS.map(t => (
          <button key={t[0]} onClick={() => setTab(t[0])} className={`tab${tab === t[0] ? ' active' : ''}`}>
            {t[1]}
            {t[0] === 'orders' && stats.overdue > 0 && <span className="badge">{stats.overdue}</span>}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && (
        <section>
          <div className="grid">
            <Stat label="งานทั้งหมด" value={stats.total} />
            <Stat label="งานใหม่" value={stats.new} accent />
            <Stat label="ออกแบบ" value={stats.design} accent />
            <Stat label="ผลิต" value={stats.production} accent />
            <Stat label="ค้างส่ง" value={stats.overdue} danger />
            <Stat label="ค้างชำระ" value={stats.unpaid} danger />
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="sub">ยอดรวมงานทั้งหมด</div>
            <b style={{ fontSize: 30 }}>{stats.sales.toLocaleString()} บาท</b>
          </div>

          {todayOrders.length > 0 && (
            <div className="card alertCard" style={{ marginTop: 12 }}>
              <h3 className="dangerHead">งานนัดส่งวันนี้ ({todayOrders.length} งาน)</h3>
              <MiniTable orders={todayOrders} />
            </div>
          )}

          <div className="card" style={{ marginTop: 12 }}>
            <h3>งานล่าสุด</h3>
            <MiniTable orders={orders.slice(0, 8)} />
          </div>
        </section>
      )}

      {/* New Order */}
      {tab === 'new-order' && (
        <section className="card">
          <h2>เปิดงานใหม่</h2>
          <form className="form" onSubmit={addOrder}>
            <Field label="ลูกค้า" full>
              <select required value={orderForm.customer_id} onChange={e => setOrderForm({ ...orderForm, customer_id: e.target.value })}>
                <option value="">เลือกลูกค้า</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone || 'ไม่มีเบอร์'}</option>)}
              </select>
            </Field>
            <Field label="ชื่องาน" full>
              <input required value={orderForm.title} onChange={e => setOrderForm({ ...orderForm, title: e.target.value })} />
            </Field>
            <Field label="ประเภทงาน">
              <input value={orderForm.order_type} onChange={e => setOrderForm({ ...orderForm, order_type: e.target.value })} />
            </Field>
            <Field label="วันนัดส่ง">
              <input type="date" value={orderForm.due_date} onChange={e => setOrderForm({ ...orderForm, due_date: e.target.value })} />
            </Field>
            <Field label="ขนาด">
              <input value={orderForm.size} onChange={e => setOrderForm({ ...orderForm, size: e.target.value })} placeholder="เช่น 120x240 ซม." />
            </Field>
            <Field label="จำนวน">
              <input type="number" min="1" value={orderForm.quantity} onChange={e => setOrderForm({ ...orderForm, quantity: e.target.value })} />
            </Field>
            <Field label="วัสดุ">
              <input value={orderForm.material} onChange={e => setOrderForm({ ...orderForm, material: e.target.value })} />
            </Field>
            <Field label="ราคา (บาท)">
              <input type="number" min="0" value={orderForm.price} onChange={e => setOrderForm({ ...orderForm, price: e.target.value })} />
            </Field>
            <Field label="มัดจำ (บาท)">
              <input type="number" min="0" value={orderForm.deposit} onChange={e => setOrderForm({ ...orderForm, deposit: e.target.value })} />
            </Field>
            {Number(orderForm.price) > 0 && (
              <div className="balancePreview full">
                ยอดค้างชำระ: <b>{(Number(orderForm.price) - Number(orderForm.deposit)).toLocaleString()} บาท</b>
              </div>
            )}
            <Field label="คนออกแบบ">
              <select value={orderForm.designer_id} onChange={e => setOrderForm({ ...orderForm, designer_id: e.target.value })}>
                <option value="">ยังไม่กำหนด</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </Field>
            <Field label="คนผลิต">
              <select value={orderForm.production_id} onChange={e => setOrderForm({ ...orderForm, production_id: e.target.value })}>
                <option value="">ยังไม่กำหนด</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </Field>
            <Field label="รายละเอียดงาน" full>
              <textarea value={orderForm.detail} onChange={e => setOrderForm({ ...orderForm, detail: e.target.value })} />
            </Field>
            <button type="submit" className="full">บันทึกเปิดงาน</button>
          </form>
        </section>
      )}

      {/* Orders */}
      {tab === 'orders' && (
        <section className="card">
          <div className="tableHeader">
            <h2 style={{ margin: 0 }}>งานทั้งหมด ({filtered.length})</h2>
            <div className="filters">
              <input
                type="search" className="searchInput"
                placeholder="ค้นหาชื่องาน, ลูกค้า..."
                value={orderSearch} onChange={e => setOrderSearch(e.target.value)}
              />
              <select className="filterSelect" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">ทุกสถานะ</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="mobileTable">
            <table>
              <thead>
                <tr>
                  <th>เลขงาน</th><th>ลูกค้า</th><th>งาน</th>
                  <th>สถานะ</th><th>นัดส่ง</th><th>ยอด</th><th>ค้าง</th><th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const isOverdue = !!o.due_date && new Date(o.due_date) < new Date() && !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status);
                  const isExpanded = expandedId === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr className={isExpanded ? 'rowExpanded' : undefined}>
                        <td>
                          <button className="codeBtn" onClick={() => setExpandedId(isExpanded ? null : o.id)}>
                            {o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}
                          </button>
                        </td>
                        <td>{o.customers?.name || '-'}</td>
                        <td>{o.title}</td>
                        <td><StatusPill status={o.status} /></td>
                        <td className={isOverdue ? 'overdue' : undefined}>{o.due_date || '-'}</td>
                        <td>{Number(o.price || 0).toLocaleString()}</td>
                        <td className={Number(o.balance) > 0 ? 'unpaid' : undefined}>{Number(o.balance || 0).toLocaleString()}</td>
                        <td>
                          <div className="rowActions">
                            <select value={o.status} onChange={e => changeStatus(o, e.target.value)}>
                              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {Number(o.balance) > 0 && (
                              <button className="btnGreen" onClick={() => markPaid(o)}>จ่ายครบ</button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="detailRow">
                          <td colSpan={8}>
                            <div className="orderDetail">
                              <span><b>ประเภท:</b> {o.order_type || '-'}</span>
                              <span><b>ขนาด:</b> {o.size || '-'}</span>
                              <span><b>จำนวน:</b> {o.quantity || 1} ชิ้น</span>
                              <span><b>วัสดุ:</b> {o.material || '-'}</span>
                              <span><b>มัดจำ:</b> {Number(o.deposit||0).toLocaleString()} บาท</span>
                              <span><b>ออกแบบโดย:</b> {o.designer?.name || '-'}</span>
                              <span><b>ผลิตโดย:</b> {o.production?.name || '-'}</span>
                              {o.detail && <span className="detailFull"><b>หมายเหตุ:</b> {o.detail}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Customers */}
      {tab === 'customers' && (
        <section className="two">
          <div className="card">
            <h2>เพิ่มลูกค้า</h2>
            <form className="form" onSubmit={addCustomer}>
              <Field label="ชื่อ" full><input required value={customerForm.name} onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })} /></Field>
              <Field label="เบอร์โทร"><input value={customerForm.phone} onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })} /></Field>
              <Field label="Line ID"><input value={customerForm.line_id} onChange={e => setCustomerForm({ ...customerForm, line_id: e.target.value })} /></Field>
              <Field label="ช่องทางติดต่อ" full><input value={customerForm.contact_channel} onChange={e => setCustomerForm({ ...customerForm, contact_channel: e.target.value })} /></Field>
              <button type="submit" className="full">บันทึกลูกค้า</button>
            </form>
          </div>
          <div className="card">
            <h2>รายชื่อลูกค้า ({customers.length})</h2>
            <div className="listBox">
              {customers.map(c => {
                const cnt = orders.filter(o => o.customer_id === c.id).length;
                return (
                  <div key={c.id} className="listRow">
                    <div>
                      <b>{c.name}</b>
                      <span className="sub"> {c.phone || '-'}</span>
                      {c.line_id && <span className="sub"> | Line: {c.line_id}</span>}
                      <span className="countBadge">{cnt} งาน</span>
                    </div>
                    {cnt === 0 && <button className="btnRed btnSm" onClick={() => deleteCustomer(c.id)}>ลบ</button>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Employees */}
      {tab === 'employees' && (
        <section className="two">
          <div className="card">
            <h2>เพิ่มพนักงาน</h2>
            <form className="form" onSubmit={addEmployee}>
              <Field label="ชื่อ" full><input required value={employeeForm.name} onChange={e => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></Field>
              <Field label="ตำแหน่ง" full><input value={employeeForm.position} onChange={e => setEmployeeForm({ ...employeeForm, position: e.target.value })} /></Field>
              <Field label="สิทธิ์" full>
                <select value={employeeForm.role} onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}>
                  <option value="owner">เจ้าของร้าน</option>
                  <option value="admin">แอดมิน</option>
                  <option value="graphic">กราฟิก</option>
                  <option value="production">ช่างผลิต</option>
                </select>
              </Field>
              <button type="submit" className="full">บันทึกพนักงาน</button>
            </form>
          </div>
          <div className="card">
            <h2>พนักงาน ({employees.length})</h2>
            <div className="listBox">
              {employees.map(emp => {
                const cnt = orders.filter(o => o.designer_id === emp.id || o.production_id === emp.id).length;
                return (
                  <div key={emp.id} className="listRow">
                    <div>
                      <b>{emp.name}</b>
                      <span className="sub"> {emp.position || '-'} | {emp.role}</span>
                      <span className="countBadge">{cnt} งาน</span>
                    </div>
                    {cnt === 0 && <button className="btnRed btnSm" onClick={() => deleteEmployee(emp.id)}>ลบ</button>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="card stat">
      <span className="sub">{label}</span>
      <b style={{ color: danger ? '#dc2626' : accent ? '#1d4ed8' : undefined }}>{value}</b>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label className={full ? 'full' : undefined}>{label}{children}</label>;
}

function StatusPill({ status }: { status: string }) {
  const [bg, color] = STATUS_STYLE[status] || ['#e5e7eb', '#374151'];
  return <span className="pill" style={{ background: bg, color }}>{status}</span>;
}

function MiniTable({ orders }: { orders: Order[] }) {
  if (!orders.length) return <p className="sub" style={{ marginTop: 8 }}>ไม่มีข้อมูล</p>;
  return (
    <div className="mobileTable" style={{ marginTop: 8 }}>
      <table>
        <thead>
          <tr><th>เลขงาน</th><th>ลูกค้า</th><th>งาน</th><th>สถานะ</th><th>นัดส่ง</th></tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td>{o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}</td>
              <td>{o.customers?.name || '-'}</td>
              <td>{o.title}</td>
              <td><StatusPill status={o.status} /></td>
              <td>{o.due_date || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
