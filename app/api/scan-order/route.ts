import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

async function getApiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    );
    const { data } = await sb.from('app_settings').select('value').eq('key', 'anthropic_api_key').maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'ไม่พบ API Key — กรุณาตั้งค่าที่หน้า /setup ขั้นตอนที่ 4' }, { status: 500 });
  }
  const client = new Anthropic({ apiKey });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'ข้อมูล request ไม่ถูกต้อง' }, { status: 400 });
  }
  const { imageBase64, mediaType } = body;
  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ ok: false, error: 'ไม่พบข้อมูลรูปภาพ' }, { status: 400 });
  }

  const prompt = `คุณคือผู้ช่วยอ่านใบงานของร้านปริ้นท์และป้ายชื่อ "Idea Inkjet"
วิเคราะห์รูปภาพใบงานนี้แล้วสกัดข้อมูลเป็น JSON ต่อไปนี้:

{
  "title": "ชื่องาน หรือรายละเอียดหลักที่อ่านได้ เช่น บัตรสะสมแต้ม, ป้ายไวนิล, สติ๊กเกอร์",
  "order_type": "ประเภทงาน เช่น สติ๊กเกอร์, ป้าย, ไวนิล, บัตร, กล่อง, แบนเนอร์, โปสเตอร์ หรืออื่นๆ",
  "size": "ขนาดงาน เช่น A4, 60x90 ซม., 1x2 เมตร (ถ้าไม่มีให้ใส่ null)",
  "quantity": จำนวน (ตัวเลขเท่านั้น ไม่มีหน่วย ถ้าไม่มีให้ใส่ null),
  "material": "วัสดุที่ใช้ถ้าระบุ เช่น ไวนิล, อาร์ตมัน, PP (ถ้าไม่มีให้ใส่ null)",
  "price": ราคา (ตัวเลขเท่านั้น ไม่มีสกุลเงิน ถ้าไม่มีให้ใส่ null),
  "customer_name": "ชื่อลูกค้าถ้ามี (ถ้าไม่มีให้ใส่ null)",
  "worker": "ชื่อพนักงาน หรือหมายเลขเครื่องที่ใช้ถ้าระบุ (ถ้าไม่มีให้ใส่ null)",
  "work_date": "วันที่ทำงานในรูปแบบ DD/MM/YYYY ถ้ามี ปีเป็น ค.ศ. 4 หลัก เช่น 24/06/2024 (ถ้าไม่มีให้ใส่ null)",
  "paid": ถ้าเห็นสัญลักษณ์ว่าจ่ายแล้ว (เช่น ✓ วงกลม จ่ายแล้ว) ให้ใส่ true, ถ้ายังไม่จ่ายให้ใส่ false, ถ้าไม่แน่ใจให้ใส่ null,
  "notes": "ข้อมูลอื่นๆที่อ่านได้และอาจเป็นประโยชน์ (ถ้าไม่มีให้ใส่ null)"
}

กฎ:
- ตอบเฉพาะ JSON เท่านั้น ไม่ต้องอธิบายเพิ่มเติม ไม่ต้องมี markdown code block
- อ่านตัวเขียนมือด้วย แม้จะอ่านยาก
- ถ้าไม่แน่ใจค่าไหนให้ใส่ null ดีกว่าเดา
- ปีในใบงานอาจเป็นปีไทย (เช่น 67 = พ.ศ. 2567 = ค.ศ. 2024, 68 = ค.ศ. 2025) ให้แปลงเป็น ค.ศ. เสมอ
- work_date ต้องเป็น ค.ศ. 4 หลักเท่านั้น`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: imageBase64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (!text) return NextResponse.json({ ok: false, error: 'AI ไม่ตอบกลับ' }, { status: 500 });

    // Extract last JSON object (in case there's extra text before/after)
    const matches = [...text.matchAll(/\{[\s\S]*?\}/g)];
    const jsonStr = matches.length > 0 ? matches[matches.length - 1][0] : null;
    if (!jsonStr) return NextResponse.json({ ok: false, error: 'AI ไม่ส่งกลับ JSON', raw: text }, { status: 500 });

    let data: any;
    try { data = JSON.parse(jsonStr); } catch {
      return NextResponse.json({ ok: false, error: 'JSON จาก AI มีรูปแบบผิด', raw: jsonStr }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
