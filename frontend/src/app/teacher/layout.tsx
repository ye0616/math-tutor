'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Camera,
  BarChart3,
  Users,
  Pencil,
  AlertCircle,
  Gift,
  Archive,
} from 'lucide-react';
import { getStoredUser } from '@/lib/api';
import ProfileModal from '@/components/ProfileModal';

const navItems = [
  { href: '/teacher/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/teacher/lesson', label: '课堂教学', icon: BookOpen },
  { href: '/teacher/grading', label: '拍照批改', icon: Camera },
  { href: '/teacher/analytics', label: '学情分析', icon: BarChart3 },
  { href: '/teacher/class-errors', label: '错题&出题', icon: AlertCircle },
  { href: '/teacher/management', label: '班级管理', icon: Users },
  { href: '/teacher/store', label: '积分商城', icon: Gift },
  { href: '/teacher/resource-library', label: '资源库', icon: Archive },
];

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    setUserInfo(getStoredUser());
  }, []);

  const userName = userInfo?.name || '老师';
  const avatarText = (userName || '?')[0];
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '凌晨好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div data-theme="teacher" className="min-h-screen paper-bg" style={{ fontFamily: "'Noto Sans SC', system-ui, sans-serif", color: '#3D3D3D' }}>
      <div className="flex" style={{ minHeight: '100vh' }}>
        {/* Sidebar */}
        <aside className="w-60 shrink-0 relative py-6 px-3 hidden md:block" style={{ backgroundColor: '#F0EBE0', borderRight: '2px solid rgba(220,80,80,0.15)' }}>
          {/* Logo */}
          <div className="flex items-center gap-2 px-3 mb-6">
            <Pencil className="w-5 h-5" style={{ color: '#C0785C' }} />
            <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-caveat), cursive', color: '#5C6170' }}>Math Sketch</span>
          </div>

          {/* Nav */}
          <nav className="space-y-1.5">
            <div className="px-3 pb-3 mb-2">
              <span className="text-lg" style={{ fontFamily: 'var(--font-caveat), cursive', color: '#7A756D' }}>~ 目录索引 ~</span>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/teacher/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all hover:translate-x-1"
                  style={isActive ? {
                    background: 'linear-gradient(135deg, rgba(192,120,92,0.15) 0%, rgba(192,120,92,0.08) 100%)',
                    color: '#C0785C',
                    borderLeft: '3px solid #C0785C',
                    transform: 'translateX(2px)',
                    fontWeight: 600,
                  } : {
                    color: '#7A756D',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Sidebar doodle */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-20">
            <svg width="80" height="40" viewBox="0 0 80 40" fill="none">
              <path d="M10 35 Q20 5 40 20 Q60 35 70 10" stroke="#B8B0A4" strokeWidth="1.5" fill="none" strokeDasharray="3 3"/>
              <circle cx="10" cy="35" r="2" fill="#B8B0A4"/>
              <circle cx="70" cy="10" r="2" fill="#B8B0A4"/>
            </svg>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-40 flex items-center justify-between px-6 h-16 relative" style={{ backgroundColor: '#FDFBF7', boxShadow: '2px 2px 0px rgba(60,60,60,0.08)' }}>
            <div className="flex items-center gap-4">
              <span className="text-sm" style={{ color: '#7A756D' }}>{greeting}，{userName}</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setProfileOpen(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:scale-110 cursor-pointer"
                style={{ backgroundColor: '#EDEBE6', color: '#5C6170', border: '2px solid transparent' }}
                title="个人中心"
              >
                {avatarText}
              </button>
            </div>
            {/* Decorative tape strip */}
            <div className="absolute bottom-0 left-0 right-0 h-2" style={{ background: 'linear-gradient(90deg, rgba(255,180,120,0.3) 0%, rgba(180,220,180,0.25) 30%, rgba(200,180,230,0.25) 60%, rgba(255,200,180,0.3) 100%)', transform: 'rotate(-0.3deg)' }} />
          </header>

          <main className="flex-1 overflow-y-auto p-6 relative" style={{ borderLeft: '2px solid rgba(220,80,80,0.2)' }}>
            {children}
          </main>
        </div>
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} theme="teacher" />
    </div>
  );
}
