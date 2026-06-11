'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
type Customer = { id: number; name: string; phone: string; line_id: string; contact_channel: string };
type Employee  = { id: number; name: string; position: string; role: string };
type Order = {
  id: number; order_code: string; title: string; status: string;
  due_date: string; price: number; deposit: number; balance: number;
  customer_id: number; designer_id: number | null; production_id: number | null;
  detail: string; order_type: string; size: string; quantity: number; material: string;
  customers?: Customer; designer?: Employee; production?: Employee;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES = [
  'รับงานใหม่','กำลังออกแบบ','รอลูกค้าตรวจแบบ','ลูกค้าอนุมัติแล้ว',
  'กำลังผลิต','ผลิตเสร็จ','แจ้งลูกค้ามารับ','ลูกค้ารับแล้ว',
  'ชำระเงินแล้ว','ค้างชำระ','ยกเลิก',
];

const STATUS_STYLE: Record<string, [string, string]> = {
  'รับงานใหม่':         ['#dbeafe','#1d4ed8'],
  'กำลังออกแบบ':        ['#fef9c3','#854d0e'],
  'รอลูกค้าตรวจแบบ':   ['#ffedd5','#c2410c'],
  'ลูกค้าอนุมัติแล้ว': ['#dcfce7','#15803d'],
  'กำลังผลิต':          ['#fae8ff','#7e22ce'],
  'ผลิตเสร็จ':          ['#d1fae5','#065f46'],
  'แจ้งลูกค้ามารับ':   ['#ede9fe','#5b21b6'],
  'ลูกค้ารับแล้ว':     ['#ccfbf1','#0f766e'],
  'ชำระเงินแล้ว':      ['#f0fdf4','#16a34a'],
  'ค้างชำระ':           ['#fee2e2','#dc2626'],
  'ยกเลิก':             ['#f3f4f6','#6b7280'],
};

const EMPTY_ORDER = {
  customer_id:'', title:'', order_type:'ป้ายไวนิล', detail:'',
  size:'', quantity:'1', material:'', price:'0', deposit:'0',
  due_date:'', designer_id:'', production_id:'',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtMoney = (n?: number) => Number(n || 0).toLocaleString('th-TH');
const fmtDate  = (d?: string) => {
  if (!d) return '-';
  const [y,m,day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' });
};
const orderCode = (o: Order) => o.order_code || `JOB-${String(o.id).padStart(4,'0')}`;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  // Core
  const [tab, setTab]             = useState('dashboard');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [message, setMessage]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  // Create forms
  const [custForm, setCustForm]   = useState({ name:'', phone:'', line_id:'', contact_channel:'LINE' });
  const [empForm,  setEmpForm]    = useState({ name:'', position:'', role:'graphic' });
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER);

  // Filter / search
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [quickFilter,  setQuickFilter]  = useState('');
  const [expandedId,   setExpandedId]   = useState<number | null>(null);

  // Edit-order modal
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editForm,     setEditForm]     = useState(EMPTY_ORDER);

  // Payment modal
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [payForm,     setPayForm]     = useState({ amount:'', method:'เงินสด' });

  // Print modal
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  // Edit-customer modal
  const [editCust,     setEditCust]     = useState<Customer | null>(null);
  const [editCustForm, setEditCustForm] = useState({ name:'', phone:'', line_id:'', contact_channel:'' });

  // Edit-employee modal
  const [editEmp,     setEditEmp]     = useState<Employee | null>(null);
  const [editEmpForm, setEditEmpForm] = useState({ name:'', position:'', role:'graphic' });

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true); setError('');
    const [c, e, o] = await Promise.all([
      supabase.from('customers').select('*').order('id', { ascending: false }),
      supabase.from('employees').select('*').order('id', { ascending: false }),
      supabase.from('orders').select('*').order('id', { ascending: false }),
    ]);
    setLoading(false);
    if (c.error || e.error || o.error) {
      setError(c.error?.message || e.error?.message || o.error?.message || 'โหลดข้อมูลไม่สำเร็จ'); return;
    }
    // Normalize column names — DB may use employee_name / customer_name
    const custNorm: Customer[] = (c.data || []).map((x: any) => ({
      id: x.id,
      name: x.name ?? x.customer_name ?? '',
      phone: x.phone ?? '',
      line_id: x.line_id ?? '',
      contact_channel: x.contact_channel ?? 'LINE',
    }));
    const empNorm: Employee[] = (e.data || []).map((x: any) => ({
      id: x.id,
      name: x.name ?? x.employee_name ?? '',
      position: x.position ?? '',
      role: x.role ?? 'graphic',
    }));
    const custMap = Object.fromEntries(custNorm.map(x => [x.id, x]));
    const empMap  = Object.fromEntries(empNorm.map(x => [x.id, x]));
    const enriched = (o.data || []).map((row: any) => ({
      ...row,
      customers:  custMap[row.customer_id]   ?? undefined,
      designer:   empMap[row.designer_id]    ?? undefined,
      production: empMap[row.production_id]  ?? undefined,
    }));
    setCustomers(custNorm);
    setEmployees(empNorm);
    setOrders(enriched);
  }
  useEffect(() => { load(); }, []);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const active = orders.filter(x => !['ชำระเงินแล้ว','ยกเลิก'].includes(x.status));
    return {
      total:      orders.length,
      new:        orders.filter(x => x.status === 'รับงานใหม่').length,
      design:     orders.filter(x => x.status === 'กำลังออกแบบ').length,
      production: orders.filter(x => x.status === 'กำลังผลิต').length,
      overdue:    active.filter(x => x.due_date && new Date(x.due_date) < new Date()).length,
      unpaid:     orders.filter(x => Number(x.balance) > 0).length,
      sales:      orders.reduce((s, x) => s + Number(x.price || 0), 0),
      collected:  orders.filter(x => x.status === 'ชำระเงินแล้ว').reduce((s, x) => s + Number(x.price || 0), 0),
      outstanding: orders.reduce((s, x) => s + Number(x.balance || 0), 0),
    };
  }, [orders]);

  const todayOrders = useMemo(() =>
    orders.filter(x => x.due_date === today && !['ชำระเงินแล้ว','ยกเลิก'].includes(x.status)),
    [orders, today]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o => {
      if (q && !o.title.toLowerCase().includes(q) &&
              !(o.customers?.name || '').toLowerCase().includes(q) &&
              !orderCode(o).toLowerCase().includes(q)) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      const active = !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status);
      if (quickFilter === 'today'   && !(o.due_date === today && active)) return false;
      if (quickFilter === 'overdue' && !(o.due_date && new Date(o.due_date) < new Date() && active)) return false;
      if (quickFilter === 'unpaid'  && !(Number(o.balance) > 0)) return false;
      if (quickFilter === 'production' && o.status !== 'กำลังผลิต') return false;
      return true;
    });
  }, [orders, search, statusFilter, quickFilter, today]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  function show(msg: string) { setMessage(msg); setTimeout(() => setMessage(''), 2500); }

  // ── Create ────────────────────────────────────────────────────────────────
  async function addCustomer(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await supabase.from('customers').insert({
      customer_name: custForm.name,
      phone: custForm.phone,
      line_id: custForm.line_id,
      contact_channel: custForm.contact_channel,
    });
    if (res.error) {
      // Fallback: DB might use 'name' column instead
      const res2 = await supabase.from('customers').insert(custForm);
      if (res2.error) { setError(res2.error.message); return; }
    }
    setCustForm({ name:'', phone:'', line_id:'', contact_channel:'LINE' });
    show('เพิ่มลูกค้าแล้ว'); load();
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await supabase.from('employees').insert({
      employee_name: empForm.name,
      position: empForm.position,
      role: empForm.role,
    });
    if (res.error) { setError(res.error.message); return; }
    setEmpForm({ name:'', position:'', role:'graphic' });
    show('เพิ่มพนักงานแล้ว'); load();
  }

  async function addOrder(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const price   = Number(orderForm.price   || 0);
    const deposit = Number(orderForm.deposit || 0);
    const row: Record<string, unknown> = {
      ...orderForm,
      customer_id:   Number(orderForm.customer_id),
      quantity:      Number(orderForm.quantity || 1),
      price, deposit, balance: price - deposit,
      status: 'รับงานใหม่',
      designer_id:   orderForm.designer_id   ? Number(orderForm.designer_id)   : null,
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

  // ── Update ────────────────────────────────────────────────────────────────
  function openEditOrder(o: Order) {
    setEditingOrder(o);
    setEditForm({
      customer_id:   String(o.customer_id || ''),
      title:         o.title || '',
      order_type:    o.order_type || 'ป้ายไวนิล',
      detail:        o.detail || '',
      size:          o.size || '',
      quantity:      String(o.quantity || 1),
      material:      o.material || '',
      price:         String(o.price || 0),
      deposit:       String(o.deposit || 0),
      due_date:      o.due_date || '',
      designer_id:   o.designer_id   ? String(o.designer_id)   : '',
      production_id: o.production_id ? String(o.production_id) : '',
    });
  }

  async function updateOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrder) return;
    setError('');
    const price   = Number(editForm.price   || 0);
    const deposit = Number(editForm.deposit || 0);
    // Preserve already-paid amounts when price/deposit didn't change
    const priceChanged   = price   !== Number(editingOrder.price);
    const depositChanged = deposit !== Number(editingOrder.deposit);
    let balance: number;
    if (priceChanged || depositChanged) {
      const alreadyPaid = Math.max(0, (Number(editingOrder.price) - Number(editingOrder.deposit)) - Number(editingOrder.balance));
      balance = Math.max(0, (price - deposit) - alreadyPaid);
    } else {
      balance = Number(editingOrder.balance);
    }
    const res = await supabase.from('orders').update({
      customer_id:   Number(editForm.customer_id),
      title:         editForm.title,
      order_type:    editForm.order_type,
      detail:        editForm.detail,
      size:          editForm.size,
      quantity:      Number(editForm.quantity || 1),
      material:      editForm.material,
      price, deposit, balance,
      due_date:      editForm.due_date || null,
      designer_id:   editForm.designer_id   ? Number(editForm.designer_id)   : null,
      production_id: editForm.production_id ? Number(editForm.production_id) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', editingOrder.id);
    if (res.error) { setError(res.error.message); return; }
    setEditingOrder(null);
    show('แก้ไขงานแล้ว'); load();
  }

  function openEditCustomer(c: Customer) {
    setEditCust(c);
    setEditCustForm({ name: c.name, phone: c.phone || '', line_id: c.line_id || '', contact_channel: c.contact_channel || '' });
  }

  async function updateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!editCust) return;
    setError('');
    const res = await supabase.from('customers').update({
      customer_name: editCustForm.name,
      phone: editCustForm.phone,
      line_id: editCustForm.line_id,
      contact_channel: editCustForm.contact_channel,
    }).eq('id', editCust.id);
    if (res.error) {
      // Fallback: DB might use 'name' column instead
      const res2 = await supabase.from('customers').update(editCustForm).eq('id', editCust.id);
      if (res2.error) { setError(res2.error.message); return; }
      setEditCust(null); show('แก้ไขลูกค้าแล้ว'); load(); return;
    }
    if (res.error) { setError(res.error.message); return; }
    setEditCust(null);
    show('แก้ไขลูกค้าแล้ว'); load();
  }

  function openEditEmployee(emp: Employee) {
    setEditEmp(emp);
    setEditEmpForm({ name: emp.name, position: emp.position || '', role: emp.role || 'graphic' });
  }

  async function updateEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmp) return;
    setError('');
    const res = await supabase.from('employees').update({
      employee_name: editEmpForm.name,
      position: editEmpForm.position,
      role: editEmpForm.role,
    }).eq('id', editEmp.id);
    if (res.error) { setError(res.error.message); return; }
    setEditEmp(null);
    show('แก้ไขพนักงานแล้ว'); load();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
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

  // ── Order actions ─────────────────────────────────────────────────────────
  async function changeStatus(o: Order, newStatus: string) {
    setError('');
    const res = await supabase.from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', o.id);
    if (res.error) { setError(res.error.message); return; }
    await supabase.from('order_status_logs').insert({
      order_id: o.id, old_status: o.status, new_status: newStatus, note: 'เปลี่ยนสถานะ',
    });
    show('เปลี่ยนสถานะแล้ว'); load();
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payingOrder) return;
    setError('');
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) { setError('กรุณาระบุจำนวนเงินที่รับ'); return; }
    const p = await supabase.from('payments').insert({
      order_id: payingOrder.id, amount,
      payment_method: payForm.method, payment_status: 'paid',
      payment_date: new Date().toISOString(), note: `รับเงิน ${payForm.method}`,
    });
    if (p.error) { setError(p.error.message); return; }
    const newBalance = Math.max(0, Number(payingOrder.balance || 0) - amount);
    const newStatus  = newBalance === 0 ? 'ชำระเงินแล้ว' : payingOrder.status;
    await supabase.from('orders').update({
      balance: newBalance, status: newStatus, updated_at: new Date().toISOString(),
    }).eq('id', payingOrder.id);
    if (newBalance === 0 && newStatus !== payingOrder.status) {
      await supabase.from('order_status_logs').insert({
        order_id: payingOrder.id, old_status: payingOrder.status, new_status: 'ชำระเงินแล้ว',
        note: `รับเงิน ${fmtMoney(amount)} บาท ครบ`,
      });
    }
    setPayingOrder(null);
    setPayForm({ amount:'', method:'เงินสด' });
    show('บันทึกรับเงินแล้ว'); load();
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TABS = [
    ['dashboard','Dashboard'], ['new-order','เปิดงานใหม่'],
    ['orders','งานทั้งหมด'],   ['customers','ลูกค้า'], ['employees','พนักงาน'],
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="container">
      {/* Header */}
      <div className="top">
        <div>
          <div className="brand">Idea Inkjet Cloud V2</div>
          <div className="sub">ระบบรับงาน + ติดตามสถานะงาน + Supabase Cloud</div>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</button>
      </div>

      {message && <div className="notice">{message}</div>}
      {error   && <div className="notice error">{error}</div>}

      {/* Tab bar */}
      <div className="tabs">
        {TABS.map(t => (
          <button key={t[0]} onClick={() => setTab(t[0])} className={`tab${tab === t[0] ? ' active' : ''}`}>
            {t[1]}
            {t[0] === 'orders' && stats.overdue > 0 && <span className="badge">{stats.overdue}</span>}
          </button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══════════════════════════════════════════════════════ */}
      {tab === 'dashboard' && (
        <section>
          <div className="grid">
            <Stat label="งานทั้งหมด"  value={stats.total} />
            <Stat label="งานใหม่"     value={stats.new}        accent />
            <Stat label="ออกแบบ"      value={stats.design}     accent />
            <Stat label="ผลิต"        value={stats.production} accent />
            <Stat label="ค้างส่ง"     value={stats.overdue}    danger />
            <Stat label="ค้างชำระ"    value={stats.unpaid}     danger />
          </div>

          <div className="statsRow">
            <div className="card statWide">
              <div className="sub">ยอดรวมงานทั้งหมด</div>
              <b style={{ fontSize: 28 }}>{fmtMoney(stats.sales)} บาท</b>
            </div>
            <div className="card statWide">
              <div className="sub">เก็บแล้ว</div>
              <b style={{ fontSize: 28, color:'#16a34a' }}>{fmtMoney(stats.collected)} บาท</b>
            </div>
            <div className="card statWide">
              <div className="sub">ยังค้างชำระ</div>
              <b style={{ fontSize: 28, color: stats.outstanding > 0 ? '#dc2626' : undefined }}>
                {fmtMoney(stats.outstanding)} บาท
              </b>
            </div>
          </div>

          {todayOrders.length > 0 && (
            <div className="card alertCard" style={{ marginTop:12 }}>
              <h3 className="dangerHead">งานนัดส่งวันนี้ ({todayOrders.length} งาน)</h3>
              <MiniTable orders={todayOrders} />
            </div>
          )}

          <div className="card" style={{ marginTop:12 }}>
            <h3 style={{ margin:'0 0 8px' }}>งานล่าสุด</h3>
            <MiniTable orders={orders.slice(0,10)} />
          </div>
        </section>
      )}

      {/* ═══ NEW ORDER ═══════════════════════════════════════════════════════ */}
      {tab === 'new-order' && (
        <section className="card">
          <h2>เปิดงานใหม่</h2>
          <OrderForm
            form={orderForm} setForm={setOrderForm}
            customers={customers} employees={employees}
            onSubmit={addOrder} submitLabel="บันทึกเปิดงาน"
          />
        </section>
      )}

      {/* ═══ ORDERS ══════════════════════════════════════════════════════════ */}
      {tab === 'orders' && (
        <section className="card">
          <div className="tableHeader">
            <h2 style={{ margin:0 }}>งานทั้งหมด ({filtered.length})</h2>
            <div className="filters">
              <input type="search" className="searchInput" placeholder="ค้นหาชื่องาน, ลูกค้า..."
                value={search} onChange={e => setSearch(e.target.value)} />
              <select className="filterSelect" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">ทุกสถานะ</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Quick filter chips */}
          <div className="quickFilters">
            {([
              ['',           'ทั้งหมด'],
              ['today',      `วันนี้ (${todayOrders.length})`],
              ['overdue',    `ค้างส่ง (${stats.overdue})`],
              ['unpaid',     `ค้างชำระ (${stats.unpaid})`],
              ['production', `กำลังผลิต (${stats.production})`],
            ] as [string,string][]).map(([v,l]) => (
              <button key={v} className={`qBtn${quickFilter===v?' active':''}`} onClick={() => setQuickFilter(v)}>{l}</button>
            ))}
          </div>

          <div className="mobileTable">
            <table>
              <thead>
                <tr><th>เลขงาน</th><th>ลูกค้า</th><th>งาน</th><th>สถานะ</th><th>นัดส่ง</th><th>ยอด</th><th>ค้าง</th><th>จัดการ</th></tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const isOverdue  = !!o.due_date && new Date(o.due_date) < new Date() && !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status);
                  const isExpanded = expandedId === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr className={isExpanded ? 'rowExpanded' : undefined}>
                        <td>
                          <button className="codeBtn" onClick={() => setExpandedId(isExpanded ? null : o.id)}>
                            {orderCode(o)}
                          </button>
                        </td>
                        <td>{o.customers?.name || '-'}</td>
                        <td>{o.title}</td>
                        <td><StatusPill status={o.status} /></td>
                        <td className={isOverdue ? 'overdue' : undefined}>{o.due_date || '-'}</td>
                        <td>{fmtMoney(o.price)}</td>
                        <td className={Number(o.balance) > 0 ? 'unpaid' : undefined}>{fmtMoney(o.balance)}</td>
                        <td>
                          <div className="rowActions">
                            <select value={o.status} onChange={e => changeStatus(o, e.target.value)}>
                              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {Number(o.balance) > 0 && (
                              <button className="btnGreen" onClick={() => {
                                setPayingOrder(o);
                                setPayForm({ amount: String(o.balance), method:'เงินสด' });
                              }}>รับเงิน</button>
                            )}
                            <button className="btn2" onClick={() => openEditOrder(o)}>แก้ไข</button>
                            <button className="btnPrint" onClick={() => setPrintOrder(o)}>พิมพ์</button>
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
                              <span><b>มัดจำ:</b> {fmtMoney(o.deposit)} บาท</span>
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
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="emptyRow">ไม่พบงานที่ตรงกับการค้นหา</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ═══ CUSTOMERS ═══════════════════════════════════════════════════════ */}
      {tab === 'customers' && (
        <section className="two">
          <div className="card">
            <h2>เพิ่มลูกค้า</h2>
            <form className="form" onSubmit={addCustomer}>
              <Field label="ชื่อ" full><input required value={custForm.name} onChange={e => setCustForm({...custForm, name:e.target.value})} /></Field>
              <Field label="เบอร์โทร"><input value={custForm.phone} onChange={e => setCustForm({...custForm, phone:e.target.value})} /></Field>
              <Field label="Line ID"><input value={custForm.line_id} onChange={e => setCustForm({...custForm, line_id:e.target.value})} /></Field>
              <Field label="ช่องทางติดต่อ" full><input value={custForm.contact_channel} onChange={e => setCustForm({...custForm, contact_channel:e.target.value})} /></Field>
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
                    <div className="rowActions">
                      <button className="btn2 btnSm" onClick={() => openEditCustomer(c)}>แก้ไข</button>
                      {cnt === 0 && <button className="btnRed btnSm" onClick={() => deleteCustomer(c.id)}>ลบ</button>}
                    </div>
                  </div>
                );
              })}
              {customers.length === 0 && <p className="sub">ยังไม่มีลูกค้า</p>}
            </div>
          </div>
        </section>
      )}

      {/* ═══ EMPLOYEES ═══════════════════════════════════════════════════════ */}
      {tab === 'employees' && (
        <section className="two">
          <div className="card">
            <h2>เพิ่มพนักงาน</h2>
            <form className="form" onSubmit={addEmployee}>
              <Field label="ชื่อ" full><input required value={empForm.name} onChange={e => setEmpForm({...empForm, name:e.target.value})} /></Field>
              <Field label="ตำแหน่ง" full><input value={empForm.position} onChange={e => setEmpForm({...empForm, position:e.target.value})} /></Field>
              <Field label="สิทธิ์" full>
                <select value={empForm.role} onChange={e => setEmpForm({...empForm, role:e.target.value})}>
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
                    <div className="rowActions">
                      <button className="btn2 btnSm" onClick={() => openEditEmployee(emp)}>แก้ไข</button>
                      {cnt === 0 && <button className="btnRed btnSm" onClick={() => deleteEmployee(emp.id)}>ลบ</button>}
                    </div>
                  </div>
                );
              })}
              {employees.length === 0 && <p className="sub">ยังไม่มีพนักงาน</p>}
            </div>
          </div>
        </section>
      )}

      {/* ═══ MODALS ══════════════════════════════════════════════════════════ */}

      {/* Edit Order */}
      {editingOrder && (
        <Modal title={`แก้ไขงาน — ${orderCode(editingOrder)}`} onClose={() => setEditingOrder(null)}>
          <OrderForm
            form={editForm} setForm={setEditForm}
            customers={customers} employees={employees}
            onSubmit={updateOrder} submitLabel="บันทึกแก้ไข"
          />
        </Modal>
      )}

      {/* Payment */}
      {payingOrder && (
        <Modal title="บันทึกรับเงิน" onClose={() => setPayingOrder(null)}>
          <div className="payInfo">
            <div className="payInfoRow"><span>งาน</span><b>{payingOrder.title}</b></div>
            <div className="payInfoRow"><span>ลูกค้า</span><b>{payingOrder.customers?.name || '-'}</b></div>
            <div className="payInfoRow"><span>ราคารวม</span><b>{fmtMoney(payingOrder.price)} บาท</b></div>
            <div className="payInfoRow"><span>ยอดค้าง</span><b className="redText">{fmtMoney(payingOrder.balance)} บาท</b></div>
          </div>
          <form className="form" onSubmit={recordPayment}>
            <Field label="จำนวนเงินที่รับ (บาท)" full>
              <input type="number" min="1" required autoFocus
                value={payForm.amount} onChange={e => setPayForm({...payForm, amount:e.target.value})} />
            </Field>
            <Field label="ช่องทางชำระเงิน" full>
              <select value={payForm.method} onChange={e => setPayForm({...payForm, method:e.target.value})}>
                <option value="เงินสด">เงินสด</option>
                <option value="โอนธนาคาร">โอนธนาคาร</option>
                <option value="พร้อมเพย์">พร้อมเพย์</option>
                <option value="QR Code">QR Code</option>
              </select>
            </Field>
            {payForm.amount && Number(payForm.amount) >= Number(payingOrder.balance) && (
              <div className="balancePreview full">สถานะจะเปลี่ยนเป็น <b>ชำระเงินแล้ว</b> อัตโนมัติ</div>
            )}
            <button type="submit" className="full btnGreen">บันทึกรับเงิน</button>
          </form>
        </Modal>
      )}

      {/* Edit Customer */}
      {editCust && (
        <Modal title="แก้ไขลูกค้า" onClose={() => setEditCust(null)}>
          <form className="form" onSubmit={updateCustomer}>
            <Field label="ชื่อ" full><input required value={editCustForm.name} onChange={e => setEditCustForm({...editCustForm, name:e.target.value})} /></Field>
            <Field label="เบอร์โทร"><input value={editCustForm.phone} onChange={e => setEditCustForm({...editCustForm, phone:e.target.value})} /></Field>
            <Field label="Line ID"><input value={editCustForm.line_id} onChange={e => setEditCustForm({...editCustForm, line_id:e.target.value})} /></Field>
            <Field label="ช่องทางติดต่อ" full><input value={editCustForm.contact_channel} onChange={e => setEditCustForm({...editCustForm, contact_channel:e.target.value})} /></Field>
            <button type="submit" className="full">บันทึกแก้ไข</button>
          </form>
        </Modal>
      )}

      {/* Edit Employee */}
      {editEmp && (
        <Modal title="แก้ไขพนักงาน" onClose={() => setEditEmp(null)}>
          <form className="form" onSubmit={updateEmployee}>
            <Field label="ชื่อ" full><input required value={editEmpForm.name} onChange={e => setEditEmpForm({...editEmpForm, name:e.target.value})} /></Field>
            <Field label="ตำแหน่ง" full><input value={editEmpForm.position} onChange={e => setEditEmpForm({...editEmpForm, position:e.target.value})} /></Field>
            <Field label="สิทธิ์" full>
              <select value={editEmpForm.role} onChange={e => setEditEmpForm({...editEmpForm, role:e.target.value})}>
                <option value="owner">เจ้าของร้าน</option>
                <option value="admin">แอดมิน</option>
                <option value="graphic">กราฟิก</option>
                <option value="production">ช่างผลิต</option>
              </select>
            </Field>
            <button type="submit" className="full">บันทึกแก้ไข</button>
          </form>
        </Modal>
      )}

      {/* Print Slip */}
      {printOrder && (
        <Modal title="ใบรับงาน" onClose={() => setPrintOrder(null)}>
          <div className="printContent">
            <PrintSlip order={printOrder} />
          </div>
          <div className="printActions">
            <button className="btnGreen" onClick={() => window.print()}>พิมพ์ / Save PDF</button>
            <button className="btn2"     onClick={() => setPrintOrder(null)}>ปิด</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

// ─── Reusable OrderForm (shared by new-order and edit-order) ──────────────────
type OrderFormProps = {
  form: typeof EMPTY_ORDER;
  setForm: (f: typeof EMPTY_ORDER) => void;
  customers: Customer[];
  employees: Employee[];
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
};

function OrderForm({ form, setForm, customers, employees, onSubmit, submitLabel }: OrderFormProps) {
  const balance = Number(form.price || 0) - Number(form.deposit || 0);
  return (
    <form className="form" onSubmit={onSubmit}>
      <Field label="ลูกค้า" full>
        <select required value={form.customer_id} onChange={e => setForm({...form, customer_id:e.target.value})}>
          <option value="">เลือกลูกค้า</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone || 'ไม่มีเบอร์'}</option>)}
        </select>
      </Field>
      <Field label="ชื่องาน" full>
        <input required value={form.title} onChange={e => setForm({...form, title:e.target.value})} />
      </Field>
      <Field label="ประเภทงาน">
        <input value={form.order_type} onChange={e => setForm({...form, order_type:e.target.value})} />
      </Field>
      <Field label="วันนัดส่ง">
        <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})} />
      </Field>
      <Field label="ขนาด">
        <input value={form.size} onChange={e => setForm({...form, size:e.target.value})} placeholder="เช่น 120x240 ซม." />
      </Field>
      <Field label="จำนวน">
        <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})} />
      </Field>
      <Field label="วัสดุ" full>
        <input value={form.material} onChange={e => setForm({...form, material:e.target.value})} />
      </Field>
      <Field label="ราคา (บาท)">
        <input type="number" min="0" value={form.price} onChange={e => setForm({...form, price:e.target.value})} />
      </Field>
      <Field label="มัดจำ (บาท)">
        <input type="number" min="0" value={form.deposit} onChange={e => setForm({...form, deposit:e.target.value})} />
      </Field>
      {Number(form.price) > 0 && (
        <div className={`balancePreview full${balance < 0 ? ' balanceWarn' : ''}`}>
          ยอดค้างชำระ: <b>{fmtMoney(balance)} บาท</b>
          {balance < 0 && ' (มัดจำเกินราคา)'}
        </div>
      )}
      <Field label="คนออกแบบ">
        <select value={form.designer_id} onChange={e => setForm({...form, designer_id:e.target.value})}>
          <option value="">ยังไม่กำหนด</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      </Field>
      <Field label="คนผลิต">
        <select value={form.production_id} onChange={e => setForm({...form, production_id:e.target.value})}>
          <option value="">ยังไม่กำหนด</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      </Field>
      <Field label="รายละเอียดงาน" full>
        <textarea value={form.detail} onChange={e => setForm({...form, detail:e.target.value})} />
      </Field>
      <button type="submit" className="full">{submitLabel}</button>
    </form>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalBox" onClick={e => e.stopPropagation()}>
        <div className="modalHead">
          <h2 style={{ margin:0, fontSize:18 }}>{title}</h2>
          <button className="closeBtn" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
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
  const [bg, color] = STATUS_STYLE[status] || ['#e5e7eb','#374151'];
  return <span className="pill" style={{ background: bg, color }}>{status}</span>;
}

function MiniTable({ orders }: { orders: Order[] }) {
  if (!orders.length) return <p className="sub" style={{ marginTop:8 }}>ไม่มีข้อมูล</p>;
  return (
    <div className="mobileTable" style={{ marginTop:8 }}>
      <table>
        <thead><tr><th>เลขงาน</th><th>ลูกค้า</th><th>งาน</th><th>สถานะ</th><th>นัดส่ง</th></tr></thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td>{orderCode(o)}</td>
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

function PrintSlip({ order }: { order: Order }) {
  const code = orderCode(order);
  return (
    <div className="slip">
      <div className="slipHeader">
        <div className="slipShop">Idea Inkjet</div>
        <div className="slipDocType">ใบรับงาน / Work Order</div>
        <div className="slipCode">{code}</div>
      </div>

      <div className="slipSection">
        <div className="slipRow"><span>วันนัดส่ง</span><b>{fmtDate(order.due_date)}</b></div>
        <div className="slipRow"><span>สถานะ</span><b>{order.status}</b></div>
      </div>

      <div className="slipSection">
        <div className="slipSectionTitle">ข้อมูลลูกค้า</div>
        <div className="slipRow"><span>ชื่อ</span><b>{order.customers?.name || '-'}</b></div>
        <div className="slipRow"><span>โทร</span><b>{order.customers?.phone || '-'}</b></div>
        {order.customers?.line_id && <div className="slipRow"><span>Line</span><b>{order.customers.line_id}</b></div>}
        {order.customers?.contact_channel && order.customers.contact_channel !== 'LINE' &&
          <div className="slipRow"><span>ช่องทาง</span><b>{order.customers.contact_channel}</b></div>}
      </div>

      <div className="slipSection">
        <div className="slipSectionTitle">รายละเอียดงาน</div>
        <div className="slipRow"><span>ชื่องาน</span><b>{order.title}</b></div>
        {order.order_type && <div className="slipRow"><span>ประเภท</span><b>{order.order_type}</b></div>}
        {order.size       && <div className="slipRow"><span>ขนาด</span><b>{order.size}</b></div>}
        <div className="slipRow"><span>จำนวน</span><b>{order.quantity || 1} ชิ้น</b></div>
        {order.material   && <div className="slipRow"><span>วัสดุ</span><b>{order.material}</b></div>}
        {order.designer   && <div className="slipRow"><span>ออกแบบ</span><b>{order.designer.name}</b></div>}
        {order.production && <div className="slipRow"><span>ผลิต</span><b>{order.production.name}</b></div>}
        {order.detail     && <div className="slipNote">{order.detail}</div>}
      </div>

      <div className="slipSection slipPriceSection">
        <div className="slipSectionTitle">ราคา</div>
        <div className="slipRow"><span>ราคารวม</span><b>{fmtMoney(order.price)} บาท</b></div>
        <div className="slipRow"><span>มัดจำ</span><b>{fmtMoney(order.deposit)} บาท</b></div>
        <div className="slipRow slipBalance"><span>ยอดค้างชำระ</span><b>{fmtMoney(order.balance)} บาท</b></div>
      </div>

      <div className="slipSignRow">
        <div className="slipSign"><div className="signLine" /><span>ลายเซ็นลูกค้า</span></div>
        <div className="slipSign"><div className="signLine" /><span>ลายเซ็นพนักงาน</span></div>
      </div>

      <div className="slipFooter">พิมพ์วันที่ {new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' })}</div>
    </div>
  );
}
