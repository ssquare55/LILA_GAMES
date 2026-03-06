import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'LILA BLACK — Level Designer Map Tool',
  description: 'Visualize player journeys, kills, and heatmaps across LILA BLACK maps.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} bg-[#0a0b0f] text-slate-200 h-screen overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}
