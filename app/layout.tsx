import '../styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Idea Inkjet Cloud',
  description: 'ระบบรับงานและติดตามสถานะงานร้านไอเดียอิงค์เจ็ท'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
