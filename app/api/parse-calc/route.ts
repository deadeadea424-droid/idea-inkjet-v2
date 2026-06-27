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

เมื่อได้รับข้อความ ให้วิเคราะห์และส่งคืนเฉพาะ JSON ดังนี้ ไม่มีข้อความอื่น:
{
  "matId": "รหัสวัสดุที่ตรงที่สุด หรือ null ถ้าไม่รู้",
  "width": "ตัวเลขความกว้างเป็นตัวเลขล้วน หรือ null",
  "height": "ตัวเลขความสูง/ยาวเป็นตัวเลขล้วน หรือ null",
  "unit": "หน่วย: cm, m, in, หรือ ft หรือ null (ซม./เซนติเมตร=cm, ม./เมตร=m, นิ้ว=in, ฟุต=ft)",
  "qty": "จำนวนเป็นตัวเลขล้วน หรือ null"
}

กฎ:
- ถ้าไม่แน่ใจ ให้ใส่ null ดีกว่าเดา
- ส่งคืน JSON เท่านั้น ห้ามมีข้อความอื่น
- "1 เมตรคูณ 2 เมตร" → width=1, height=2, unit=m
- "50×90 ซม." หรือ "50×90 เซนติเมตร" → width=50, height=90, unit=cm
- "1.20 * 80 เซนติเมตร" หรือ "1.2×80 ซม." → width=1.2, height=80, unit=cm
- ถ้าข้อความมีหลายรายการ ให้เลือกรายการแรกที่พบ
- width และ height ต้องเป็นตัวเลขล้วน ไม่มีหน่วย
- "เซนติเมตร" = cm, "เมตร" (ไม่มี "เซนติ") = m`;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: 'no text' }, { status: 400 });

    const apiKey = await getApiKey();
    if (!apiKey) return NextResponse.json({ error: 'no api key' }, { status: 500 });

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'parse failed' }, { status: 500 });
  }
}
