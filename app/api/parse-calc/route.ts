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
- หลายรายการในข้อความ → ระบุทุกรายการในอาร์เรย์ (แม้วัสดุเดียวกันแต่ต่างขนาด ก็ต้องแยก)
- รายการเดียว → อาร์เรย์ 1 element
- ไม่รู้ → ใส่ null
- width/height ต้องเป็นตัวเลขล้วน ไม่มีหน่วย
- ถ้าเห็นชื่อวัสดุหรือ "ป้าย..." ปรากฏซ้ำพร้อมขนาดใหม่ → แยกเป็นรายการใหม่เสมอ
- "1 ป้าย", "2 ผืน", "3 ชิ้น" คือจำนวน (qty) ไม่ใช่ชื่อรายการใหม่

หน่วยวัด:
- cm = ซม, ซม., ซ.ม., เซนติเมตร, เซนติ, cm
- m  = เมตร, ม., ม (ถ้าไม่มีคำว่า "เซนติ" นำหน้า), meter, metre, m
- in = นิ้ว, inch, in, "
- ft = ฟุต, ฟิต, feet, foot, ft, '

ตัวอย่าง:
input:  "ป้ายไวนิลขนาด 1 เมตร คูณ 2 เมตร จำนวน 3 ป้าย"
output: [{"material":"ไวนิล","width":"1","height":"2","unit":"m","qty":"3"}]

input:  "ไวนิล 1 เมตร x 2 เมตร 3 ผืน"
output: [{"material":"ไวนิล","width":"1","height":"2","unit":"m","qty":"3"}]

input:  "ป้ายไวนิลขนาด 1 เมตรคูณ 2 เมตร 1 ป้าย ป้ายไวนิลขนาด 3 เมตรคูณ 2 เมตร 1 ป้าย"
output: [{"material":"ไวนิล","width":"1","height":"2","unit":"m","qty":"1"},{"material":"ไวนิล","width":"3","height":"2","unit":"m","qty":"1"}]

input:  "ไวนิล 1×2 ม. 3 ผืน และสติ๊กเกอร์พิมพ์ 60×90 ซม. 5 ชิ้น"
output: [{"material":"ไวนิล","width":"1","height":"2","unit":"m","qty":"3"},{"material":"สติ๊กเกอร์พิมพ์","width":"60","height":"90","unit":"cm","qty":"5"}]

input:  "อะคริลิค 3 มิล ติดสติ๊กเกอร์ไดคัท ขนาด 40×60 ซม. 2 แผ่น กับ ผ้าไอที 2×5 เมตร 1 ผืน"
output: [{"material":"อะคริลิค ติดสติ๊กเกอร์ไดคัท","width":"40","height":"60","unit":"cm","qty":"2"},{"material":"ผ้าไอที","width":"2","height":"5","unit":"m","qty":"1"}]

input:  "ไวนิล 60×90 2 ผืน ไวนิล 100×200 3 ผืน"
output: [{"material":"ไวนิล","width":"60","height":"90","unit":"cm","qty":"2"},{"material":"ไวนิล","width":"100","height":"200","unit":"cm","qty":"3"}]`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Accept either { text } (single) or { segments: string[] } (pre-split by client)
    const segments: string[] = body.segments ?? (body.text?.trim() ? [body.text.trim()] : []);
    if (segments.length === 0) return NextResponse.json([], { status: 400 });

    const apiKey = await getApiKey();
    if (!apiKey) return NextResponse.json([], { status: 500 });

    // When multiple segments are provided, number them so AI parses each independently
    const userMessage = segments.length > 1
      ? segments.map((s, i) => `รายการที่ ${i + 1}: ${s}`).join('\n')
      : segments[0];

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
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
