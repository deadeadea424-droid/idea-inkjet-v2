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

  const OWNER_ID = 0; // sentinel for owner login

  useEffect(() => {
    async function loadEmps() {
      const [empRes, settingsRes] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase.from('app_settings').select('key, value').in('key', [
          ...Array.from({ length: 100 }, (_, i) => `calc_emp_${i + 1}`),
          'owner_pin',
        ]),
      ]);
      const allSettings: Record<string, string> = {};
      (settingsRes.data ?? []).forEach((r: any) => { allSettings[r.key] = r.value; });

      const accessSet = new Set<number>(
        Object.entries(allSettings)
          .filter(([k, v]) => k.startsWith('calc_emp_') && v === 'true')
          .map(([k]) => Number(k.replace('calc_emp_', '')))
      );
      const raw = (empRes.data ?? []).filter((e: any) => accessSet.has(Number(e.id)));
      const empList = raw.map((e: any) => ({
        id: Number(e.id),
        name: e.name || e.employee_name || `พนักงาน ${e.id}`,
      }));
      // Always add owner at the top
      const list = [{ id: OWNER_ID, name: '👑 เจ้าของร้าน' }, ...empList];
      setEmployees(list);
      setEmpId(OWNER_ID);
      setLoading(false);
    }
    loadEmps();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (empId === '') return;
    setChecking(true); setErrMsg('');

    const isOwner = empId === OWNER_ID;
    const pinKey  = isOwner ? 'owner_pin' : `pin_emp_${empId}`;
    const { data } = await supabase
      .from('app_settings').select('value').eq('key', pinKey).maybeSingle();
    setChecking(false);

    if (!data?.value) {
      setErrMsg(isOwner ? 'ยังไม่ได้ตั้งรหัสเจ้าของร้าน กรุณาตั้งที่ /setup' : 'พนักงานนี้ยังไม่ได้ตั้งรหัส กรุณาติดต่อแอดมิน');
      return;
    }
    if (data.value !== pin) { setErrMsg('รหัสไม่ถูกต้อง กรุณาลองใหม่'); setPin(''); return; }

    const emp = employees.find(e => e.id === empId);
    const empName = emp?.name ?? '';
    const session = { empId, empName, ts: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    // Log access (fire-and-forget; owner has no employee_id)
    supabase.from('calc_access_logs').insert({
      employee_id:   isOwner ? null : empId,
      employee_name: isOwner ? 'เจ้าของร้าน' : empName,
    });
    onLogin(empId as number, empName);
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
  sticker_future5:  ['สติ๊กเกอร์', 'รีด', 'ฟิวเจอร์', 'รีดฟิวเจอร์', 'สติ๊กเกอร์รีด', 'สติ๊กเกอร์ฟิวเจอร์', 'สติ๊กเกอร์ที่ฟิวเจอร์', 'สติ๊กเกอร์รีดฟิวเจอร์บอร์ด'],
  sticker_foam55:   ['สติ๊กเกอร์', 'รีด', 'โฟม', 'โฟมบอร์ด', 'รีดโฟม', 'สติ๊กเกอร์โฟม', 'สติ๊กเกอร์ที่โฟม'],
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
  type ParsedItem = { matName: string; isFixed: boolean; isQuote: boolean; dim?: string; sqm: number; qty: number; unitWord: string; pricePerPiece: number; total: number; vinylMin?: string; minTotalApplied?: boolean };
  const [parseItems, setParseItems] = useState<ParsedItem[]>([]);
  type AnalysisItem = { materialRaw?: string; matName?: string; w?: number; h?: number; unit?: string; qty?: number };
  const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>([]);
  const [parseAllCopied, setParseAllCopied] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [ownerPin, setOwnerPin] = useState('');
  const [matUnlocked, setMatUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinErr, setPinErr] = useState('');

  type CartItem = { id: number; matName: string; dim?: string; sqm?: number; isFixed: boolean; qty: number; unitWord: string; pricePerPiece: number; total: number };
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartCounter, setCartCounter] = useState(0);
  const [cartCopied, setCartCopied] = useState(false);

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

  const cartGrandTotal = cartItems.reduce((s, i) => s + i.total, 0);

  function copyParsedItems() {
    if (parseItems.length === 0) return;
    const lines: string[] = [];
    parseItems.forEach((item, idx) => {
      if (parseItems.length > 1) lines.push(`รายการที่ ${idx + 1}: ${item.matName}`);
      else lines.push(`วัสดุ: ${item.matName}`);
      if (item.dim) lines.push(`  ขนาด: ${item.dim}${!item.isFixed && item.sqm ? ` (${item.sqm.toFixed(2)} ตร.ม.)` : ''}`);
      lines.push(`  จำนวน: ${item.qty} ${item.unitWord}`);
      lines.push(`  ราคา/${item.unitWord}: ${fmt(item.pricePerPiece)} บาท`);
      if (item.qty > 1) lines.push(`  รวม: ${fmt(item.total)} บาท`);
    });
    if (parseItems.length > 1) {
      const grand = parseItems.reduce((s, i) => s + i.total, 0);
      lines.push('', `รวมทั้งหมด: ${fmt(grand)} บาท`);
    }
    lines.push('ขอบคุณที่ใช้บริการครับ');
    navigator.clipboard?.writeText(lines.join('\n')).then(() => { setParseAllCopied(true); setTimeout(() => setParseAllCopied(false), 2500); });
  }

  function addToCartFromManual() {
    if (sqm <= 0 && !isFixed) return;
    const id = cartCounter + 1;
    setCartCounter(id);
    const unitWord = mat.id.startsWith('paper_') ? 'แผ่น' : 'ชิ้น';
    setCartItems(prev => [...prev, {
      id, matName: mat.name,
      dim: !isFixed && wNum > 0 && hNum > 0 ? `${wNum}×${hNum} ${unit}` : undefined,
      sqm: isFixed ? undefined : sqm, isFixed,
      qty: qNum, unitWord, pricePerPiece, total,
    }]);
  }

  function removeFromCart(id: number) { setCartItems(prev => prev.filter(i => i.id !== id)); }

  function copyCart() {
    const lines: string[] = [];
    cartItems.forEach((item, idx) => {
      lines.push(`รายการที่ ${idx + 1}: ${item.matName}`);
      if (item.dim) lines.push(`  ขนาด: ${item.dim}${!item.isFixed && item.sqm ? ` (${item.sqm.toFixed(2)} ตร.ม.)` : ''}`);
      lines.push(`  จำนวน: ${item.qty} ${item.unitWord}`);
      lines.push(`  ราคา/${item.unitWord}: ${fmt(item.pricePerPiece)} บาท`);
      lines.push(`  รวม: ${fmt(item.total)} บาท`);
    });
    lines.push('', `รวมทั้งหมด: ${fmt(cartGrandTotal)} บาท`, 'ขอบคุณที่ใช้บริการครับ');
    navigator.clipboard?.writeText(lines.join('\n')).then(() => { setCartCopied(true); setTimeout(() => setCartCopied(false), 2500); });
  }

  // Score a free-text material description against the materials list.
  // Returns the best-matching matId, or undefined if nothing scored.
  function scoreMaterial(text: string): string | undefined {
    const tl = text.toLowerCase();
    let bestMatId: string | undefined;
    let bestScore = 0;
    for (const m of materials) {
      const kws = [...new Set([m.name.toLowerCase(), ...m.name.toLowerCase().split(/\s+/), ...(MAT_KEYWORDS[m.id] ?? []).map(k => k.toLowerCase())])];
      let score = 0;
      for (const kw of kws) if (tl.includes(kw)) score += kw.length * 2;
      if (score > bestScore) { bestScore = score; bestMatId = m.id; }
    }
    return bestScore > 0 ? bestMatId : undefined;
  }

  // Pre-split a multi-item sentence into individual item segments before sending to AI.
  // Splits on: (1) conjunctions "และ"/"กับ", (2) [number][unit_word] followed by a known material keyword.
  function segmentText(text: string): string[] {
    const conjParts = text.split(/\s*(?:และ|กับ)\s*/);
    if (conjParts.length > 1) return conjParts.map(p => p.trim()).filter(Boolean);

    const MATERIAL_STARTS = ['ไวนิล','สติ๊กเกอร์','สติกเกอร์','ฟิวเจอร์','ผ้าไอที','ผ้า','อะคริลิค','อะคริลิก','กระดาษ','โรลอัพ','ป้าย'];
    function startsWithMaterial(s: string): boolean {
      const w = s.trimStart().toLowerCase();
      if (/^x\s*stand/i.test(w)) return true;
      return MATERIAL_STARTS.some(m => w.startsWith(m.toLowerCase()));
    }

    const UNIT_RE = /\d+\s*(?:ป้าย|ผืน|ชิ้น|แผ่น|อัน|ใบ|รูป|pcs?|pieces?)/gi;
    const boundaries: number[] = [];
    let m: RegExpExecArray | null;
    UNIT_RE.lastIndex = 0;
    while ((m = UNIT_RE.exec(text)) !== null) {
      const endPos = m.index + m[0].length;
      const after = text.slice(endPos);
      if (startsWithMaterial(after)) boundaries.push(endPos);
    }

    if (boundaries.length === 0) return [text];
    const parts: string[] = [];
    let last = 0;
    for (const b of boundaries) { const p = text.slice(last, b).trim(); if (p) parts.push(p); last = b; }
    const rest = text.slice(last).trim();
    if (rest) parts.push(rest);
    return parts.length > 1 ? parts : [text];
  }

  function kwMatch(text: string): { matId?: string; parsedW: number; parsedH: number; du?: 'cm'|'m'|'in'|'ft'; parsedQ: number } {
    const UNIT_WORD = '(?:เมตร|ม\\.?|ซม\\.?|ซ\\.ม\\.?|นิ้ว|ฟุต|cm|m|in|ft)?';
    const dimMatch =
      text.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/) ??
      text.match(/กว้าง\s*(\d+(?:\.\d+)?)[^0-9]{0,10}(?:สูง|ยาว)\s*(\d+(?:\.\d+)?)/) ??
      text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_WORD}\\s*คูณ\\s*(\\d+(?:\\.\\d+)?)`));
    let parsedW = 0, parsedH = 0, du: 'cm'|'m'|'in'|'ft'|undefined;
    if (dimMatch) {
      parsedW = parseFloat(dimMatch[1]) || 0;
      parsedH = parseFloat(dimMatch[2]) || 0;
      // Check near the match first (higher priority), then full text as fallback
      // near: 10 chars before + match + 60 chars after (enough to catch unit abbreviations)
      const near = text.slice(Math.max(0, (dimMatch.index ?? 0) - 10), (dimMatch.index ?? 0) + dimMatch[0].length + 60);
      const around = near + ' ' + text;
      // cm must be checked BEFORE m because เซนติเมตร contains เมตร
      if (/ซม\.?|ซ\.ม\.?|เซนติเมตร|เซนติ|centimeter|cm/i.test(near)) du = 'cm';
      else if (/นิ้ว|inch|in\b|"/i.test(near)) du = 'in';
      else if (/ฟุต|feet?|foot|\bft\b/i.test(near)) du = 'ft';
      // ม. and ม (Thai meter abbrev) — safe in near text since it's targeted around digits
      else if (/เมตร|ม\.?|meter|metre|\bm\b/i.test(near)) du = 'm';
      else if (/ซม\.?|ซ\.ม\.?|เซนติเมตร|เซนติ|centimeter|cm/i.test(around)) du = 'cm';
      else if (/นิ้ว|inch|in\b|"/i.test(around)) du = 'in';
      else if (/ฟุต|feet?|foot|\bft\b/i.test(around)) du = 'ft';
      // For full-text fallback keep เมตร/meter only (ม is too common in Thai words)
      else if (/\bเมตร\b|meter|metre|\bm\b/i.test(around)) du = 'm';
    }
    const qtyMatch =
      text.match(/(\d+)\s*(?:ผืน|ชิ้น|แผ่น|อัน|ตัว|รูป|ใบ|pcs?|piece)/i) ??
      text.match(/จำนวน\s*[:\s]*(\d+)/i);
    const parsedQ = qtyMatch ? Math.max(1, parseInt(qtyMatch[1]) || 1) : 1;
    return { matId: scoreMaterial(text), parsedW, parsedH, du, parsedQ };
  }

  function calcItemPrice(mId: string | undefined, parsedW: number, parsedH: number, du: 'cm'|'m'|'in'|'ft'|undefined, parsedQ: number): Omit<ParsedItem, 'isQuote'> | null {
    const activeMat = (mId ? materials.find(m => m.id === mId) : null) ?? materials[0];
    const activeUnit = du ?? 'cm';
    const toM2 = (n: number) => activeUnit === 'cm' ? n/100 : activeUnit === 'in' ? n*0.0254 : activeUnit === 'ft' ? n*0.3048 : n;
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
      return {
        matName: activeMat.name, isFixed: isParsedFixed,
        dim: parsedW > 0 ? `${parsedW}×${parsedH}${du ? ' ' + du : ''}` : undefined,
        sqm: parsedSqm, qty: parsedQ, unitWord,
        pricePerPiece: parsedPpp, total: parsedTotal,
        vinylMin: parsedVinylMin || undefined,
        minTotalApplied: !!(activeMat.minTotal && parsedRaw < activeMat.minTotal),
      };
    }
    return null;
  }

  async function parseAndApply() {
    if (!parseText.trim()) return;
    const text = parseText;
    setParsing(true);
    setParseInfo([]);
    setParseItems([]);
    setAnalysisItems([]);

    // Step 1: Pre-split text into item segments locally
    const segments = segmentText(text);

    // Step 2: Send to AI — single text or numbered list of segments
    let aiItems: { material?: string; width?: string; height?: string; unit?: string; qty?: string }[] = [];
    try {
      const body = segments.length > 1 ? { segments } : { text };
      const res = await fetch('/api/parse-calc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) aiItems = data;
      }
    } catch {}
    setParsing(false);

    const results: ParsedItem[] = [];

    // kwMatch unit is used as fallback when AI doesn't return a unit
    const kwFallback = kwMatch(text);

    const analysis: AnalysisItem[] = [];

    if (aiItems.length > 0) {
      for (const ai of aiItems) {
        const parsedW = ai.width ? parseFloat(ai.width) : 0;
        const parsedH = ai.height ? parseFloat(ai.height) : 0;
        const aiUnit = ai.unit && ['cm','m','in','ft'].includes(ai.unit) ? ai.unit as 'cm'|'m'|'in'|'ft' : undefined;
        const du = aiUnit ?? kwFallback.du;
        const parsedQ = ai.qty ? Math.max(1, parseInt(ai.qty) || 1) : 1;
        const mId = ai.material ? scoreMaterial(ai.material) : undefined;
        const matchedMat = mId ? materials.find(m => m.id === mId) : undefined;
        analysis.push({ materialRaw: ai.material ?? undefined, matName: matchedMat?.name, w: parsedW || undefined, h: parsedH || undefined, unit: du, qty: parsedQ });
        const computed = calcItemPrice(mId, parsedW, parsedH, du, parsedQ);
        if (computed) results.push({ ...computed, isQuote: false });
      }
      if (results.length === 0) setParseInfo(['ไม่พบข้อมูล — ลองพิมพ์ชื่อวัสดุ ขนาด หรือจำนวน']);
    } else {
      // Fallback: keyword matching on full text
      const kw = kwMatch(text);
      const matchedMat = kw.matId ? materials.find(m => m.id === kw.matId) : undefined;
      analysis.push({ matName: matchedMat?.name, w: kw.parsedW || undefined, h: kw.parsedH || undefined, unit: kw.du, qty: kw.parsedQ });
      const computed = calcItemPrice(kw.matId, kw.parsedW, kw.parsedH, kw.du, kw.parsedQ);
      if (computed) results.push({ ...computed, isQuote: false });
      if (results.length === 0) setParseInfo(['ไม่พบข้อมูล — ลองพิมพ์ชื่อวัสดุ ขนาด หรือจำนวน']);
    }

    setAnalysisItems(analysis);

    setParseItems(results);

    // Auto-add all parsed items to cart immediately
    if (results.length > 0) {
      const startId = cartCounter;
      const newCartItems: CartItem[] = results.map((item, i) => ({
        id: startId + i + 1,
        matName: item.matName, dim: item.dim, sqm: item.sqm,
        isFixed: item.isFixed, qty: item.qty, unitWord: item.unitWord,
        pricePerPiece: item.pricePerPiece, total: item.total,
      }));
      setCartCounter(startId + results.length);
      setCartItems(prev => [...prev, ...newCartItems]);
    }
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
          onChange={e => { setParseText(e.target.value); setParseInfo([]); setAnalysisItems([]); setParseItems([]); }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); parseAndApply(); } }}
          placeholder={'เช่น: ไวนิลหลังขาว 60×90 ซม. 3 ผืน\nหรือ: สติ๊กเกอร์พิมพ์ 1×2 เมตร 5 ชิ้น'}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7 }}
        />
        <button onClick={parseAndApply} disabled={parsing} style={{
          marginTop: 8, width: '100%', padding: '10px', borderRadius: 10, border: 'none',
          cursor: parsing ? 'default' : 'pointer', background: parsing ? '#a78bfa' : '#7c3aed', color: 'white', fontWeight: 700, fontSize: 14,
        }}>
          {parsing ? '🤖 กำลังวิเคราะห์...' : '✨ ใส่ข้อมูลอัตโนมัติ (AI)'}
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

        {/* ── ผลวิเคราะห์ ──────────────────────────── */}
        {analysisItems.length > 0 && (
          <div style={{ marginTop: 10, background: '#eef2ff', borderRadius: 12, padding: '10px 14px', border: '1px solid #c7d2fe' }}>
            <div style={{ fontSize: 12, color: '#4338ca', fontWeight: 700, marginBottom: 8 }}>
              🔍 AI วิเคราะห์ได้ {analysisItems.length} รายการ
            </div>
            {analysisItems.map((a, i) => (
              <div key={i} style={{ marginBottom: i < analysisItems.length - 1 ? 8 : 0 }}>
                {analysisItems.length > 1 && (
                  <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, marginBottom: 4 }}>รายการที่ {i + 1}</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {a.matName ? (
                    <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>
                      📌 {a.matName}
                    </span>
                  ) : a.materialRaw ? (
                    <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>
                      ❓ {a.materialRaw}
                    </span>
                  ) : (
                    <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '3px 8px', fontSize: 12 }}>ไม่พบวัสดุ</span>
                  )}
                  {a.w && a.h && (
                    <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>
                      📐 {a.w}×{a.h}{a.unit ? ' ' + a.unit : ''}
                    </span>
                  )}
                  {a.qty && (
                    <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>
                      🔢 {a.qty} ชิ้น
                    </span>
                  )}
                </div>
                {a.materialRaw && a.matName && a.materialRaw !== a.matName && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, paddingLeft: 2 }}>
                    AI: "{a.materialRaw}" → จับคู่: {a.matName}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── ผลคำนวณ inline ───────────────────────── */}
        {parseItems.length > 0 && (
          <div style={{ marginTop: 12, background: '#1e293b', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10, fontWeight: 600 }}>
              สรุปราคา{parseItems.length > 1 ? ` (${parseItems.length} รายการ)` : ''}
            </div>
            {parseItems.map((item, idx) => (
              <div key={idx}>
                {parseItems.length > 1 && (
                  <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                    รายการที่ {idx + 1}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>วัสดุ</span>
                    <span style={{ color: '#94a3b8', fontWeight: 600, textAlign: 'right', maxWidth: '65%' }}>{item.matName}</span>
                  </div>
                  {item.dim && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#64748b' }}>ขนาด</span>
                      <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                        {item.dim}{!item.isFixed ? ` (${item.sqm.toFixed(2)} ตร.ม.)` : ''}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>จำนวน</span>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>{item.qty} {item.unitWord}</span>
                  </div>
                  {item.vinylMin && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#fbbf24' }}>{item.vinylMin}</span>
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>{fmt(item.pricePerPiece)} บาท/{item.unitWord}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, color: '#cbd5e1' }}>ราคา/{item.unitWord}</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{fmt(item.pricePerPiece)} บาท</span>
                    </div>
                    {item.qty > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                        <span style={{ fontSize: 12, color: '#cbd5e1' }}>รวม {item.qty} {item.unitWord}</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{fmt(item.total)} บาท</span>
                      </div>
                    )}
                    {item.minTotalApplied && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 2 }}>
                        <span style={{ color: '#fbbf24' }}>ขั้นต่ำ</span>
                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt(item.total)} บาท</span>
                      </div>
                    )}
                  </div>
                </div>
                {idx < parseItems.length - 1 && (
                  <div style={{ borderTop: '1px solid #2d3748', margin: '12px 0' }} />
                )}
              </div>
            ))}
            {parseItems.length > 1 && (
              <div style={{ borderTop: '2px solid #475569', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, color: '#cbd5e1', fontWeight: 700 }}>รวมทั้งหมด</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9' }}>{fmt(parseItems.reduce((s, i) => s + i.total, 0))} บาท</span>
              </div>
            )}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#14532d', borderRadius: 8 }}>
              <span style={{ fontSize: 14, color: '#86efac', fontWeight: 700, flex: 1 }}>
                ✅ เพิ่ม{parseItems.length > 1 ? `ทั้ง ${parseItems.length} รายการ` : ''}ในตะกร้าแล้ว
              </span>
            </div>
            <button onClick={copyParsedItems} style={{
              marginTop: 6, width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              cursor: 'pointer', background: parseAllCopied ? '#16a34a' : '#3b82f6', color: 'white', fontWeight: 700, fontSize: 14,
            }}>
              {parseAllCopied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกผลลัพธ์'}
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
          <button onClick={addToCartFromManual} style={{
            marginTop: 8, width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: '#15803d', color: 'white', fontWeight: 700, fontSize: 15,
          }}>
            ➕ เพิ่มในรายการ
          </button>
        </div>
      )}

      {/* ── รายการคำนวณ ──────────────────────────── */}
      {cartItems.length > 0 && (
        <div style={{ ...card, background: '#f0fdf4', borderColor: '#86efac', borderWidth: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>🛒 รายการทั้งหมด ({cartItems.length} รายการ)</div>
            <button onClick={() => setCartItems([])} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              ลบทั้งหมด
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cartItems.map((item, idx) => (
              <div key={item.id} style={{ background: 'white', borderRadius: 10, padding: '10px 12px', border: '1px solid #bbf7d0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{idx + 1}. {item.matName}</div>
                    {item.dim && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {item.dim}{!item.isFixed && item.sqm ? ` · ${item.sqm.toFixed(2)} ตร.ม.` : ''}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {item.qty} {item.unitWord} · {fmt(item.pricePerPiece)} บ./{item.unitWord}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#15803d' }}>{fmt(item.total)} บ.</div>
                    <button onClick={() => removeFromCart(item.id)} style={{
                      background: '#fee2e2', border: 'none', borderRadius: 6,
                      width: 26, height: 26, cursor: 'pointer', color: '#dc2626', fontWeight: 800, fontSize: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #86efac', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>รวมทั้งหมด</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: '#15803d' }}>{fmt(cartGrandTotal)} บาท</span>
          </div>
          <button onClick={copyCart} style={{
            marginTop: 10, width: '100%', padding: '12px', borderRadius: 10, border: 'none',
            cursor: 'pointer', background: cartCopied ? '#16a34a' : '#15803d', color: 'white', fontWeight: 700, fontSize: 14,
          }}>
            {cartCopied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกทั้งรายการ'}
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
