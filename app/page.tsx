'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
type Customer  = { id: number; name: string; phone: string; line_id: string; contact_channel: string };
type Employee  = { id: number; name: string; position: string; role: string };
type StatusLog = { id: number; order_id: number; old_status: string; new_status: string; note: string; created_at: string };
type Order = {
  id: number; order_code: string; title: string; status: string;
  due_date: string; price: number; deposit: number; balance: number;
  customer_id: number; designer_id: number | null; production_id: number | null;
  detail: string; order_type: string; size: string; quantity: number; material: string;
  created_at: string;
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

// ─── Self-healing DB layer ────────────────────────────────────────────────────
const colMap: Record<string, Record<string, string>> = {};

function applyMap(table: string, data: Record<string, any>): Record<string, any> {
  const m = colMap[table];
  if (!m) return data;
  const out: Record<string, any> = { ...data };
  for (const [k, v] of Object.entries(m)) {
    if (k in out && !(v in out)) { out[v] = out[k]; delete out[k]; }
  }
  return out;
}

function tryLearn(table: string, msg: string): boolean {
  const m = msg.match(/null value in column "([^"]+)"/);
  if (!m) return false;
  const dbCol    = m[1];
  const prefix   = table.replace(/s$/, '') + '_';
  const shortCol = dbCol.startsWith(prefix) ? dbCol.slice(prefix.length) : null;
  if (!shortCol) return false;
  colMap[table] = { ...(colMap[table] ?? {}), [shortCol]: dbCol };
  return true;
}

async function dbInsert(table: string, data: Record<string, any>) {
  const res = await supabase.from(table).insert(applyMap(table, data)).select().single();
  if (!res.error) return res;
  if (tryLearn(table, res.error.message)) {
    return supabase.from(table).insert(applyMap(table, data)).select().single();
  }
  return res;
}

async function dbUpdate(table: string, id: number, data: Record<string, any>) {
  const res = await supabase.from(table).update(applyMap(table, data)).eq('id', id);
  if (!res.error) return res;
  if (tryLearn(table, res.error.message)) {
    return supabase.from(table).update(applyMap(table, data)).eq('id', id);
  }
  return res;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab]             = useState('dashboard');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [message, setMessage]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [role, setRole]           = useState<'owner' | 'employee' | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);

  const [custForm, setCustForm]   = useState({ name:'', phone:'', line_id:'', contact_channel:'LINE' });
  const [empForm,  setEmpForm]    = useState({ name:'', position:'', role:'graphic' });
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER);

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [quickFilter,  setQuickFilter]  = useState('');
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  const [orderLogs,   setOrderLogs]   = useState<StatusLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFor,     setLogsFor]     = useState<number | null>(null);

  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editForm,     setEditForm]     = useState(EMPTY_ORDER);
  const [payingOrder,  setPayingOrder]  = useState<Order | null>(null);
  const [payForm,      setPayForm]      = useState({ amount:'', method:'เงินสด' });
  const [printOrder,   setPrintOrder]   = useState<Order | null>(null);
  const [editCust,     setEditCust]     = useState<Customer | null>(null);
  const [editCustForm, setEditCustForm] = useState({ name:'', phone:'', line_id:'', contact_channel:'' });
  const [editEmp,      setEditEmp]      = useState<Employee | null>(null);
  const [editEmpForm,  setEditEmpForm]  = useState({ name:'', position:'', role:'graphic' });

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true); setError('');
    const [c, e, o] = await Promise.all([
      supabase.from('customers').select('*').order('id', { ascending: false }),
      supabase.from('employees').select('*').order('id', { ascending: false }),
      supabase.from('orders').select('*').order('id', { ascending: false }),
    ]);
    setLoading(false); setInitialized(true);
    if (c.error || e.error || o.error) {
      setError(c.error?.message || e.error?.message || o.error?.message || 'โหลดข้อมูลไม่สำเร็จ'); return;
    }
    const custNorm: Customer[] = (c.data || []).map((x: any) => ({
      id: x.id, name: x.name ?? x.customer_name ?? '',
      phone: x.phone ?? '', line_id: x.line_id ?? '', contact_channel: x.contact_channel ?? 'LINE',
    }));
    const empNorm: Employee[] = (e.data || []).map((x: any) => ({
      id: x.id, name: x.name ?? x.employee_name ?? '',
      position: x.position ?? '', role: x.role ?? 'graphic',
    }));
    const custMap = Object.fromEntries(custNorm.map(x => [x.id, x]));
    const empMap  = Object.fromEntries(empNorm.map(x => [x.id, x]));
    const ordNorm = (o.data || []).map((row: any) => ({
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
      created_at: row.created_at ?? null,
      customers:  custMap[row.customer_id]  ?? undefined,
      designer:   empMap[row.designer_id]   ?? undefined,
      production: empMap[row.production_id] ?? undefined,
    }));
    setCustomers(custNorm); setEmployees(empNorm); setOrders(ordNorm);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const r = localStorage.getItem('iij_role') as 'owner' | 'employee' | null;
    const e = localStorage.getItem('iij_emp');
    if (r) setRole(r);
    if (e) setSelectedEmpId(Number(e));
  }, []);

  function doLogin(r: 'owner' | 'employee', empId?: number) {
    setRole(r); localStorage.setItem('iij_role', r);
    if (empId !== undefined) { setSelectedEmpId(empId); localStorage.setItem('iij_emp', String(empId)); }
  }
  function doLogout() {
    setRole(null); setSelectedEmpId(null);
    localStorage.removeItem('iij_role'); localStorage.removeItem('iij_emp');
  }

  async function loadOrderLogs(orderId: number) {
    setLogsLoading(true); setLogsFor(orderId);
    const { data } = await supabase.from('order_status_logs')
      .select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    setOrderLogs(data || []); setLogsLoading(false);
  }

  // ── Computed ──────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const active = orders.filter(x => !['ชำระเงินแล้ว','ยกเลิก'].includes(x.status));
    return {
      total:       orders.length,
      new:         orders.filter(x => x.status === 'รับงานใหม่').length,
      design:      orders.filter(x => x.status === 'กำลังออกแบบ').length,
      production:  orders.filter(x => x.status === 'กำลังผลิต').length,
      overdue:     active.filter(x => x.due_date && new Date(x.due_date) < new Date()).length,
      unpaid:      orders.filter(x => Number(x.balance) > 0).length,
      sales:       orders.reduce((s, x) => s + Number(x.price || 0), 0),
      collected:   orders.filter(x => x.status === 'ชำระเงินแล้ว').reduce((s, x) => s + Number(x.price || 0), 0),
      outstanding: orders.reduce((s, x) => s + Number(x.balance || 0), 0),
    };
  }, [orders]);

  const todayOrders = useMemo(() =>
    orders.filter(x => x.due_date === today && !['ชำระเงินแล้ว','ยกเลิก'].includes(x.status)),
    [orders, today]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o => {
      if (q && !o.title.toLowerCase().includes(q) &&
              !(o.customers?.name || '').toLowerCase().includes(q) &&
              !orderCode(o).toLowerCase().includes(q)) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (dateFrom && o.created_at && o.created_at.slice(0,10) < dateFrom) return false;
      if (dateTo   && o.created_at && o.created_at.slice(0,10) > dateTo)   return false;
      const active = !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status);
      if (quickFilter === 'today'      && !(o.due_date === today && active)) return false;
      if (quickFilter === 'overdue'    && !(o.due_date && new Date(o.due_date) < new Date() && active)) return false;
      if (quickFilter === 'unpaid'     && !(Number(o.balance) > 0)) return false;
      if (quickFilter === 'production' && o.status !== 'กำลังผลิต') return false;
      return true;
    });
  }, [orders, search, statusFilter, quickFilter, today, dateFrom, dateTo]);

  const monthlyData = useMemo(() => {
    const map: Record<string, { revenue: number; count: number }> = {};
    orders.forEach(o => {
      const key = (o.created_at || '').slice(0, 7);
      if (!key) return;
      if (!map[key]) map[key] = { revenue: 0, count: 0 };
      map[key].revenue += Number(o.price || 0);
      map[key].count++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [orders]);

  const topCustomers = useMemo(() => {
    const map: Record<number, { name: string; count: number; total: number; unpaid: number }> = {};
    orders.forEach(o => {
      if (!o.customer_id) return;
      if (!map[o.customer_id]) map[o.customer_id] = { name: o.customers?.name || '?', count: 0, total: 0, unpaid: 0 };
      map[o.customer_id].count++;
      map[o.customer_id].total  += Number(o.price   || 0);
      map[o.customer_id].unpaid += Number(o.balance || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [orders]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  function show(msg: string) { setMessage(msg); setTimeout(() => setMessage(''), 2500); }

  // ── Export CSV ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['เลขงาน','ลูกค้า','ชื่องาน','ประเภท','สถานะ','วันนัดส่ง','ราคา','มัดจำ','ค้างชำระ','วันที่สร้าง'];
    const rows = filtered.map(o => [
      orderCode(o), o.customers?.name || '', o.title, o.order_type || '', o.status,
      o.due_date || '', o.price, o.deposit, o.balance, (o.created_at || '').slice(0,10),
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `orders-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async function addCustomer(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await dbInsert('customers', {
      name: custForm.name, phone: custForm.phone,
      line_id: custForm.line_id, contact_channel: custForm.contact_channel,
    });
    if (res.error) { setError(res.error.message); return; }
    setCustForm({ name:'', phone:'', line_id:'', contact_channel:'LINE' });
    show('เพิ่มลูกค้าแล้ว'); load();
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await dbInsert('employees', {
      name: empForm.name, position: empForm.position, role: empForm.role,
    });
    if (res.error) { setError(res.error.message); return; }
    setEmpForm({ name:'', position:'', role:'graphic' });
    show('เพิ่มพนักงานแล้ว'); load();
  }

  async function addOrder(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const price   = Number(orderForm.price   || 0);
    const deposit = Number(orderForm.deposit || 0);
    const res = await dbInsert('orders', {
      ...orderForm,
      customer_id:   Number(orderForm.customer_id),
      quantity:      Number(orderForm.quantity || 1),
      price, deposit, balance: price - deposit,
      status: 'รับงานใหม่',
      designer_id:   orderForm.designer_id   ? Number(orderForm.designer_id)   : null,
      production_id: orderForm.production_id ? Number(orderForm.production_id) : null,
    });
    if (res.error) { setError(res.error.message); return; }
    await supabase.from('order_status_logs').insert({
      order_id: res.data?.id, old_status: '', new_status: 'รับงานใหม่', note: 'เปิดงานใหม่',
    });
    setOrderForm(EMPTY_ORDER); show('เปิดงานใหม่แล้ว'); setTab('orders'); load();
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function openEditOrder(o: Order) {
    setEditingOrder(o);
    setEditForm({
      customer_id:   String(o.customer_id || ''),   title:    o.title || '',
      order_type:    o.order_type || 'ป้ายไวนิล',   detail:   o.detail || '',
      size:          o.size || '',                   quantity: String(o.quantity || 1),
      material:      o.material || '',               price:    String(o.price || 0),
      deposit:       String(o.deposit || 0),         due_date: o.due_date || '',
      designer_id:   o.designer_id   ? String(o.designer_id)   : '',
      production_id: o.production_id ? String(o.production_id) : '',
    });
  }

  async function updateOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrder) return; setError('');
    const price   = Number(editForm.price   || 0);
    const deposit = Number(editForm.deposit || 0);
    const priceChanged   = price   !== Number(editingOrder.price);
    const depositChanged = deposit !== Number(editingOrder.deposit);
    let balance: number;
    if (priceChanged || depositChanged) {
      const alreadyPaid = Math.max(0, (Number(editingOrder.price) - Number(editingOrder.deposit)) - Number(editingOrder.balance));
      balance = Math.max(0, (price - deposit) - alreadyPaid);
    } else {
      balance = Number(editingOrder.balance);
    }
    const res = await dbUpdate('orders', editingOrder.id, {
      customer_id: Number(editForm.customer_id), title: editForm.title,
      order_type: editForm.order_type, detail: editForm.detail, size: editForm.size,
      quantity: Number(editForm.quantity || 1), material: editForm.material,
      price, deposit, balance, due_date: editForm.due_date || null,
      designer_id:   editForm.designer_id   ? Number(editForm.designer_id)   : null,
      production_id: editForm.production_id ? Number(editForm.production_id) : null,
      updated_at: new Date().toISOString(),
    });
    if (res.error) { setError(res.error.message); return; }
    setEditingOrder(null); show('แก้ไขงานแล้ว'); load();
  }

  function openEditCustomer(c: Customer) {
    setEditCust(c);
    setEditCustForm({ name: c.name, phone: c.phone || '', line_id: c.line_id || '', contact_channel: c.contact_channel || '' });
  }
  async function updateCustomer(e: React.FormEvent) {
    e.preventDefault(); if (!editCust) return; setError('');
    const res = await dbUpdate('customers', editCust.id, editCustForm);
    if (res.error) { setError(res.error.message); return; }
    setEditCust(null); show('แก้ไขลูกค้าแล้ว'); load();
  }

  function openEditEmployee(emp: Employee) {
    setEditEmp(emp);
    setEditEmpForm({ name: emp.name, position: emp.position || '', role: emp.role || 'graphic' });
  }
  async function updateEmployee(e: React.FormEvent) {
    e.preventDefault(); if (!editEmp) return; setError('');
    const res = await dbUpdate('employees', editEmp.id, editEmpForm);
    if (res.error) { setError(res.error.message); return; }
    setEditEmp(null); show('แก้ไขพนักงานแล้ว'); load();
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
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

  // ── Order actions ──────────────────────────────────────────────────────────
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
    e.preventDefault(); if (!payingOrder) return; setError('');
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
    setPayingOrder(null); setPayForm({ amount:'', method:'เงินสด' });
    show('บันทึกรับเงินแล้ว'); load();
  }

  // ── Role gates ────────────────────────────────────────────────────────────
  if (!initialized) return (
    <main className="container" style={{ minHeight:'100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:8 }}>
      <div className="brand">Idea Inkjet</div>
      <div className="sub">กำลังโหลดระบบ...</div>
    </main>
  );

  if (!role) return <RoleSelectScreen employees={employees} onSelect={doLogin} />;

  if (role === 'employee') {
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return (
      <main className="container">
        <div className="card" style={{ maxWidth:360, margin:'80px auto', padding:28, textAlign:'center' }}>
          <p>ไม่พบข้อมูลพนักงาน กรุณาเลือกใหม่</p>
          <button onClick={doLogout}>กลับหน้าเลือกผู้ใช้</button>
        </div>
      </main>
    );
    return (
      <EmployeeView
        emp={emp}
        orders={orders.filter(o => o.designer_id === emp.id || o.production_id === emp.id)}
        message={message} error={error} loading={loading}
        onLogout={doLogout} onLoad={load} onChangeStatus={changeStatus}
        onLoadLogs={loadOrderLogs} orderLogs={orderLogs}
        logsLoading={logsLoading} logsFor={logsFor} today={today}
      />
    );
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS = [
    ['dashboard','Dashboard'], ['new-order','เปิดงานใหม่'],
    ['orders','งานทั้งหมด'],   ['customers','ลูกค้า'],
    ['employees','พนักงาน'],   ['analytics','วิเคราะห์'],
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="container">
      <div className="top">
        <div>
          <div className="brand">Idea Inkjet Cloud V2</div>
          <div className="sub">ระบบรับงาน + ติดตามสถานะงาน + Supabase Cloud</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} disabled={loading}>{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</button>
          <button className="btn2 btnSm" onClick={doLogout}>เปลี่ยนผู้ใช้</button>
        </div>
      </div>

      {message && <div className="notice">{message}</div>}
      {error   && <div className="notice error">{error}</div>}

      <div className="tabs">
        {TABS.map(t => (
          <button key={t[0]} onClick={() => setTab(t[0])} className={`tab${tab === t[0] ? ' active' : ''}`}>
            {t[1]}
            {t[0] === 'orders' && stats.overdue > 0 && <span className="badge">{stats.overdue}</span>}
          </button>
        ))}
      </div>

      {/* ═══ DASHBOARD ════════════════════════════════════════════════════════ */}
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
              <b style={{ fontSize:28 }}>{fmtMoney(stats.sales)} บาท</b>
            </div>
            <div className="card statWide">
              <div className="sub">เก็บแล้ว</div>
              <b style={{ fontSize:28, color:'#16a34a' }}>{fmtMoney(stats.collected)} บาท</b>
            </div>
            <div className="card statWide">
              <div className="sub">ยังค้างชำระ</div>
              <b style={{ fontSize:28, color: stats.outstanding > 0 ? '#dc2626' : undefined }}>
                {fmtMoney(stats.outstanding)} บาท
              </b>
            </div>
          </div>

          {monthlyData.length > 0 && (
            <div className="card" style={{ marginTop:12 }}>
              <h3 style={{ margin:'0 0 12px' }}>รายรับรายเดือน (6 เดือนล่าสุด)</h3>
              <BarChart data={monthlyData.map(([m, v]) => [m, v.revenue])} />
            </div>
          )}

          <div className="card" style={{ marginTop:12 }}>
            <h3 style={{ margin:'0 0 10px' }}>สัดส่วนสถานะงานทั้งหมด</h3>
            <StatusDistribution orders={orders} />
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

      {/* ═══ NEW ORDER ════════════════════════════════════════════════════════ */}
      {tab === 'new-order' && (
        <section className="card">
          <h2>เปิดงานใหม่</h2>
          <OrderForm form={orderForm} setForm={setOrderForm}
            customers={customers} employees={employees}
            onSubmit={addOrder} submitLabel="บันทึกเปิดงาน" />
        </section>
      )}

      {/* ═══ ORDERS ═══════════════════════════════════════════════════════════ */}
      {tab === 'orders' && (
        <section className="card">
          <div className="tableHeader">
            <h2 style={{ margin:0 }}>งานทั้งหมด ({filtered.length})</h2>
            <div className="filters">
              <input type="search" className="searchInput" placeholder="ค้นหาชื่องาน, ลูกค้า, เลขงาน..."
                value={search} onChange={e => setSearch(e.target.value)} />
              <select className="filterSelect" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">ทุกสถานะ</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="dateFilterRow">
            <label>จาก<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
            <label>ถึง<input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)} /></label>
            {(dateFrom || dateTo) && (
              <button className="btnSm btn2" onClick={() => { setDateFrom(''); setDateTo(''); }}>ล้าง</button>
            )}
            <button className="btnSm btnGreen exportBtn" onClick={exportCSV}>⬇ Export CSV</button>
          </div>

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
                  const isToday    = o.due_date === today && !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status);
                  const isExpanded = expandedId === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr className={isExpanded ? 'rowExpanded' : undefined}>
                        <td>
                          <button className="codeBtn" onClick={() => {
                            const next = isExpanded ? null : o.id;
                            setExpandedId(next);
                            if (next) loadOrderLogs(next);
                          }}>{orderCode(o)}</button>
                        </td>
                        <td>{o.customers?.name || '-'}</td>
                        <td>{o.title}</td>
                        <td><StatusPill status={o.status} /></td>
                        <td className={isOverdue ? 'overdue' : isToday ? 'dueToday' : undefined}>{o.due_date || '-'}</td>
                        <td>{fmtMoney(o.price)}</td>
                        <td className={Number(o.balance) > 0 ? 'unpaid' : undefined}>{fmtMoney(o.balance)}</td>
                        <td>
                          <div className="rowActions">
                            <select value={o.status} onChange={e => changeStatus(o, e.target.value)}>
                              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {Number(o.balance) > 0 && (
                              <button className="btnGreen" onClick={() => {
                                setPayingOrder(o); setPayForm({ amount: String(o.balance), method:'เงินสด' });
                              }}>รับเงิน</button>
                            )}
                            <button className="btn2"    onClick={() => openEditOrder(o)}>แก้ไข</button>
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
                            <LogTimeline logs={orderLogs} loading={logsLoading} logsFor={logsFor} orderId={o.id} />
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

      {/* ═══ CUSTOMERS ════════════════════════════════════════════════════════ */}
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
                const custOrders = orders.filter(o => o.customer_id === c.id);
                const cnt    = custOrders.length;
                const total  = custOrders.reduce((s, o) => s + Number(o.price || 0), 0);
                const unpaid = custOrders.reduce((s, o) => s + Number(o.balance || 0), 0);
                return (
                  <div key={c.id} className="listRow">
                    <div>
                      <b>{c.name}</b>
                      <span className="sub"> {c.phone || '-'}</span>
                      {c.line_id && <span className="sub"> | Line: {c.line_id}</span>}
                      <div style={{ marginTop:3 }}>
                        <span className="countBadge">{cnt} งาน</span>
                        {total > 0 && <span className="countBadge greenBadge">{fmtMoney(total)} บาท</span>}
                        {unpaid > 0 && <span className="countBadge redBadge">ค้าง {fmtMoney(unpaid)}</span>}
                      </div>
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

      {/* ═══ EMPLOYEES ════════════════════════════════════════════════════════ */}
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
                const asDes = orders.filter(o => o.designer_id   === emp.id).length;
                const asPro = orders.filter(o => o.production_id === emp.id).length;
                return (
                  <div key={emp.id} className="listRow">
                    <div>
                      <b>{emp.name}</b>
                      <span className="sub"> {emp.position || '-'} | {emp.role}</span>
                      <div style={{ marginTop:3 }}>
                        <span className="countBadge">{asDes + asPro} งาน</span>
                        {asDes > 0 && <span className="countBadge" style={{ background:'#fef9c3', color:'#854d0e' }}>ออกแบบ {asDes}</span>}
                        {asPro > 0 && <span className="countBadge" style={{ background:'#fae8ff', color:'#7e22ce' }}>ผลิต {asPro}</span>}
                      </div>
                    </div>
                    <div className="rowActions">
                      <button className="btn2 btnSm" onClick={() => openEditEmployee(emp)}>แก้ไข</button>
                      {(asDes + asPro) === 0 && <button className="btnRed btnSm" onClick={() => deleteEmployee(emp.id)}>ลบ</button>}
                    </div>
                  </div>
                );
              })}
              {employees.length === 0 && <p className="sub">ยังไม่มีพนักงาน</p>}
            </div>
          </div>
        </section>
      )}

      {/* ═══ ANALYTICS ════════════════════════════════════════════════════════ */}
      {tab === 'analytics' && (
        <section>
          <div className="analyticsGrid">
            <div className="card">
              <h3 className="chartTitle">รายรับรายเดือน (บาท)</h3>
              {monthlyData.length > 0
                ? <BarChart data={monthlyData.map(([m,v]) => [m, v.revenue])} color="#3b82f6" />
                : <p className="sub">ยังไม่มีข้อมูล — สร้างงานก่อนครับ</p>}
            </div>
            <div className="card">
              <h3 className="chartTitle">จำนวนงานรายเดือน</h3>
              {monthlyData.length > 0
                ? <BarChart data={monthlyData.map(([m,v]) => [m, v.count])} color="#8b5cf6" unit="งาน" />
                : <p className="sub">ยังไม่มีข้อมูล</p>}
            </div>
          </div>

          <div className="card" style={{ marginTop:12 }}>
            <h3 className="chartTitle">การกระจายสถานะงาน ({orders.length} งาน)</h3>
            <StatusDistribution orders={orders} />
          </div>

          <div className="card" style={{ marginTop:12 }}>
            <h3 className="chartTitle">ลูกค้าที่สั่งซื้อมากที่สุด (Top 10)</h3>
            {topCustomers.length > 0 ? (
              <div className="mobileTable" style={{ marginTop:8 }}>
                <table>
                  <thead>
                    <tr><th>#</th><th>ลูกค้า</th><th>จำนวนงาน</th><th>ยอดรวม</th><th>ค้างชำระ</th></tr>
                  </thead>
                  <tbody>
                    {topCustomers.map((c, i) => (
                      <tr key={c.name + i}>
                        <td><b style={{ color: i === 0 ? '#f59e0b' : i < 3 ? '#6b7280' : undefined }}>{i+1}</b></td>
                        <td><b>{c.name}</b></td>
                        <td>{c.count} งาน</td>
                        <td><b style={{ color:'#16a34a' }}>{fmtMoney(c.total)} บาท</b></td>
                        <td>{c.unpaid > 0 ? <span style={{ color:'#dc2626', fontWeight:600 }}>{fmtMoney(c.unpaid)} บาท</span> : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="sub">ยังไม่มีข้อมูล</p>}
          </div>

          <div className="card" style={{ marginTop:12 }}>
            <h3 className="chartTitle">สรุปยอดรวม</h3>
            <div className="summaryGrid">
              <SummaryCard label="งานทั้งหมด"       value={`${stats.total} งาน`} />
              <SummaryCard label="ยอดขายรวม"        value={`${fmtMoney(stats.sales)} บาท`} color="#1d4ed8" />
              <SummaryCard label="เก็บเงินได้แล้ว"  value={`${fmtMoney(stats.collected)} บาท`} color="#16a34a" />
              <SummaryCard label="ยังค้างชำระ"       value={`${fmtMoney(stats.outstanding)} บาท`} color={stats.outstanding > 0 ? '#dc2626' : undefined} />
              <SummaryCard label="อัตราเก็บเงิน"    value={stats.sales > 0 ? `${Math.round(stats.collected/stats.sales*100)}%` : '-'} color="#16a34a" />
              <SummaryCard label="งานค้างส่ง"        value={`${stats.overdue} งาน`} color={stats.overdue > 0 ? '#dc2626' : undefined} />
            </div>
          </div>
        </section>
      )}

      {/* ═══ MODALS ════════════════════════════════════════════════════════════ */}
      {editingOrder && (
        <Modal title={`แก้ไขงาน — ${orderCode(editingOrder)}`} onClose={() => setEditingOrder(null)}>
          <OrderForm form={editForm} setForm={setEditForm}
            customers={customers} employees={employees}
            onSubmit={updateOrder} submitLabel="บันทึกแก้ไข" />
        </Modal>
      )}

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

      {printOrder && (
        <Modal title="ใบรับงาน" onClose={() => setPrintOrder(null)}>
          <div className="printContent"><PrintSlip order={printOrder} /></div>
          <div className="printActions">
            <button className="btnGreen" onClick={() => window.print()}>พิมพ์ / Save PDF</button>
            <button className="btn2" onClick={() => setPrintOrder(null)}>ปิด</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

// ─── OrderForm ────────────────────────────────────────────────────────────────
type OrderFormProps = {
  form: typeof EMPTY_ORDER; setForm: (f: typeof EMPTY_ORDER) => void;
  customers: Customer[]; employees: Employee[];
  onSubmit: (e: React.FormEvent) => void; submitLabel: string;
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
      <Field label="ชื่องาน" full><input required value={form.title} onChange={e => setForm({...form, title:e.target.value})} /></Field>
      <Field label="ประเภทงาน"><input value={form.order_type} onChange={e => setForm({...form, order_type:e.target.value})} /></Field>
      <Field label="วันนัดส่ง"><input type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})} /></Field>
      <Field label="ขนาด"><input value={form.size} onChange={e => setForm({...form, size:e.target.value})} placeholder="เช่น 120x240 ซม." /></Field>
      <Field label="จำนวน"><input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})} /></Field>
      <Field label="วัสดุ" full><input value={form.material} onChange={e => setForm({...form, material:e.target.value})} /></Field>
      <Field label="ราคา (บาท)"><input type="number" min="0" value={form.price} onChange={e => setForm({...form, price:e.target.value})} /></Field>
      <Field label="มัดจำ (บาท)"><input type="number" min="0" value={form.deposit} onChange={e => setForm({...form, deposit:e.target.value})} /></Field>
      {Number(form.price) > 0 && (
        <div className={`balancePreview full${balance < 0 ? ' balanceWarn' : ''}`}>
          ยอดค้างชำระ: <b>{fmtMoney(balance)} บาท</b>{balance < 0 && ' (มัดจำเกินราคา)'}
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

// ─── Shared sub-components ────────────────────────────────────────────────────
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
function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="summaryCard">
      <div className="sub">{label}</div>
      <b style={{ color }}>{value}</b>
    </div>
  );
}

// ─── BarChart (pure SVG) ──────────────────────────────────────────────────────
const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function BarChart({ data, color = '#3b82f6', unit = 'บาท' }: { data: [string, number][]; color?: string; unit?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d[1]), 1);
  const BAR_W = 54, GAP = 10, H = 110;
  const totalW = data.length * (BAR_W + GAP) - GAP;
  return (
    <div style={{ overflowX:'auto', paddingBottom:4 }}>
      <svg width={totalW} height={H + 50} style={{ display:'block', minWidth:'100%' }}>
        {data.map(([label, val], i) => {
          const x    = i * (BAR_W + GAP);
          const barH = Math.max(4, Math.round((val / max) * H));
          const y    = H - barH;
          const [yr, mo] = label.split('-');
          const thMo = TH_MONTHS[Number(mo) - 1] ?? mo;
          const disp = val >= 1000000 ? `${(val/1e6).toFixed(1)}M`
                     : val >= 1000    ? `${(val/1000).toFixed(1)}K`
                     : String(val);
          return (
            <g key={label}>
              <rect x={x} y={y} width={BAR_W} height={barH} fill={color} rx={4} opacity={0.85} />
              <text x={x + BAR_W/2} y={H + 16} textAnchor="middle" fontSize={11} fill="#6b7280">{thMo}</text>
              <text x={x + BAR_W/2} y={H + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">{yr.slice(2)}</text>
              <text x={x + BAR_W/2} y={Math.max(y - 5, 12)} textAnchor="middle" fontSize={10} fill="#374151">{disp}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Status distribution bar ──────────────────────────────────────────────────
function StatusDistribution({ orders }: { orders: Order[] }) {
  const total  = orders.length || 1;
  const counts = STATUSES.map(s => ({ s, n: orders.filter(o => o.status === s).length })).filter(x => x.n > 0);
  return (
    <div>
      <div style={{ display:'flex', height:26, borderRadius:8, overflow:'hidden', gap:2 }}>
        {counts.map(({ s, n }) => {
          const [bg] = STATUS_STYLE[s] || ['#e5e7eb',''];
          return <div key={s} style={{ flex:n/total, background:bg, minWidth:6 }} title={`${s}: ${n}`} />;
        })}
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:10 }}>
        {counts.map(({ s, n }) => {
          const [bg, color] = STATUS_STYLE[s] || ['#e5e7eb','#374151'];
          return (
            <span key={s} style={{ background:bg, color, fontSize:12, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap' }}>
              {s} <b>{n}</b>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Order status timeline ────────────────────────────────────────────────────
function LogTimeline({ logs, loading, logsFor, orderId }: { logs: StatusLog[]; loading: boolean; logsFor: number|null; orderId: number }) {
  if (loading && logsFor === orderId) return <div className="logLine sub">กำลังโหลดประวัติ...</div>;
  if (logsFor !== orderId || !logs.length) return null;
  return (
    <div className="logTimeline">
      <div className="logLabel">ประวัติการเปลี่ยนสถานะ</div>
      {logs.map(l => (
        <div key={l.id} className="logEntry">
          <span className="logDot" />
          <div className="logBody">
            <span className="logStatus">
              {l.old_status ? <>{l.old_status} → </> : null}<b>{l.new_status}</b>
            </span>
            {l.note && <span className="logNote">{l.note}</span>}
            <span className="logTime">
              {new Date(l.created_at).toLocaleString('th-TH', { dateStyle:'short', timeStyle:'short' })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PrintSlip ────────────────────────────────────────────────────────────────
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

// ─── Role Selection Screen ────────────────────────────────────────────────────
function RoleSelectScreen({ employees, onSelect }: {
  employees: Employee[];
  onSelect: (role: 'owner' | 'employee', empId?: number) => void;
}) {
  const [empId, setEmpId] = useState('');
  return (
    <main className="container" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div className="card" style={{ padding:'40px 32px', textAlign:'center' }}>
          <div className="brand" style={{ fontSize:28, marginBottom:4 }}>Idea Inkjet</div>
          <div className="sub" style={{ marginBottom:32 }}>ระบบจัดการงานพิมพ์</div>

          <button
            onClick={() => onSelect('owner')}
            style={{ width:'100%', padding:'18px 16px', marginBottom:8, fontSize:15, borderRadius:12, textAlign:'left', display:'flex', flexDirection:'column', gap:4 }}
          >
            <span style={{ fontSize:20 }}>🏪 เจ้าของร้าน</span>
            <span style={{ fontSize:12, fontWeight:400, opacity:.85 }}>ดูภาพรวมทั้งหมด จัดการระบบ</span>
          </button>

          <div style={{ borderTop:'1px solid var(--line)', margin:'20px 0 16px' }} />
          <p style={{ fontSize:13, color:'var(--muted)', margin:'0 0 10px' }}>หรือเข้าในฐานะพนักงาน</p>
          <select value={empId} onChange={e => setEmpId(e.target.value)} style={{ width:'100%', marginBottom:10 }}>
            <option value="">เลือกชื่อพนักงาน...</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}{e.position ? ` — ${e.position}` : ''}</option>
            ))}
          </select>
          <button
            className="btnGreen"
            style={{ width:'100%', opacity: empId ? 1 : .5 }}
            disabled={!empId}
            onClick={() => empId && onSelect('employee', Number(empId))}
          >
            👷 เข้าสู่ระบบพนักงาน
          </button>
          {employees.length === 0 && (
            <p style={{ fontSize:12, color:'var(--muted)', marginTop:12 }}>
              ยังไม่มีพนักงานในระบบ เจ้าของร้านต้องเพิ่มพนักงานก่อน
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Employee View ────────────────────────────────────────────────────────────
type EmpViewProps = {
  emp: Employee; orders: Order[];
  message: string; error: string; loading: boolean;
  onLogout: () => void; onLoad: () => void;
  onChangeStatus: (o: Order, s: string) => void;
  onLoadLogs: (id: number) => void;
  orderLogs: StatusLog[]; logsLoading: boolean; logsFor: number | null;
  today: string;
};
function EmployeeView({ emp, orders, message, error, loading, onLogout, onLoad, onChangeStatus, onLoadLogs, orderLogs, logsLoading, logsFor, today }: EmpViewProps) {
  const [filter, setFilter]       = useState<'active' | 'all' | 'done'>('active');
  const [expandedId, setExpanded] = useState<number | null>(null);

  const DONE   = ['ชำระเงินแล้ว','ยกเลิก'];
  const active = orders.filter(o => !DONE.includes(o.status));
  const done   = orders.filter(o =>  DONE.includes(o.status));
  const dueToday = active.filter(o => o.due_date === today).length;
  const overdue  = active.filter(o => o.due_date && new Date(o.due_date) < new Date() && o.due_date !== today).length;
  const displayed = filter === 'active' ? active : filter === 'done' ? done : orders;

  return (
    <main className="container">
      <div className="top">
        <div>
          <div className="brand" style={{ fontSize:20 }}>สวัสดี, {emp.name}</div>
          <div className="sub">{emp.position || emp.role} · Idea Inkjet</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onLoad} disabled={loading} className="btnSm btn2">{loading ? 'โหลด...' : 'รีเฟรช'}</button>
          <button className="btnSm btn2" onClick={onLogout}>ออกจากระบบ</button>
        </div>
      </div>

      {message && <div className="notice">{message}</div>}
      {error   && <div className="notice error">{error}</div>}

      {/* Summary row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
        {([
          ['งานทั้งหมด', orders.length, undefined],
          ['กำลังทำ',    active.length, '#1d4ed8'],
          ['วันนี้',     dueToday,      dueToday > 0 ? '#c2410c' : undefined],
          ['เลยกำหนด',  overdue,       overdue  > 0 ? '#dc2626' : undefined],
        ] as [string, number, string|undefined][]).map(([label, val, color]) => (
          <div key={label} className="card stat" style={{ padding:'12px 14px' }}>
            <span className="sub" style={{ fontSize:11 }}>{label}</span>
            <b style={{ color, fontSize:22 }}>{val}</b>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="tabs" style={{ marginBottom:14 }}>
        <button className={`tab${filter==='active'?' active':''}`} onClick={() => setFilter('active')}>
          ต้องทำ {active.length > 0 && <span className="badge">{active.length}</span>}
        </button>
        <button className={`tab${filter==='all'?' active':''}`} onClick={() => setFilter('all')}>
          ทั้งหมด ({orders.length})
        </button>
        <button className={`tab${filter==='done'?' active':''}`} onClick={() => setFilter('done')}>
          เสร็จแล้ว ({done.length})
        </button>
      </div>

      {/* Job cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {displayed.length === 0 && (
          <div className="card" style={{ textAlign:'center', padding:36, color:'var(--muted)' }}>
            {filter === 'active' ? 'ไม่มีงานที่ต้องทำ 🎉' : 'ยังไม่มีงาน'}
          </div>
        )}
        {displayed.map(o => {
          const isDes      = o.designer_id   === emp.id;
          const isPro      = o.production_id === emp.id;
          const isOverdue  = !!o.due_date && new Date(o.due_date) < new Date() && !DONE.includes(o.status);
          const isToday    = o.due_date === today && !DONE.includes(o.status);
          const isExpanded = expandedId === o.id;
          return (
            <div key={o.id} className="card" style={{ padding:'14px 16px' }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6, alignItems:'center' }}>
                <span style={{ fontWeight:700, color:'var(--brand)', fontSize:13 }}>
                  {o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}
                </span>
                <StatusPill status={o.status} />
                {isDes && <span className="countBadge" style={{ background:'#fef9c3', color:'#854d0e' }}>ออกแบบ</span>}
                {isPro && <span className="countBadge" style={{ background:'#fae8ff', color:'#7e22ce' }}>ผลิต</span>}
              </div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{o.title}</div>
              <div style={{ fontSize:13, color:'var(--muted)' }}>
                ลูกค้า: {o.customers?.name || '-'}
                {o.due_date && (
                  <span className={isOverdue ? ' overdue' : isToday ? ' dueToday' : ''} style={{ marginLeft:12 }}>
                    นัดส่ง: {fmtDate(o.due_date)}{isOverdue ? ' ⚠️' : isToday ? ' 🔔' : ''}
                  </span>
                )}
              </div>
              {(o.size || o.quantity) && (
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                  {o.size ? `ขนาด: ${o.size}` : ''}{o.size && o.quantity ? ' · ' : ''}{o.quantity ? `${o.quantity} ชิ้น` : ''}
                </div>
              )}

              {!DONE.includes(o.status) && (
                <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>เปลี่ยนสถานะ:</span>
                  <select value={o.status} onChange={ev => onChangeStatus(o, ev.target.value)} style={{ flex:1, minWidth:160 }}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div style={{ marginTop:8 }}>
                <button className="codeBtn" style={{ fontSize:12 }} onClick={() => {
                  const next = isExpanded ? null : o.id;
                  setExpanded(next);
                  if (next) onLoadLogs(next);
                }}>
                  {isExpanded ? '▲ ซ่อน' : '▼ รายละเอียด'}
                </button>
                {isExpanded && (
                  <div style={{ marginTop:8, borderTop:'1px solid var(--line)', paddingTop:8 }}>
                    {o.detail && <p style={{ fontSize:13, margin:'0 0 6px' }}><b>หมายเหตุ:</b> {o.detail}</p>}
                    <div className="orderDetail" style={{ marginBottom:8 }}>
                      {o.order_type && <span><b>ประเภท:</b> {o.order_type}</span>}
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
