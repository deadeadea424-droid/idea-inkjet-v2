import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

async function getApiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const sb = createClient(url, anon);
    const { data } = await sb.from('app_settings').select('value').eq('key', 'anthropic_api_key').maybeSingle();
    return data?.value ?? null;
  } catch { return null; }
}

const MATERIALS_LIST = `
vinyl_white = ไวนิลหลังขาว
vinyl_black = ไวนิลหลังดำ
fabric_it = ผ้าไอที
acrylic3_cut = อะคริลิค 3 มิล ตัดอย่างเดียว
acrylic3_sticker = อะคริลิค 3 มิล + สติ๊กเกอร์พิมพ์
acrylic3_diecut = อะคริลิค 3 มิล + สติ๊กเกอร์ไดคัท
acrylic3_engrave = อะคริลิค 3 มิล สลัก
future3 = ฟิวเจอร์บอร์ด 3 มม.
future5 = ฟิวเจอร์บอร์ด 5 มม.
sticker_future5 = สติ๊กเกอร์รีดฟิวเจอร์บอร์ด 5 มม.
sticker_foam55 = สติ๊กเกอร์รีดโฟมบอร์ด 5.5 มม.
sticker_print = สติ๊กเกอร์พิมพ์
sticker_diecut = สติ๊กเกอร์พิมพ์ไดคัท
sticker_clear = สติ๊กเกอร์ใส
xstand_v60 = X Stand ไวนิล 60×160 ซม.
xstand_v80 = X Stand ไวนิล 80×180 ซม.
xstand_p60 = X Stand กระดาษก๊อซซี่ PP 60×160 ซม.
xstand_p80 = X Stand กระดาษก๊อซซี่ PP 80×180 ซม.
rollup_p80 = โรลอัพ กระดาษก๊อซซี่ PP 80×200 ซม.
paper_a4 = กระดาษ A4 ธรรมดา
paper_art = อาร์ตมัน A4
paper_lam = A4 เคลือบ
letter_plastic = อักษรพลาสวูด
letter_stainless = อักษรสแตนเลส
letter_alu = อักษรอลูมิเนียม
letter_acrylic = อักษรอะคริลิค
`.trim();

const SYSTEM_PROMPT = `คุณเป็นตัวช่วยวิเคราะห์ข้อความใบสั่งทำป้ายสำหรับร้านพิมพ์ไทย

วัสดุที่มีในระบบ (รหัส = ชื่อ):
${MATERIALS_LIST}

เมื่อได้รับข้อความ ให้วิเคราะห์และส่งคืนเฉพาะ JSON array ของทุกรายการที่พบ ไม่มีข้อความอื่น:
[
  {
    "matId": "รหัสวัสดุที่ตรงที่สุด หรือ null",
    "width": "ตัวเลขความกว้างเป็นตัวเลขล้วน หรือ null",
    "height": "ตัวเลขความสูง/ยาวเป็นตัวเลขล้วน หรือ null",
    "unit": "cm, m, in, หรือ ft หรือ null",
    "qty": "จำนวนเป็นตัวเลขล้วน หรือ null"
  }
]

กฎ:
- ถ้ามีหลายรายการในข้อความ ให้ระบุทุกรายการในอาร์เรย์
- ถ้ามีรายการเดียว ให้ส่งอาร์เรย์ 1 element
- ถ้าไม่แน่ใจ ใส่ null ดีกว่าเดา
- width และ height ต้องเป็นตัวเลขล้วน ไม่มีหน่วย

หน่วยวัดและตัวย่อ (แปลงให้ถูกต้องเสมอ):
- cm  = ซม, ซม., ซ.ม., ซ.ม, เซนติเมตร, เซนติ, centimeter, cm, CM
- m   = เมตร, ม., ม, meter, metre, m, M  (ต้องไม่มีคำว่า "เซนติ" นำหน้า)
- in  = นิ้ว, inch, inches, in, " (double quote)
- ft  = ฟุต, ฟิต, feet, foot, ft, ' (single quote)

ตัวอย่างการแปลงหน่วย:
- "1 เมตรคูณ 2 เมตร" → width="1", height="2", unit="m"
- "1×2 ม." หรือ "1×2ม" → width="1", height="2", unit="m"
- "100×200 ซม." หรือ "100×200 เซนติเมตร" → width="100", height="200", unit="cm"
- "1.2×80 ซม." หรือ "1.2×80 cm" → width="1.2", height="80", unit="cm"
- "48×96 นิ้ว" → width="48", height="96", unit="in"
- "4×8 ฟุต" → width="4", height="8", unit="ft"
- ตัวอย่าง input: "ไวนิล 1×2 ม. 3 ผืน และสติ๊กเกอร์พิมพ์ 60×90 ซม. 5 ชิ้น"
- ตัวอย่าง output: [{"matId":"vinyl_white","width":"1","height":"2","unit":"m","qty":"3"},{"matId":"sticker_print","width":"60","height":"90","unit":"cm","qty":"5"}]`;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) return NextResponse.json([], { status: 400 });

    const apiKey = await getApiKey();
    if (!apiKey) return NextResponse.json([], { status: 500 });

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    // Support both array [...] and object {...} responses
    const arrStart = raw.indexOf('[');
    const objStart = raw.indexOf('{');
    let parsed: unknown;
    if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
      parsed = JSON.parse(raw.slice(arrStart, raw.lastIndexOf(']') + 1));
    } else {
      parsed = JSON.parse(raw.slice(objStart, raw.lastIndexOf('}') + 1));
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}
