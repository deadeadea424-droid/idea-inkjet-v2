'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Customer = { id:number; name:string; phone:string; line_id:string; contact_channel:string };
type Employee = { id:number; name:string; position:string; role:string };
type Order = { id:number; order_code:string; title:string; status:string; due_date:string; price:number; deposit:number; balance:number; customer_id:number; designer_id:number; production_id:number; customers?:Customer; designer?:Employee; production?:Employee };

const statuses = ['รับงานใหม่','กำลังออกแบบ','รอลูกค้าตรวจแบบ','ลูกค้าอนุมัติแล้ว','กำลังผลิต','ผลิตเสร็จ','แจ้งลูกค้ามารับ','ลูกค้ารับแล้ว','ชำระเงินแล้ว','ค้างชำระ','ยกเลิก'];

export default function Home(){
  const [tab,setTab]=useState('dashboard');
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [orders,setOrders]=useState<Order[]>([]);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const [customerForm,setCustomerForm]=useState({name:'',phone:'',line_id:'',facebook:'',contact_channel:'LINE'});
  const [employeeForm,setEmployeeForm]=useState({name:'',position:'กราฟิก',role:'graphic'});
  const [orderForm,setOrderForm]=useState({customer_id:'',title:'',order_type:'ป้ายไวนิล',detail:'',size:'',quantity:'1',material:'',price:'0',deposit:'0',due_date:'',designer_id:'',production_id:''});

  async function load(){
    setError('');
    const [c,e,o] = await Promise.all([
      supabase.from('customers').select('*').order('id',{ascending:false}),
      supabase.from('employees').select('*').order('id',{ascending:false}),
      supabase.from('orders').select('*, customers(*), designer:employees!orders_designer_id_fkey(*), production:employees!orders_production_id_fkey(*)').order('id',{ascending:false})
    ]);
    if(c.error||e.error||o.error){ setError(c.error?.message || e.error?.message || o.error?.message || 'โหลดข้อมูลไม่สำเร็จ'); return; }
    setCustomers(c.data||[]); setEmployees(e.data||[]); setOrders(o.data||[]);
  }
  useEffect(()=>{ load(); },[]);

  const stats = useMemo(()=>({
    total: orders.length,
    new: orders.filter(x=>x.status==='รับงานใหม่').length,
    design: orders.filter(x=>x.status==='กำลังออกแบบ').length,
    production: orders.filter(x=>x.status==='กำลังผลิต').length,
    overdue: orders.filter(x=>x.due_date && new Date(x.due_date) < new Date() && !['ชำระเงินแล้ว','ยกเลิก'].includes(x.status)).length,
    unpaid: orders.filter(x=>x.status==='ค้างชำระ' || Number(x.balance)>0).length,
    sales: orders.reduce((s,x)=>s+Number(x.price||0),0)
  }),[orders]);

  function show(msg:string){ setMessage(msg); setTimeout(()=>setMessage(''),2500); }

  async function addCustomer(e:any){
    e.preventDefault(); setError('');
    const res = await supabase.from('customers').insert(customerForm);
    if(res.error){ setError(res.error.message); return; }
    setCustomerForm({name:'',phone:'',line_id:'',facebook:'',contact_channel:'LINE'}); show('เพิ่มลูกค้าแล้ว'); load();
  }
  async function addEmployee(e:any){
    e.preventDefault(); setError('');
    const res = await supabase.from('employees').insert(employeeForm);
    if(res.error){ setError(res.error.message); return; }
    setEmployeeForm({name:'',position:'กราฟิก',role:'graphic'}); show('เพิ่มพนักงานแล้ว'); load();
  }
  async function addOrder(e:any){
    e.preventDefault(); setError('');
    const price=Number(orderForm.price||0), deposit=Number(orderForm.deposit||0);
    const row:any = {...orderForm, customer_id:Number(orderForm.customer_id), quantity:Number(orderForm.quantity||1), price, deposit, balance: price-deposit, status:'รับงานใหม่'};
    if(row.designer_id) row.designer_id=Number(row.designer_id); else row.designer_id=null;
    if(row.production_id) row.production_id=Number(row.production_id); else row.production_id=null;
    const res = await supabase.from('orders').insert(row).select().single();
    if(res.error){ setError(res.error.message); return; }
    await supabase.from('order_status_logs').insert({order_id:res.data.id, old_status:'', new_status:'รับงานใหม่', note:'เปิดงานใหม่'});
    setOrderForm({customer_id:'',title:'',order_type:'ป้ายไวนิล',detail:'',size:'',quantity:'1',material:'',price:'0',deposit:'0',due_date:'',designer_id:'',production_id:''});
    show('เปิดงานใหม่แล้ว'); setTab('orders'); load();
  }
  async function changeStatus(order:Order,newStatus:string){
    setError('');
    const res = await supabase.from('orders').update({status:newStatus, updated_at:new Date().toISOString()}).eq('id',order.id);
    if(res.error){ setError(res.error.message); return; }
    await supabase.from('order_status_logs').insert({order_id:order.id, old_status:order.status, new_status:newStatus, note:'เปลี่ยนสถานะ'});
    show('เปลี่ยนสถานะแล้ว'); load();
  }
  async function markPaid(order:Order){
    setError('');
    const amount = Number(order.balance||0) || Number(order.price||0);
    const p = await supabase.from('payments').insert({order_id:order.id, amount, payment_method:'เงินสด/โอน', payment_status:'paid', payment_date:new Date().toISOString(), note:'บันทึกจ่ายครบ'});
    if(p.error){ setError(p.error.message); return; }
    await supabase.from('orders').update({balance:0,status:'ชำระเงินแล้ว',updated_at:new Date().toISOString()}).eq('id',order.id);
    await supabase.from('order_status_logs').insert({order_id:order.id, old_status:order.status, new_status:'ชำระเงินแล้ว', note:'บันทึกรับเงิน'});
    show('บันทึกรับเงินแล้ว'); load();
  }

  return <main className="container">
    <div className="top"><div><div className="brand">Idea Inkjet Cloud V2</div><div className="sub">ระบบรับงาน + ติดตามสถานะงาน + Supabase Cloud</div></div><button onClick={load}>รีเฟรช</button></div>
    {message && <div className="notice">{message}</div>}{error && <div className="notice error">{error}</div>}
    <div className="tabs">{[['dashboard','Dashboard'],['new-order','เปิดงานใหม่'],['orders','งานทั้งหมด'],['customers','ลูกค้า'],['employees','พนักงาน']].map(t=><button key={t[0]} onClick={()=>setTab(t[0])} className={'tab '+(tab===t[0]?'active':'')}>{t[1]}</button>)}</div>

    {tab==='dashboard' && <section><div className="grid">
      <Stat label="งานทั้งหมด" value={stats.total}/><Stat label="งานใหม่" value={stats.new}/><Stat label="ออกแบบ" value={stats.design}/><Stat label="ผลิต" value={stats.production}/><Stat label="ค้างส่ง" value={stats.overdue}/><Stat label="ค้างชำระ" value={stats.unpaid}/>
    </div><div className="card" style={{marginTop:12}}><h3>ยอดรวมงานทั้งหมด</h3><b style={{fontSize:30}}>{stats.sales.toLocaleString()} บาท</b></div></section>}

    {tab==='new-order' && <section className="card"><h2>เปิดงานใหม่</h2><form className="form" onSubmit={addOrder}>
      <Field label="ลูกค้า"><select required value={orderForm.customer_id} onChange={e=>setOrderForm({...orderForm,customer_id:e.target.value})}><option value="">เลือกลูกค้า</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} - {c.phone}</option>)}</select></Field>
      <Field label="ชื่องาน"><input required value={orderForm.title} onChange={e=>setOrderForm({...orderForm,title:e.target.value})}/></Field>
      <Field label="ประเภทงาน"><input value={orderForm.order_type} onChange={e=>setOrderForm({...orderForm,order_type:e.target.value})}/></Field>
      <Field label="ขนาด"><input value={orderForm.size} onChange={e=>setOrderForm({...orderForm,size:e.target.value})}/></Field>
      <Field label="จำนวน"><input type="number" value={orderForm.quantity} onChange={e=>setOrderForm({...orderForm,quantity:e.target.value})}/></Field>
      <Field label="วัสดุ"><input value={orderForm.material} onChange={e=>setOrderForm({...orderForm,material:e.target.value})}/></Field>
      <Field label="ราคา"><input type="number" value={orderForm.price} onChange={e=>setOrderForm({...orderForm,price:e.target.value})}/></Field>
      <Field label="มัดจำ"><input type="number" value={orderForm.deposit} onChange={e=>setOrderForm({...orderForm,deposit:e.target.value})}/></Field>
      <Field label="วันนัดส่ง"><input type="date" value={orderForm.due_date} onChange={e=>setOrderForm({...orderForm,due_date:e.target.value})}/></Field>
      <Field label="คนออกแบบ"><select value={orderForm.designer_id} onChange={e=>setOrderForm({...orderForm,designer_id:e.target.value})}><option value="">ยังไม่กำหนด</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></Field>
      <Field label="คนผลิต"><select value={orderForm.production_id} onChange={e=>setOrderForm({...orderForm,production_id:e.target.value})}><option value="">ยังไม่กำหนด</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></Field>
      <Field label="รายละเอียดงาน"><textarea value={orderForm.detail} onChange={e=>setOrderForm({...orderForm,detail:e.target.value})}/></Field>
      <button className="full">บันทึกเปิดงาน</button></form></section>}

    {tab==='orders' && <OrdersTable orders={orders} changeStatus={changeStatus} markPaid={markPaid}/>}    
    {tab==='customers' && <section className="two"><div className="card"><h2>เพิ่มลูกค้า</h2><form className="form" onSubmit={addCustomer}><Field label="ชื่อ"><input required value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})}/></Field><Field label="เบอร์"><input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})}/></Field><Field label="Line"><input value={customerForm.line_id} onChange={e=>setCustomerForm({...customerForm,line_id:e.target.value})}/></Field><Field label="ช่องทาง"><input value={customerForm.contact_channel} onChange={e=>setCustomerForm({...customerForm,contact_channel:e.target.value})}/></Field><button className="full">บันทึกลูกค้า</button></form></div><List title="รายชื่อลูกค้า" rows={customers.map(c=>`${c.name} | ${c.phone||'-'} | ${c.line_id||'-'}`)}/></section>}
    {tab==='employees' && <section className="two"><div className="card"><h2>เพิ่มพนักงาน</h2><form className="form" onSubmit={addEmployee}><Field label="ชื่อ"><input required value={employeeForm.name} onChange={e=>setEmployeeForm({...employeeForm,name:e.target.value})}/></Field><Field label="ตำแหน่ง"><input value={employeeForm.position} onChange={e=>setEmployeeForm({...employeeForm,position:e.target.value})}/></Field><Field label="สิทธิ์"><select value={employeeForm.role} onChange={e=>setEmployeeForm({...employeeForm,role:e.target.value})}><option value="owner">เจ้าของร้าน</option><option value="admin">แอดมิน</option><option value="graphic">กราฟิก</option><option value="production">ช่างผลิต</option></select></Field><button className="full">บันทึกพนักงาน</button></form></div><List title="พนักงาน" rows={employees.map(e=>`${e.name} | ${e.position} | ${e.role}`)}/></section>}
  </main>
}
function Stat({label,value}:{label:string;value:any}){return <div className="card stat"><span className="sub">{label}</span><b>{value}</b></div>}
function Field({label,children}:{label:string;children:any}){return <label>{label}{children}</label>}
function List({title,rows}:{title:string;rows:string[]}){return <div className="card"><h2>{title}</h2>{rows.map((r,i)=><p key={i}>{r}</p>)}</div>}
function OrdersTable({orders,changeStatus,markPaid}:{orders:Order[];changeStatus:any;markPaid:any}){return <section className="card"><h2>งานทั้งหมด</h2><div className="mobileTable"><table><thead><tr><th>เลขงาน</th><th>ลูกค้า</th><th>งาน</th><th>สถานะ</th><th>นัดส่ง</th><th>ยอด</th><th>จัดการ</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.order_code || `JOB-${String(o.id).padStart(4,'0')}`}</td><td>{o.customers?.name||'-'}</td><td>{o.title}</td><td><span className="pill">{o.status}</span></td><td>{o.due_date||'-'}</td><td>{Number(o.price||0).toLocaleString()}</td><td><div className="rowActions"><select value={o.status} onChange={e=>changeStatus(o,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select><button className="btnGreen" onClick={()=>markPaid(o)}>จ่ายครบ</button></div></td></tr>)}</tbody></table></div></section>}
