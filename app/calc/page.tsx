'use client';
import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type Material = { id: string; name: string; pricePerSqm: number; fixedPrice?: number; quoteOnly?: boolean; minTotal?: number };
const DEFAULT_MATERIALS: Material[] = [
  { id: 'vinyl_white', name: 'ไวนิลหลังขาว', pricePerSqm: 150 },
  { id: 'vinyl_black', name: 'ไวนิลหลังดำ', pricePerSqm: 150 },
  { id: 'fabric_it', name: 'ผ้าไอที', pricePerSqm: 500 },
  { id: 'acrylic3_cut', name: 'อะคริลิค 3 มิล ตัดอย่างเดียว', pricePerSqm: 1000 },
  { id: 'acrylic3_sticker', name: 'อะคริลิค 3 มิล + สติ๊กเกอร์พิมพ์', pricePerSqm: 1500 },
  { id: 'acrylic3_diecut', name: 'อะคริลิค 3 มิล + สติ๊กเกอร์ไดคัท', pricePerSqm: 2000 },
  { id: 'acrylic3_engrave', name: 'อะคริลิค 3 มิล สลัก', pricePerSqm: 3500 },
  { id: 'future3', name: 'ฟิวเจอร์บอร์ด 3 มม.', pricePerSqm: 180 },
  { id: 'future5', name: 'ฟิวเจอร์บอร์ด 5 มม.', pricePerSqm: 220 },
  { id: 'sticker_future5', name: 'สติ๊กเกอร์รีดฟิวเจอร์บอร์ด 5 มม.', pricePerSqm: 500 },
  { id: 'sticker_foam55', name: 'สติ๊กเกอร์รีดโฟมบอร์ด 5.5 มม.', pricePerSqm: 500 },
  { id: 'sticker_print', name: 'สติ๊กเกอร์พิมพ์', pricePerSqm: 400 },
  { id: 'sticker_diecut', name: 'สติ๊กเกอร์พิมพ์ไดคัท', pricePerSqm: 400 },
  { id: 'sticker_clear', name: 'สติ๊กเกอร์ใส', pricePerSqm: 500 },
{ id: 'xstand_v60', name: 'X Stand ไวนิล 60×160 ซม.', pricePerSqm: 0, fixedPrice: 600 },
  { id: 'xstand_v80', name: 'X Stand ไวนิล 80×180 ซม.', pricePerSqm: 0, fixedPrice: 800 },
  { id: 'xstand_p60', name: 'X Stand กระดาษก๊อซซี่ PP 60×160 ซม.', pricePerSqm: 0, fixedPrice: 800 },
  { id: 'xstand_p80', name: 'X Stand กระดาษก๊อซซี่ PP 80×180 ซม.', pricePerSqm: 0, fixedPrice: 1000 },
  { id: 'rollup_p80', name: 'โรลอัพ กระดาษก๊อซซี่ PP 80×200 ซม.', pricePerSqm: 0, fixedPrice: 1500 },
  { id: 'paper_a4', name: 'กระดาษ A4 ธรรมดา', pricePerSqm: 0, fixedPrice: 10, minTotal: 50 },
  { id: 'paper_art', name: 'อาร์ตมัน A4', pricePerSqm: 0, fixedPrice: 20, minTotal: 50 },
  { id: 'paper_lam', name: 'A4 เคลือบ', pricePerSqm: 0, fixedPrice: 50, minTotal: 50 },
  { id: 'letter_plastic', name: 'อักษรพลาสวูด', pricePerSqm: 0, quoteOnly: true },
  { id: 'letter_stainless', name: 'อักษรสแตนเลส', pricePerSqm: 0, quoteOnly: true },
  { id: 'letter_alu', name: 'อักษรอลูมิเนียม', pricePerSqm: 0, quoteOnly: true },
  { id: 'letter_acrylic', name: 'อักษรอะคริลิค', pricePerSqm: 0, quoteOnly: true },
];


const fmt = (n: number) => Math.round(n).toLocaleString('th-TH');

const MATERIALS_VER = 'v10';

// keyword map: each material gets specific search tokens (lowercase)
// score = sum of matched keyword lengths × 2 → longer/rarer match wins
const MAT_KEYWORDS: Record<string, string[]> = {
  vinyl_white:      ['ไวนิล', 'ขาว', 'หลังขาว', 'ไวนิลขาว', 'ไวนิลหลังขาว'],
  vinyl_black:      ['ไวนิล', 'ดำ',  'หลังดำ',  'ไวนิลดำ',  'ไวนิลหลังดำ'],
  fabric_it:        ['ผ้า', 'ไอที', 'ผ้าไอที', 'fabric'],
  acrylic3_cut:     ['อะคริลิค', 'ตัด', 'ตัดอย่างเดียว', 'ตัดเฉย'],
  acrylic3_sticker: ['อะคริลิค', 'สติ๊กเกอร์พิมพ์', 'อะคริลิค+สติ๊กเกอร์'],
  acrylic3_diecut:  ['อะคริลิค', 'ไดคัท', 'อะคริลิคไดคัท'],
  acrylic3_engrave: ['อะคริลิค', 'สลัก', 'engrave'],
  future3:          ['ฟิวเจอร์', 'ฟิวเจอร์บอร์ด', '3มม', '3 มม', 'future 3'],
  future5:          ['ฟิวเจอร์', 'ฟิวเจอร์บอร์ด', '5มม', '5 มม', 'future 5'],
  sticker_future5:  ['สติ๊กเกอร์', 'รีด', 'ฟิวเจอร์', 'รีดฟิวเจอร์', 'สติ๊กเกอร์รีด'],
  sticker_foam55:   ['สติ๊กเกอร์', 'รีด', 'โฟม', 'โฟมบอร์ด', 'รีดโฟม'],
  sticker_print:    ['สติ๊กเกอร์', 'พิมพ์', 'สติ๊กเกอร์พิมพ์', 'sticker'],
  sticker_diecut:   ['สติ๊กเกอร์', 'ไดคัท', 'สติ๊กเกอร์ไดคัท', 'diecut'],
  sticker_clear:    ['สติ๊กเกอร์', 'ใส', 'สติ๊กเกอร์ใส', 'clear'],
  xstand_v60:       ['x stand', 'xstand', 'ไวนิล', '60×160', '60x160'],
  xstand_v80:       ['x stand', 'xstand', 'ไวนิล', '80×180', '80x180'],
  xstand_p60:       ['x stand', 'xstand', 'กระดาษ', 'pp', '60×160'],
  xstand_p80:       ['x stand', 'xstand', 'กระดาษ', 'pp', '80×180'],
  rollup_p80:       ['โรลอัพ', 'โรล', 'rollup', 'roll up', 'ม้วน'],
  paper_a4:         ['กระดาษ', 'a4', 'ธรรมดา', 'กระดาษa4'],
  paper_art:        ['กระดาษ', 'อาร์ตมัน', 'อาร์ต', 'art', 'กระดาษอาร์ต'],
  paper_lam:        ['กระดาษ', 'เคลือบ', 'a4 เคลือบ', 'กระดาษเคลือบ'],
  letter_plastic:   ['อักษร', 'พลาสวูด', 'อักษรพลาส'],
  letter_stainless: ['อักษร', 'สแตนเลส', 'stainless'],
  letter_alu:       ['อักษร', 'อลูมิเนียม', 'อะลูมิเนียม', 'aluminium'],
  letter_acrylic:   ['อักษร', 'อักษรอะคริลิค'],
};

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
  const [unit, setUnit] = useState<'cm' | 'm' | 'in' | 'ft'>('cm');
  const [qty, setQty] = useState('1');
  const [showEditMat, setShowEditMat] = useState(false);
  const [fixedPrices, setFixedPrices] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [parseText, setParseText] = useState('');
  const [parseInfo, setParseInfo] = useState<string[]>([]);

  const mat = materials.find(m => m.id === matId) ?? materials[0];
  const wNum = parseFloat(width) || 0;
  const hNum = parseFloat(height) || 0;
  const qNum = Math.max(1, parseInt(qty) || 1);


  const toM = (n: number) => unit === 'cm' ? n / 100 : unit === 'in' ? n * 0.0254 : unit === 'ft' ? n * 0.3048 : n;
  const wM = toM(wNum);
  const hM = toM(hNum);
  const sqm = wM * hM;


  const isFixed = mat.fixedPrice !== undefined;
  const isQuote = !!mat.quoteOnly;
  const isVinyl = mat.id.startsWith('vinyl_');
  const fixedVal = parseFloat(fixedPrices[mat.id] ?? '') || mat.fixedPrice || 0;
  const basePricePerPiece = isFixed ? fixedVal : mat.pricePerSqm * sqm;
  const rawPerPiece = basePricePerPiece;

  // ไวนิล: ขั้นต่ำแบบ tier
  let pricePerPiece = rawPerPiece;
  let vinylMinApplied = '';
  if (isVinyl && rawPerPiece > 0) {
    if (rawPerPiece < 100) { pricePerPiece = 100; vinylMinApplied = 'ขั้นต่ำ 100 บาท'; }
    else if (rawPerPiece < 150) { pricePerPiece = 150; vinylMinApplied = 'ขั้นต่ำ 150 บาท'; }
    else if (rawPerPiece < 200 && qNum === 1) { pricePerPiece = 200; vinylMinApplied = 'ขั้นต่ำ 200 บาท (สั่ง 1 ผืน)'; }
  }

  const rawTotal = pricePerPiece * qNum;
  const total = mat.minTotal ? Math.max(rawTotal, mat.minTotal) : rawTotal;
  const minTotalApplied = mat.minTotal && rawTotal < mat.minTotal;

  function copyResult() {
    const w = unit === 'cm' ? `${wNum}×${hNum} ซม.` : `${wNum}×${hNum} ม.`;
    const text = [
      `วัสดุ: ${mat.name}`,
      !isFixed ? `ขนาด: ${w} (${sqm.toFixed(2)} ตร.ม.)` : '',
      `จำนวน: ${qNum} ${mat.id.startsWith('paper_') ? 'แผ่น' : 'ชิ้น'}`,
      `ราคา/ชิ้น: ${fmt(pricePerPiece)} บาท`,
      `รวม: ${fmt(total)} บาท`,
      `ขอบคุณที่ใช้บริการครับ`,
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  function resetMaterials() { setMaterials(DEFAULT_MATERIALS); }

  function parseAndApply() {
    if (!parseText.trim()) return;
    const text = parseText;
    const tl = text.toLowerCase();
    const info: string[] = [];

    // ── Material matching (weighted keyword score) ──
    let bestMatId: string | undefined;
    let bestScore = 0;
    for (const mat of materials) {
      const nameWords = mat.name.toLowerCase().split(/\s+/).filter(w => w.length >= 1);
      const kws = [...new Set([
        mat.name.toLowerCase(),
        ...nameWords,
        ...(MAT_KEYWORDS[mat.id] ?? []).map(k => k.toLowerCase()),
      ])];
      let score = 0;
      for (const kw of kws) {
        if (tl.includes(kw)) score += kw.length * 2;
      }
      if (score > bestScore) { bestScore = score; bestMatId = mat.id; }
    }
    if (bestMatId && bestScore > 0) {
      const found = materials.find(m => m.id === bestMatId)!;
      setMatId(bestMatId);
      info.push(`วัสดุ: ${found.name}`);
    }

    // ── Dimension parsing (multiple patterns) ───────
    const dimMatch =
      text.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/) ??
      text.match(/กว้าง\s*(\d+(?:\.\d+)?)[^0-9]{0,10}(?:สูง|ยาว)\s*(\d+(?:\.\d+)?)/) ??
      text.match(/(\d+(?:\.\d+)?)\s*คูณ\s*(\d+(?:\.\d+)?)/);
    if (dimMatch) {
      setWidth(dimMatch[1]);
      setHeight(dimMatch[2]);
      // detect unit from text around the match AND full text
      const around = text.slice(
        Math.max(0, (dimMatch.index ?? 0) - 5),
        (dimMatch.index ?? 0) + dimMatch[0].length + 20,
      ) + ' ' + text;
      let du: 'cm' | 'm' | 'in' | 'ft' | undefined;
      if (/ซม|ซ\.ม\.?|centimeter|cm/i.test(around)) du = 'cm';
      else if (/นิ้ว|inch|"/i.test(around)) du = 'in';
      else if (/ฟุต|feet|foot|ft|'/i.test(around)) du = 'ft';
      else if (/เมตร|meter|metre|\bm\b/i.test(around)) du = 'm';
      if (du) setUnit(du);
      info.push(`ขนาด: ${dimMatch[1]}×${dimMatch[2]}${du ? ' ' + du : ''}`);
    }

    // ── Quantity parsing ─────────────────────────────
    const qtyMatch =
      text.match(/(\d+)\s*(?:ผืน|ชิ้น|แผ่น|อัน|ตัว|รูป|ใบ|pcs?|piece)/i) ??
      text.match(/จำนวน\s*[:\s]*(\d+)/i);
    if (qtyMatch) {
      setQty(qtyMatch[1]);
      info.push(`จำนวน: ${qtyMatch[1]}`);
    }

    setParseInfo(info.length > 0 ? info : ['ไม่พบข้อมูล — ลองพิมพ์ชื่อวัสดุ ขนาด หรือจำนวน']);
    if (info.length > 0) {
      setTimeout(() => {
        document.getElementById('calc-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }

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

      {/* ── พิมพ์รายละเอียด ──────────────────────── */}
      <div style={card}>
        <div style={sectionTitle}>🔍 พิมพ์รายละเอียด</div>
        <textarea
          value={parseText}
          onChange={e => { setParseText(e.target.value); setParseInfo([]); }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); parseAndApply(); } }}
          placeholder={'เช่น: ไวนิลหลังขาว 60×90 ซม. 3 ผืน\nหรือ: สติ๊กเกอร์พิมพ์ 1×2 เมตร 5 ชิ้น'}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7 }}
        />
        <button onClick={parseAndApply} style={{
          marginTop: 8, width: '100%', padding: '10px', borderRadius: 10, border: 'none',
          cursor: 'pointer', background: '#7c3aed', color: 'white', fontWeight: 700, fontSize: 14,
        }}>
          ✨ ใส่ข้อมูลอัตโนมัติ
        </button>
        {parseInfo.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {parseInfo.map((t, i) => (
              <span key={i} style={{
                background: t.startsWith('ไม่พบ') ? '#fef9c3' : '#f0fdf4',
                color: t.startsWith('ไม่พบ') ? '#854d0e' : '#166534',
                border: `1px solid ${t.startsWith('ไม่พบ') ? '#fde68a' : '#bbf7d0'}`,
                borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
              }}>
                {t.startsWith('ไม่พบ') ? '⚠️' : '✓'} {t}
              </span>
            ))}
          </div>
        )}
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
              <div style={{ fontSize: 11, color: m.quoteOnly ? '#7c3aed' : '#6b7280', marginTop: 2 }}>
                {m.quoteOnly ? '📋 ประเมินราคา' : m.fixedPrice !== undefined ? `${fmt(m.fixedPrice)} บ./ชิ้น` : `${fmt(m.pricePerSqm)} บ./ตร.ม.`}
              </div>
            </button>
          ))}
        </div>

        {isFixed && (
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>ราคาต่อชิ้น (บาท)</label>
            <input type="number"
              value={fixedPrices[mat.id] ?? String(mat.fixedPrice ?? '')}
              onChange={e => setFixedPrices(p => ({ ...p, [mat.id]: e.target.value }))}
              style={inputStyle} />
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
                <input type="number"
                  value={m.fixedPrice !== undefined ? m.fixedPrice : m.pricePerSqm}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0;
                    const n = [...materials];
                    n[i] = m.fixedPrice !== undefined ? { ...m, fixedPrice: v } : { ...m, pricePerSqm: v };
                    setMaterials(n);
                  }}
                  style={{ ...inputStyle, width: 90, marginBottom: 0 }} />
              </div>
            ))}
            <button onClick={resetMaterials} style={{ ...linkBtn, color: '#dc2626' }}>↺ รีเซ็ตเป็นค่าเริ่มต้น</button>
          </div>
        )}
      </div>

      {/* ── Quote-only notice ─────────────────────── */}
      {isQuote && (
        <div style={{ ...card, background: '#f5f3ff', borderColor: '#c4b5fd', borderWidth: 2 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed', marginBottom: 10 }}>
            📋 งานนี้ต้องประเมินราคา
          </div>
          <div style={{ fontSize: 13, color: '#4c1d95', lineHeight: 1.8, marginBottom: 12 }}>
            กรุณาแจ้งข้อมูลต่อไปนี้เพื่อให้ทางร้านประเมินราคา:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {[
              '📐 ขนาดโดยรวมหรือขนาดของแต่ละตัวอักษร',
              '🔤 จำนวนตัวอักษรและรูปแบบ/ฟอนต์',
              '🖼️ ภาพตัวอย่างหรือแบบร่างคร่าวๆ (ถ้ามี)',
              '🎨 สีที่ต้องการ',
            ].map((t, i) => (
              <div key={i} style={{ background: 'white', padding: '8px 12px', borderRadius: 8, fontSize: 13, color: '#374151' }}>{t}</div>
            ))}
          </div>
          <div style={{ background: '#ede9fe', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#5b21b6' }}>
            ⚠️ ราคาขึ้นอยู่กับขนาดและจำนวนตัวอักษร — ส่งข้อมูลมาแล้วร้านจะประเมินและแจ้งราคากลับ
          </div>
        </div>
      )}

      {/* ── ขนาด ─────────────────────────────────── */}
      {!isQuote && <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={sectionTitle}>ขนาด</div>
          <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            {(['cm', 'm', 'in', 'ft'] as const).map(u => (
              <button key={u} onClick={() => setUnit(u)} style={{
                padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: unit === u ? '#1d4ed8' : 'white', color: unit === u ? 'white' : '#6b7280',
              }}>{u}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>กว้าง ({unit})</label>
            <input type="number" value={width} onChange={e => setWidth(e.target.value)}
              placeholder={unit==='cm'?'เช่น 120':unit==='m'?'เช่น 1.2':unit==='in'?'เช่น 48':'เช่น 4'} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>สูง ({unit})</label>
            <input type="number" value={height} onChange={e => setHeight(e.target.value)}
              placeholder={unit==='cm'?'เช่น 240':unit==='m'?'เช่น 2.4':unit==='in'?'เช่น 96':'เช่น 8'} style={inputStyle} />
          </div>
        </div>

        {sqm > 0 && (
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
            พื้นที่: {sqm.toFixed(4)} ตร.ม.
          </div>
        )}
      </div>}

      {/* ── จำนวน ────────────────────────────────── */}
      {!isQuote && <div style={card}>
        <div>
          <label style={labelStyle}>จำนวน ({mat.id.startsWith('paper_') ? 'แผ่น' : 'ชิ้น'})</label>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inputStyle} />
        </div>
      </div>}


      {/* ── ผลลัพธ์ ──────────────────────────────── */}
      {(sqm > 0 || isFixed) && (
        <div id="calc-result" style={{ ...card, background: '#1e293b', border: 'none' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8', marginBottom: 14 }}>สรุปราคา</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row label="วัสดุ" value={mat.name} light />
            {!isFixed && <Row label="พื้นที่" value={`${sqm.toFixed(4)} ตร.ม.`} light />}
            {!isFixed && <Row label={`ราคาวัสดุ (${fmt(mat.pricePerSqm)} × ${sqm.toFixed(4)})`} value={`${fmt(basePricePerPiece)} บาท`} light />}
            {isFixed   && <Row label="ราคาต่อชิ้น" value={`${fmt(basePricePerPiece)} บาท`} light />}
            {vinylMinApplied && <Row label={vinylMinApplied} value={`${fmt(pricePerPiece)} บาท`} light warn />}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginTop: 6 }}>
              <Row label="ราคา / ชิ้น" value={`${fmt(pricePerPiece)} บาท`} big />
              {qNum > 1 && <Row label={`จำนวน ${qNum} ชิ้น`} value={`${fmt(rawTotal)} บาท`} big />}
              {minTotalApplied && <Row label={`ขั้นต่ำ ${mat.minTotal} บาท`} value={`${fmt(total)} บาท`} big warn />}
            </div>
          </div>

          <div style={{ marginTop: 14, background: '#1e3a5f', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#1e40af', padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#bfdbfe' }}>
              📋 ก่อนแจ้งราคาลูกค้า — ต้องประเมินก่อนทุกครั้ง
            </div>
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#93c5fd', lineHeight: 1.9 }}>
              <b style={{ color: '#bfdbfe' }}>1. ใครทำ?</b> ประเมินว่างานนี้ผ่านกระบวนการอะไรบ้าง<br/>
              — พิมพ์ · ตัด · ติด · ประกอบ · เชื่อม · ติดตั้ง ฯลฯ<br/>
              <b style={{ color: '#bfdbfe' }}>2. เครื่องจักรไหน?</b> เครื่องพิมพ์ / เลเซอร์ / CNC / เครื่องตัด ฯลฯ<br/>
              <b style={{ color: '#bfdbfe' }}>3. เวลาที่ใช้?</b> ชิ้นเล็กหรือรายละเอียดมาก ใช้เวลานานกว่า<br/>
              <b style={{ color: '#bfdbfe' }}>4. จำนวนน้อย?</b> สั่งน้อยชิ้น ต้นทุนต่อชิ้นสูง — ควรปรับราคาให้สมเหตุสมผล<br/>
              <b style={{ color: '#fbbf24' }}>⚠️ เอะใจก่อนแจ้ง:</b> ราคาที่คำนวณได้สมควรกับงานที่ทำหรือไม่? ถ้าไม่ — ปรับเพิ่ม
            </div>
            <div style={{ borderTop: '1px solid #1e3a8a', padding: '10px 12px', fontSize: 12, color: '#fde68a', lineHeight: 1.8, background: '#1c2f4f' }}>
              <b style={{ color: '#fbbf24' }}>💡 ถ้าราคาดูสูง — ยังแจ้งได้เลย</b><br/>
              บอกลูกค้าว่า <span style={{ color: 'white', fontStyle: 'italic' }}>"นี่คือราคาประเมินเบื้องต้น ราคาที่แท้จริงต้องนำไปหารือกับผู้มีอำนาจตัดสินใจก่อน แล้วจะแจ้งราคาสรุปให้อีกครั้ง"</span><br/>
              อย่าตัดสินใจลดราคาเองโดยไม่ได้รับอนุมัติ
            </div>
          </div>

          <button onClick={copyResult} style={{
            marginTop: 12, width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
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

function Row({ label, value, light, big, warn }: { label: string; value: string; light?: boolean; big?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: big ? 14 : 12, color: warn ? '#fbbf24' : big ? '#cbd5e1' : '#64748b' }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 13, fontWeight: big ? 800 : 600, color: warn ? '#fbbf24' : big ? '#f1f5f9' : '#94a3b8' }}>{value}</span>
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
