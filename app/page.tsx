export default function MenuPage() {
  const items = [
    {
      href: '/admin',
      icon: '🖥️',
      title: 'ระบบจัดการงาน',
      desc: 'เปิดงาน · ติดตามสถานะ · Dashboard',
      color: '#1d4ed8',
      bg: '#eff6ff',
      border: '#bfdbfe',
    },
    {
      href: '/calc',
      icon: '🧮',
      title: 'คำนวณราคาป้าย',
      desc: 'คิดราคาตามขนาด · วัสดุ · งานตกแต่ง',
      color: '#7c3aed',
      bg: '#f5f3ff',
      border: '#ddd6fe',
    },
    {
      href: '/register',
      icon: '📋',
      title: 'ลงทะเบียนลูกค้า',
      desc: 'แบบฟอร์มลูกค้ากรอกข้อมูลเอง',
      color: '#0891b2',
      bg: '#ecfeff',
      border: '#a5f3fc',
    },
    {
      href: '/scan',
      icon: '📷',
      title: 'สแกนใบงาน',
      desc: 'ถ่ายรูปใบงาน · AI วิเคราะห์ · บันทึกอัตโนมัติ',
      color: '#059669',
      bg: '#ecfdf5',
      border: '#a7f3d0',
    },
    {
      href: '/setup',
      icon: '🔧',
      title: 'ตั้งค่าระบบ',
      desc: 'ทดสอบฐานข้อมูล · ตั้งรหัสผ่าน',
      color: '#b45309',
      bg: '#fffbeb',
      border: '#fde68a',
    },
  ];

  return (
    <main style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 16px',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🖨️</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>Idea Inkjet</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>เลือกเมนูที่ต้องการ</div>
      </div>

      {/* Menu grid */}
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => (
          <a key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: 'white', borderRadius: 16, padding: '18px 20px',
            textDecoration: 'none', border: `2px solid ${item.border}`,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: item.bg, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 26,
            }}>
              {item.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: item.color }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.desc}</div>
            </div>
            <div style={{ fontSize: 20, color: '#d1d5db' }}>›</div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 32, fontSize: 11, color: '#475569' }}>Idea Inkjet Cloud V2</div>
    </main>
  );
}
