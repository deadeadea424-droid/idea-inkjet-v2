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

// AI's job: understand the customer's text and extract structured data.
// Matching to materials and price calculation is done by the local system.
const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยวิเคราะห์ใบสั่งทำป้ายสำหรับร้านพิมพ์ไทย

อ่านข้อความแล้วส่งคืนเฉพาะ JSON array ไม่มีข้อความอื่น:
[
  {
    "material": "ชื่อวัสดุหรือประเภทงานที่ลูกค้าต้องการ (ภาษาไทย เช่น ไวนิล, สติ๊กเกอร์พิมพ์, ฟิวเจอร์บอร์ด) หรือ null",
    "width": "ตัวเลขความกว้างล้วนๆ หรือ null",
    "height": "ตัวเลขความสูง/ยาวล้วนๆ หรือ null",
    "unit": "cm หรือ m หรือ in หรือ ft หรือ null",
    "qty": "จำนวนล้วนๆ หรือ null"
  }
]

กฎ:
- หลายรายการในข้อความ → ระบุทุกรายการในอาร์เรย์
- รายการเดียว → อาร์เรย์ 1 element
- ไม่รู้ → ใส่ null
- width/height ต้องเป็นตัวเลขล้วน ไม่มีหน่วย

หน่วยวัด:
- cm = ซม, ซม., ซ.ม., เซนติเมตร, เซนติ, cm
- m  = เมตร, ม., ม (ถ้าไม่มีคำว่า "เซนติ" นำหน้า), meter, metre, m
- in = นิ้ว, inch, in, "
- ft = ฟุต, ฟิต, feet, foot, ft, '

ตัวอย่าง:
input:  "ไวนิล 1×2 ม. 3 ผืน และสติ๊กเกอร์พิมพ์ 60×90 ซม. 5 ชิ้น"
output: [{"material":"ไวนิล","width":"1","height":"2","unit":"m","qty":"3"},{"material":"สติ๊กเกอร์พิมพ์","width":"60","height":"90","unit":"cm","qty":"5"}]

input:  "อะคริลิค 3 มิล ติดสติ๊กเกอร์ไดคัท ขนาด 40×60 ซม. 2 แผ่น กับ ผ้าไอที 2×5 เมตร 1 ผืน"
output: [{"material":"อะคริลิค ติดสติ๊กเกอร์ไดคัท","width":"40","height":"60","unit":"cm","qty":"2"},{"material":"ผ้าไอที","width":"2","height":"5","unit":"m","qty":"1"}]`;

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
