'use client';
import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type Material = { id: string; name: string; pricePerSqm: number };
type Finishing = { id: string; name: string; unit: 'sqm' | 'perimeter' | 'piece' | 'fixed'; price: number; enabled: boolean; qty?: number };

const DEFAULT_MATERIALS: Material[] = [
  { id: 'vinyl_white', name: 'ไวนิลหลังขาว', pricePerSqm: 100 },
  { id: 'vinyl_black', name: 'ไวนิลหลังดำ', pricePerSqm: 120 },
  { id: 'fabric_it', name: 'ผ้าไอที', pricePerSqm: 200 },
  { id: 'acrylic3', name: 'อะคริลิค 3 มม.', pricePerSqm: 400 },
  { id: 'future3', name: 'ฟิวเจอร์บอร์ด 3 มม.', pricePerSqm: 180 },
  { id: 'future5', name: 'ฟิวเจอร์บอร์ด 5 มม.', pricePerSqm: 220 },
  { id: 'sticker', name: 'สติ๊กเกอร์ทั่วไป', pricePerSqm: 120 },
  { id: 'sticker_clear', name: 'สติ๊กเกอร์ใส', pricePerSqm: 160 },
  { id: 'xbanner', name: 'X-Banner (ผ้า + โครง)', pricePerSqm: 0 },
];

const DEFAULT_FINISHING: Finishing[] = [
  { id: 'eyelet', name: 'ตอกตาไก่', unit: 'piece', price: 5, enabled: false, qty: 4 },
  { id: 'rope', name: 'ม้วนขอบ + เชือก', unit: 'perimeter', price: 25, enabled: false },
  { id: 'hem', name: 'ม้วนขอบ (ไม่มีเชือก)', unit: 'perimeter', price: 15, enabled: false },
  { id: 'lam_gloss', name: 'ลามิเนตมัน', unit: 'sqm', price: 40, enabled: false },
  { id: 'lam_matte', name: 'ลามิเนตด้าน', unit: 'sqm', price: 50, enabled: false },
  { id: 'frame_alu', name: 'กรอบอลูมิเนียม', unit: 'perimeter', price: 80, enabled: false },
  { id: 'install', name: 'ค่าติดตั้ง', unit: 'fixed', price: 200, enabled: false },
];

const fmt = (n: number) => Math.round(n).toLocaleString('th-TH');

const MATERIALS_VER = 'v2';

function useLocalStorage<T>(key: string, init: T, version?: string): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(init);
  useEffect(() => {
    try {
      if (version) {
        const saved = localStorage.getItem(key + '_ver');
        if (saved !== version) { localStorage.removeItem(key); localStorage.setItem(key + '_ver', version); return; }
      }
      const s = localStorage.getItem(key); if (s) setVal(JSON.parse(s));
    } catch {}
  }, [key, version]);
  const save = useCallback((v: T) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key]);
  return [val, save];
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CalcPage() {
  const [materials, setMaterials] = useLocalStorage<Material[]>('calc_materials', DEFAULT_MATERIALS, MATERIALS_VER);
  const [matId, setMatId] = useState('vinyl440');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [unit, setUnit] = useState<'cm' | 'm'>('cm');
  const [qty, setQty] = useState('1');
  const [minPrice, setMinPrice] = useState('50');
  const [finishing, setFinishing] = useLocalStorage<Finishing[]>('calc_finishing', DEFAULT_FINISHING);
  const [showEditMat, setShowEditMat] = useState(false);
  const [showEditFin, setShowEditFin] = useState(false);
  const [margin, setMargin] = useState('0');
  const [xbannerFixed, setXbannerFixed] = useState('350');
  const [copied, setCopied] = useState(false);

  const mat = materials.find(m => m.id === matId) ?? materials[0];
  const wNum = parseFloat(width) || 0;
  const hNum = parseFloat(height) || 0;
  const qNum = Math.max(1, parseInt(qty) || 1);
  const minNum = parseFloat(minPrice) || 0;
  const marginPct = parseFloat(margin) || 0;

  const wM = unit === 'cm' ? wNum / 100 : wNum;
  const hM = unit === 'cm' ? hNum / 100 : hNum;
  const sqm = wM * hM;
  const perimeter = 2 * (wM + hM);

  function calcFinishingCost(f: Finishing): number {
    if (!f.enabled) return 0;
    switch (f.unit) {
      case 'sqm':       return f.price * sqm;
      case 'perimeter': return f.price * perimeter;
      case 'piece':     return f.price * (f.qty ?? 1);
      case 'fixed':     return f.price;
    }
  }

  const isXbanner = matId === 'xbanner';
  const basePricePerPiece = isXbanner
    ? parseFloat(xbannerFixed) || 0
    : mat.pricePerSqm * sqm;
  const finishingTotalPerPiece = finishing.reduce((s, f) => s + calcFinishingCost(f), 0);
  const rawPerPiece = basePricePerPiece + finishingTotalPerPiece;
  const pricePerPiece = Math.max(rawPerPiece, sqm > 0 || isXbanner ? minNum : 0);
  const priceAfterMargin = pricePerPiece * (1 + marginPct / 100);
  const total = priceAfterMargin * qNum;

  function copyResult() {
    const w = unit === 'cm' ? `${wNum}×${hNum} ซม.` : `${wNum}×${hNum} ม.`;
    const fins = finishing.filter(f => f.enabled).map(f => f.name).join(', ');
    const text = [
      `วัสดุ: ${mat.name}`,
      `ขนาด: ${w} (${sqm.toFixed(2)} ตร.ม.)`,
      `จำนวน: ${qNum} ชิ้น`,
      fins ? `งานตกแต่ง: ${fins}` : '',
      `ราคา/ชิ้น: ${fmt(priceAfterMargin)} บาท`,
      `รวม: ${fmt(total)} บาท`,
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  function resetFinishing() { setFinishing(DEFAULT_FINISHING); }
  function resetMaterials() { setMaterials(DEFAULT_MATERIALS); }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '16px 14px 80px', background: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <a href="/" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 22, lineHeight: 1 }}>←</a>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>คำนวณราคาป้าย</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Idea Inkjet · Price Calculator</div>
        </div>
      </div>

      {/* ── วัสดุ ─────────────────────────────────── */}
      <div style={card}>
        <div style={sectionTitle}>วัสดุ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {materials.map(m => (
            <button key={m.id} onClick={() => setMatId(m.id)} style={{
              padding: '10px 8px', borderRadius: 10, border: `2px solid ${matId === m.id ? '#1d4ed8' : '#e5e7eb'}`,
              background: matId === m.id ? '#eff6ff' : 'white', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: matId === m.id ? '#1d4ed8' : '#1e293b' }}>{m.name}</div>
              {m.id !== 'xbanner' && (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{fmt(m.pricePerSqm)} บ./ตร.ม.</div>
              )}
            </button>
          ))}
        </div>

        {isXbanner && (
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>ราคา X-Banner ต่อชิ้น (บาท)</label>
            <input type="number" value={xbannerFixed} onChange={e => setXbannerFixed(e.target.value)} style={inputStyle} />
          </div>
        )}

        <button onClick={() => setShowEditMat(!showEditMat)} style={linkBtn}>
          {showEditMat ? '▲ ซ่อน' : '✏️ แก้ราคาวัสดุ'}
        </button>

        {showEditMat && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {materials.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: 13, color: '#374151' }}>{m.name}</div>
                {m.id !== 'xbanner' && (
                  <input type="number" value={m.pricePerSqm}
                    onChange={e => { const n = [...materials]; n[i] = { ...m, pricePerSqm: parseFloat(e.target.value) || 0 }; setMaterials(n); }}
                    style={{ ...inputStyle, width: 90, marginBottom: 0 }} />
                )}
              </div>
            ))}
            <button onClick={resetMaterials} style={{ ...linkBtn, color: '#dc2626' }}>↺ รีเซ็ตเป็นค่าเริ่มต้น</button>
          </div>
        )}
      </div>

      {/* ── ขนาด ─────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={sectionTitle}>ขนาด</div>
          <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            {(['cm', 'm'] as const).map(u => (
              <button key={u} onClick={() => setUnit(u)} style={{
                padding: '5px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: unit === u ? '#1d4ed8' : 'white', color: unit === u ? 'white' : '#6b7280',
              }}>{u}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>กว้าง ({unit})</label>
            <input type="number" value={width} onChange={e => setWidth(e.target.value)}
              placeholder={unit === 'cm' ? 'เช่น 120' : 'เช่น 1.2'} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>สูง ({unit})</label>
            <input type="number" value={height} onChange={e => setHeight(e.target.value)}
              placeholder={unit === 'cm' ? 'เช่น 240' : 'เช่น 2.4'} style={inputStyle} />
          </div>
        </div>

        {sqm > 0 && (
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
            พื้นที่: {sqm.toFixed(4)} ตร.ม. · เส้นรอบวง: {perimeter.toFixed(2)} ม.
          </div>
        )}
      </div>

      {/* ── จำนวน + ราคาขั้นต่ำ ─────────────────── */}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>จำนวน (ชิ้น)</label>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ราคาขั้นต่ำ/ชิ้น (บาท)</label>
            <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>กำไร / Margin (%)</label>
          <input type="number" value={margin} onChange={e => setMargin(e.target.value)}
            placeholder="0 = ไม่เพิ่ม" style={inputStyle} />
        </div>
      </div>

      {/* ── งานตกแต่ง ─────────────────────────────── */}
      <div style={card}>
        <div style={sectionTitle}>งานตกแต่ง / Finishing</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {finishing.map((f, i) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8, background: f.enabled ? '#f0fdf4' : '#f8fafc',
              border: `1px solid ${f.enabled ? '#bbf7d0' : '#f1f5f9'}` }}>
              <input type="checkbox" checked={f.enabled} onChange={e => {
                const n = [...finishing]; n[i] = { ...f, enabled: e.target.checked }; setFinishing(n);
              }} style={{ width: 18, height: 18, accentColor: '#16a34a', flexShrink: 0, cursor: 'pointer' }} />
              <div style={{ flex: 1, fontSize: 13, color: '#1e293b', fontWeight: f.enabled ? 600 : 400 }}>{f.name}</div>
              {f.unit === 'piece' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>จำนวนรู</span>
                  <input type="number" value={f.qty ?? 4} min={1}
                    onChange={e => { const n = [...finishing]; n[i] = { ...f, qty: parseInt(e.target.value) || 1 }; setFinishing(n); }}
                    style={{ width: 52, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, textAlign: 'center' }} />
                </div>
              )}
              <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                {f.unit === 'sqm'       && `${fmt(f.price)} บ./ตร.ม.`}
                {f.unit === 'perimeter' && `${fmt(f.price)} บ./ม.`}
                {f.unit === 'piece'     && `${fmt(f.price)} บ./รู`}
                {f.unit === 'fixed'     && `${fmt(f.price)} บาท`}
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => setShowEditFin(!showEditFin)} style={{ ...linkBtn, marginTop: 10 }}>
          {showEditFin ? '▲ ซ่อน' : '✏️ แก้ราคางานตกแต่ง'}
        </button>

        {showEditFin && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {finishing.map((f, i) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: 13, color: '#374151' }}>{f.name}</div>
                <input type="number" value={f.price}
                  onChange={e => { const n = [...finishing]; n[i] = { ...f, price: parseFloat(e.target.value) || 0 }; setFinishing(n); }}
                  style={{ ...inputStyle, width: 90, marginBottom: 0 }} />
              </div>
            ))}
            <button onClick={resetFinishing} style={{ ...linkBtn, color: '#dc2626' }}>↺ รีเซ็ตเป็นค่าเริ่มต้น</button>
          </div>
        )}
      </div>

      {/* ── ผลลัพธ์ ──────────────────────────────── */}
      {(sqm > 0 || isXbanner) && (
        <div style={{ ...card, background: '#1e293b', border: 'none' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8', marginBottom: 14 }}>สรุปราคา</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row label="วัสดุ" value={mat.name} light />
            {!isXbanner && <Row label="พื้นที่" value={`${sqm.toFixed(4)} ตร.ม.`} light />}
            {!isXbanner && <Row label={`ราคาวัสดุ (${fmt(mat.pricePerSqm)} × ${sqm.toFixed(4)})`} value={`${fmt(basePricePerPiece)} บาท`} light />}
            {isXbanner  && <Row label="ราคา X-Banner" value={`${fmt(basePricePerPiece)} บาท`} light />}
            {finishing.filter(f => f.enabled).map(f => (
              <Row key={f.id} label={f.name} value={`${fmt(calcFinishingCost(f))} บาท`} light />
            ))}
            {rawPerPiece < minNum && sqm > 0 && (
              <Row label="ปรับขึ้นราคาขั้นต่ำ" value={`${fmt(minNum)} บาท`} light />
            )}
            {marginPct > 0 && (
              <Row label={`Margin ${marginPct}%`} value={`+${fmt(priceAfterMargin - pricePerPiece)} บาท`} light />
            )}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginTop: 6 }}>
              <Row label="ราคา / ชิ้น" value={`${fmt(priceAfterMargin)} บาท`} big />
              {qNum > 1 && <Row label={`จำนวน ${qNum} ชิ้น`} value={`${fmt(total)} บาท`} big />}
            </div>
          </div>

          <button onClick={copyResult} style={{
            marginTop: 16, width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: copied ? '#16a34a' : '#3b82f6', color: 'white', fontWeight: 700, fontSize: 15,
          }}>
            {copied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกผลลัพธ์'}
          </button>
        </div>
      )}

      {/* Quick presets */}
      <div style={card}>
        <div style={sectionTitle}>ขนาดนิยม (กดเพื่อใช้)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: '60×120 ซม.', w: '60', h: '120', u: 'cm' as const },
            { label: '80×120 ซม.', w: '80', h: '120', u: 'cm' as const },
            { label: '100×200 ซม.', w: '100', h: '200', u: 'cm' as const },
            { label: '120×240 ซม.', w: '120', h: '240', u: 'cm' as const },
            { label: '1×2 ม.', w: '1', h: '2', u: 'm' as const },
            { label: '1×3 ม.', w: '1', h: '3', u: 'm' as const },
            { label: '1.2×2.4 ม.', w: '1.2', h: '2.4', u: 'm' as const },
            { label: '2×3 ม.', w: '2', h: '3', u: 'm' as const },
            { label: '3×6 ม.', w: '3', h: '6', u: 'm' as const },
            { label: '4×8 ม.', w: '4', h: '8', u: 'm' as const },
          ].map(p => (
            <button key={p.label} onClick={() => { setWidth(p.w); setHeight(p.h); setUnit(p.u); }} style={{
              padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 20,
              background: 'white', fontSize: 13, cursor: 'pointer', color: '#374151',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

    </main>
  );
}

function Row({ label, value, light, big }: { label: string; value: string; light?: boolean; big?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: big ? 14 : 12, color: big ? '#cbd5e1' : '#64748b' }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 13, fontWeight: big ? 800 : 600, color: big ? '#f1f5f9' : '#94a3b8' }}>{value}</span>
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e7eb',
  borderRadius: 16, padding: '16px 14px', marginBottom: 12,
};
const sectionTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 12,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
  borderRadius: 8, fontSize: 15, marginBottom: 0, boxSizing: 'border-box',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer',
  fontSize: 13, padding: '6px 0', fontWeight: 600,
};
