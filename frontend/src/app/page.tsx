'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Phone, Lock, Eye, EyeOff, ArrowRight, User, Shield, KeyRound, Hash } from 'lucide-react';
import { authLogin, authStudentLogin, authRegister, setToken, getStoredUser } from '@/lib/api';

type Role = 'teacher' | 'student' | 'admin' | null;

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [studentNo, setStudentNo] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  useEffect(() => {
    setMounted(true);
    // Auto-restore previous session
    const user = getStoredUser();
    if (user && user.role) {
      const token = localStorage.getItem('math-tutor-token');
      if (token) {
        if (user.role === 'teacher') router.push('/teacher/dashboard');
        else if (user.role === 'student') router.push('/student/home');
        else if (user.role === 'admin') router.push('/admin');
      }
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      if (isLogin) {
        // 登录
        if (selectedRole === 'student') {
          // 学生登录：姓名 + 学号
          if (!name.trim()) {
            setError('请输入姓名');
            setLoading(false);
            return;
          }
          if (!studentNo.trim()) {
            setError('请输入学号');
            setLoading(false);
            return;
          }
          const data = await authStudentLogin(name.trim(), studentNo.trim());
          setToken(data.token);
          localStorage.setItem('math-tutor-user', JSON.stringify(data.user));
          router.push('/student/home');
        } else {
          // 教师/管理员登录：手机号 + 密码
          const data = await authLogin(phone, password, selectedRole);
          setToken(data.token);
          localStorage.setItem('math-tutor-user', JSON.stringify(data.user));

          if (data.user.role === 'admin') router.push('/admin');
          else if (data.user.role === 'teacher') router.push('/teacher/dashboard');
        }
      } else {
        // 注册（仅教师）
        if (!name.trim()) {
          setError('请输入姓名');
          setLoading(false);
          return;
        }
        const data = await authRegister(selectedRole, name, phone, password, inviteCode);
        if (data.status === 'pending') {
          setInfo('注册成功！请等待管理员审核通过后再登录。');
          setIsLogin(true);
        } else {
          setInfo('注册成功！请登录。');
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      setError(err.message || '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedRole(null);
    setName('');
    setPhone('');
    setPassword('');
    setStudentNo('');
    setInviteCode('');
    setError('');
    setInfo('');
    setShowPassword(false);
  };

  if (!mounted) return null;

  const isTeacherModal = selectedRole === 'teacher';
  const isAdminModal = selectedRole === 'admin';
  const isStudentModal = selectedRole === 'student';

  // 模态框样式根据角色选择
  const modalBg = isAdminModal
    ? '#F8F8FF'
    : isTeacherModal
    ? '#FDFBF7'
    : '#FFFDF7';
  const modalBorder = isAdminModal
    ? '3px solid #6366F1'
    : isTeacherModal
    ? '3px solid #B8B0A4'
    : '3px solid #C8E6C0';
  const modalShadow = isAdminModal
    ? '0 8px 32px rgba(99, 102, 241, 0.3)'
    : isTeacherModal
    ? '4px 4px 0 #B8B0A4, 8px 8px 20px rgba(0,0,0,0.2)'
    : '0 8px 32px rgba(115, 192, 103, 0.3)';
  const headerBg = isAdminModal
    ? 'linear-gradient(135deg, #EEF2FF, #F8F8FF)'
    : isTeacherModal
    ? 'linear-gradient(135deg, #F5F0E6, #FDFBF7)'
    : 'linear-gradient(135deg, #E8F5E4, #F0F8F0)';
  const accentColor = isAdminModal ? '#6366F1' : isTeacherModal ? '#5C6170' : '#73C067';
  const accentColor2 = isAdminModal ? '#818CF8' : isTeacherModal ? '#C0785C' : '#95D8F0';
  const inputBg = isAdminModal ? '#F0F0FF' : isTeacherModal ? '#F5F0E6' : '#F0F8F0';
  const inputBorder = isAdminModal ? '#C7D2FE' : isTeacherModal ? '#B8B0A4' : '#C8E6C0';
  const subTextColor = isAdminModal ? '#6366F1' : isTeacherModal ? '#7A756D' : '#8B7355';
  const iconEmoji = isAdminModal ? '🛡️' : isTeacherModal ? '📖' : '🦁';

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f8f5f0 0%, #fff8e8 50%, #f0f8f0 100%)' }}>
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 text-6xl opacity-20 animate-float-slow">📚</div>
        <div className="absolute top-40 right-20 text-5xl opacity-20 animate-float-medium">✏️</div>
        <div className="absolute bottom-32 left-1/4 text-5xl opacity-20 animate-float-fast">🎨</div>
        <div className="absolute bottom-20 right-1/3 text-6xl opacity-20 animate-float-slow">📐</div>
        <div className="absolute top-1/3 left-1/2 text-4xl opacity-15 animate-float-medium">∑</div>
        <div className="absolute top-1/4 right-1/4 text-4xl opacity-15 animate-float-fast">π</div>
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🎓</span>
          <h1 className="text-2xl font-bold" style={{ color: '#3D3D3D', fontFamily: 'var(--font-caveat)' }}>
            数学智教
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 py-8 min-h-[calc(100vh-100px)]">
        {/* Title */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: '#3D3D3D' }}>
            欢迎来到
            <span className="inline-block mx-2" style={{ fontFamily: 'var(--font-caveat)', color: '#C0785C' }}>数学智教</span>
          </h2>
          <p className="text-lg" style={{ color: '#7A756D' }}>选择你的身份，开启学习之旅</p>
        </div>

        {/* Two cards */}
        <div className="flex flex-col md:flex-row gap-8 items-center justify-center w-full max-w-4xl">
          {/* Teacher Card */}
          <div
            onClick={() => { setSelectedRole('teacher'); setIsLogin(true); setError(''); setInfo(''); }}
            className="group relative w-full md:w-[380px] h-[480px] rounded-3xl cursor-pointer transition-all duration-500 hover:scale-105 hover:-rotate-1"
            style={{
              background: '#F5F0E6',
              boxShadow: '4px 4px 0 #B8B0A4, 8px 8px 20px rgba(0,0,0,0.1)',
            }}
          >
            {/* Paper texture */}
            <div className="absolute inset-0 rounded-3xl opacity-30" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 28px, #B8B0A4 28px, #B8B0A4 29px)',
            }} />

            {/* Tape decoration */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 rounded-sm opacity-70"
              style={{ background: 'rgba(192, 120, 92, 0.4)', transform: 'rotate(-2deg)' }} />

            {/* Content */}
            <div className="relative h-full flex flex-col items-center justify-center p-8">
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center mb-6"
                style={{ background: '#FDFBF7', border: '2px dashed #B8B0A4' }}>
                <span className="text-5xl">📖</span>
              </div>

              <h3 className="text-3xl font-bold mb-2" style={{ color: '#5C6170', fontFamily: 'var(--font-caveat)' }}>
                Teacher
              </h3>
              <h4 className="text-xl font-bold mb-4" style={{ color: '#3D3D3D' }}>
                教师入口
              </h4>

              <div className="w-full h-px my-4" style={{ background: '#B8B0A4', borderStyle: 'dashed' }} />

              <ul className="space-y-3 text-left w-full">
                <li className="flex items-center gap-3" style={{ color: '#5C6170' }}>
                  <span style={{ color: '#6B8F71' }}>✓</span>
                  <span>课堂教学管理</span>
                </li>
                <li className="flex items-center gap-3" style={{ color: '#5C6170' }}>
                  <span style={{ color: '#6B8F71' }}>✓</span>
                  <span>AI 拍照批改</span>
                </li>
                <li className="flex items-center gap-3" style={{ color: '#5C6170' }}>
                  <span style={{ color: '#6B8F71' }}>✓</span>
                  <span>学情数据分析</span>
                </li>
                <li className="flex items-center gap-3" style={{ color: '#5C6170' }}>
                  <span style={{ color: '#6B8F71' }}>✓</span>
                  <span>教学资源建设</span>
                </li>
              </ul>

              <div className="mt-6 px-6 py-3 rounded-full flex items-center gap-2 transition-all group-hover:scale-110"
                style={{ background: '#C0785C', color: 'white' }}>
                <span>点击进入</span>
                <ArrowRight size={18} />
              </div>
            </div>
          </div>

          {/* Student Card */}
          <div
            onClick={() => { setSelectedRole('student'); setIsLogin(true); setError(''); setInfo(''); }}
            className="group relative w-full md:w-[380px] h-[480px] rounded-[32px] cursor-pointer transition-all duration-500 hover:scale-105 hover:rotate-1"
            style={{
              background: '#FFFDF7',
              boxShadow: '0 8px 32px rgba(115, 192, 103, 0.2)',
              border: '3px solid #C8E6C0',
            }}
          >
            {/* Zoo gate decoration */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-end gap-1">
              <div className="w-3 h-8 rounded-t-full" style={{ background: '#8B6F47' }} />
              <div className="w-20 h-6 rounded-t-xl flex items-center justify-center" style={{ background: '#73C067' }}>
                <span className="text-xs text-white font-bold">ZOO</span>
              </div>
              <div className="w-3 h-8 rounded-t-full" style={{ background: '#8B6F47' }} />
            </div>

            {/* Content */}
            <div className="relative h-full flex flex-col items-center justify-center p-8">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 relative"
                style={{ background: 'linear-gradient(135deg, #73C067, #95D8F0)' }}>
                <span className="text-5xl">🦁</span>
                <span className="absolute -top-1 -right-1 text-2xl animate-bounce">🐘</span>
              </div>

              <h3 className="text-3xl font-bold mb-2" style={{ color: '#73C067', fontFamily: "'Nunito', sans-serif" }}>
                Zoo School
              </h3>
              <h4 className="text-xl font-bold mb-4" style={{ color: '#4A3728' }}>
                学生入口
              </h4>

              <div className="w-full h-1 my-4 rounded-full" style={{ background: 'linear-gradient(90deg, #73C067, #95D8F0, #FFB86C)' }} />

              <ul className="space-y-3 text-left w-full">
                <li className="flex items-center gap-3" style={{ color: '#4A3728' }}>
                  <span className="text-xl">🐘</span>
                  <span>动物场馆闯关</span>
                </li>
                <li className="flex items-center gap-3" style={{ color: '#4A3728' }}>
                  <span className="text-xl">🦁</span>
                  <span>错题救助站</span>
                </li>
                <li className="flex items-center gap-3" style={{ color: '#4A3728' }}>
                  <span className="text-xl">🐵</span>
                  <span>饲养员成长手册</span>
                </li>
                <li className="flex items-center gap-3" style={{ color: '#4A3728' }}>
                  <span className="text-xl">🦒</span>
                  <span>动物收集图鉴</span>
                </li>
              </ul>

              <div className="mt-6 px-6 py-3 rounded-full flex items-center gap-2 transition-all group-hover:scale-110"
                style={{ background: 'linear-gradient(135deg, #73C067, #95D8F0)', color: 'white' }}>
                <span>开始冒险</span>
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
        </div>

        {/* Admin entry */}
        <div className="mt-10 text-center">
          <button
            onClick={() => { setSelectedRole('admin'); setIsLogin(true); setError(''); setInfo(''); }}
            className="inline-flex items-center gap-2 text-sm transition-all hover:opacity-70"
            style={{ color: '#9CA3AF' }}
          >
            <Shield size={14} />
            <span>管理员入口</span>
          </button>
        </div>
      </main>

      {/* Login Modal */}
      {selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl overflow-hidden animate-scale-in"
            style={{
              background: modalBg,
              border: modalBorder,
              boxShadow: modalShadow,
            }}
          >
            {/* Close button */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10 hover:opacity-70"
              style={{ background: inputBg }}
            >
              <X size={18} style={{ color: accentColor }} />
            </button>

            {/* Header */}
            <div className="p-6 pb-4 text-center" style={{ background: headerBg }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{
                  background: isTeacherModal ? '#FDFBF7' : 'transparent',
                  border: isTeacherModal ? '2px dashed #B8B0A4' : 'none',
                }}>
                <span className="text-3xl">{iconEmoji}</span>
              </div>
              <h3 className="text-xl font-bold" style={{ color: accentColor }}>
                {isAdminModal ? '管理员登录' : isTeacherModal ? '教师登录' : '学生登录'}
              </h3>
              <p className="text-sm mt-1" style={{ color: subTextColor }}>
                {isAdminModal ? '系统管理后台' : isLogin ? '欢迎回来！' : '创建新账号'}
              </p>
            </div>

            {/* Form */}
            <form id="auth-form" onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
              {error && (
                <div className="p-3 rounded-xl text-sm" style={{
                  background: '#FEF2F2',
                  color: '#DC2626',
                  border: '1px solid #FECACA',
                }}>
                  {error}
                </div>
              )}

              {info && (
                <div className="p-3 rounded-xl text-sm" style={{
                  background: '#F0FDF4',
                  color: '#16A34A',
                  border: '1px solid #BBF7D0',
                }}>
                  {info}
                </div>
              )}

              {/* === Student login: name + student_no === */}
              {isStudentModal && isLogin && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: accentColor }}>
                      姓名
                    </label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="请输入姓名"
                        required
                        className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all"
                        style={{
                          background: inputBg,
                          border: `2px solid ${inputBorder}`,
                          color: '#3D3D3D',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: accentColor }}>
                      学号
                    </label>
                    <div className="relative">
                      <Hash size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                      <input
                        type="text"
                        value={studentNo}
                        onChange={(e) => setStudentNo(e.target.value)}
                        placeholder="请输入学号"
                        required
                        className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all font-mono"
                        style={{
                          background: inputBg,
                          border: `2px solid ${inputBorder}`,
                          color: '#3D3D3D',
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl text-xs" style={{ background: inputBg, color: subTextColor }}>
                    账号由老师统一创建，请向老师询问你的学号
                  </div>
                </>
              )}

              {/* === Student: no registration, show notice === */}
              {isStudentModal && !isLogin && (
                <div className="p-4 rounded-xl text-sm text-center" style={{ background: inputBg, color: accentColor }}>
                  学生账号由老师统一创建，请联系老师获取账号。
                </div>
              )}

              {/* === Teacher/Admin: name (registration only) === */}
              {!isLogin && !isAdminModal && !isStudentModal && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: accentColor }}>
                    姓名
                  </label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="请输入姓名"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all"
                      style={{
                        background: inputBg,
                        border: `2px solid ${inputBorder}`,
                        color: '#3D3D3D',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* === Teacher/Admin: phone === */}
              {!isStudentModal && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: accentColor }}>
                    手机号
                  </label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="请输入手机号"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all"
                      style={{
                        background: inputBg,
                        border: `2px solid ${inputBorder}`,
                        color: '#3D3D3D',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* === Teacher/Admin: password === */}
              {!isStudentModal && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: accentColor }}>
                    密码
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码"
                      required
                      minLength={6}
                      className="w-full pl-10 pr-12 py-3 rounded-xl outline-none transition-all"
                      style={{
                        background: inputBg,
                        border: `2px solid ${inputBorder}`,
                        color: '#3D3D3D',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? <EyeOff size={18} style={{ color: '#9CA3AF' }} /> : <Eye size={18} style={{ color: '#9CA3AF' }} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Invite code field (only for teacher registration) */}
              {!isLogin && isTeacherModal && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: accentColor }}>
                    教师推荐码
                  </label>
                  <div className="relative">
                    <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="请输入教师推荐码"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all"
                      style={{
                        background: inputBg,
                        border: `2px solid ${inputBorder}`,
                        color: '#3D3D3D',
                      }}
                    />
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: subTextColor }}>
                    联系管理员获取推荐码
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (isStudentModal && !isLogin)}
                className="w-full py-3 rounded-xl font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})`,
                }}
              >
                {loading ? '处理中...' : (isLogin ? '登录' : isStudentModal ? '暂不支持' : '注册')}
              </button>

              {/* Guest login removed — all roles must enter credentials manually */}
              <div className="text-center">
                {isTeacherModal ? (
                  <span className="text-xs opacity-60" style={{ color: subTextColor }}>
                    联系管理员获取账号
                  </span>
                ) : isStudentModal ? (
                  <span className="text-xs opacity-60" style={{ color: subTextColor }}>
                    学生账号由老师创建
                  </span>
                ) : null}
              </div>

              {/* Toggle login/register (teacher only, not student/admin) */}
              {!isAdminModal && !isStudentModal && (
                <div className="text-center text-sm" style={{ color: subTextColor }}>
                  {isLogin ? '还没有账号？' : '已有账号？'}
                  <button
                    type="button"
                    onClick={() => { setIsLogin(!isLogin); setError(''); setInfo(''); }}
                    className="ml-1 font-bold"
                    style={{ color: accentColor2 }}
                  >
                    {isLogin ? '去注册' : '去登录'}
                  </button>
                </div>
              )}

              {/* Test account hint — 已全部移除，要求手动输入凭据 */}
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes float-medium {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(-5deg); }
        }
        @keyframes float-fast {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(3deg); }
        }
        .animate-float-slow { animation: float-slow 6s ease-in-out infinite; }
        .animate-float-medium { animation: float-medium 4s ease-in-out infinite; }
        .animate-float-fast { animation: float-fast 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
