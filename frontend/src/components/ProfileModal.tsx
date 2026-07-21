'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Phone, Hash, User, Lock, Eye, EyeOff, LogOut, Edit3, Save, Award, Shield } from 'lucide-react';
import { getStoredUser, getToken, clearToken, authUpdateProfile, authChangePassword } from '@/lib/api';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  theme: 'teacher' | 'student';
}

export default function ProfileModal({ open, onClose, theme }: ProfileModalProps) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // change password
  const [showPwdSection, setShowPwdSection] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  // theme styles
  const isTeacher = theme === 'teacher';
  const accentColor = isTeacher ? '#C0785C' : '#73C067';
  const bgColor = isTeacher ? '#FDFBF7' : '#FFFDF7';
  const borderColor = isTeacher ? 'rgba(192,120,92,0.2)' : 'rgba(115,192,103,0.2)';
  const inputBg = isTeacher ? '#F5F0E6' : 'rgba(255,255,255,0.9)';
  const inputBorder = isTeacher ? 'rgba(192,120,92,0.15)' : 'rgba(115,192,103,0.2)';

  useEffect(() => {
    if (open) {
      const u = getStoredUser();
      setUser(u);
      setNameInput(u?.name || '');
      setMsg('');
      setErrorMsg('');
      setEditingName(false);
      setShowPwdSection(false);
      setOldPwd('');
      setNewPwd('');
    }
  }, [open]);

  if (!open || !user) return null;

  const avatarText = (user.name || '?')[0];
  const roleLabel = user.role === 'teacher' ? '教师' : user.role === 'student' ? '学生' : user.role === 'admin' ? '管理员' : user.role;

  const handleSaveName = async () => {
    if (!nameInput.trim()) {
      setErrorMsg('姓名不能为空');
      return;
    }
    try {
      const token = getToken();
      if (!token) return;
      const data = await authUpdateProfile(token, nameInput.trim());
      // update localStorage
      const updated = { ...user, name: nameInput.trim() };
      localStorage.setItem('math-tutor-user', JSON.stringify(updated));
      setUser(updated);
      setEditingName(false);
      setMsg('姓名修改成功');
      setErrorMsg('');
      // refresh page to update header
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      setErrorMsg(e.message || '修改失败');
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) {
      setErrorMsg('请填写完整');
      return;
    }
    if (newPwd.length < 6) {
      setErrorMsg('新密码至少6位');
      return;
    }
    try {
      const token = getToken();
      if (!token) return;
      await authChangePassword(token, oldPwd, newPwd);
      setMsg('密码修改成功');
      setErrorMsg('');
      setOldPwd('');
      setNewPwd('');
      setShowPwdSection(false);
    } catch (e: any) {
      setErrorMsg(e.message || '修改失败');
    }
  };

  const handleLogout = () => {
    clearToken();
    router.push('/');
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{
          background: bgColor,
          border: `2px solid ${borderColor}`,
          fontFamily: isTeacher ? "'Noto Sans SC', system-ui, sans-serif" : "'Nunito', 'Noto Sans SC', system-ui, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-center gap-2 mb-1">
          <User size={18} style={{ color: accentColor }} />
          <h2 className="text-lg font-bold" style={{ color: '#3D3D3D' }}>
            个人中心 <span style={{ color: accentColor }}>- {user.name}</span>
          </h2>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5 transition-colors"
        >
          <X size={20} style={{ color: '#9CA3AF' }} />
        </button>

        {/* Avatar + Name */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold mb-3"
            style={{
              background: isTeacher
                ? 'linear-gradient(135deg, #EDEBE6, #D5CFC4)'
                : 'linear-gradient(135deg, #E8F5E4, #C8E6C0)',
              color: accentColor,
              border: `2.5px solid ${accentColor}40`,
            }}
          >
            {avatarText}
          </div>

          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="px-3 py-1.5 rounded-lg outline-none text-lg font-bold text-center"
                style={{ border: `2px solid ${accentColor}50`, background: inputBg, color: '#3D3D3D' }}
                autoFocus
              />
              <button onClick={handleSaveName} className="p-1.5 rounded-lg" style={{ background: `${accentColor}20` }}>
                <Save size={18} style={{ color: accentColor }} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold" style={{ color: '#3D3D3D' }}>{user.name}</span>
              <button
                onClick={() => setEditingName(true)}
                className="p-1 rounded-lg hover:bg-black/5 transition-colors"
              >
                <Edit3 size={14} style={{ color: '#9CA3AF' }} />
              </button>
            </div>
          )}

          {/* Role badge */}
          <span
            className="mt-1.5 px-3 py-0.5 rounded-full text-xs font-medium"
            style={{ background: `${accentColor}18`, color: accentColor }}
          >
            {roleLabel}
          </span>
        </div>

        {/* Info cards */}
        <div className="space-y-3 mb-5">
          {user.role === 'student' ? (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: inputBg, border: `1px solid ${inputBorder}` }}
            >
              <Hash size={18} style={{ color: '#9CA3AF' }} />
              <span className="text-sm" style={{ color: '#6B7280' }}>
                学号：<span className="font-mono font-bold" style={{ color: accentColor }}>{user.student_no || '未设置'}</span>
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: inputBg, border: `1px solid ${inputBorder}` }}
            >
              <Phone size={18} style={{ color: '#9CA3AF' }} />
              <span className="text-sm" style={{ color: '#6B7280' }}>{user.phone || '未设置'}</span>
            </div>
          )}

          {user.role === 'student' && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: inputBg, border: `1px solid ${inputBorder}` }}
            >
              <Award size={18} style={{ color: '#FFB86C' }} />
              <span className="text-sm" style={{ color: '#6B7280' }}>
                积分：<span className="font-bold" style={{ color: '#FFB86C' }}>{user.points ?? 0}</span>
              </span>
            </div>
          )}

          {user.role === 'teacher' && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: inputBg, border: `1px solid ${inputBorder}` }}
            >
              <Shield size={18} style={{ color: accentColor }} />
              <span className="text-sm" style={{ color: '#6B7280' }}>
                账号状态：<span className="font-bold" style={{ color: '#73C067' }}>正常</span>
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        {msg && (
          <div className="mb-3 px-4 py-2 rounded-lg text-sm text-center" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
            {msg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-3 px-4 py-2 rounded-lg text-sm text-center" style={{ background: '#FFEBEE', color: '#C62828' }}>
            {errorMsg}
          </div>
        )}

        {/* Change password section (teacher/admin only, students use student_no as password) */}
        {user.role !== 'student' && (
          showPwdSection ? (
          <div className="mb-4 p-4 rounded-xl space-y-3" style={{ background: inputBg, border: `1px solid ${inputBorder}` }}>
            <div className="text-sm font-medium" style={{ color: accentColor }}>修改密码</div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
              <input
                type={showOldPwd ? 'text' : 'password'}
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                placeholder="原密码"
                className="w-full pl-9 pr-9 py-2.5 rounded-lg outline-none text-sm"
                style={{ border: `1.5px solid ${inputBorder}`, background: '#fff', color: '#3D3D3D' }}
              />
              <button onClick={() => setShowOldPwd(!showOldPwd)} className="absolute right-3 top-1/2 -translate-y-1/2">
                {showOldPwd ? <EyeOff size={16} style={{ color: '#9CA3AF' }} /> : <Eye size={16} style={{ color: '#9CA3AF' }} />}
              </button>
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
              <input
                type={showNewPwd ? 'text' : 'password'}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="新密码（至少6位）"
                className="w-full pl-9 pr-9 py-2.5 rounded-lg outline-none text-sm"
                style={{ border: `1.5px solid ${inputBorder}`, background: '#fff', color: '#3D3D3D' }}
              />
              <button onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2">
                {showNewPwd ? <EyeOff size={16} style={{ color: '#9CA3AF' }} /> : <Eye size={16} style={{ color: '#9CA3AF' }} />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleChangePassword}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: accentColor }}
              >
                确认修改
              </button>
              <button
                onClick={() => { setShowPwdSection(false); setOldPwd(''); setNewPwd(''); setErrorMsg(''); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all hover:bg-black/5"
                style={{ border: `1.5px solid ${inputBorder}`, color: '#7A756D' }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowPwdSection(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium mb-3 transition-all hover:opacity-90"
            style={{ border: `1.5px solid ${borderColor}`, color: accentColor, background: 'transparent' }}
          >
            <Lock size={16} />
            修改密码
          </button>
        )
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
          style={{ background: '#FFEBEE', color: '#E53935' }}
        >
          <LogOut size={16} />
          退出登录
        </button>
      </div>
    </div>
  );
}
