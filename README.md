# Idea Inkjet V2 Cloud

ระบบรับงานและติดตามสถานะงานร้านไอเดียอิงค์เจ็ท แบบ Cloud ใช้ Supabase + Vercel

## ความสามารถ Version 2 Cloud

- Dashboard
- เพิ่มลูกค้า
- เพิ่มพนักงาน
- เปิดงานใหม่
- ดูงานทั้งหมด
- เปลี่ยนสถานะงาน
- บันทึกจ่ายครบ
- ฐานข้อมูล PostgreSQL บน Supabase
- Deploy ขึ้น Vercel ได้

## 1) สร้าง Supabase Project

1. เข้า Supabase แล้วสร้าง Project ใหม่
2. ไปที่ SQL Editor
3. เปิดไฟล์ `supabase/schema.sql`
4. Copy ทั้งหมดไป Run

## 2) ตั้งค่า Environment

Copy ไฟล์ `.env.example` เป็น `.env.local`

```bash
cp .env.example .env.local
```

แล้วใส่ค่าจาก Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

ดูค่าได้ที่ Supabase > Project Settings > API

## 3) เปิดใช้งานในเครื่อง

```bash
npm install
npm run dev
```

เปิดเว็บ:

```text
http://localhost:3000
```

## 4) Deploy ขึ้น Vercel

1. อัปโหลดโค้ดนี้เข้า GitHub
2. เข้า Vercel > Add New Project
3. เลือก repo นี้
4. ตั้ง Environment Variables สองตัว:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
5. กด Deploy

## หมายเหตุความปลอดภัย

ไฟล์ `schema.sql` ตั้ง policy แบบทดลองให้ใช้งานง่ายก่อน
ถ้านำไปใช้จริงควรเพิ่ม Supabase Auth และจำกัดสิทธิ์ตาม role เช่น owner, admin, graphic, production

## สถานะงานที่ใช้

1. รับงานใหม่
2. กำลังออกแบบ
3. รอลูกค้าตรวจแบบ
4. ลูกค้าอนุมัติแล้ว
5. กำลังผลิต
6. ผลิตเสร็จ
7. แจ้งลูกค้ามารับ
8. ลูกค้ารับแล้ว
9. ชำระเงินแล้ว
10. ค้างชำระ
11. ยกเลิก
