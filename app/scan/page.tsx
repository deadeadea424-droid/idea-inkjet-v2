'use client';
import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type ScannedData = {
  title: string | null;
  order_type: string | null;
  size: string | null;
  quantity: number | null;
  material: string | null;
  price: number | null;
  customer_name: string | null;
  worker: string | null;
  work_date: string | null;
  paid: boolean | null;
  notes: string | null;
};

type JobItem = {
  id: string;
  file: File;
  preview: string;
  status: 'idle' | 'scanning' | 'done' | 'error' | 'saved';
  data: ScannedData | null;
  error: string | null;
  edited: ScannedData | null;
};

const emptyData = (): ScannedData => ({
  title: null, order_type: null, size: null, quantity: null,
  material: null, price: null, customer_name: null, worker: null,
  work_date: null, paid: null, notes: null,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function ScanPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const newItems: JobItem[] = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        preview: URL.createObjectURL(f),
        status: 'idle',
        data: null,
        error: null,
        edited: null,
      }));
    setJobs(prev => [...prev, ...newItems]);
  }

  function removeJob(id: string) {
    setJobs(prev => prev.filter(j => j.id !== id));
  }

  function updateEdited(id: string, field: keyof ScannedData, value: string) {
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j;
      const base = j.edited ?? j.data ?? emptyData();
      const parsed: any =
        field === 'quantity' || field === 'price' ? (value === '' ? null : Number(value)) :
        field === 'paid' ? (value === 'true' ? true : value === 'false' ? false : null) :
        value === '' ? null : value;
      return { ...j, edited: { ...base, [field]: parsed } };
    }));
  }

  async function scanOne(job: JobItem) {
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'scanning', error: null } : j));
    try {
      const base64 = await fileToBase64(job.file);
      const res = await fetch('/api/scan-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: job.file.type }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'เกิดข้อผิดพลาด');
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'done', data: json.data, edited: json.data } : j));
    } catch (e: any) {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: e.message } : j));
    }
  }

  async function scanAll() {
    setScanning(true);
    const pending = jobs.filter(j => j.status === 'idle' || j.status === 'error');
    for (const job of pending) await scanOne(job);
    setScanning(false);
  }

  async function saveJob(job: JobItem) {
    const d = job.edited ?? job.data;
    if (!d) return;

    // Find or create customer
    let customerId: number | null = null;
    if (d.customer_name) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', d.customer_name.trim())
        .maybeSingle();
      if (cust) {
        customerId = cust.id;
      } else {
        const { data: newCust } = await supabase
          .from('customers')
          .insert({ name: d.customer_name.trim() })
          .select('id')
          .single();
        customerId = newCust?.id ?? null;
      }
    }

    // Build detail string
    const detailParts = [
      d.worker ? `พนักงาน/เครื่อง: ${d.worker}` : '',
      d.notes ? `หมายเหตุ: ${d.notes}` : '',
      `[สแกนจากใบงาน]`,
    ].filter(Boolean);

    // Map paid → status
    const status = d.paid === true ? 'ชำระเงินแล้ว' : d.paid === false ? 'ลูกค้ารับแล้ว' : 'ผลิตเสร็จ';

    const payload: Record<string, any> = {
      title: d.title ?? '(ไม่ระบุ)',
      order_type: d.order_type ?? '',
      size: d.size ?? '',
      quantity: d.quantity ?? 0,
      material: d.material ?? '',
      price: d.price ?? 0,
      deposit: d.paid ? (d.price ?? 0) : 0,
      balance: d.paid ? 0 : (d.price ?? 0),
      status,
      detail: detailParts.join('\n'),
      delivery_method: 'รับเอง',
      payment_type: 'เงินสด',
      file_status: 'ไม่มีไฟล์',
      finishing: '',
      credit_days: 0,
      order_code: `SCAN-${Date.now()}`,
    };
    if (customerId) payload.customer_id = customerId;
    if (d.work_date) payload.due_date = parseThaiDate(d.work_date);

    const { error } = await supabase.from('orders').insert(payload);
    if (error) {
      alert(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'saved' } : j));
  }

  function parseThaiDate(s: string): string | null {
    const m = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (!m) return null;
    let y = parseInt(m[3]);
    if (y < 100) y = y > 50 ? y + 1900 : y + 2000; // 2-digit year
    if (y > 2400) y = y - 543; // Thai Buddhist year
    const mm = m[2].padStart(2, '0');
    const dd = m[1].padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }

  const doneCount = jobs.filter(j => j.status === 'done' || j.status === 'saved').length;
  const pendingCount = jobs.filter(j => j.status === 'idle' || j.status === 'error').length;

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '16px 14px 80px', background: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <a href="/menu" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 22 }}>←</a>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>📷 สแกนใบงาน</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>AI วิเคราะห์รูปใบงาน → บันทึกเข้าระบบ</div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#1d4ed8' : '#cbd5e1'}`,
          borderRadius: 16, padding: '32px 20px', textAlign: 'center',
          background: dragOver ? '#eff6ff' : 'white', cursor: 'pointer',
          marginBottom: 16, transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>แตะหรือลากรูปใบงานมาวาง</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>รองรับหลายรูปพร้อมกัน · JPG, PNG, WEBP</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* Scan all button */}
      {pendingCount > 0 && (
        <button
          onClick={scanAll}
          disabled={scanning}
          style={{
            width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: scanning ? '#94a3b8' : '#1d4ed8', color: 'white',
            fontWeight: 800, fontSize: 15, marginBottom: 16,
          }}
        >
          {scanning ? '⏳ กำลังวิเคราะห์...' : `🔍 วิเคราะห์ใบงาน ${pendingCount} รูป`}
        </button>
      )}

      {/* Stats */}
      {jobs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'ทั้งหมด', val: jobs.length, bg: '#f1f5f9', c: '#475569' },
            { label: 'วิเคราะห์แล้ว', val: doneCount, bg: '#f0fdf4', c: '#16a34a' },
            { label: 'บันทึกแล้ว', val: jobs.filter(j => j.status === 'saved').length, bg: '#eff6ff', c: '#1d4ed8' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: s.c }}>
              {s.label}: {s.val}
            </div>
          ))}
        </div>
      )}

      {/* Job cards */}
      {jobs.map(job => (
        <JobCard
          key={job.id}
          job={job}
          onRemove={() => removeJob(job.id)}
          onScan={() => scanOne(job)}
          onSave={() => saveJob(job)}
          onEdit={(field, val) => updateEdited(job.id, field, val)}
        />
      ))}

      {jobs.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📋</div>
          <div>ยังไม่มีรูปใบงาน<br/>แตะพื้นที่ด้านบนเพื่อเพิ่มรูป</div>
        </div>
      )}
    </main>
  );
}

function JobCard({ job, onRemove, onScan, onSave, onEdit }: {
  job: JobItem;
  onRemove: () => void;
  onScan: () => void;
  onSave: () => void;
  onEdit: (field: keyof ScannedData, val: string) => void;
}) {
  const d = job.edited ?? job.data;

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, marginBottom: 14, overflow: 'hidden' }}>

      {/* Image + status bar */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'flex-start' }}>
        <img src={job.preview} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4, wordBreak: 'break-all' }}>
            {job.file.name}
          </div>
          <StatusBadge status={job.status} />
          {job.error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{job.error}</div>}
        </div>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, padding: 0 }}>✕</button>
      </div>

      {/* Action buttons (idle/error) */}
      {(job.status === 'idle' || job.status === 'error') && (
        <div style={{ padding: '0 14px 12px' }}>
          <button onClick={onScan} style={{
            width: '100%', padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#1d4ed8', color: 'white', fontWeight: 700, fontSize: 13,
          }}>
            🔍 วิเคราะห์รูปนี้
          </button>
        </div>
      )}

      {/* Scanning spinner */}
      {job.status === 'scanning' && (
        <div style={{ padding: '12px 14px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          ⏳ AI กำลังอ่านใบงาน...
        </div>
      )}

      {/* Saved */}
      {job.status === 'saved' && (
        <div style={{ padding: '12px 14px', background: '#f0fdf4', textAlign: 'center', color: '#16a34a', fontWeight: 700, fontSize: 13 }}>
          ✅ บันทึกเข้าระบบแล้ว
        </div>
      )}

      {/* Extracted data — editable */}
      {job.status === 'done' && d && (
        <div style={{ borderTop: '1px solid #f1f5f9' }}>
          <div style={{ padding: '10px 14px 4px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
            ข้อมูลที่วิเคราะห์ได้ (แก้ไขได้ก่อนบันทึก)
          </div>
          <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="ชื่องาน / รายละเอียด" value={d.title ?? ''} onChange={v => onEdit('title', v)} />
            <Field label="ประเภทงาน" value={d.order_type ?? ''} onChange={v => onEdit('order_type', v)} />
            <Row2>
              <Field label="ขนาด" value={d.size ?? ''} onChange={v => onEdit('size', v)} />
              <Field label="จำนวน" value={d.quantity?.toString() ?? ''} type="number" onChange={v => onEdit('quantity', v)} />
            </Row2>
            <Field label="วัสดุ" value={d.material ?? ''} onChange={v => onEdit('material', v)} />
            <Row2>
              <Field label="ราคา (บาท)" value={d.price?.toString() ?? ''} type="number" onChange={v => onEdit('price', v)} />
              <div style={{ flex: 1 }}>
                <label style={lbl}>สถานะชำระ</label>
                <select
                  value={d.paid === true ? 'true' : d.paid === false ? 'false' : ''}
                  onChange={e => onEdit('paid', e.target.value)}
                  style={inp}
                >
                  <option value="">ไม่ระบุ</option>
                  <option value="true">✅ จ่ายแล้ว</option>
                  <option value="false">❌ ยังไม่จ่าย</option>
                </select>
              </div>
            </Row2>
            <Row2>
              <Field label="ลูกค้า" value={d.customer_name ?? ''} onChange={v => onEdit('customer_name', v)} />
              <Field label="พนักงาน/เครื่อง" value={d.worker ?? ''} onChange={v => onEdit('worker', v)} />
            </Row2>
            <Field label="วันที่ทำงาน (DD/MM/YYYY)" value={d.work_date ?? ''} onChange={v => onEdit('work_date', v)} />
            <Field label="หมายเหตุ" value={d.notes ?? ''} onChange={v => onEdit('notes', v)} />
          </div>
          <div style={{ padding: '0 14px 14px' }}>
            <button onClick={onSave} style={{
              width: '100%', padding: '11px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#16a34a', color: 'white', fontWeight: 800, fontSize: 14,
            }}>
              💾 บันทึกเข้าระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: JobItem['status'] }) {
  const map: Record<string, [string, string, string]> = {
    idle:     ['รอวิเคราะห์', '#f1f5f9', '#475569'],
    scanning: ['กำลังวิเคราะห์...', '#fef9c3', '#854d0e'],
    done:     ['วิเคราะห์แล้ว', '#dcfce7', '#15803d'],
    error:    ['เกิดข้อผิดพลาด', '#fee2e2', '#dc2626'],
    saved:    ['บันทึกแล้ว ✓', '#eff6ff', '#1d4ed8'],
  };
  const [label, bg, color] = map[status];
  return (
    <span style={{ background: bg, color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={lbl}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inp} />
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>;
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 3 };
const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
  borderRadius: 8, fontSize: 13, boxSizing: 'border-box',
};
