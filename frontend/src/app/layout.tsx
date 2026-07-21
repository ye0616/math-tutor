import type { Metadata } from 'next';
import { Caveat, Nunito } from 'next/font/google';
import './globals.css';

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '数学智教 - AI教育智能体',
  description: '面向五年级学生的数学教育智能平台，覆盖人教版五上五下数学教材，区分教师端与学生端。',
  keywords: ['数学教育', 'AI教学', '五年级数学', '智能体', '教育平台'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${caveat.variable} ${nunito.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
