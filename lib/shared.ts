import { supabase } from './supabase';

// ─── Timezone helper (Thailand UTC+7) ────────────────────────────────────────
// sv-SE locale produces YYYY-MM-DD format needed for date comparisons
export const todayTH = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

// ─── Types ────────────────────────────────────────────────────────────────────
export type Customer  = { id: number; name: string; phone: string; line_id: string; contact_channel: string };
export type Employee  = { id: number; name: string; position: string; role: string; pin?: string | null };
export type StatusLog = { id: number; order_id: number; old_status: string; new_status: string; note: string; changed_by?: string; created_at: string };
export type Order = {
  id: number; order_code: string; title: string; status: string;
  due_date: string; price: number; deposit: number; balance: number;
  customer_id: number; designer_id: number | null; production_id: number | null;
  detail: string; order_type: string; size: string; quantity: number; material: string;
  file_status: string; delivery_method: string; finishing: string;
  created_at: string;
  customers?: Customer; designer?: Employee; production?: Employee;
};

// ─── Constants ────────────────────────────────────────────────────────────────
export const STATUSES = [
  'รับงานใหม่','กำลังออกแบบ','รอลูกค้าตรวจแบบ','ลูกค้าอนุมัติแล้ว',
  'กำลังผลิต','ผลิตเสร็จ','แจ้งลูกค้ามารับ','ลูกค้ารับแล้ว',
  'ชำระเงินแล้ว','ค้างชำระ','ยกเลิก',
];

export const STATUS_STYLE: Record<string, [string, string]> = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const fmtMoney = (n?: number) => Number(n || 0).toLocaleString('th-TH');
export const fmtDate  = (d?: string) => {
  if (!d) return '-';
  const [y,m,day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' });
};
export const orderCode = (o: Order) => o.order_code || `JOB-${String(o.id).padStart(4,'0')}`;

// ─── PIN helpers ──────────────────────────────────────────────────────────────
export async function savePin(empId: number, pin: string): Promise<string> {
  if (pin) {
    const { error } = await supabase.from('app_settings').upsert({ key: `pin_emp_${empId}`, value: pin });
    if (error) return error.message;
  } else {
    const { error } = await supabase.from('app_settings').delete().eq('key', `pin_emp_${empId}`);
    if (error) return error.message;
  }
  return '';
}
