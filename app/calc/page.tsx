'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'calc_session';

function CalcLogin({ onLogin }: { onLogin: (empId: number, empName: string) => void }) {
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([]);
  const [empId, setEmpId]     = useState<number | ''>('');
  const [pin, setPin]         = useState('');
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg]   = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    async function loadEmps() {
      const [empRes, settingsRes] = await Promise.all([
        supabase.from('employees').select('id, name').order('name'),
        supabase.from('app_settings').select('key, value').like('key', 'calc_emp_%'),
      ]);
      const accessSet = new Set<number>(
        (settingsRes.data ?? [])
          .filter(r => r.value === 'true')
          .map(r => Number(r.key.replace('calc_emp_', '')))
      );
      const list = (empRes.data ?? []).filter((e: any) => accessSet.has(e.id));
      setEmployees(list);
      if (list.length > 0) setEmpId(list[0].id);
      setLoading(false);
    }
    loadEmps();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!empId) return;
    setChecking(true); setErrMsg('');
    const { data } = await supabase
      .from('app_settings').select('value').eq('key', `pin_emp_${empId}`).maybeSingle();
    setChecking(false);
    if (!data?.value) { setErrMsg('พนักงานนี้ยังไม่ได้ตั้งรหัส กรุณาติดต่อแอดมิน'); return; }
    if (data.value !== pin) { setErrMsg('รหัสไม่ถูกต้อง กรุณาลองใหม่'); setPin(''); return; }
    const emp = employees.find(e => e.id === empId);
    const session = { empId, empName: emp?.name ?? '', ts: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    // Log access to database (fire-and-forget)
    supabase.from('calc_access_logs').insert({ employee_id: empId, employee_name: emp?.name ?? '' });
    onLogin(empId as number, emp?.name ?? '');
  }

  if (loading) return (
    <main style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'#f8fafc' }}>
      <div style={{ color:'#6b7280' }}>กำลังโหลด...</div>
    </main>
  );

  return (
    <main style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'#f1f5f9', padding:'0 16px' }}>
      <div style={{ width:'100%', maxWidth:380, background:'white', borderRadius:20, padding:'32px 28px', boxShadow:'0 8px 32px rgba(0,0,0,0.10)' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🧮</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#1e293b' }}>คำนวณราคาป้าย</div>
          <div style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>สำหรับเจ้าหน้าที่ร้าน Idea Inkjet เท่านั้น</div>
        </div>

        {employees.length === 0 ? (
          <div style={{ textAlign:'center', padding:'20px 0', color:'#6b7280' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
            <div style={{ fontWeight:600, fontSize:15 }}>ยังไม่มีพนักงานได้รับสิทธิ์</div>
            <div style={{ fontSize:13, marginTop:6 }}>กรุณาให้แอดมินเปิดสิทธิ์คำนวณราคาในหน้าจัดการพนักงาน</div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ fontSize:13, color:'#374151', fontWeight:600, display:'block', marginBottom:6 }}>ชื่อพนักงาน</label>
              <select value={empId} onChange={e => setEmpId(Number(e.target.value))} required
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #d1d5db', fontSize:15, background:'white', boxSizing:'border-box' }}>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:13, color:'#374151', fontWeight:600, display:'block', marginBottom:6 }}>รหัสเข้าใช้งาน</label>
              <input type="password" required value={pin} onChange={e => setPin(e.target.value)}
                placeholder="กรอกรหัส PIN"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #d1d5db', fontSize:16, letterSpacing:4, textAlign:'center', boxSizing:'border-box' }} />
            </div>
            {errMsg && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:'8px 12px', color:'#dc2626', fontSize:13 }}>
                {errMsg}
              </div>
            )}
            <button type="submit" disabled={checking}
              style={{ padding:'12px 0', borderRadius:12, border:'none', background: checking ? '#93c5fd' : '#1d4ed8', color:'white', fontSize:15, fontWeight:700, cursor: checking ? 'default' : 'pointer' }}>
              {checking ? 'กำลังตรวจสอบ...' : 'เข้าใช้งาน'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

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
  const [session,  setSession]  = useState<{ empId: number; empName: string } | null | 'loading'>('loading');

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) { const s = JSON.parse(raw); setSession({ empId: s.empId, empName: s.empName }); }
      else setSession(null);
    } catch { setSession(null); }
  }, []);

  function logout() { sessionStorage.removeItem(SESSION_KEY); setSession(null); }

  if (session === 'loading') return (
    <main style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'#f8fafc' }}>
      <div style={{ color:'#6b7280' }}>กำลังโหลด...</div>
    </main>
  );
  if (!session) return <CalcLogin onLogin={(id, name) => setSession({ empId: id, empName: name })} />;

  return <CalcApp empName={session.empName} onLogout={logout} />;
}

function CalcApp({ empName, onLogout }: { empName: string; onLogout: () => void }) {
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
  const [parseResult, setParseResult] = useState<{
    matName: string; isFixed: boolean; isQuote: boolean;
    dim?: string; sqm: number; qty: number; unitWord: string;
    pricePerPiece: number; total: number; vinylMin?: string; minTotalApplied?: boolean;
  } | null>(null);
  const [parseCopied, setParseCopied] = useState(false);
  const [ownerPin, setOwnerPin] = useState('');
  const [matUnlocked, setMatUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinErr, setPinErr] = useState('');

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'owner_pin').single()
      .then(({ data }) => setOwnerPin(data?.value ?? ''));
  }, []);

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
    for (const m of materials) {
      const nameWords = m.name.toLowerCase().split(/\s+/).filter(w => w.length >= 1);
      const kws = [...new Set([
        m.name.toLowerCase(),
        ...nameWords,
        ...(MAT_KEYWORDS[m.id] ?? []).map(k => k.toLowerCase()),
      ])];
      let score = 0;
      for (const kw of kws) { if (tl.includes(kw)) score += kw.length * 2; }
      if (score > bestScore) { bestScore = score; bestMatId = m.id; }
    }
    const parsedMat = (bestMatId && bestScore > 0)
      ? materials.find(m => m.id === bestMatId)!
      : null;
    if (parsedMat) { setMatId(parsedMat.id); info.push(`วัสดุ: ${parsedMat.name}`); }

    // ── Dimension parsing ───────────────────────────
    const dimMatch =
      text.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/) ??
      text.match(/กว้าง\s*(\d+(?:\.\d+)?)[^0-9]{0,10}(?:สูง|ยาว)\s*(\d+(?:\.\d+)?)/) ??
      text.match(/(\d+(?:\.\d+)?)\s*คูณ\s*(\d+(?:\.\d+)?)/);
    let parsedW = 0, parsedH = 0;
    let du: 'cm' | 'm' | 'in' | 'ft' | undefined;
    if (dimMatch) {
      parsedW = parseFloat(dimMatch[1]) || 0;
      parsedH = parseFloat(dimMatch[2]) || 0;
      setWidth(dimMatch[1]);
      setHeight(dimMatch[2]);
      const around = text.slice(
        Math.max(0, (dimMatch.index ?? 0) - 5),
        (dimMatch.index ?? 0) + dimMatch[0].length + 20,
      ) + ' ' + text;
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
    let parsedQ = 1;
    if (qtyMatch) {
      parsedQ = Math.max(1, parseInt(qtyMatch[1]) || 1);
      setQty(qtyMatch[1]);
      info.push(`จำนวน: ${qtyMatch[1]}`);
    }

    // ── Inline price computation ─────────────────────
    const activeMat = parsedMat ?? (materials.find(m => m.id === matId) ?? materials[0]);
    const activeUnit = du ?? unit;
    const toM2 = (n: number) =>
      activeUnit === 'cm' ? n / 100 : activeUnit === 'in' ? n * 0.0254 : activeUnit === 'ft' ? n * 0.3048 : n;
    const parsedSqm = toM2(parsedW) * toM2(parsedH);

    const isParsedFixed = activeMat.fixedPrice !== undefined;
    const isParsedVinyl = activeMat.id.startsWith('vinyl_');
    const parsedFp = parseFloat(fixedPrices[activeMat.id] ?? '') || activeMat.fixedPrice || 0;
    const parsedBase = isParsedFixed ? parsedFp : activeMat.pricePerSqm * parsedSqm;

    let parsedPpp = parsedBase;
    let parsedVinylMin = '';
    if (isParsedVinyl && parsedBase > 0) {
      if (parsedBase < 100) { parsedPpp = 100; parsedVinylMin = 'ขั้นต่ำ 100 บาท'; }
      else if (parsedBase < 150) { parsedPpp = 150; parsedVinylMin = 'ขั้นต่ำ 150 บาท'; }
      else if (parsedBase < 200 && parsedQ === 1) { parsedPpp = 200; parsedVinylMin = 'ขั้นต่ำ 200 บาท (สั่ง 1 ผืน)'; }
    }
    const parsedRaw = parsedPpp * parsedQ;
    const parsedTotal = activeMat.minTotal ? Math.max(parsedRaw, activeMat.minTotal) : parsedRaw;
    const unitWord = activeMat.id.startsWith('paper_') ? 'แผ่น' : 'ชิ้น';

    if ((parsedSqm > 0 || isParsedFixed) && !activeMat.quoteOnly) {
      setParseResult({
        matName: activeMat.name, isFixed: isParsedFixed, isQuote: false,
        dim: dimMatch ? `${dimMatch[1]}×${dimMatch[2]}${du ? ' ' + du : ''}` : undefined,
        sqm: parsedSqm, qty: parsedQ, unitWord,
        pricePerPiece: parsedPpp, total: parsedTotal,
        vinylMin: parsedVinylMin || undefined,
        minTotalApplied: !!(activeMat.minTotal && parsedRaw < activeMat.minTotal),
      });
    } else {
      setParseResult(null);
    }

    setParseInfo(info.length > 0 ? info : ['ไม่พบข้อมูล — ลองพิมพ์ชื่อวัสดุ ขนาด หรือจำนวน']);
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '16px 14px 80px', background: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <a href="/" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 22, lineHeight: 1 }} title="กลับเมนู">←</a>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>คำนวณราคาป้าย</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Idea Inkjet · Price Calculator</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>👤 {empName}</div>
          <button onClick={onLogout} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
            ออกจากระบบ
          </button>
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

        {/* ── ผลคำนวณ inline ───────────────────────── */}
        {parseResult && (
          <div style={{ marginTop: 12, background: '#1e293b', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10, fontWeight: 600 }}>สรุปราคา</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>วัสดุ</span>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>{parseResult.matName}</span>
              </div>
              {parseResult.dim && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>ขนาด</span>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                    {parseResult.dim}{!parseResult.isFixed ? ` (${parseResult.sqm.toFixed(2)} ตร.ม.)` : ''}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>จำนวน</span>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>{parseResult.qty} {parseResult.unitWord}</span>
              </div>
              {parseResult.vinylMin && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#fbbf24' }}>{parseResult.vinylMin}</span>
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>{fmt(parseResult.pricePerPiece)} บาท/{parseResult.unitWord}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid #334155', marginTop: 6, paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: '#cbd5e1' }}>ราคา/{parseResult.unitWord}</span>
                  <span style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9' }}>{fmt(parseResult.pricePerPiece)} บาท</span>
                </div>
                {parseResult.qty > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: '#cbd5e1' }}>รวม {parseResult.qty} {parseResult.unitWord}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{fmt(parseResult.total)} บาท</span>
                  </div>
                )}
                {parseResult.minTotalApplied && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                    <span style={{ color: '#fbbf24' }}>ขั้นต่ำ</span>
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt(parseResult.total)} บาท</span>
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => {
              const lines = [
                `วัสดุ: ${parseResult.matName}`,
                parseResult.dim ? `ขนาด: ${parseResult.dim}${!parseResult.isFixed ? ` (${parseResult.sqm.toFixed(2)} ตร.ม.)` : ''}` : '',
                `จำนวน: ${parseResult.qty} ${parseResult.unitWord}`,
                `ราคา/${parseResult.unitWord}: ${fmt(parseResult.pricePerPiece)} บาท`,
                parseResult.qty > 1 ? `รวม: ${fmt(parseResult.total)} บาท` : '',
                `ขอบคุณที่ใช้บริการครับ`,
              ].filter(Boolean).join('\n');
              navigator.clipboard?.writeText(lines).then(() => { setParseCopied(true); setTimeout(() => setParseCopied(false), 2500); });
            }} style={{
              marginTop: 10, width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              cursor: 'pointer', background: parseCopied ? '#16a34a' : '#3b82f6', color: 'white', fontWeight: 700, fontSize: 14,
            }}>
              {parseCopied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกผลลัพธ์'}
            </button>
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

        <button onClick={() => {
          if (showEditMat) { setShowEditMat(false); return; }
          if (matUnlocked || !ownerPin) { setShowEditMat(true); return; }
          setPinInput(''); setPinErr(''); setShowPinModal(true);
        }} style={linkBtn}>
          {showEditMat ? '▲ ซ่อน' : `✏️ แก้ราคาวัสดุ${ownerPin && !matUnlocked ? ' 🔒' : ''}`}
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

      {/* ── PIN Modal ────────────────────────────────── */}
      {showPinModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20,
        }} onClick={() => setShowPinModal(false)}>
          <div style={{
            background: 'white', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 340,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>🔒 สิทธิ์เจ้าของร้าน</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>ใส่รหัสเจ้าของร้านเพื่อแก้ราคาวัสดุ</div>
            <input
              type="password"
              inputMode="numeric"
              placeholder="รหัสผ่าน"
              autoFocus
              value={pinInput}
              onChange={e => { setPinInput(e.target.value); setPinErr(''); }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (pinInput === ownerPin) {
                    setMatUnlocked(true); setShowPinModal(false); setShowEditMat(true);
                  } else { setPinErr('รหัสไม่ถูกต้อง'); }
                }
              }}
              style={{ ...inputStyle, marginBottom: 8, fontSize: 18, letterSpacing: 4, textAlign: 'center' }}
            />
            {pinErr && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{pinErr}</div>}
            <button onClick={() => {
              if (pinInput === ownerPin) {
                setMatUnlocked(true); setShowPinModal(false); setShowEditMat(true);
              } else { setPinErr('รหัสไม่ถูกต้อง'); }
            }} style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: '#1d4ed8', color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}>ยืนยัน</button>
            <button onClick={() => setShowPinModal(false)} style={{
              ...linkBtn, display: 'block', width: '100%', textAlign: 'center', marginTop: 10, color: '#6b7280',
            }}>ยกเลิก</button>
          </div>
        </div>
      )}

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
