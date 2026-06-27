'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
type Customer  = { id: number; name: string; phone: string; line_id: string; contact_channel: string; address?: string; tax_id?: string };
type Employee  = { id: number; name: string; position: string; role: string; pin?: string | null };
type StatusLog = { id: number; order_id: number; old_status: string; new_status: string; note: string; changed_by?: string; created_at: string };
type Order = {
  id: number; order_code: string; title: string; status: string;
  due_date: string; price: number; deposit: number; balance: number;
  customer_id: number;
  designer_id:  number | null; production_id: number | null;
  receiver_id:  number | null; measurer_id:   number | null; delivery_id: number | null;
  detail: string; order_type: string; size: string; quantity: number; material: string;
  file_status: string; delivery_method: string; finishing: string;
  payment_type: string; credit_days: number;
  created_at: string;
  customers?: Customer; designer?: Employee; production?: Employee;
  receiver?: Employee; measurer?: Employee; delivery?: Employee;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES = [
  'รับงานใหม่','กำลังออกแบบ','รอลูกค้าตรวจแบบ','ลูกค้าอนุมัติแล้ว',
  'กำลังผลิต','ผลิตเสร็จ','แจ้งลูกค้ามารับ','กำลังเอาไปส่ง','ลูกค้ารับแล้ว',
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
  'กำลังเอาไปส่ง':     ['#fff7ed','#c2410c'],
  'ลูกค้ารับแล้ว':     ['#ccfbf1','#0f766e'],
  'ชำระเงินแล้ว':      ['#f0fdf4','#16a34a'],
  'ค้างชำระ':           ['#fee2e2','#dc2626'],
  'ยกเลิก':             ['#f3f4f6','#6b7280'],
};

function statusesForOrder(o: { delivery_method?: string }): string[] {
  if (o.delivery_method === 'จัดส่ง') return STATUSES.filter(s => s !== 'แจ้งลูกค้ามารับ');
  return STATUSES.filter(s => s !== 'กำลังเอาไปส่ง');
}

const EMPTY_ORDER = {
  customer_id:'', title:'', order_type:'ป้ายไวนิล', detail:'',
  size:'', quantity:'1', material:'', price:'0', deposit:'0',
  due_date:'', designer_id:'', production_id:'',
  receiver_id:'', measurer_id:'', delivery_id:'',
  file_status:'มีไฟล์แล้ว', delivery_method:'รับเองที่ร้าน', finishing:'',
  payment_type:'เงินสด', credit_days:'30',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtMoney = (n?: number) => Number(n || 0).toLocaleString('th-TH');
const fmtDate  = (d?: string) => {
  if (!d) return '-';
  const [y,m,day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' });
};
const fmtDateTime = (d?: string) => {
  if (!d) return '-';
  return new Date(d).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', year:'numeric', month:'short',
    day:'numeric', hour:'2-digit', minute:'2-digit',
  });
};
const todayThLong = () => new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year:'numeric', month:'long', day:'numeric' });
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

function tryStripCol(data: Record<string, any>, msg: string): Record<string, any> | null {
  const m = msg.match(/Could not find the '([^']+)' column/);
  if (!m) return null;
  const col = m[1];
  if (!(col in data)) return null;
  const out = { ...data };
  delete out[col];
  return out;
}

function tryFixTypeMismatch(data: Record<string, any>, msg: string): Record<string, any> | null {
  // "invalid input syntax for type bigint: "someText"" — find field with that value and strip it
  if (!msg.includes('invalid input syntax for type')) return null;
  const m = msg.match(/invalid input syntax for type \w+: "([^"]+)"/);
  if (!m) return null;
  const badValue = m[1];
  const out = { ...data };
  for (const [k, v] of Object.entries(out)) {
    if (String(v) === badValue) { delete out[k]; return out; }
  }
  return null;
}

async function dbInsert(table: string, data: Record<string, any>) {
  let d = applyMap(table, data);
  for (let i = 0; i < 8; i++) {
    const res = await supabase.from(table).insert(d).select().single();
    if (!res.error) return res;
    const msg = res.error.message;
    if (tryLearn(table, msg)) { d = applyMap(table, d); continue; }
    const stripped = tryStripCol(d, msg) ?? tryFixTypeMismatch(d, msg);
    if (stripped) { d = stripped; continue; }
    return res;
  }
  return supabase.from(table).insert(d).select().single();
}

async function dbUpdate(table: string, id: number, data: Record<string, any>) {
  let d = applyMap(table, data);
  for (let i = 0; i < 8; i++) {
    const res = await supabase.from(table).update(d).eq('id', id);
    if (!res.error) return res;
    if (tryLearn(table, res.error.message)) { d = applyMap(table, d); continue; }
    const stripped = tryStripCol(d, res.error.message);
    if (stripped) { d = stripped; continue; }
    return res;
  }
  return supabase.from(table).update(d).eq('id', id);
}

// ─── PIN helpers (DB-based via app_settings) ─────────────────────────────────
async function savePin(empId: number, pin: string): Promise<string> {
  if (pin) {
    const { error } = await supabase.from('app_settings').upsert({ key: `pin_emp_${empId}`, value: pin });
    if (error) return error.message;
  } else {
    const { error } = await supabase.from('app_settings').delete().eq('key', `pin_emp_${empId}`);
    if (error) return error.message;
  }
  return '';
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
  const [role, setRole]           = useState<'owner' | 'employee' | 'viewer' | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [editMode, setEditMode]   = useState(false);
  const [viewAsEmp, setViewAsEmp] = useState<number | null>(null);
  const [ownerPin, setOwnerPinState] = useState('');
  const [dbSetupNeeded, setDbSetupNeeded] = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [notifPerm,  setNotifPerm]  = useState<NotificationPermission>('default');
  const seenOverdueRef = useRef<Set<number>>(new Set());
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [shopSettings, setShopSettings] = useState({ name:'Idea Inkjet', address:'', tax_id:'', phone:'' });
  const [custForm, setCustForm]   = useState({ name:'', phone:'', line_id:'', contact_channel:'LINE', address:'', tax_id:'' });
  const [empForm,  setEmpForm]    = useState({ name:'', position:'', role:'graphic', pin:'' });
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
  const [logsTableReady, setLogsTableReady] = useState(true);
  const [logsTableError, setLogsTableError] = useState('');

  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editForm,     setEditForm]     = useState(EMPTY_ORDER);
  const [payingOrder,  setPayingOrder]  = useState<Order | null>(null);
  const [payForm,      setPayForm]      = useState({ amount:'', method:'เงินสด', received_by:'เจ้าของร้าน' });
  const [printOrder,    setPrintOrder]    = useState<Order | null>(null);
  const [receiptOrder,  setReceiptOrder]  = useState<Order | null>(null);
  const [receiptType,   setReceiptType]   = useState<'cash'|'tax'>('cash');
  const [followups, setFollowups] = useState<Record<number, { status: string; note: string; promisedDate: string; updatedAt: string }>>({});
  const [followupModal, setFollowupModal] = useState<{ customerId: number; customerName: string } | null>(null);
  const [followupForm, setFollowupForm] = useState({ status: 'ติดต่อแล้ว รอชำระ', note: '', promisedDate: '' });
  const [unpaidFilter, setUnpaidFilter] = useState<'all'|'untouched'|'promised'|'overdue'>('all');
  const [unpaidSort,   setUnpaidSort]   = useState<'balance'|'overdue'|'name'>('overdue');
  const [editCust,     setEditCust]     = useState<Customer | null>(null);
  const [editCustForm, setEditCustForm] = useState({ name:'', phone:'', line_id:'', contact_channel:'', address:'', tax_id:'' });
  const [editEmp,      setEditEmp]      = useState<Employee | null>(null);
  const [editEmpForm,  setEditEmpForm]  = useState({ name:'', position:'', role:'graphic', pin:'' });

  const [assessments,   setAssessments]   = useState<any[]>([]);
  const [paymentSlips,  setPaymentSlips]  = useState<any[]>([]);
  const [slipViewing,   setSlipViewing]   = useState<number | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true); setError('');
    // Load main data + all settings in one shot
    const [c, e, o, allSettings, logsCheck] = await Promise.all([
      supabase.from('customers').select('*').order('id', { ascending: false }),
      supabase.from('employees').select('*').order('id', { ascending: false }),
      supabase.from('orders').select('*').order('id', { ascending: false }),
      supabase.from('app_settings').select('key, value'),
      supabase.from('order_status_logs').select('id').limit(1),
    ]);
    if (logsCheck.error) {
      setLogsTableReady(false);
      setLogsTableError(logsCheck.error.message);
    } else {
      setLogsTableReady(true);
      setLogsTableError('');
    }
    setLoading(false); setInitialized(true);

    // If app_settings table is missing, show setup screen and stop
    if (allSettings.error) {
      setDbSetupNeeded(true);
      return;
    }
    setDbSetupNeeded(false);

    if (c.error || e.error || o.error) {
      setError(c.error?.message || e.error?.message || o.error?.message || 'โหลดข้อมูลไม่สำเร็จ'); return;
    }

    // Build settings map: { owner_pin: '...', pin_emp_1: '...', ... }
    const settingsMap: Record<string, string> = {};
    (allSettings.data || []).forEach((row: any) => { settingsMap[row.key] = row.value; });

    // Migrate legacy localStorage owner PIN once
    let ownerPinVal = settingsMap['owner_pin'] || '';
    if (!ownerPinVal) {
      const legacy = localStorage.getItem('iij_owner_pin');
      if (legacy) {
        await supabase.from('app_settings').upsert({ key: 'owner_pin', value: legacy });
        localStorage.removeItem('iij_owner_pin');
        ownerPinVal = legacy;
      }
    }
    setOwnerPinState(ownerPinVal);
    localStorage.removeItem('iij_pins');

    setShopSettings({
      name:    settingsMap['shop_name']    || 'Idea Inkjet',
      address: settingsMap['shop_address'] || '',
      tax_id:  settingsMap['shop_tax_id']  || '',
      phone:   settingsMap['shop_phone']   || '',
    });

    const followupMap: Record<number, { status: string; note: string; promisedDate: string; updatedAt: string }> = {};
    Object.entries(settingsMap).forEach(([k, v]) => {
      if (k.startsWith('followup_')) {
        const id = Number(k.slice(9));
        try { followupMap[id] = JSON.parse(v); } catch {}
      }
    });
    setFollowups(followupMap);

    const custNorm: Customer[] = (c.data || []).map((x: any) => ({
      id: x.id, name: x.name ?? x.customer_name ?? '',
      phone: x.phone ?? '', line_id: x.line_id ?? '', contact_channel: x.contact_channel ?? 'LINE',
      address: x.address ?? '', tax_id: x.tax_id ?? '',
    }));
    const empNorm: Employee[] = (e.data || []).map((x: any) => ({
      id: x.id, name: x.name ?? x.employee_name ?? '',
      position: x.position ?? '', role: x.role ?? 'graphic',
      pin: settingsMap[`pin_emp_${x.id}`] || null,
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
      receiver_id:  row.receiver_id  ?? null,
      measurer_id:  row.measurer_id  ?? null,
      delivery_id:  row.delivery_id  ?? null,
      customers:  custMap[row.customer_id]  ?? undefined,
      designer:   empMap[row.designer_id]   ?? undefined,
      production: empMap[row.production_id] ?? undefined,
      receiver:   empMap[row.receiver_id]   ?? undefined,
      measurer:   empMap[row.measurer_id]   ?? undefined,
      delivery:   empMap[row.delivery_id]   ?? undefined,
    }));
    setCustomers(custNorm); setEmployees(empNorm); setOrders(ordNorm);
    setLastRefresh(new Date());

    // Load pending payment slips for badge count
    supabase.from('payment_slips').select('id, status').eq('status', 'pending')
      .then(({ data }) => { if (data) setPaymentSlips(data); });

    // Browser notifications for overdue + today
    if (typeof window !== 'undefined' && Notification.permission === 'granted') {
      const t = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
      const overdue = ordNorm.filter(o => !!o.due_date && o.due_date < t && !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status));
      const newOverdue = overdue.filter(o => !seenOverdueRef.current.has(o.id));
      if (newOverdue.length > 0) {
        new Notification('Idea Inkjet ⚠️ งานเลยกำหนด', {
          body: `มี ${newOverdue.length} งานที่เลยกำหนดแล้ว: ${newOverdue.slice(0,3).map(o => o.title).join(', ')}`,
          icon: '/favicon.ico',
        });
        newOverdue.forEach(o => seenOverdueRef.current.add(o.id));
      }
      const today2 = ordNorm.filter(o => o.due_date === t && !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status));
      if (today2.length > 0 && seenOverdueRef.current.size === 0) {
        new Notification('Idea Inkjet 🔔 นัดส่งวันนี้', {
          body: `มี ${today2.length} งานที่นัดส่งวันนี้`,
          icon: '/favicon.ico',
        });
      }
    }
  }
  useEffect(() => {
    load();
    if (typeof window !== 'undefined') {
      setNotifPerm(Notification.permission);
    }
  }, []);

  // Auto-refresh every 60 seconds when logged in as owner
  useEffect(() => {
    if (role === 'owner') {
      autoRefreshRef.current = setInterval(() => { load(); }, 60_000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [role]);

  async function loadAssessments() {
    const { data } = await supabase
      .from('assessments')
      .select('*, orders(id, order_code, title, customers(name)), employee_ratings(id, employee_id, employee_role, rating, comment, employees(name))')
      .order('created_at', { ascending: false });
    setAssessments(data || []);
  }

  async function loadPaymentSlips() {
    const { data } = await supabase
      .from('payment_slips')
      .select('*, orders(id, order_code, title, customers(name))')
      .order('created_at', { ascending: false });
    setPaymentSlips(data || []);
  }

  useEffect(() => {
    if (tab === 'assessments') loadAssessments();
    if (tab === 'slips') loadPaymentSlips();
  }, [tab]);

  async function markSlipReviewed(id: number) {
    await supabase.from('payment_slips').update({ status: 'reviewed' }).eq('id', id);
    setPaymentSlips(prev => prev.map(s => s.id === id ? { ...s, status: 'reviewed' } : s));
  }

  function doLogin(r: 'owner' | 'employee' | 'viewer', empId?: number, edit?: boolean) {
    setRole(r); setEditMode(!!edit);
    if (empId !== undefined) setSelectedEmpId(empId);
  }
  function doLogout() {
    setRole(null); setSelectedEmpId(null); setEditMode(false);
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
  }

  async function requestNotifPermission() {
    if (typeof window === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') {
      new Notification('Idea Inkjet ✓', { body: 'เปิดการแจ้งเตือนแล้ว' });
    }
  }

  async function saveOwnerPin(pin: string): Promise<string> {
    if (pin) {
      const { error } = await supabase.from('app_settings').upsert({ key: 'owner_pin', value: pin });
      if (error) return error.message;
    } else {
      const { error } = await supabase.from('app_settings').delete().eq('key', 'owner_pin');
      if (error) return error.message;
    }
    setOwnerPinState(pin);
    return '';
  }

  async function saveShopSettings(s: typeof shopSettings): Promise<string> {
    const pairs = [
      { key:'shop_name',    value: s.name    },
      { key:'shop_address', value: s.address },
      { key:'shop_tax_id',  value: s.tax_id  },
      { key:'shop_phone',   value: s.phone   },
    ];
    for (const p of pairs) {
      const { error } = await supabase.from('app_settings').upsert(p);
      if (error) return error.message;
    }
    setShopSettings(s);
    return '';
  }

  async function loadOrderLogs(orderId: number) {
    setLogsLoading(true); setLogsFor(orderId);
    const { data, error } = await supabase.from('order_status_logs')
      .select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    if (error) {
      setLogsTableReady(false);
      setLogsTableError(error.message);
    } else {
      setLogsTableReady(true);
      setLogsTableError('');
    }
    setOrderLogs(data || []); setLogsLoading(false);
  }

  // ── Computed ──────────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

  const stats = useMemo(() => {
    const active = orders.filter(x => !['ชำระเงินแล้ว','ยกเลิก'].includes(x.status));
    return {
      total:       orders.length,
      new:         orders.filter(x => x.status === 'รับงานใหม่').length,
      design:      orders.filter(x => x.status === 'กำลังออกแบบ').length,
      production:  orders.filter(x => x.status === 'กำลังผลิต').length,
      overdue:     active.filter(x => x.due_date && x.due_date < today).length,
      today:       active.filter(x => x.due_date === today).length,
      unpaid:      orders.filter(x => Number(x.balance) > 0).length,
      sales:       orders.reduce((s, x) => s + Number(x.price || 0), 0),
      collected:   orders.filter(x => x.status === 'ชำระเงินแล้ว').reduce((s, x) => s + Number(x.price || 0), 0),
      outstanding: orders.reduce((s, x) => s + Number(x.balance || 0), 0),
    };
  }, [orders, today]);

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
      if (quickFilter === 'overdue'    && !(o.due_date && o.due_date < today && active)) return false;
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

  const unpaidByCustomer = useMemo(() => {
    const map: Record<number, {
      customer: Customer; orders: Order[];
      totalBalance: number; oldestDue: string | null;
    }> = {};
    orders.forEach(o => {
      if (Number(o.balance) <= 0) return;
      const cust = customers.find(c => c.id === o.customer_id);
      if (!cust) return;
      if (!map[cust.id]) map[cust.id] = { customer: cust, orders: [], totalBalance: 0, oldestDue: null };
      map[cust.id].orders.push(o);
      map[cust.id].totalBalance += Number(o.balance);
      if (o.due_date && (!map[cust.id].oldestDue || o.due_date < map[cust.id].oldestDue!)) {
        map[cust.id].oldestDue = o.due_date;
      }
    });
    return Object.values(map).sort((a, b) => b.totalBalance - a.totalBalance);
  }, [orders, customers]);

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
      address: custForm.address, tax_id: custForm.tax_id,
    });
    if (res.error) { setError(res.error.message); return; }
    setCustForm({ name:'', phone:'', line_id:'', contact_channel:'LINE', address:'', tax_id:'' });
    show('เพิ่มลูกค้าแล้ว'); load();
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await dbInsert('employees', {
      name: empForm.name, position: empForm.position, role: empForm.role,
    });
    if (res.error) { setError(res.error.message); return; }
    if (empForm.pin && res.data?.id) {
      const pinErr = await savePin(res.data.id, empForm.pin);
      if (pinErr) { setError('บันทึกรหัสพนักงานไม่สำเร็จ: ' + pinErr); return; }
    }
    setEmpForm({ name:'', position:'', role:'graphic', pin:'' });
    show('เพิ่มพนักงานแล้ว'); load();
  }

  async function addOrder(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!orderForm.customer_id) { setError('กรุณาเลือกลูกค้า'); return; }
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
      receiver_id:   orderForm.receiver_id   ? Number(orderForm.receiver_id)   : null,
      measurer_id:   orderForm.measurer_id   ? Number(orderForm.measurer_id)   : null,
      delivery_id:   orderForm.delivery_id   ? Number(orderForm.delivery_id)   : null,
    });
    if (res.error) { setError(res.error.message); return; }
    await dbInsert('order_status_logs', {
      order_id: res.data?.id, old_status: '', new_status: 'รับงานใหม่', note: 'เปิดงานใหม่', changed_by: 'เจ้าของร้าน',
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
      receiver_id:   o.receiver_id   ? String(o.receiver_id)   : '',
      measurer_id:   o.measurer_id   ? String(o.measurer_id)   : '',
      delivery_id:   o.delivery_id   ? String(o.delivery_id)   : '',
      file_status:      o.file_status      || 'มีไฟล์แล้ว',
      delivery_method:  o.delivery_method  || 'รับเองที่ร้าน',
      finishing:        o.finishing        || '',
      payment_type:     o.payment_type     || 'เงินสด',
      credit_days:      String(o.credit_days ?? 30),
    });
  }

  async function updateOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrder) return; setError('');
    if (!editForm.customer_id) { setError('กรุณาเลือกลูกค้า'); return; }
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
      receiver_id:   editForm.receiver_id   ? Number(editForm.receiver_id)   : null,
      measurer_id:   editForm.measurer_id   ? Number(editForm.measurer_id)   : null,
      delivery_id:   editForm.delivery_id   ? Number(editForm.delivery_id)   : null,
      payment_type: editForm.payment_type || 'เงินสด',
      credit_days:  editForm.payment_type === 'เครดิต' ? Number(editForm.credit_days || 30) : 0,
      updated_at: new Date().toISOString(),
    });
    if (res.error) { setError(res.error.message); return; }
    setEditingOrder(null); show('แก้ไขงานแล้ว'); load();
  }

  function openEditCustomer(c: Customer) {
    setEditCust(c);
    setEditCustForm({ name: c.name, phone: c.phone || '', line_id: c.line_id || '', contact_channel: c.contact_channel || '', address: c.address || '', tax_id: c.tax_id || '' });
  }
  async function updateCustomer(e: React.FormEvent) {
    e.preventDefault(); if (!editCust) return; setError('');
    const res = await dbUpdate('customers', editCust.id, editCustForm);
    if (res.error) { setError(res.error.message); return; }
    setEditCust(null); show('แก้ไขลูกค้าแล้ว'); load();
  }

  function openEditEmployee(emp: Employee) {
    setEditEmp(emp);
    setEditEmpForm({ name: emp.name, position: emp.position || '', role: emp.role || 'graphic', pin: emp.pin || '' });
  }
  async function updateEmployee(e: React.FormEvent) {
    e.preventDefault(); if (!editEmp) return; setError('');
    const { pin, ...rest } = editEmpForm;
    const res = await dbUpdate('employees', editEmp.id, rest);
    if (res.error) { setError(res.error.message); return; }
    if (pin) {
      const pinErr = await savePin(editEmp.id, pin);
      if (pinErr) { setError('บันทึกรหัสพนักงานไม่สำเร็จ: ' + pinErr); return; }
    }
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
    const changedBy = role === 'owner'
      ? 'เจ้าของร้าน'
      : (employees.find(e => e.id === selectedEmpId)?.name ?? 'พนักงาน');
    const res = await dbUpdate('orders', o.id, { status: newStatus, updated_at: new Date().toISOString() });
    if (res.error) { setError(res.error.message); return; }
    const logRes = await dbInsert('order_status_logs', {
      order_id: o.id, old_status: o.status, new_status: newStatus, note: '', changed_by: changedBy,
    });
    if (logRes.error) {
      setLogsTableReady(false);
      setLogsTableError(logRes.error.message);
    } else {
      setLogsTableReady(true);
      setLogsTableError('');
      if (logsFor === o.id) loadOrderLogs(o.id);
    }
    show('เปลี่ยนสถานะแล้ว'); load();
  }

  async function saveFollowup(customerId: number) {
    const val = JSON.stringify({ ...followupForm, updatedAt: new Date().toISOString() });
    const { error } = await supabase.from('app_settings').upsert({ key: `followup_${customerId}`, value: val });
    if (error) { setError(error.message); return; }
    setFollowups(prev => ({ ...prev, [customerId]: { ...followupForm, updatedAt: new Date().toISOString() } }));
    setFollowupModal(null);
    show('บันทึกการติดตามแล้ว');
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault(); if (!payingOrder) return; setError('');
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) { setError('กรุณาระบุจำนวนเงินที่รับ'); return; }

    const newBalance = Math.max(0, Number(payingOrder.balance || 0) - amount);
    const newStatus  = newBalance === 0 ? 'ชำระเงินแล้ว' : 'ค้างชำระ';
    const note       = `รับเงิน ${fmtMoney(amount)} บาท (${payForm.method})${newBalance > 0 ? ` คงเหลือ ${fmtMoney(newBalance)} บาท` : ' ครบ'}`;

    // 1. บันทึกการรับเงิน (ไม่ block ถ้า payments table ไม่มี)
    const p = await supabase.from('payments').insert({
      order_id: payingOrder.id, amount,
      payment_method: payForm.method, payment_status: 'paid',
      payment_date: new Date().toISOString(),
      note, received_by: payForm.received_by,
    });
    if (p.error && !p.error.message.includes('Could not find') && !p.error.message.includes('does not exist')) {
      setError(p.error.message); return;
    }

    // 2. อัปเดตยอดค้างและสถานะ
    const upd = await dbUpdate('orders', payingOrder.id, {
      balance: newBalance, status: newStatus, updated_at: new Date().toISOString(),
    });
    if (upd.error) { setError(upd.error.message); return; }

    // 3. บันทึก log เสมอ (ทั้งชำระบางส่วนและครบ)
    const logRes2 = await dbInsert('order_status_logs', {
      order_id: payingOrder.id,
      old_status: payingOrder.status,
      new_status: newStatus,
      note,
      changed_by: payForm.received_by,
    });
    if (logRes2.error) {
      setLogsTableReady(false);
      setLogsTableError(logRes2.error.message);
    } else {
      setLogsTableReady(true);
      setLogsTableError('');
      if (logsFor === payingOrder.id) loadOrderLogs(payingOrder.id);
    }

    const paidId = payingOrder.id;
    setPayingOrder(null); setPayForm({ amount:'', method:'เงินสด', received_by:'เจ้าของร้าน' });
    show('บันทึกรับเงินแล้ว'); load();
    if (logsFor === paidId) loadOrderLogs(paidId);
  }

  // ── Role gates ────────────────────────────────────────────────────────────
  if (!initialized) return (
    <main className="container" style={{ minHeight:'100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:8 }}>
      <div className="brand">Idea Inkjet</div>
      <div className="sub">กำลังโหลดระบบ...</div>
    </main>
  );

  if (dbSetupNeeded) return (
    <main className="container" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 16px' }}>
      <div style={{ width:'100%', maxWidth:520 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div className="brand" style={{ fontSize:28 }}>Idea Inkjet</div>
          <div className="sub">ระบบจัดการงานพิมพ์</div>
        </div>
        <div className="card" style={{ padding:'24px', border:'2px solid #fca5a5' }}>
          <h3 style={{ margin:'0 0 8px', color:'#dc2626' }}>⚠️ ต้องสร้างตารางฐานข้อมูลก่อน</h3>
          <p style={{ margin:'0 0 16px', fontSize:14, color:'var(--muted)' }}>
            ระบบต้องการตาราง <b>app_settings</b> สำหรับเก็บรหัสผ่าน
            กรุณาเปิด <b>Supabase → SQL Editor</b> แล้วรันคำสั่งนี้:
          </p>
          <div style={{ background:'#1e293b', color:'#86efac', borderRadius:10, padding:'14px 16px', fontFamily:'monospace', fontSize:14, marginBottom:16, userSelect:'all' }}>
            CREATE TABLE IF NOT EXISTS app_settings (<br/>
            &nbsp;&nbsp;key TEXT PRIMARY KEY,<br/>
            &nbsp;&nbsp;value TEXT<br/>
            );<br/>
            ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
          </div>
          <button style={{ width:'100%' }} onClick={() => { setInitialized(false); setDbSetupNeeded(false); load(); }}>
            ✓ สร้างแล้ว — ตรวจสอบอีกครั้ง
          </button>
        </div>
      </div>
    </main>
  );

  if (!role) return <RoleSelectScreen ownerPin={ownerPin} onSelect={doLogin} onSetOwnerPin={saveOwnerPin} />;

  if (role === 'viewer') return (
    <ViewerBoard orders={orders} employees={employees} message={message} error={error}
      loading={loading} onLogout={doLogout} onLoad={load} today={today} />
  );

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
        orders={orders.filter(o => o.designer_id === emp.id || o.production_id === emp.id || o.receiver_id === emp.id || o.measurer_id === emp.id || o.delivery_id === emp.id)}
        message={message} error={error} loading={loading} editMode={editMode}
        onLogout={doLogout} onLoad={load} onChangeStatus={changeStatus}
        onLoadLogs={loadOrderLogs} orderLogs={orderLogs}
        logsLoading={logsLoading} logsFor={logsFor} logsTableReady={logsTableReady} today={today}
      />
    );
  }

  // ── Owner preview of an employee's view ────────────────────────────────────
  if (role === 'owner' && viewAsEmp !== null) {
    const emp = employees.find(e => e.id === viewAsEmp);
    if (emp) return (
      <div>
        <div style={{ background:'#1d4ed8', color:'white', padding:'10px 20px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, zIndex:50 }}>
          <span style={{ fontSize:14 }}>👁 ดูในฐานะ: <b>{emp.name}</b>{emp.position ? ` · ${emp.position}` : ''}</span>
          <button style={{ background:'rgba(255,255,255,0.2)', color:'white', fontWeight:700,
            borderRadius:8, padding:'5px 14px', fontSize:13, border:'none', cursor:'pointer' }}
            onClick={() => setViewAsEmp(null)}>
            ← กลับหน้าเจ้าของร้าน
          </button>
        </div>
        <EmployeeView
          emp={emp}
          orders={orders.filter(o => o.designer_id === emp.id || o.production_id === emp.id || o.receiver_id === emp.id || o.measurer_id === emp.id || o.delivery_id === emp.id)}
          message={message} error={error} loading={loading} editMode={true}
          onLogout={() => setViewAsEmp(null)} onLoad={load} onChangeStatus={changeStatus}
          onLoadLogs={loadOrderLogs} orderLogs={orderLogs}
          logsLoading={logsLoading} logsFor={logsFor} logsTableReady={logsTableReady} today={today}
        />
      </div>
    );
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS = [
    ['dashboard','Dashboard'], ['new-order','เปิดงานใหม่'],
    ['tracking','ติดตามงาน'],  ['orders','งานทั้งหมด'],
    ['unpaid','ค้างชำระ'],     ['customers','ลูกค้า'],
    ['employees','พนักงาน'],   ['analytics','วิเคราะห์'],
    ['assessments','ประเมินพนักงาน'], ['slips','สลิปโอนเงิน'],
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="container">
      <div className="top">
        <div>
          <div className="brand">Idea Inkjet Cloud V2</div>
          <div className="sub">
            ระบบรับงาน + ติดตามสถานะงาน
            {lastRefresh && <span style={{ marginLeft:8, fontSize:11, color:'#9ca3af' }}>อัปเดต {lastRefresh.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' })}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* Calc link */}
          <a href="/calc" style={{ fontSize:16, padding:'6px 10px', textDecoration:'none',
            background:'var(--card)', border:'1px solid var(--line)', borderRadius:8, lineHeight:1 }}
            title="คำนวณราคาป้าย">🧮</a>
          {/* Notification Bell */}
          <div style={{ position:'relative' }}>
            <button className="btnSm btn2" onClick={() => setNotifOpen(v => !v)} style={{ fontSize:16, padding:'6px 10px' }}>
              🔔
              {(stats.overdue + stats.today) > 0 && (
                <span className="badge" style={{ position:'absolute', top:-4, right:-4, fontSize:10, padding:'1px 5px' }}>
                  {stats.overdue + stats.today}
                </span>
              )}
            </button>
            {notifOpen && (
              <div style={{ position:'absolute', right:0, top:'110%', width:300, background:'white',
                border:'1px solid var(--line)', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,.12)',
                zIndex:200, padding:14 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>การแจ้งเตือน</div>
                {notifPerm !== 'granted' && (
                  <button className="btnGreen btnSm" style={{ width:'100%', marginBottom:10, fontSize:12 }}
                    onClick={requestNotifPermission}>
                    เปิดแจ้งเตือนบราวเซอร์
                  </button>
                )}
                {stats.overdue > 0 ? (
                  <div>
                    <div style={{ color:'#dc2626', fontWeight:600, fontSize:13, marginBottom:4 }}>⚠️ งานเลยกำหนด {stats.overdue} งาน</div>
                    {orders.filter(o => !!o.due_date && o.due_date < today && !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status))
                      .slice(0,5).map(o => (
                      <div key={o.id} style={{ fontSize:12, padding:'4px 0', borderBottom:'1px solid var(--line)', color:'#374151' }}>
                        <b>{o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}</b> {o.title}
                        <div style={{ color:'#dc2626', fontSize:11 }}>กำหนด {fmtDate(o.due_date)} ({o.customers?.name || '-'})</div>
                      </div>
                    ))}
                  </div>
                ) : <div style={{ fontSize:13, color:'#6b7280' }}>ไม่มีงานเลยกำหนด ✓</div>}
                {stats.today > 0 && (
                  <div style={{ marginTop:10 }}>
                    <div style={{ color:'#c2410c', fontWeight:600, fontSize:13, marginBottom:4 }}>🔔 นัดส่งวันนี้ {stats.today} งาน</div>
                    {orders.filter(o => o.due_date === today && !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status))
                      .slice(0,5).map(o => (
                      <div key={o.id} style={{ fontSize:12, padding:'4px 0', borderBottom:'1px solid var(--line)', color:'#374151' }}>
                        <b>{o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}</b> {o.title}
                        <div style={{ color:'#c2410c', fontSize:11 }}>{o.customers?.name || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn2 btnSm" style={{ width:'100%', marginTop:10, fontSize:12 }}
                  onClick={() => { setNotifOpen(false); setTab('tracking'); }}>
                  ดูบอร์ดติดตามงาน →
                </button>
              </div>
            )}
          </div>
          <button onClick={load} disabled={loading} className="btnSm">{loading ? 'โหลด...' : 'รีเฟรช'}</button>
          <button className="btn2 btnSm" onClick={doLogout}>ออกจากระบบ</button>
        </div>
      </div>

      {message && <div className="notice">{message}</div>}
      {error   && <div className="notice error">{error}</div>}

      <div className="tabs">
        {TABS.map(t => (
          <button key={t[0]} onClick={() => setTab(t[0])} className={`tab${tab === t[0] ? ' active' : ''}`}>
            {t[1]}
            {t[0] === 'tracking' && (stats.overdue + stats.today) > 0 && <span className="badge">{stats.overdue + stats.today}</span>}
            {t[0] === 'orders'   && stats.overdue > 0 && <span className="badge">{stats.overdue}</span>}
            {t[0] === 'unpaid'   && unpaidByCustomer.length > 0 && <span className="badge">{unpaidByCustomer.length}</span>}
            {t[0] === 'slips'    && paymentSlips.filter(s => s.status === 'pending').length > 0 && <span className="badge">{paymentSlips.filter(s => s.status === 'pending').length}</span>}
          </button>
        ))}
      </div>

      {/* ═══ LOGS TABLE SETUP NOTICE ════════════════════════════════════════ */}
      {!logsTableReady && (
        <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ fontWeight:700, color:'#c2410c', marginBottom:6 }}>⚠️ ไม่สามารถบันทึกประวัติสถานะได้</div>
          {logsTableError && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'6px 10px', fontFamily:'monospace', fontSize:11, color:'#991b1b', marginBottom:8, wordBreak:'break-all' }}>
              Error: {logsTableError}
            </div>
          )}
          <div style={{ fontSize:13, color:'#78350f', marginBottom:10 }}>
            กรุณารัน SQL นี้ใน <b>Supabase → SQL Editor</b> เพื่อสร้างตารางและปิด RLS:
          </div>
          <div style={{ background:'#1e293b', color:'#86efac', borderRadius:8, padding:'12px 14px', fontFamily:'monospace', fontSize:12, marginBottom:10, userSelect:'all', overflowX:'auto' }}>
            CREATE TABLE IF NOT EXISTS order_status_logs (<br/>
            &nbsp;&nbsp;id BIGSERIAL PRIMARY KEY,<br/>
            &nbsp;&nbsp;order_id BIGINT NOT NULL,<br/>
            &nbsp;&nbsp;old_status TEXT DEFAULT '',<br/>
            &nbsp;&nbsp;new_status TEXT NOT NULL,<br/>
            &nbsp;&nbsp;note TEXT DEFAULT '',<br/>
            &nbsp;&nbsp;changed_by TEXT DEFAULT '',<br/>
            &nbsp;&nbsp;created_at TIMESTAMPTZ DEFAULT NOW()<br/>
            );<br/>
            ALTER TABLE order_status_logs DISABLE ROW LEVEL SECURITY;
          </div>
          <button className="btnSm" style={{ background:'#c2410c', color:'white' }}
            onClick={() => { setLogsTableReady(true); }}>
            ✓ สร้างแล้ว — ปิดแจ้งเตือน
          </button>
        </div>
      )}

      {/* ═══ TRACKING BOARD ══════════════════════════════════════════════════ */}
      {tab === 'tracking' && (
        <KanbanBoard orders={orders} today={today} employees={employees} onChangeStatus={changeStatus} />
      )}

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
                  const isOverdue  = !!o.due_date && o.due_date < today && !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status);
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
                              {statusesForOrder(o).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {Number(o.balance) > 0 && (
                              <button className="btnGreen" onClick={() => {
                                setPayingOrder(o); setPayForm({ amount: String(o.balance), method:'เงินสด', received_by:'เจ้าของร้าน' });
                              }}>รับเงิน</button>
                            )}
                            <button className="btn2"    onClick={() => openEditOrder(o)}>แก้ไข</button>
                            <button className="btnPrint" onClick={() => setPrintOrder(o)}>ใบส่งงาน</button>
                            <button className="btnPrint" style={{ background:'#0369a1' }} onClick={() => { setReceiptOrder(o); setReceiptType('cash'); }}>ใบเสร็จ</button>
                            <button className="btnPrint" style={{ background:'#7c3aed' }} onClick={() => { setReceiptOrder(o); setReceiptType('tax'); }}>กำกับภาษี</button>
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
                              {o.file_status     && <span><b>ไฟล์งาน:</b> {o.file_status}</span>}
                              {o.delivery_method && <span><b>การรับงาน:</b> {o.delivery_method}</span>}
                              <span><b>การชำระ:</b> {o.payment_type || 'เงินสด'}{o.payment_type === 'เครดิต' && o.credit_days ? ` ${o.credit_days} วัน` : ''}</span>
                              {o.receiver   && <span><b>รับงาน:</b> {o.receiver.name}</span>}
                              {o.measurer   && <span><b>วัดป้าย:</b> {o.measurer.name}</span>}
                              {o.designer   && <span><b>ออกแบบ:</b> {o.designer.name}</span>}
                              {o.production && <span><b>ผลิต:</b> {o.production.name}</span>}
                              {o.delivery   && <span><b>ส่งงาน:</b> {o.delivery.name}</span>}
                              {o.finishing  && <span className="detailFull"><b>ฟินิชชิ่ง:</b> {o.finishing}</span>}
                              {o.detail     && <span className="detailFull"><b>หมายเหตุ:</b> {o.detail}</span>}
                            </div>
                            <div style={{ marginTop:10 }}>
                              {logsFor !== o.id
                                ? <button className="btnSm btn2" onClick={() => loadOrderLogs(o.id)}>📋 ดูประวัติสถานะ</button>
                                : <LogTimeline logs={orderLogs} loading={logsLoading} logsFor={logsFor} orderId={o.id} tableReady={logsTableReady} />
                              }
                            </div>
                            {/* Payment slips for this order */}
                            {(() => {
                              const orderSlips = paymentSlips.filter((s: any) => s.order_id === o.id);
                              if (!orderSlips.length) return null;
                              return (
                                <div style={{ marginTop:10, borderTop:'1px solid #e5e7eb', paddingTop:10 }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:'#0369a1', marginBottom:8 }}>📎 สลิปโอนเงินจากลูกค้า ({orderSlips.length})</div>
                                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                    {orderSlips.map((s: any) => (
                                      <div key={s.id} style={{ background: s.status === 'pending' ? '#eff6ff' : '#f0fdf4', border:`1px solid ${s.status === 'pending' ? '#bfdbfe' : '#bbf7d0'}`, borderRadius:10, padding:'10px 12px' }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                                          <div>
                                            <b style={{ color:'#1e293b' }}>{Number(s.amount).toLocaleString('th-TH')} บาท</b>
                                            {s.transferred_at && <span style={{ fontSize:12, color:'#6b7280', marginLeft:8 }}>{new Date(s.transferred_at).toLocaleString('th-TH', { timeZone:'Asia/Bangkok', dateStyle:'short', timeStyle:'short' })}</span>}
                                          </div>
                                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background: s.status === 'pending' ? '#dbeafe' : '#d1fae5', color: s.status === 'pending' ? '#1d4ed8' : '#15803d', fontWeight:600 }}>
                                            {s.status === 'pending' ? 'รอตรวจสอบ' : 'ตรวจสอบแล้ว'}
                                          </span>
                                        </div>
                                        {s.reference_no && <div style={{ fontSize:12, color:'#374151' }}>เลขอ้างอิง: {s.reference_no}</div>}
                                        {s.note && <div style={{ fontSize:12, color:'#374151' }}>หมายเหตุ: {s.note}</div>}
                                        {s.slip_url && (
                                          <div style={{ marginTop:8, display:'flex', gap:8, alignItems:'center' }}>
                                            <img src={s.slip_url} alt="สลิป" onClick={() => setSlipViewing(s.id)}
                                              style={{ width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid #e5e7eb', cursor:'pointer' }} />
                                            <a href={s.slip_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#1d4ed8' }}>เปิดเต็มจอ ↗</a>
                                          </div>
                                        )}
                                        {s.status === 'pending' && (
                                          <button className="btnSm btnGreen" style={{ marginTop:8 }} onClick={() => markSlipReviewed(s.id)}>
                                            ✓ ยืนยันรับเงินแล้ว
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
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
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h2 style={{ margin:0 }}>เพิ่มลูกค้า</h2>
              <CopyLinkBtn path="/register" label="ลิงค์ลงทะเบียนลูกค้า" color="#7c3aed" />
            </div>
            <form className="form" onSubmit={addCustomer}>
              <Field label="ชื่อ / บริษัท" full><input required value={custForm.name} onChange={e => setCustForm({...custForm, name:e.target.value})} /></Field>
              <Field label="เบอร์โทร"><input value={custForm.phone} onChange={e => setCustForm({...custForm, phone:e.target.value})} /></Field>
              <Field label="Line ID"><input value={custForm.line_id} onChange={e => setCustForm({...custForm, line_id:e.target.value})} /></Field>
              <Field label="ช่องทางติดต่อ" full><input value={custForm.contact_channel} onChange={e => setCustForm({...custForm, contact_channel:e.target.value})} /></Field>
              <Field label="ที่อยู่ (สำหรับใบกำกับภาษี)" full><textarea value={custForm.address} onChange={e => setCustForm({...custForm, address:e.target.value})} style={{ minHeight:60 }} /></Field>
              <Field label="เลขผู้เสียภาษี" full><input value={custForm.tax_id} onChange={e => setCustForm({...custForm, tax_id:e.target.value})} placeholder="13 หลัก (ไม่บังคับ)" /></Field>
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
                      <CopyLinkBtn path={`/customer/${c.id}`} label="ลิงค์ลูกค้า" />
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
        <section>
          <div className="two" style={{ marginBottom:14 }}>
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
                <Field label="รหัสเข้าใช้งาน" full>
                  <input type="password" placeholder="ตั้งรหัส 4–8 ตัว (ไม่บังคับ)"
                    value={empForm.pin} onChange={e => setEmpForm({...empForm, pin:e.target.value})} />
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
                  const asRec = orders.filter(o => o.receiver_id   === emp.id).length;
                  const asMea = orders.filter(o => o.measurer_id   === emp.id).length;
                  const asDel = orders.filter(o => o.delivery_id   === emp.id).length;
                  return (
                    <div key={emp.id} className="listRow">
                      <div>
                        <b>{emp.name}</b>
                        <span className="sub"> {emp.position || '-'} | {emp.role}</span>
                        {emp.pin
                          ? <span className="countBadge" style={{ background:'#dcfce7', color:'#166534' }}>🔒 มีรหัส</span>
                          : <span className="countBadge" style={{ background:'#fee2e2', color:'#991b1b' }}>🔓 ยังไม่มีรหัส</span>}
                        <div style={{ marginTop:3 }}>
                          <span className="countBadge">{asDes + asPro + asRec + asMea + asDel} งาน</span>
                          {asRec > 0 && <span className="countBadge" style={{ background:'#dbeafe', color:'#1d4ed8' }}>รับงาน {asRec}</span>}
                          {asDes > 0 && <span className="countBadge" style={{ background:'#fef9c3', color:'#854d0e' }}>ออกแบบ {asDes}</span>}
                          {asMea > 0 && <span className="countBadge" style={{ background:'#d1fae5', color:'#065f46' }}>วัดป้าย {asMea}</span>}
                          {asPro > 0 && <span className="countBadge" style={{ background:'#fae8ff', color:'#7e22ce' }}>ผลิต {asPro}</span>}
                          {asDel > 0 && <span className="countBadge" style={{ background:'#fef3c7', color:'#92400e' }}>ส่งงาน {asDel}</span>}
                        </div>
                      </div>
                      <div className="rowActions">
                        <button className="btnSm" style={{ background:'#0891b2' }} onClick={() => setViewAsEmp(emp.id)}>ดูหน้าจอ</button>
                        <button className="btn2 btnSm" onClick={() => openEditEmployee(emp)}>แก้ไข/รหัส</button>
                        <CopyLinkBtn path={`/emp/${emp.id}`} label="คัดลอกลิงค์" />
                        {(asDes + asPro + asRec + asMea + asDel) === 0 && <button className="btnRed btnSm" onClick={() => deleteEmployee(emp.id)}>ลบ</button>}
                      </div>
                    </div>
                  );
                })}
                {employees.length === 0 && <p className="sub">ยังไม่มีพนักงาน</p>}
              </div>
            </div>
          </div>
          <OwnerPinManager ownerPin={ownerPin} onSave={saveOwnerPin} />
          <ShopSettingsManager settings={shopSettings} onSave={saveShopSettings} />
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

      {/* ═══ ASSESSMENTS ═════════════════════════════════════════════════════ */}
      {tab === 'assessments' && (() => {
        const starLabel = (n: number) => ['','ต้องปรับปรุง','พอใช้','ดี','ดีมาก','ยอดเยี่ยม'][n] ?? '';
        const starBar   = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
        const scoreColor = (n: number) => n >= 4 ? '#16a34a' : n >= 3 ? '#d97706' : '#dc2626';

        // Aggregate per-employee stats across all assessments
        const empMap: Record<number, { name: string; role: string; ratings: number[]; comments: string[] }> = {};
        assessments.forEach((a: any) => {
          (a.employee_ratings ?? []).forEach((r: any) => {
            const id = r.employee_id;
            if (!empMap[id]) empMap[id] = { name: r.employees?.name ?? `พนักงาน #${id}`, role: r.employee_role ?? '', ratings: [], comments: [] };
            if (r.rating) empMap[id].ratings.push(r.rating);
            if (r.comment) empMap[id].comments.push(r.comment);
          });
        });

        const empStats = Object.entries(empMap).map(([id, v]) => ({
          id: Number(id),
          name: v.name,
          role: v.role,
          count: v.ratings.length,
          avg: v.ratings.length ? v.ratings.reduce((s, n) => s + n, 0) / v.ratings.length : 0,
          comments: v.comments,
        })).sort((a, b) => b.avg - a.avg);

        const avgOverall = assessments.length > 0
          ? assessments.reduce((s: number, a: any) => s + (a.overall_rating || 0), 0) / assessments.length
          : 0;

        const [asmtView, setAsmtView] = useState<'leaderboard'|'feedback'>('leaderboard');

        return (
          <section>
            {/* KPI strip */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
              <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>ประเมินทั้งหมด</div>
                <div style={{ fontSize:24, fontWeight:800, color:'#1d4ed8' }}>{assessments.length}</div>
              </div>
              <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>คะแนนเฉลี่ยรวม</div>
                <div style={{ fontSize:24, fontWeight:800, color: scoreColor(avgOverall) }}>
                  {avgOverall > 0 ? avgOverall.toFixed(1) : '-'}<span style={{ fontSize:13, fontWeight:400 }}>/5</span>
                </div>
              </div>
              <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>พนักงานที่ถูกประเมิน</div>
                <div style={{ fontSize:24, fontWeight:800, color:'#7c3aed' }}>{empStats.length} คน</div>
              </div>
            </div>

            {/* Toggle */}
            <div className="tabs" style={{ marginBottom:14 }}>
              <button className={`tab${asmtView==='leaderboard'?' active':''}`} onClick={() => setAsmtView('leaderboard')}>
                🏆 คะแนนรายคน
              </button>
              <button className={`tab${asmtView==='feedback'?' active':''}`} onClick={() => setAsmtView('feedback')}>
                💬 Feedback ทั้งหมด
              </button>
            </div>

            {assessments.length === 0 && (
              <div className="card" style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>⭐</div>
                <div style={{ fontWeight:600 }}>ยังไม่มีการประเมิน</div>
                <div style={{ fontSize:13, marginTop:4 }}>ลูกค้าจะเห็นปุ่มประเมินเมื่อสถานะงานเป็น "ลูกค้ารับแล้ว" หรือ "ชำระเงินแล้ว"</div>
              </div>
            )}

            {/* Leaderboard view */}
            {asmtView === 'leaderboard' && empStats.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {empStats.map((emp, i) => (
                  <div key={emp.id} className="card" style={{ borderLeft:`4px solid ${i===0?'#f59e0b':i===1?'#9ca3af':i===2?'#b45309':'#e5e7eb'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ width:40, height:40, borderRadius:'50%', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#1d4ed8', fontSize:16, flexShrink:0 }}>
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            {i < 3 && <span style={{ fontSize:16 }}>{['🥇','🥈','🥉'][i]}</span>}
                            <span style={{ fontWeight:700, fontSize:15 }}>{emp.name}</span>
                          </div>
                          <div style={{ fontSize:12, color:'var(--muted)' }}>ถูกประเมิน {emp.count} ครั้ง</div>
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:28, fontWeight:800, color: scoreColor(emp.avg) }}>{emp.avg.toFixed(1)}</div>
                        <div style={{ fontSize:15, color:'#f59e0b', letterSpacing:2 }}>{starBar(emp.avg)}</div>
                        <div style={{ fontSize:11, fontWeight:600, color: scoreColor(emp.avg) }}>{starLabel(Math.round(emp.avg))}</div>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div style={{ marginTop:10, background:'#f3f4f6', borderRadius:100, height:8, overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:100, background: scoreColor(emp.avg), width:`${(emp.avg/5)*100}%`, transition:'width 0.4s' }} />
                    </div>

                    {emp.comments.length > 0 && (
                      <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
                        {emp.comments.slice(0, 2).map((c, ci) => (
                          <div key={ci} style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'6px 10px', fontSize:13, color:'#374151' }}>
                            "{c}"
                          </div>
                        ))}
                        {emp.comments.length > 2 && (
                          <div style={{ fontSize:12, color:'var(--muted)' }}>และอีก {emp.comments.length - 2} ความคิดเห็น...</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Feedback view — per-assessment */}
            {asmtView === 'feedback' && assessments.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {assessments.map((a: any) => (
                  <div key={a.id} className="card">
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8, marginBottom:10 }}>
                      <div>
                        {a.orders?.order_code && <div style={{ fontSize:12, color:'var(--muted)' }}>{a.orders.order_code}</div>}
                        <div style={{ fontWeight:700, fontSize:15 }}>{a.orders?.title ?? `งาน #${a.order_id}`}</div>
                        {a.orders?.customers?.name && <div style={{ fontSize:13, color:'var(--muted)' }}>ลูกค้า: {a.orders.customers.name}</div>}
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:20, color:'#f59e0b' }}>{starBar(a.overall_rating || 0)}</div>
                        <div style={{ fontSize:12, fontWeight:700, color: scoreColor(a.overall_rating||0) }}>{starLabel(a.overall_rating||0)}</div>
                      </div>
                    </div>

                    {/* Per-employee ratings in this assessment */}
                    {(a.employee_ratings ?? []).length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
                        {(a.employee_ratings ?? []).map((r: any) => (
                          <div key={r.id} style={{ background:'#f8fafc', borderRadius:8, padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                            <div>
                              <span style={{ fontWeight:600, fontSize:13 }}>{r.employees?.name ?? `#${r.employee_id}`}</span>
                              <span style={{ fontSize:11, color:'var(--muted)', marginLeft:6 }}>({r.employee_role})</span>
                              {r.comment && <div style={{ fontSize:12, color:'#374151', marginTop:2 }}>"{r.comment}"</div>}
                            </div>
                            <div style={{ textAlign:'right', flexShrink:0 }}>
                              <div style={{ fontWeight:800, fontSize:15, color: scoreColor(r.rating||0) }}>{r.rating ?? '-'}/5</div>
                              <div style={{ fontSize:12, color:'#f59e0b' }}>{starBar(r.rating||0)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {a.comment && (
                      <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#374151' }}>
                        <span style={{ fontSize:11, color:'#92400e', fontWeight:600 }}>ข้อเสนอแนะ: </span>{a.comment}
                      </div>
                    )}
                    <div style={{ marginTop:6, fontSize:11, color:'var(--muted)' }}>
                      {new Date(a.created_at).toLocaleString('th-TH', { timeZone:'Asia/Bangkok', dateStyle:'medium', timeStyle:'short' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {/* ═══ PAYMENT SLIPS ═══════════════════════════════════════════════════ */}
      {tab === 'slips' && (() => {
        const pending  = paymentSlips.filter(s => s.status === 'pending');
        const reviewed = paymentSlips.filter(s => s.status === 'reviewed');
        return (
          <section>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
              <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>สลิปทั้งหมด</div>
                <div style={{ fontSize:24, fontWeight:800, color:'#1d4ed8' }}>{paymentSlips.length}</div>
              </div>
              <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>รอตรวจสอบ</div>
                <div style={{ fontSize:24, fontWeight:800, color: pending.length > 0 ? '#dc2626' : '#6b7280' }}>{pending.length}</div>
              </div>
              <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>ตรวจสอบแล้ว</div>
                <div style={{ fontSize:24, fontWeight:800, color:'#16a34a' }}>{reviewed.length}</div>
              </div>
            </div>

            {paymentSlips.length === 0 ? (
              <div className="card" style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📎</div>
                <div style={{ fontWeight:600 }}>ยังไม่มีสลิปโอนเงิน</div>
                <div style={{ fontSize:13, marginTop:4 }}>ลูกค้าจะส่งสลิปผ่านหน้าติดตามงาน</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {paymentSlips.map((s: any) => (
                  <div key={s.id} className="card" style={{ borderLeft:`4px solid ${s.status === 'pending' ? '#3b82f6' : '#16a34a'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8, marginBottom:10 }}>
                      <div>
                        {s.orders?.order_code && <div style={{ fontSize:12, color:'var(--muted)' }}>{s.orders.order_code}</div>}
                        <div style={{ fontWeight:700, fontSize:15 }}>{s.orders?.title ?? `งาน #${s.order_id}`}</div>
                        {s.orders?.customers?.name && <div style={{ fontSize:13, color:'var(--muted)' }}>ลูกค้า: {s.orders.customers.name}</div>}
                      </div>
                      <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background: s.status === 'pending' ? '#dbeafe' : '#d1fae5', color: s.status === 'pending' ? '#1d4ed8' : '#15803d', fontWeight:700 }}>
                        {s.status === 'pending' ? '⏳ รอตรวจสอบ' : '✅ ตรวจสอบแล้ว'}
                      </span>
                    </div>

                    <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize:22, fontWeight:800, color:'#16a34a' }}>{Number(s.amount).toLocaleString('th-TH')} บาท</div>
                        {s.transferred_at && (
                          <div style={{ fontSize:13, color:'#374151', marginTop:4 }}>
                            โอนเมื่อ: {new Date(s.transferred_at).toLocaleString('th-TH', { timeZone:'Asia/Bangkok', dateStyle:'medium', timeStyle:'short' })}
                          </div>
                        )}
                        {s.reference_no && <div style={{ fontSize:13, color:'#374151', marginTop:2 }}>เลขอ้างอิง: <b>{s.reference_no}</b></div>}
                        {s.note && <div style={{ fontSize:13, color:'#374151', marginTop:2 }}>หมายเหตุ: {s.note}</div>}
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>
                          แจ้งเมื่อ: {new Date(s.created_at).toLocaleString('th-TH', { timeZone:'Asia/Bangkok', dateStyle:'short', timeStyle:'short' })}
                        </div>
                      </div>

                      {s.slip_url && (
                        <div>
                          <img src={s.slip_url} alt="สลิป"
                            onClick={() => window.open(s.slip_url, '_blank')}
                            style={{ width:100, height:130, objectFit:'cover', borderRadius:10, border:'1px solid #e5e7eb', cursor:'pointer', display:'block' }} />
                          <a href={s.slip_url} target="_blank" rel="noreferrer"
                            style={{ fontSize:11, color:'#1d4ed8', display:'block', textAlign:'center', marginTop:4 }}>เปิดเต็มจอ ↗</a>
                        </div>
                      )}
                    </div>

                    {s.status === 'pending' && (
                      <button className="btnSm btnGreen" style={{ marginTop:12 }} onClick={() => markSlipReviewed(s.id)}>
                        ✓ ยืนยันรับเงินแล้ว
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {tab === 'unpaid' && (() => {
        const FOLLOWUP_STATUSES = [
          { value: 'ยังไม่ติดต่อ',            bg: '#f3f4f6', color: '#6b7280' },
          { value: 'ติดต่อแล้ว รอชำระ',       bg: '#dbeafe', color: '#1d4ed8' },
          { value: 'นัดชำระแล้ว',              bg: '#dcfce7', color: '#15803d' },
          { value: 'มีปัญหา / ติดต่อไม่ได้',  bg: '#fee2e2', color: '#dc2626' },
        ];

        let displayedUnpaid = [...unpaidByCustomer];

        if (unpaidFilter === 'untouched') {
          displayedUnpaid = displayedUnpaid.filter(x => !followups[x.customer.id] || followups[x.customer.id].status === 'ยังไม่ติดต่อ');
        } else if (unpaidFilter === 'promised') {
          displayedUnpaid = displayedUnpaid.filter(x => followups[x.customer.id]?.status === 'นัดชำระแล้ว');
        } else if (unpaidFilter === 'overdue') {
          displayedUnpaid = displayedUnpaid.filter(x => x.orders.some(o => {
            if (o.payment_type === 'เครดิต') {
              const d = new Date(o.due_date); d.setDate(d.getDate() + Number(o.credit_days || 30));
              return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }) < today;
            }
            return !!o.due_date && o.due_date < today;
          }));
        }

        if (unpaidSort === 'balance') {
          displayedUnpaid.sort((a, b) => b.totalBalance - a.totalBalance);
        } else if (unpaidSort === 'name') {
          displayedUnpaid.sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'th'));
        } else {
          displayedUnpaid.sort((a, b) => {
            const aOv = a.orders.some(o => o.due_date && o.due_date < today) ? 1 : 0;
            const bOv = b.orders.some(o => o.due_date && o.due_date < today) ? 1 : 0;
            return bOv - aOv || b.totalBalance - a.totalBalance;
          });
        }

        return (
          <section>
            {/* Summary */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
              {[
                ['ลูกค้าค้างชำระ', `${unpaidByCustomer.length} ราย`, '#dc2626'],
                ['งานค้างชำระ',    `${unpaidByCustomer.reduce((s,x)=>s+x.orders.length,0)} งาน`, '#c2410c'],
                ['ยอดรวมทั้งหมด',  `${fmtMoney(unpaidByCustomer.reduce((s,x)=>s+x.totalBalance,0))} ฿`, '#7c3aed'],
              ].map(([label, val, color]) => (
                <div key={label as string} className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:20, fontWeight:800, color: color as string }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Sort + Filter controls */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, color:'var(--muted)', whiteSpace:'nowrap' }}>เรียงตาม:</span>
                {(['overdue','balance','name'] as const).map(s => (
                  <button key={s} className={unpaidSort === s ? 'btnSm btnGreen' : 'btnSm btn2'}
                    onClick={() => setUnpaidSort(s)}>
                    {s === 'overdue' ? 'เลยกำหนด' : s === 'balance' ? 'ยอดสูง' : 'ชื่อ'}
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {([
                  ['all','ทั้งหมด'],['untouched','ยังไม่ติดต่อ'],['promised','นัดชำระ'],['overdue','มีปัญหา'],
                ] as const).map(([v, label]) => (
                  <button key={v} className={unpaidFilter === v ? 'btnSm btnGreen' : 'btnSm btn2'}
                    onClick={() => setUnpaidFilter(v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {unpaidByCustomer.length === 0 ? (
              <div className="card" style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🎉</div>
                <div style={{ fontWeight:600 }}>ไม่มียอดค้างชำระ</div>
                <div style={{ fontSize:13, marginTop:4 }}>ลูกค้าทุกคนชำระครบแล้ว</div>
              </div>
            ) : displayedUnpaid.length === 0 ? (
              <div className="card" style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>
                <div style={{ fontSize:13 }}>ไม่มีรายการในกลุ่มที่เลือก</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {displayedUnpaid.map(({ customer, orders: custOrders, totalBalance }) => {
                  const hasCredit = custOrders.some(o => o.payment_type === 'เครดิต');
                  const hasCash   = custOrders.some(o => o.payment_type !== 'เครดิต');

                  function creditPayDue(o: Order): string | null {
                    if (o.payment_type !== 'เครดิต' || !o.due_date || !o.credit_days) return null;
                    const d = new Date(o.due_date);
                    d.setDate(d.getDate() + Number(o.credit_days));
                    return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
                  }

                  const isAnyOverdue = custOrders.some(o => {
                    if (o.payment_type === 'เครดิต') {
                      const cpd = creditPayDue(o);
                      return !!cpd && cpd < today;
                    }
                    return !!o.due_date && o.due_date < today;
                  });

                  const reminderText = [
                    `สวัสดีครับ คุณ${customer.name} 🙏`,
                    `ทางร้าน Idea Inkjet ขอแจ้งเตือนยอดค้างชำระดังนี้ครับ`,
                    ``,
                    ...custOrders.map(o => {
                      const cpd = creditPayDue(o);
                      const payInfo = o.payment_type === 'เครดิต'
                        ? ` [เครดิต ${o.credit_days} วัน${cpd ? ` ครบกำหนด ${fmtDate(cpd)}` : ''}]`
                        : ` [เงินสด]`;
                      return `• ${orderCode(o)} ${o.title}${payInfo}\n  ยอดค้าง: ${fmtMoney(Number(o.balance))} บาท`;
                    }),
                    ``,
                    `ยอดรวมค้างชำระ: ${fmtMoney(totalBalance)} บาท`,
                    `กรุณาติดต่อชำระเงินที่ร้านหรือโอนมาได้เลยนะครับ`,
                    `ขอบคุณมากครับ 🙏 Idea Inkjet`,
                  ].join('\n');

                  const fu = followups[customer.id];
                  const fuStatus = fu?.status || 'ยังไม่ติดต่อ';
                  const fuStyle = FOLLOWUP_STATUSES.find(s => s.value === fuStatus) || FOLLOWUP_STATUSES[0];

                  return (
                    <div key={customer.id} className="card"
                      style={{ border: isAnyOverdue ? '1px solid #fca5a5' : '1px solid var(--line)', padding:'16px 18px' }}>
                      {/* Customer header */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8, marginBottom:8 }}>
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            <span style={{ fontWeight:700, fontSize:16, color:'#1e293b' }}>{customer.name}</span>
                            {hasCredit && <span style={{ fontSize:11, background:'#ede9fe', color:'#5b21b6', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>เครดิต</span>}
                            {hasCash   && <span style={{ fontSize:11, background:'#d1fae5', color:'#065f46', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>เงินสด</span>}
                          </div>
                          <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>
                            {customer.phone && <span>📞 {customer.phone}</span>}
                            {customer.line_id && <span style={{ marginLeft:10 }}>LINE: {customer.line_id}</span>}
                          </div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                          <div style={{ fontSize:20, fontWeight:800, color:'#dc2626' }}>{fmtMoney(totalBalance)} ฿</div>
                          {isAnyOverdue && <div style={{ fontSize:11, color:'#dc2626' }}>⚠️ เลยกำหนดชำระ</div>}
                          {/* Follow-up status badge */}
                          <span style={{ fontSize:11, background: fuStyle.bg, color: fuStyle.color, padding:'2px 10px', borderRadius:20, fontWeight:700 }}>
                            {fuStatus}
                          </span>
                        </div>
                      </div>

                      {/* Follow-up info */}
                      {fu && (fu.note || fu.promisedDate) && (
                        <div style={{ background:'#f8fafc', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:13 }}>
                          {fu.promisedDate && <div style={{ color:'#15803d', fontWeight:600, marginBottom:2 }}>นัดชำระ: {fmtDate(fu.promisedDate)}</div>}
                          {fu.note && <div style={{ color:'#374151' }}>{fu.note}</div>}
                          {fu.updatedAt && <div style={{ color:'#9ca3af', fontSize:11, marginTop:4 }}>อัปเดต: {fmtDateTime(fu.updatedAt)}</div>}
                        </div>
                      )}

                      {/* Orders list */}
                      <div style={{ borderTop:'1px solid #f3f4f6', paddingTop:10, marginBottom:12 }}>
                        {custOrders.map(o => {
                          const isCredit  = o.payment_type === 'เครดิต';
                          const cpd       = creditPayDue(o);
                          const payExpired = cpd ? cpd < today : (!isCredit && !!o.due_date && o.due_date < today);
                          return (
                            <div key={o.id} style={{ padding:'8px 0', borderBottom:'1px dashed #f3f4f6' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, flexWrap:'wrap' }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                    <span style={{ fontSize:12, color:'var(--muted)' }}>{orderCode(o)}</span>
                                    <span style={{ fontSize:14, fontWeight:600 }}>{o.title}</span>
                                    {isCredit
                                      ? <span style={{ fontSize:11, background:'#ede9fe', color:'#5b21b6', padding:'1px 7px', borderRadius:20, fontWeight:700, whiteSpace:'nowrap' }}>
                                          เครดิต {o.credit_days} วัน
                                        </span>
                                      : <span style={{ fontSize:11, background:'#d1fae5', color:'#065f46', padding:'1px 7px', borderRadius:20, fontWeight:700 }}>
                                          เงินสด
                                        </span>
                                    }
                                  </div>
                                  <div style={{ fontSize:12, marginTop:3, color: payExpired ? '#dc2626' : 'var(--muted)' }}>
                                    {isCredit
                                      ? cpd
                                        ? <>{payExpired ? '⚠️ ' : ''}ครบกำหนดชำระ {fmtDate(cpd)}{payExpired ? ' (เลยกำหนด)' : ''}</>
                                        : 'ยังไม่ระบุวันนัดส่ง'
                                      : o.due_date
                                        ? <>นัดส่ง {fmtDate(o.due_date)}{payExpired ? ' ⚠️ เลยกำหนด' : ''}</>
                                        : null
                                    }
                                  </div>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                                  <b style={{ color:'#dc2626', whiteSpace:'nowrap' }}>{fmtMoney(Number(o.balance))} ฿</b>
                                  <button className="btnSm btnGreen"
                                    onClick={() => { setPayingOrder(o); setPayForm({ amount: String(o.balance), method: isCredit ? 'โอนธนาคาร' : 'เงินสด', received_by:'เจ้าของร้าน' }); }}>
                                    รับชำระ
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Actions */}
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <button className="btnSm btnGreen"
                          onClick={() => {
                            const biggest = [...custOrders].sort((a,b)=>Number(b.balance)-Number(a.balance))[0];
                            setPayingOrder(biggest);
                            setPayForm({ amount: String(biggest.balance), method:'เงินสด', received_by:'เจ้าของร้าน' });
                          }}>
                          💰 รับชำระทั้งหมด
                        </button>
                        <button className="btnSm btn2"
                          onClick={() => navigator.clipboard?.writeText(reminderText).then(() => show('คัดลอกข้อความแล้ว'))}>
                          📋 คัดลอกข้อความแจ้งเตือน
                        </button>
                        {customer.line_id && (
                          <a href={`https://line.me/R/ti/p/${customer.line_id}`} target="_blank" rel="noopener noreferrer"
                            style={{ textDecoration:'none' }}>
                            <button className="btnSm" style={{ background:'#16a34a' }}>
                              💬 เปิด LINE
                            </button>
                          </a>
                        )}
                        <button className="btnSm btn2"
                          onClick={() => {
                            const existing = followups[customer.id];
                            setFollowupForm({
                              status: existing?.status || 'ติดต่อแล้ว รอชำระ',
                              note: existing?.note || '',
                              promisedDate: existing?.promisedDate || '',
                            });
                            setFollowupModal({ customerId: customer.id, customerName: customer.name });
                          }}>
                          📝 บันทึกการติดตาม
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })()}

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
            <Field label="ช่องทางชำระเงิน">
              <select value={payForm.method} onChange={e => setPayForm({...payForm, method:e.target.value})}>
                <option value="เงินสด">เงินสด</option>
                <option value="โอนธนาคาร">โอนธนาคาร</option>
                <option value="พร้อมเพย์">พร้อมเพย์</option>
                <option value="QR Code">QR Code</option>
              </select>
            </Field>
            <Field label="ผู้รับเงิน">
              <select value={payForm.received_by} onChange={e => setPayForm({...payForm, received_by:e.target.value})}>
                <option value="เจ้าของร้าน">เจ้าของร้าน</option>
                {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
              </select>
            </Field>
            {payForm.amount && (
              <div className={`full ${Number(payForm.amount) >= Number(payingOrder.balance) ? 'balancePreview' : 'balancePreview balanceWarn'}`}>
                {Number(payForm.amount) >= Number(payingOrder.balance)
                  ? <>สถานะจะเปลี่ยนเป็น <b>ชำระเงินแล้ว</b> อัตโนมัติ</>
                  : <>คงเหลือ <b>{fmtMoney(Math.max(0, Number(payingOrder.balance) - Number(payForm.amount)))} บาท</b> → สถานะ <b>ค้างชำระ</b></>
                }
              </div>
            )}
            <button type="submit" className="full btnGreen">บันทึกรับเงิน</button>
          </form>
        </Modal>
      )}

      {followupModal && (
        <Modal title={`ติดตามหนี้ — ${followupModal.customerName}`} onClose={() => setFollowupModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, marginBottom:6, color:'#374151' }}>สถานะการติดตาม</label>
              <select value={followupForm.status} onChange={e => setFollowupForm(f => ({ ...f, status: e.target.value }))}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:14 }}>
                {[
                  'ยังไม่ติดต่อ',
                  'ติดต่อแล้ว รอชำระ',
                  'นัดชำระแล้ว',
                  'มีปัญหา / ติดต่อไม่ได้',
                ].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {followupForm.status === 'นัดชำระแล้ว' && (
              <div>
                <label style={{ display:'block', fontSize:13, fontWeight:600, marginBottom:6, color:'#374151' }}>วันที่นัดชำระ</label>
                <input type="date" value={followupForm.promisedDate}
                  onChange={e => setFollowupForm(f => ({ ...f, promisedDate: e.target.value }))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:14, boxSizing:'border-box' }} />
              </div>
            )}
            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, marginBottom:6, color:'#374151' }}>หมายเหตุ / บันทึก</label>
              <textarea value={followupForm.note}
                onChange={e => setFollowupForm(f => ({ ...f, note: e.target.value }))}
                placeholder="เช่น โทรแล้วไม่รับ, บอกจะโอนวันศุกร์..."
                rows={3}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:14, resize:'vertical', boxSizing:'border-box' }} />
            </div>
            <button className="btnGreen" style={{ padding:'13px', fontWeight:700, fontSize:15 }}
              onClick={() => saveFollowup(followupModal.customerId)}>
              บันทึกการติดตาม
            </button>
          </div>
        </Modal>
      )}

      {editCust && (
        <Modal title="แก้ไขลูกค้า" onClose={() => setEditCust(null)}>
          <form className="form" onSubmit={updateCustomer}>
            <Field label="ชื่อ / บริษัท" full><input required value={editCustForm.name} onChange={e => setEditCustForm({...editCustForm, name:e.target.value})} /></Field>
            <Field label="เบอร์โทร"><input value={editCustForm.phone} onChange={e => setEditCustForm({...editCustForm, phone:e.target.value})} /></Field>
            <Field label="Line ID"><input value={editCustForm.line_id} onChange={e => setEditCustForm({...editCustForm, line_id:e.target.value})} /></Field>
            <Field label="ช่องทางติดต่อ" full><input value={editCustForm.contact_channel} onChange={e => setEditCustForm({...editCustForm, contact_channel:e.target.value})} /></Field>
            <Field label="ที่อยู่ (สำหรับใบกำกับภาษี)" full><textarea value={editCustForm.address} onChange={e => setEditCustForm({...editCustForm, address:e.target.value})} style={{ minHeight:60 }} /></Field>
            <Field label="เลขผู้เสียภาษี" full><input value={editCustForm.tax_id} onChange={e => setEditCustForm({...editCustForm, tax_id:e.target.value})} placeholder="13 หลัก (ไม่บังคับ)" /></Field>
            <button type="submit" className="full">บันทึกแก้ไข</button>
          </form>
        </Modal>
      )}

      {editEmp && (
        <Modal title={`แก้ไขพนักงาน — ${editEmp.name}`} onClose={() => setEditEmp(null)}>
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
            <Field label="รหัสเข้าใช้งาน (เว้นว่างเพื่อลบรหัส)" full>
              <input type="password" placeholder="ตั้ง / เปลี่ยน / ลบรหัส"
                value={editEmpForm.pin} onChange={e => setEditEmpForm({...editEmpForm, pin:e.target.value})} />
            </Field>
            <button type="submit" className="full">บันทึกแก้ไข</button>
          </form>
        </Modal>
      )}

      {printOrder && (
        <Modal title="ใบส่งงาน / Work Order" onClose={() => setPrintOrder(null)}>
          <div className="printContent"><PrintSlip order={printOrder} /></div>
          <div className="printActions">
            <button className="btnGreen" onClick={() => window.print()}>พิมพ์ / Save PDF</button>
            <button className="btn2" onClick={() => setPrintOrder(null)}>ปิด</button>
          </div>
        </Modal>
      )}

      {receiptOrder && (
        <Modal title={receiptType === 'tax' ? 'ใบกำกับภาษี' : 'ใบเสร็จรับเงิน'} onClose={() => setReceiptOrder(null)}>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <button className={receiptType==='cash' ? 'btnGreen btnSm' : 'btn2 btnSm'} onClick={() => setReceiptType('cash')}>ใบเสร็จเงินสด</button>
            <button className={receiptType==='tax'  ? 'btnGreen btnSm' : 'btn2 btnSm'} style={{ background: receiptType==='tax' ? '#7c3aed' : undefined }} onClick={() => setReceiptType('tax')}>ใบกำกับภาษี</button>
          </div>
          <div className="printContent">
            {receiptType === 'cash'
              ? <CashReceipt order={receiptOrder} shop={shopSettings} />
              : <TaxInvoice  order={receiptOrder} shop={shopSettings} />}
          </div>
          <div className="printActions">
            <button className="btnGreen" onClick={() => window.print()}>พิมพ์ / Save PDF</button>
            <button className="btn2" onClick={() => setReceiptOrder(null)}>ปิด</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

// ─── CustomerPicker ───────────────────────────────────────────────────────────
function CustomerPicker({ customers, value, onChange }: {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  const selected = customers.find(c => String(c.id) === value);

  const filtered = customers.filter(c => {
    if (!query) return true;
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const displayValue = open ? query : (selected ? `${selected.name}${selected.phone ? ` — ${selected.phone}` : ''}` : query);

  function handleFocus() {
    setOpen(true);
    if (selected) setQuery('');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    if (value) onChange('');
  }

  function handleSelect(c: Customer) {
    onChange(String(c.id));
    setQuery(''); setOpen(false);
  }

  function handleClear() {
    onChange(''); setQuery(''); setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder="พิมพ์ชื่อหรือเบอร์โทร..."
          style={{ flex: 1 }}
          autoComplete="off"
        />
        {selected && (
          <button type="button" onClick={handleClear}
            style={{ padding: '0 12px', background: '#f3f4f6', color: '#374151', borderRadius: 8, border: '1px solid #d1d5db', fontWeight: 600 }}>
            ✕
          </button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid #d1d5db', borderRadius: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,.12)', zIndex: 200,
          maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', color: '#9ca3af', fontSize: 13 }}>ไม่พบลูกค้า</div>
          ) : filtered.map(c => (
            <div key={c.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(c); }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 14,
                       background: String(c.id) === value ? '#eff6ff' : undefined }}
            >
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              {c.phone && <span style={{ color: '#6b7280', marginLeft: 10, fontSize: 13 }}>{c.phone}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
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
        <CustomerPicker customers={customers} value={form.customer_id} onChange={id => setForm({...form, customer_id:id})} />
      </Field>
      <Field label="ชื่องาน" full><input required value={form.title} onChange={e => setForm({...form, title:e.target.value})} /></Field>
      <Field label="ประเภทงาน"><input value={form.order_type} onChange={e => setForm({...form, order_type:e.target.value})} /></Field>
      <Field label="วันนัดส่ง"><input type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})} /></Field>
      <Field label="ขนาด"><input value={form.size} onChange={e => setForm({...form, size:e.target.value})} placeholder="เช่น 120x240 ซม." /></Field>
      <Field label="จำนวน"><input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})} /></Field>
      <Field label="วัสดุ" full><input value={form.material} onChange={e => setForm({...form, material:e.target.value})} /></Field>
      <Field label="ไฟล์งาน">
        <select value={form.file_status} onChange={e => setForm({...form, file_status:e.target.value})}>
          <option>มีไฟล์แล้ว</option>
          <option>ต้องออกแบบ</option>
          <option>แก้ไขไฟล์</option>
        </select>
      </Field>
      <Field label="การรับงาน">
        <select value={form.delivery_method} onChange={e => setForm({...form, delivery_method:e.target.value})}>
          <option>รับเองที่ร้าน</option>
          <option>จัดส่ง</option>
          <option>ติดตั้งเอง</option>
        </select>
      </Field>
      <Field label="การตกแต่ง / ฟินิชชิ่ง" full>
        <input value={form.finishing} onChange={e => setForm({...form, finishing:e.target.value})} placeholder="เช่น รูเจาะ, เชือกร้อย, ลามิเนต, เย็บตะเข็บ" />
      </Field>
      <Field label="การชำระเงิน">
        <select value={form.payment_type} onChange={e => setForm({...form, payment_type:e.target.value})}>
          <option>เงินสด</option>
          <option>เครดิต</option>
        </select>
      </Field>
      {form.payment_type === 'เครดิต' && (
        <Field label="เครดิต (วัน)">
          <select value={form.credit_days} onChange={e => setForm({...form, credit_days:e.target.value})}>
            <option value="15">15 วัน</option>
            <option value="30">30 วัน</option>
            <option value="45">45 วัน</option>
            <option value="60">60 วัน</option>
            <option value="90">90 วัน</option>
          </select>
        </Field>
      )}
      <Field label="ราคา (บาท)"><input type="number" min="0" value={form.price} onChange={e => setForm({...form, price:e.target.value})} /></Field>
      <Field label="มัดจำ (บาท)"><input type="number" min="0" value={form.deposit} onChange={e => setForm({...form, deposit:e.target.value})} /></Field>
      {Number(form.price) > 0 && (
        <div className={`balancePreview full${balance < 0 ? ' balanceWarn' : ''}`}>
          ยอดค้างชำระ: <b>{fmtMoney(balance)} บาท</b>{balance < 0 && ' (มัดจำเกินราคา)'}
        </div>
      )}
      <Field label="คนรับงาน">
        <select value={form.receiver_id} onChange={e => setForm({...form, receiver_id:e.target.value})}>
          <option value="">ยังไม่กำหนด</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      </Field>
      <Field label="คนวัดป้าย">
        <select value={form.measurer_id} onChange={e => setForm({...form, measurer_id:e.target.value})}>
          <option value="">ยังไม่กำหนด</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      </Field>
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
      <Field label="คนส่งงาน">
        <select value={form.delivery_id} onChange={e => setForm({...form, delivery_id:e.target.value})}>
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
function LogTimeline({ logs, loading, logsFor, orderId, tableReady }: {
  logs: StatusLog[]; loading: boolean; logsFor: number|null; orderId: number; tableReady?: boolean;
}) {
  if (logsFor !== orderId) return null;
  if (loading) return (
    <div style={{ marginTop:10, fontSize:13, color:'var(--muted)' }}>กำลังโหลดประวัติ...</div>
  );
  if (tableReady === false) return (
    <div style={{ marginTop:10, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#92400e' }}>
      ⚠️ ยังไม่มีตาราง <code>order_status_logs</code> — รัน SQL ด้านบนก่อนครับ
    </div>
  );
  if (!logs.length) return (
    <div style={{ marginTop:10, fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>ยังไม่มีประวัติการเปลี่ยนสถานะ</div>
  );
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
            {l.changed_by && <span className="logNote"> · โดย {l.changed_by}</span>}
            {l.note && <span className="logNote">{l.note}</span>}
            <span className="logTime">
              {fmtDateTime(l.created_at)}
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
        <div className="slipRow"><span>การชำระ</span><b>{order.payment_type || 'เงินสด'}{order.payment_type === 'เครดิต' && order.credit_days ? ` ${order.credit_days} วัน` : ''}</b></div>
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
        {order.material        && <div className="slipRow"><span>วัสดุ</span><b>{order.material}</b></div>}
        {order.file_status     && <div className="slipRow"><span>ไฟล์งาน</span><b>{order.file_status}</b></div>}
        {order.finishing       && <div className="slipRow"><span>ฟินิชชิ่ง</span><b>{order.finishing}</b></div>}
        {order.delivery_method && <div className="slipRow"><span>การรับงาน</span><b>{order.delivery_method}</b></div>}
        {order.receiver   && <div className="slipRow"><span>รับงาน</span><b>{order.receiver.name}</b></div>}
        {order.measurer   && <div className="slipRow"><span>วัดป้าย</span><b>{order.measurer.name}</b></div>}
        {order.designer   && <div className="slipRow"><span>ออกแบบ</span><b>{order.designer.name}</b></div>}
        {order.production && <div className="slipRow"><span>ผลิต</span><b>{order.production.name}</b></div>}
        {order.delivery   && <div className="slipRow"><span>ส่งงาน</span><b>{order.delivery.name}</b></div>}
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
      <div className="slipFooter">พิมพ์วันที่ {todayThLong()}</div>
    </div>
  );
}

// ─── Kanban Board ────────────────────────────────────────────────────────────
const KANBAN_COLS = [
  'รับงานใหม่','กำลังออกแบบ','รอลูกค้าตรวจแบบ','ลูกค้าอนุมัติแล้ว',
  'กำลังผลิต','ผลิตเสร็จ','แจ้งลูกค้ามารับ','กำลังเอาไปส่ง','ลูกค้ารับแล้ว',
];
function KanbanBoard({ orders, today, employees, onChangeStatus }: {
  orders: Order[]; today: string; employees: Employee[];
  onChangeStatus: (o: Order, s: string) => void;
}) {
  const [empFilter, setEmpFilter] = useState('');
  const active = orders.filter(o => !['ชำระเงินแล้ว','ยกเลิก'].includes(o.status));
  const filtered = empFilter
    ? active.filter(o => [o.designer_id, o.production_id, o.receiver_id, o.measurer_id, o.delivery_id].includes(Number(empFilter)))
    : active;

  return (
    <section>
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
        <div style={{ fontWeight:700, fontSize:16 }}>บอร์ดติดตามงาน</div>
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
          style={{ fontSize:13, padding:'6px 10px', border:'1px solid var(--line)', borderRadius:8 }}>
          <option value="">พนักงานทั้งหมด</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} งานที่กำลังดำเนินการ</span>
      </div>
      <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:12 }}>
        {KANBAN_COLS.map(col => {
          const colOrders = filtered.filter(o => o.status === col);
          const [bg, color] = STATUS_STYLE[col] || ['#f3f4f6','#374151'];
          return (
            <div key={col} style={{ minWidth:220, flexShrink:0 }}>
              <div style={{ background:bg, color, borderRadius:8, padding:'6px 12px', fontWeight:700, fontSize:13, marginBottom:8, display:'flex', justifyContent:'space-between' }}>
                <span>{col}</span>
                {colOrders.length > 0 && <span style={{ background:'rgba(0,0,0,.15)', borderRadius:999, padding:'0 7px', fontSize:12 }}>{colOrders.length}</span>}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {colOrders.length === 0 && (
                  <div style={{ background:'white', border:'1px dashed var(--line)', borderRadius:10, padding:'20px 10px', textAlign:'center', color:'var(--muted)', fontSize:12 }}>ไม่มีงาน</div>
                )}
                {colOrders.map(o => {
                  const isOverdue = !!o.due_date && o.due_date < today;
                  const isToday   = o.due_date === today;
                  const nextStatus = KANBAN_COLS[KANBAN_COLS.indexOf(col) + 1];
                  return (
                    <div key={o.id} style={{ background:'white', border:`1px solid ${isOverdue ? '#fca5a5' : 'var(--line)'}`, borderRadius:10, padding:'10px 12px', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>{o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}</div>
                      <div style={{ fontWeight:700, fontSize:13, marginBottom:4, lineHeight:1.3 }}>{o.title}</div>
                      <div style={{ fontSize:12, color:'var(--muted)' }}>{o.customers?.name || '-'}</div>
                      {o.due_date && (
                        <div style={{ fontSize:11, marginTop:4, fontWeight:600, color: isOverdue ? '#dc2626' : isToday ? '#c2410c' : '#6b7280' }}>
                          {isOverdue ? '⚠️ เลยกำหนด ' : isToday ? '🔔 วันนี้ ' : '📅 '}{fmtDate(o.due_date)}
                        </div>
                      )}
                      {Number(o.balance) > 0 && (
                        <div style={{ fontSize:11, marginTop:2, color:'#dc2626' }}>ค้าง {fmtMoney(o.balance)} บ.</div>
                      )}
                      {nextStatus && (
                        <button onClick={() => onChangeStatus(o, nextStatus)}
                          style={{ marginTop:8, width:'100%', padding:'5px', fontSize:11, background:bg, color, border:`1px solid ${color}30`,
                            borderRadius:6, cursor:'pointer', fontWeight:600 }}>
                          → {nextStatus}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Copy Link Button ─────────────────────────────────────────────────────────
function CopyLinkBtn({ path, label, color = '#7c3aed' }: { path: string; label: string; color?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button className="btnSm" style={{ background: copied ? '#16a34a' : color, color: 'white' }} onClick={copy}>
      {copied ? 'คัดลอกแล้ว ✓' : label}
    </button>
  );
}

// ─── Role Selection Screen (owner-only login) ─────────────────────────────────
function RoleSelectScreen({ ownerPin: initialOwnerPin, onSelect, onSetOwnerPin }: {
  ownerPin: string;
  onSelect: (role: 'owner' | 'employee' | 'viewer', empId?: number, edit?: boolean) => void;
  onSetOwnerPin: (pin: string) => Promise<string>;
}) {
  const [localOwnerPin, setLocalOwnerPin] = useState(initialOwnerPin);
  const [screen,   setScreen]   = useState<'main' | 'ownerSetup'>(initialOwnerPin ? 'main' : 'ownerSetup');
  const [ownerInput, setOwnerInput] = useState('');
  const [setupPin1, setSetupPin1]   = useState('');
  const [setupPin2, setSetupPin2]   = useState('');
  const [loginErr, setLoginErr]     = useState('');

  function handleOwner() {
    if (ownerInput !== localOwnerPin) { setLoginErr('รหัสเจ้าของร้านไม่ถูกต้อง'); return; }
    onSelect('owner');
  }

  async function handleSetupSave() {
    if (!setupPin1) { setLoginErr('กรุณาตั้งรหัสผ่าน'); return; }
    if (setupPin1 !== setupPin2) { setLoginErr('รหัสผ่านไม่ตรงกัน กรุณาลองใหม่'); return; }
    const err = await onSetOwnerPin(setupPin1);
    if (err) { setLoginErr('บันทึกไม่สำเร็จ: ' + err); return; }
    setLocalOwnerPin(setupPin1);
    setScreen('main');
    setLoginErr('');
  }

  const centerLayout: React.CSSProperties = {
    minHeight:'100vh', display:'flex', alignItems:'center',
    justifyContent:'center', padding:'20px 16px',
  };

  if (screen === 'ownerSetup') {
    return (
      <main className="container" style={centerLayout}>
        <div style={{ width:'100%', maxWidth:420 }}>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div className="brand" style={{ fontSize:28 }}>Idea Inkjet</div>
            <div className="sub">ระบบจัดการงานพิมพ์</div>
          </div>
          <div className="card" style={{ padding:'24px', border:'2px solid #fca5a5' }}>
            <h3 style={{ margin:'0 0 6px', fontSize:16 }}>🔑 ตั้งรหัสผ่านเจ้าของร้าน</h3>
            <p style={{ margin:'0 0 18px', fontSize:13, color:'var(--muted)' }}>
              ยังไม่มีรหัสผ่านสำหรับเจ้าของร้าน — กรุณาตั้งรหัสก่อนเริ่มใช้งานเพื่อความปลอดภัย
            </p>
            {loginErr && <div className="notice error" style={{ marginBottom:12 }}>{loginErr}</div>}
            <label>รหัสผ่านใหม่</label>
            <input type="password" placeholder="ตั้งรหัสผ่าน" style={{ marginBottom:10 }}
              value={setupPin1} onChange={e => { setSetupPin1(e.target.value); setLoginErr(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSetupSave()} autoFocus />
            <label>ยืนยันรหัสผ่าน</label>
            <input type="password" placeholder="ใส่รหัสผ่านอีกครั้ง" style={{ marginBottom:16 }}
              value={setupPin2} onChange={e => { setSetupPin2(e.target.value); setLoginErr(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSetupSave()} />
            <button style={{ width:'100%' }} onClick={handleSetupSave}>บันทึกรหัสและเริ่มใช้งาน</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={centerLayout}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div className="brand" style={{ fontSize:28 }}>Idea Inkjet</div>
          <div className="sub">ระบบจัดการงานพิมพ์</div>
        </div>

        {loginErr && <div className="notice error" style={{ textAlign:'center', marginBottom:12 }}>{loginErr}</div>}

        <div className="card" style={{ padding:'20px 24px', borderColor:'#bfdbfe' }}>
          <div style={{ fontWeight:700, marginBottom:12 }}>🏪 เจ้าของร้าน</div>
          <div style={{ display:'flex', gap:8 }}>
            <input type="password" placeholder="รหัสเจ้าของร้าน" autoFocus
              value={ownerInput} onChange={e => { setOwnerInput(e.target.value); setLoginErr(''); }}
              onKeyDown={e => e.key === 'Enter' && handleOwner()}
              style={{ flex:1 }} />
            <button onClick={handleOwner} style={{ width:90 }}>เข้าสู่ระบบ</button>
          </div>
          <div className="sub" style={{ marginTop:8, fontSize:12 }}>
            พนักงานใช้ลิงค์ส่วนตัวของตัวเอง — ดูได้ในหน้าพนักงาน
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Owner PIN Manager (shown inside employees tab) ───────────────────────────
function OwnerPinManager({ ownerPin, onSave }: { ownerPin: string; onSave: (p: string) => Promise<string> }) {
  const [input,   setInput]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  async function save() {
    setSaving(true);
    await onSave(input.trim());
    setSaving(false); setInput(''); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <div className="card" style={{ padding:'16px 20px' }}>
      <h3 style={{ margin:'0 0 10px', fontSize:15 }}>🔑 รหัสเจ้าของร้าน</h3>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        {ownerPin
          ? <span style={{ fontSize:13, color:'var(--muted)' }}>รหัสปัจจุบัน: <b>{'•'.repeat(ownerPin.length)}</b> ({ownerPin.length} ตัว)</span>
          : <span style={{ fontSize:13, color:'var(--muted)' }}>ยังไม่มีรหัส</span>}
        <input type="password" placeholder="ตั้ง/เปลี่ยนรหัส (เว้นว่างเพื่อลบ)"
          value={input} onChange={e => setInput(e.target.value)}
          style={{ flex:1, minWidth:180 }} />
        <button className="btnGreen btnSm" onClick={save} disabled={saving}>{saved ? 'บันทึกแล้ว ✓' : saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        {ownerPin && <button className="btnRed btnSm" onClick={() => onSave('')} disabled={saving}>ลบรหัส</button>}
      </div>
    </div>
  );
}

// ─── Shop Settings Manager ────────────────────────────────────────────────────
type ShopInfo = { name: string; address: string; tax_id: string; phone: string };
function ShopSettingsManager({ settings, onSave }: { settings: ShopInfo; onSave: (s: ShopInfo) => Promise<string> }) {
  const [form,   setForm]   = useState(settings);
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState('');
  async function save() {
    setSaving(true);
    const err = await onSave(form);
    setSaving(false);
    setMsg(err ? 'บันทึกไม่สำเร็จ: ' + err : 'บันทึกแล้ว ✓');
    setTimeout(() => setMsg(''), 2500);
  }
  return (
    <div className="card" style={{ padding:'16px 20px', marginTop:12 }}>
      <h3 style={{ margin:'0 0 12px', fontSize:15 }}>🏪 ข้อมูลร้าน (สำหรับออกใบเสร็จ)</h3>
      {msg && <div className="notice" style={{ marginBottom:10, fontSize:13, background: msg.includes('ไม่สำเร็จ') ? '#fef3f2' : '#ecfdf3', color: msg.includes('ไม่สำเร็จ') ? '#b42318' : '#067647' }}>{msg}</div>}
      <div className="form">
        <div><label>ชื่อร้าน</label><input value={form.name} onChange={e => setForm({...form, name:e.target.value})} /></div>
        <div><label>เบอร์โทรร้าน</label><input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} /></div>
        <div style={{ gridColumn:'1/-1' }}><label>ที่อยู่ร้าน</label><textarea value={form.address} onChange={e => setForm({...form, address:e.target.value})} style={{ minHeight:60 }} /></div>
        <div style={{ gridColumn:'1/-1' }}><label>เลขผู้เสียภาษีร้าน (13 หลัก)</label><input value={form.tax_id} onChange={e => setForm({...form, tax_id:e.target.value})} placeholder="สำหรับใบกำกับภาษี" /></div>
      </div>
      <button className="btnGreen btnSm" style={{ marginTop:10 }} onClick={save} disabled={saving}>
        {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลร้าน'}
      </button>
    </div>
  );
}

// ─── Cash Receipt ─────────────────────────────────────────────────────────────
function CashReceipt({ order, shop }: { order: Order; shop: ShopInfo }) {
  const code     = orderCode(order);
  const paid     = Number(order.price) - Number(order.balance);
  const today    = todayThLong();
  const receiptNo = `REC-${String(order.id).padStart(4,'0')}`;
  return (
    <div className="slip">
      <div className="slipHeader">
        <div className="slipShop">{shop.name}</div>
        {shop.address && <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{shop.address}</div>}
        {shop.phone   && <div style={{ fontSize:12, color:'#6b7280' }}>โทร {shop.phone}</div>}
        <div className="slipDocType" style={{ marginTop:6, fontSize:15, fontWeight:700 }}>ใบเสร็จรับเงิน / Cash Receipt</div>
        <div className="slipCode">{receiptNo}</div>
      </div>
      <div className="slipSection">
        <div className="slipRow"><span>วันที่</span><b>{today}</b></div>
        <div className="slipRow"><span>เลขงาน</span><b>{code}</b></div>
      </div>
      <div className="slipSection">
        <div className="slipSectionTitle">ลูกค้า</div>
        <div className="slipRow"><span>ชื่อ</span><b>{order.customers?.name || '-'}</b></div>
        {order.customers?.phone && <div className="slipRow"><span>โทร</span><b>{order.customers.phone}</b></div>}
        {(order.customers as any)?.address && <div className="slipRow"><span>ที่อยู่</span><b style={{ textAlign:'right', flex:1, fontSize:12 }}>{(order.customers as any).address}</b></div>}
      </div>
      <div className="slipSection">
        <div className="slipSectionTitle">รายการ</div>
        <div className="slipRow"><span>ชื่องาน</span><b>{order.title}</b></div>
        {order.order_type && <div className="slipRow"><span>ประเภท</span><b>{order.order_type}</b></div>}
        {order.size       && <div className="slipRow"><span>ขนาด</span><b>{order.size}</b></div>}
        <div className="slipRow"><span>จำนวน</span><b>{order.quantity || 1} ชิ้น</b></div>
      </div>
      <div className="slipSection slipPriceSection">
        <div className="slipSectionTitle">การชำระเงิน</div>
        <div className="slipRow"><span>ราคารวม</span><b>{fmtMoney(order.price)} บาท</b></div>
        <div className="slipRow"><span>มัดจำ</span><b>{fmtMoney(order.deposit)} บาท</b></div>
        <div className="slipRow slipBalance"><span>รับชำระ</span><b>{fmtMoney(paid)} บาท</b></div>
        {Number(order.balance) > 0 && (
          <div className="slipRow" style={{ color:'#dc2626' }}><span>ค้างชำระ</span><b>{fmtMoney(order.balance)} บาท</b></div>
        )}
      </div>
      <div className="slipSignRow">
        <div className="slipSign"><div className="signLine" /><span>ผู้รับเงิน</span></div>
        <div className="slipSign"><div className="signLine" /><span>ลายเซ็นลูกค้า</span></div>
      </div>
      <div className="slipFooter">พิมพ์วันที่ {today}</div>
    </div>
  );
}

// ─── Tax Invoice ──────────────────────────────────────────────────────────────
function TaxInvoice({ order, shop }: { order: Order; shop: ShopInfo }) {
  const code     = orderCode(order);
  const today    = todayThLong();
  const invoiceNo = `INV-${String(order.id).padStart(4,'0')}`;
  const price    = Number(order.price);
  const beforeVat = Math.round(price / 1.07 * 100) / 100;
  const vat      = Math.round((price - beforeVat) * 100) / 100;
  const cust     = order.customers as any;
  return (
    <div className="slip">
      <div className="slipHeader">
        <div className="slipShop">{shop.name}</div>
        {shop.address && <div style={{ fontSize:11, color:'#6b7280', marginTop:2, lineHeight:1.4 }}>{shop.address}</div>}
        {shop.phone   && <div style={{ fontSize:12, color:'#6b7280' }}>โทร {shop.phone}</div>}
        {shop.tax_id  && <div style={{ fontSize:12, color:'#6b7280' }}>เลขผู้เสียภาษี {shop.tax_id}</div>}
        <div className="slipDocType" style={{ marginTop:6, fontSize:15, fontWeight:700 }}>ใบกำกับภาษี / Tax Invoice</div>
        <div className="slipCode">{invoiceNo}</div>
      </div>
      <div className="slipSection">
        <div className="slipRow"><span>วันที่</span><b>{today}</b></div>
        <div className="slipRow"><span>เลขงาน</span><b>{code}</b></div>
      </div>
      <div className="slipSection">
        <div className="slipSectionTitle">ผู้ซื้อ / Buyer</div>
        <div className="slipRow"><span>ชื่อ / บริษัท</span><b>{cust?.name || '-'}</b></div>
        {cust?.phone   && <div className="slipRow"><span>โทร</span><b>{cust.phone}</b></div>}
        {cust?.address && <div className="slipRow"><span>ที่อยู่</span><b style={{ textAlign:'right', flex:1, fontSize:12 }}>{cust.address}</b></div>}
        {cust?.tax_id  && <div className="slipRow"><span>เลขผู้เสียภาษี</span><b>{cust.tax_id}</b></div>}
        {!cust?.tax_id && <div style={{ fontSize:11, color:'#9ca3af', marginTop:4 }}>* หากต้องการเลขผู้เสียภาษีลูกค้า แก้ไขได้ในหน้าลูกค้า</div>}
      </div>
      <div className="slipSection">
        <div className="slipSectionTitle">รายการสินค้า / Services</div>
        <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse', marginTop:4 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #000' }}>
              <th style={{ textAlign:'left', paddingBottom:3 }}>รายการ</th>
              <th style={{ textAlign:'center' }}>จำนวน</th>
              <th style={{ textAlign:'right' }}>ราคา</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ paddingTop:4 }}>
                {order.title}
                {order.order_type && <div style={{ fontSize:11, color:'#6b7280' }}>{order.order_type}{order.size ? ` · ${order.size}` : ''}</div>}
              </td>
              <td style={{ textAlign:'center' }}>{order.quantity || 1}</td>
              <td style={{ textAlign:'right' }}>{fmtMoney(beforeVat)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="slipSection slipPriceSection">
        <div className="slipRow"><span>ราคาก่อนภาษี</span><b>{fmtMoney(beforeVat)} บาท</b></div>
        <div className="slipRow"><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtMoney(vat)} บาท</b></div>
        <div className="slipRow slipBalance"><span>ยอดรวมทั้งสิ้น</span><b>{fmtMoney(price)} บาท</b></div>
        <div className="slipRow" style={{ marginTop:8, paddingTop:8, borderTop:'1px dashed #ccc' }}><span>มัดจำ</span><b>{fmtMoney(order.deposit)} บาท</b></div>
        {Number(order.balance) > 0
          ? <div className="slipRow" style={{ color:'#dc2626' }}><span>ค้างชำระ</span><b>{fmtMoney(order.balance)} บาท</b></div>
          : <div className="slipRow" style={{ color:'#16a34a' }}><span>ชำระครบแล้ว</span><b>✓</b></div>}
      </div>
      {!shop.tax_id && <div style={{ fontSize:11, color:'#9ca3af', textAlign:'center', marginTop:8 }}>* กรอกเลขผู้เสียภาษีร้านในหน้าพนักงาน → ข้อมูลร้าน</div>}
      <div className="slipSignRow">
        <div className="slipSign"><div className="signLine" /><span>ผู้ออกใบกำกับภาษี</span></div>
        <div className="slipSign"><div className="signLine" /><span>ลายเซ็นลูกค้า</span></div>
      </div>
      <div className="slipFooter">พิมพ์วันที่ {today}</div>
    </div>
  );
}

// ─── Employee View ────────────────────────────────────────────────────────────
type EmpViewProps = {
  emp: Employee; orders: Order[]; editMode: boolean;
  message: string; error: string; loading: boolean;
  onLogout: () => void; onLoad: () => void;
  onChangeStatus: (o: Order, s: string) => void;
  onLoadLogs: (id: number) => void;
  orderLogs: StatusLog[]; logsLoading: boolean; logsFor: number | null;
  logsTableReady: boolean;
  today: string;
};
function EmployeeView({ emp, orders, editMode, message, error, loading, onLogout, onLoad, onChangeStatus, onLoadLogs, orderLogs, logsLoading, logsFor, logsTableReady, today }: EmpViewProps) {
  const [filter, setFilter]       = useState<'active' | 'all' | 'done'>('active');
  const [expandedId, setExpanded] = useState<number | null>(null);
  const [showPin,    setShowPin]  = useState(false);
  const [pinNew1,    setPinNew1]  = useState('');
  const [pinNew2,    setPinNew2]  = useState('');
  const [pinMsg,     setPinMsg]   = useState('');

  async function handleSavePin() {
    if (!pinNew1) { setPinMsg('กรุณาใส่รหัสผ่านใหม่'); return; }
    if (pinNew1 !== pinNew2) { setPinMsg('รหัสผ่านไม่ตรงกัน'); return; }
    const err = await savePin(emp.id, pinNew1);
    if (err) { setPinMsg('บันทึกไม่สำเร็จ: ' + err); return; }
    setPinNew1(''); setPinNew2(''); setPinMsg('บันทึกรหัสผ่านแล้ว ✓');
    setTimeout(() => { setPinMsg(''); setShowPin(false); }, 1500);
  }

  const DONE   = ['ชำระเงินแล้ว','ยกเลิก'];
  const active = orders.filter(o => !DONE.includes(o.status));
  const done   = orders.filter(o =>  DONE.includes(o.status));
  const dueToday = active.filter(o => o.due_date === today).length;
  const overdue  = active.filter(o => o.due_date && o.due_date < today && o.due_date !== today).length;
  const displayed = filter === 'active' ? active : filter === 'done' ? done : orders;

  return (
    <main className="container">
      <div className="top">
        <div>
          <div className="brand" style={{ fontSize:20 }}>สวัสดี, {emp.name}</div>
          <div className="sub">
            {emp.position || emp.role} · Idea Inkjet
            {editMode
              ? <span style={{ marginLeft:8, color:'#16a34a', fontWeight:600 }}>🔓 แก้ไขได้</span>
              : <span style={{ marginLeft:8, color:'#6b7280' }}>👁 ดูอย่างเดียว</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onLoad} disabled={loading} className="btnSm btn2">{loading ? 'โหลด...' : 'รีเฟรช'}</button>
          <button className="btnSm btn2" onClick={onLogout}>ออกจากระบบ</button>
        </div>
      </div>

      {!editMode && (
        <div className="notice" style={{ background:'#fffbeb', color:'#92400e', borderColor:'#fde68a', border:'1px solid', marginBottom:8 }}>
          คุณเข้าในโหมดดูอย่างเดียว — ใส่รหัสที่ถูกต้องเพื่อแก้ไขสถานะงานได้
        </div>
      )}
      {message && <div className="notice">{message}</div>}
      {error   && <div className="notice error">{error}</div>}

      {/* ── Change PIN card ── */}
      <div className="card" style={{ padding:'12px 16px', marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:14, fontWeight:600 }}>🔑 รหัสผ่านของฉัน</span>
          <button className="btnSm btn2" onClick={() => { setShowPin(p => !p); setPinMsg(''); setPinNew1(''); setPinNew2(''); }}>
            {showPin ? 'ยกเลิก' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </div>
        {showPin && (
          <div style={{ marginTop:10 }}>
            {pinMsg && <div className="notice error" style={{ marginBottom:8, fontSize:13 }}>{pinMsg}</div>}
            <label>รหัสผ่านใหม่</label>
            <input type="password" placeholder="ใส่รหัสผ่านใหม่" autoFocus
              value={pinNew1} onChange={e => { setPinNew1(e.target.value); setPinMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSavePin()}
              style={{ marginBottom:8 }} />
            <label>ยืนยันรหัสผ่าน</label>
            <input type="password" placeholder="ใส่รหัสผ่านอีกครั้ง"
              value={pinNew2} onChange={e => { setPinNew2(e.target.value); setPinMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSavePin()}
              style={{ marginBottom:10 }} />
            <button className="btnGreen btnSm" onClick={handleSavePin}>บันทึกรหัสผ่านใหม่</button>
          </div>
        )}
      </div>

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

      <div className="tabs" style={{ marginBottom:14 }}>
        <button className={`tab${filter==='active'?' active':''}`} onClick={() => setFilter('active')}>
          ต้องทำ {active.length > 0 && <span className="badge">{active.length}</span>}
        </button>
        <button className={`tab${filter==='all'?' active':''}`} onClick={() => setFilter('all')}>ทั้งหมด ({orders.length})</button>
        <button className={`tab${filter==='done'?' active':''}`} onClick={() => setFilter('done')}>เสร็จแล้ว ({done.length})</button>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {displayed.length === 0 && (
          <div className="card" style={{ textAlign:'center', padding:36, color:'var(--muted)' }}>
            {filter === 'active' ? 'ไม่มีงานที่ต้องทำ 🎉' : 'ยังไม่มีงาน'}
          </div>
        )}
        {displayed.map(o => {
          const isRec      = o.receiver_id    === emp.id;
          const isMea      = o.measurer_id    === emp.id;
          const isDes      = o.designer_id    === emp.id;
          const isPro      = o.production_id  === emp.id;
          const isDel      = o.delivery_id    === emp.id;
          const isOverdue  = !!o.due_date && o.due_date < today && !DONE.includes(o.status);
          const isToday    = o.due_date === today && !DONE.includes(o.status);
          const isExpanded = expandedId === o.id;
          return (
            <div key={o.id} className="card" style={{ padding:'14px 16px' }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6, alignItems:'center' }}>
                <span style={{ fontWeight:700, color:'var(--brand)', fontSize:13 }}>
                  {o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}
                </span>
                <StatusPill status={o.status} />
                {isRec && <span className="countBadge" style={{ background:'#dbeafe', color:'#1d4ed8' }}>รับงาน</span>}
                {isMea && <span className="countBadge" style={{ background:'#d1fae5', color:'#065f46' }}>วัดป้าย</span>}
                {isDes && <span className="countBadge" style={{ background:'#fef9c3', color:'#854d0e' }}>ออกแบบ</span>}
                {isPro && <span className="countBadge" style={{ background:'#fae8ff', color:'#7e22ce' }}>ผลิต</span>}
                {isDel && <span className="countBadge" style={{ background:'#fef3c7', color:'#92400e' }}>ส่งงาน</span>}
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

              {editMode && !DONE.includes(o.status) && (
                <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>เปลี่ยนสถานะ:</span>
                  <select value={o.status} onChange={ev => onChangeStatus(o, ev.target.value)} style={{ flex:1, minWidth:160 }}>
                    {statusesForOrder(o).map(s => <option key={s} value={s}>{s}</option>)}
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
                    <LogTimeline logs={orderLogs} loading={logsLoading} logsFor={logsFor} orderId={o.id} tableReady={logsTableReady} />
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

// ─── Viewer Board (read-only, all orders) ─────────────────────────────────────
type ViewerProps = {
  orders: Order[]; employees: Employee[];
  message: string; error: string; loading: boolean;
  onLogout: () => void; onLoad: () => void; today: string;
};
function ViewerBoard({ orders, employees, message, error, loading, onLogout, onLoad, today }: ViewerProps) {
  const [search, setSearch] = useState('');
  const DONE = ['ชำระเงินแล้ว','ยกเลิก'];
  const active = orders.filter(o => !DONE.includes(o.status));

  const filtered = orders.filter(o => {
    if (!search) return !DONE.includes(o.status);
    const q = search.toLowerCase();
    return o.title.toLowerCase().includes(q) ||
           (o.customers?.name || '').toLowerCase().includes(q) ||
           (o.order_code || '').toLowerCase().includes(q);
  });

  const byStatus: Record<string, Order[]> = {};
  active.forEach(o => {
    if (!byStatus[o.status]) byStatus[o.status] = [];
    byStatus[o.status].push(o);
  });

  return (
    <main className="container">
      <div className="top">
        <div>
          <div className="brand" style={{ fontSize:20 }}>📋 สถานะงานทั้งหมด</div>
          <div className="sub">Idea Inkjet · ดูอย่างเดียว</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onLoad} disabled={loading} className="btnSm btn2">{loading ? 'โหลด...' : 'รีเฟรช'}</button>
          <button className="btnSm btn2" onClick={onLogout}>เปลี่ยนผู้ใช้</button>
        </div>
      </div>

      {message && <div className="notice">{message}</div>}
      {error   && <div className="notice error">{error}</div>}

      {/* Quick stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
        <div className="card stat" style={{ padding:'12px 14px' }}>
          <span className="sub" style={{ fontSize:11 }}>งานที่ดำเนินการอยู่</span>
          <b style={{ fontSize:22, color:'#1d4ed8' }}>{active.length}</b>
        </div>
        <div className="card stat" style={{ padding:'12px 14px' }}>
          <span className="sub" style={{ fontSize:11 }}>นัดส่งวันนี้</span>
          <b style={{ fontSize:22, color: active.filter(o => o.due_date===today).length > 0 ? '#c2410c' : undefined }}>
            {active.filter(o => o.due_date===today).length}
          </b>
        </div>
        <div className="card stat" style={{ padding:'12px 14px' }}>
          <span className="sub" style={{ fontSize:11 }}>เลยกำหนด</span>
          <b style={{ fontSize:22, color:'#dc2626' }}>
            {active.filter(o => o.due_date && o.due_date < today).length}
          </b>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom:14 }}>
        <input type="search" className="searchInput" style={{ width:'100%' }}
          placeholder="ค้นหางาน, ลูกค้า, เลขงาน..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {search ? (
        /* Search results */
        <div className="card">
          <h3 style={{ margin:'0 0 10px' }}>ผลการค้นหา ({filtered.length} งาน)</h3>
          {filtered.length === 0
            ? <p className="sub">ไม่พบงานที่ตรงกัน</p>
            : filtered.map(o => {
              const isOverdue = !!o.due_date && o.due_date < today && !DONE.includes(o.status);
              const isToday   = o.due_date === today;
              return (
                <div key={o.id} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--line)', flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ fontWeight:700, color:'var(--brand)', fontSize:13, minWidth:80 }}>
                    {o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}
                  </span>
                  <StatusPill status={o.status} />
                  <span style={{ flex:1, fontSize:14 }}>{o.title}</span>
                  <span style={{ fontSize:13, color:'var(--muted)' }}>{o.customers?.name || '-'}</span>
                  {o.due_date && (
                    <span style={{ fontSize:12 }} className={isOverdue ? 'overdue' : isToday ? 'dueToday' : ''}>
                      {fmtDate(o.due_date)}
                    </span>
                  )}
                </div>
              );
            })
          }
        </div>
      ) : (
        /* Status columns */
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {STATUSES.filter(s => !DONE.includes(s) && byStatus[s]?.length).map(s => (
            <div key={s} className="card">
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <StatusPill status={s} />
                <span style={{ fontWeight:700, fontSize:14 }}>{byStatus[s].length} งาน</span>
              </div>
              {byStatus[s].map(o => {
                const isOverdue = !!o.due_date && o.due_date < today;
                const isToday   = o.due_date === today;
                const des = employees.find(e => e.id === o.designer_id);
                const pro = employees.find(e => e.id === o.production_id);
                return (
                  <div key={o.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--line)', fontSize:13 }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, color:'var(--brand)' }}>
                        {o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}
                      </span>
                      <span style={{ fontWeight:600 }}>{o.title}</span>
                      <span style={{ color:'var(--muted)' }}>— {o.customers?.name || '-'}</span>
                    </div>
                    <div style={{ marginTop:3, display:'flex', gap:10, flexWrap:'wrap', color:'var(--muted)' }}>
                      {o.due_date && (
                        <span className={isOverdue ? 'overdue' : isToday ? 'dueToday' : ''}>
                          📅 {fmtDate(o.due_date)}{isOverdue ? ' ⚠️' : isToday ? ' 🔔' : ''}
                        </span>
                      )}
                      {des && <span>✏️ {des.name}</span>}
                      {pro && <span>🔧 {pro.name}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {active.length === 0 && (
            <div className="card" style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>ไม่มีงานที่กำลังดำเนินการ</div>
          )}
        </div>
      )}
    </main>
  );
}
