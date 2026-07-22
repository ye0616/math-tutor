'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getStoredUser } from '@/lib/api';
import ProfileModal from '@/components/ProfileModal';

const navItems = [
  { href: '/student/home', label: '首页' },
  { href: '/student/preview', label: '课前预习' },
  { href: '/student/homework', label: '学习作业' },
  { href: '/student/practice', label: '闯关游戏' },
  { href: '/student/errors', label: '错题救助站' },
  { href: '/student/xiaocong-history', label: '小聪记录' },
  { href: '/student/knowledge-graph', label: '知识图谱' },
  { href: '/student/achievements', label: '成长手册' },
];

// 根据 pathname 决定使用哪张背景图
function getSceneClass(pathname: string): string {
  if (pathname.startsWith('/student/practice')) return 'student-scene-practice';
  if (pathname.startsWith('/student/fun-games')) return 'student-scene-practice';
  if (pathname.startsWith('/student/errors')) return 'student-scene-errors';
  if (pathname.startsWith('/student/achievements')) return 'student-scene-achievements';
  if (pathname.startsWith('/student/knowledge-graph')) return 'student-scene-achievements';
  if (pathname.startsWith('/student/homework')) return 'student-scene-home';
  if (pathname.startsWith('/student/preview')) return 'student-scene-home';
  return 'student-scene-home';
}

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const sceneClass = getSceneClass(pathname);
  // 避免 SSR/CSR hydration mismatch：先以服务端一致的占位渲染，mounted 后再读 localStorage 替换
  const [mounted, setMounted] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    try { setUserInfo(getStoredUser()); } catch { /* noop */ }
    setMounted(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'math-tutor-user') setUserInfo(getStoredUser());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const userName = mounted && userInfo?.name ? userInfo.name : '小饲养员';
  const avatarText = (userName || '?')[0];
  const userPoints = userInfo?.points ?? 0;

  return (
    <div
      data-theme="student"
      className={`min-h-screen ${sceneClass}`}
      style={{ fontFamily: "var(--font-nunito), 'Noto Sans SC', system-ui, sans-serif", color: '#4A3728' }}
    >
      {/* Top navigation bar - glass style for readability over image */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'rgba(255, 255, 255, 0.82)',
          backdropFilter: 'blur(14px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
          borderBottom: '1.5px solid rgba(200, 230, 192, 0.5)',
          boxShadow: '0 2px 16px rgba(74, 55, 40, 0.05)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-lg"
              style={{ background: 'linear-gradient(135deg, #95D8F0, #73C067)' }}
              aria-hidden
            >
              🐘
            </span>
            <span className="text-lg font-bold" style={{ color: '#4A3728' }}>数学动物园</span>
          </div>
          {/* Nav menu */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.label} href={item.href}
                      className="px-4 py-2 text-sm font-medium rounded-full transition-all"
                      style={isActive
                        ? { color: '#2D5A27', background: 'rgba(232, 245, 228, 0.95)', fontWeight: 700, boxShadow: 'inset 0 -2px 0 #73C067' }
                        : { color: '#8B7355' }}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {/* Right side: user info + points */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: '#4A3728' }}>{userName}</span>
            <button
              onClick={() => {
                // 若 localStorage 已有 user 但 userInfo state 还没同步，强行从 storage 同步一次
                if (!userInfo) {
                  const u = getStoredUser();
                  if (u) setUserInfo(u);
                  else { window.location.href = '/'; return; }
                }
                setProfileOpen(true);
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:scale-110 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #E8F5E4, #C8E6C0)',
                color: '#2D5A27',
                border: '2px solid rgba(115,192,103,0.3)',
              }}
              title="个人中心"
            >
              {avatarText}
            </button>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(255, 240, 219, 0.85)', border: '1px solid rgba(255, 184, 108, 0.3)' }}
            >
              <span className="text-sm font-bold" style={{ color: '#FFB86C' }}>{userPoints}</span>
              <span className="text-xs" style={{ color: '#8B7355' }}>爱心饲料币</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content - no bottom bar, so no extra bottom padding needed */}
      <main className="max-w-7xl mx-auto px-6" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        {children}
      </main>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} theme="student" />
    </div>
  );
}
