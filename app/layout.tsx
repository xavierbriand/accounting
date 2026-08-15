import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'sluice',
  description: 'What each of us transfers this month, and whether the number is still honest.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
