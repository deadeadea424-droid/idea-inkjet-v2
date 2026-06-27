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

  const { imageBase64, mediaType } = await req.json();
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
  "work_date": "วันที่ทำงานในรูปแบบ DD/MM/YYYY ถ้ามี (ถ้าไม่มีให้ใส่ null)",
  "paid": ถ้าเห็นสัญลักษณ์ว่าจ่ายแล้ว (เช่น ✓ วงกลม จ่ายแล้ว) ให้ใส่ true, ถ้ายังไม่จ่ายให้ใส่ false, ถ้าไม่แน่ใจให้ใส่ null,
  "notes": "ข้อมูลอื่นๆที่อ่านได้และอาจเป็นประโยชน์ (ถ้าไม่มีให้ใส่ null)"
}

กฎ:
- ตอบเฉพาะ JSON เท่านั้น ไม่ต้องอธิบายเพิ่มเติม
- อ่านตัวเขียนมือด้วย แม้จะอ่านยาก
- ถ้าไม่แน่ใจค่าไหนให้ใส่ null ดีกว่าเดา
- ปีในใบงานอาจเป็นปีไทย (เช่น 67 = พ.ศ. 2567 = ค.ศ. 2024) หรืออาจเป็นปี ค.ศ. สั้น`;

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

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: 'AI ไม่ส่งกลับ JSON', raw: text }, { status: 500 });

    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
