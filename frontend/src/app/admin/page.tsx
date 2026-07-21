'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, LogOut, Home, Check, X, Clock, UserCheck, Users } from 'lucide-react';
import { authGetPending, authGetTeachers, authApprove, authReject, getToken, clearToken, getStoredUser } from '@/lib/api';

interface PendingUser {
  id: number;
  name: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [teachers, setTeachers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    setMounted(true);
    const user = getStoredUser();
    const token = getToken();
    if (!token || user?.role !== 'admin') {
      router.push('/');
      return;
    }
    loadData();
  }, [router]);

  const loadData = async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [pendingData, teachersData] = await Promise.all([
        authGetPending(token),
        authGetTeachers(token),
      ]);
      setPending(pendingData.pending_list || []);
      setTeachers(teachersData.teachers || []);
    } catch (err: any) {
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: number) => {
    const token = getToken();
    if (!token) return;
    try {
      await authApprove(token, userId);
      setActionMsg(`已通过教师审核 (ID: ${userId})`);
      setTimeout(() => setActionMsg(''), 3000);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReject = async (userId: number) => {
    const token = getToken();
    if (!token) return;
    try {
      await authReject(token, userId);
      setActionMsg(`已驳回教师注册 (ID: ${userId})`);
      setTimeout(() => setActionMsg(''), 3000);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    clearToken();
    router.push('/');
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen" style={{ background: '#F8F8FF' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-lg" style={{ background: 'rgba(255,255,255,0.85)', borderBottom: '1px solid #E0E7FF' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}>
              <Shield size={20} color="white" />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: '#312E81' }}>管理后台</h1>
              <p className="text-xs" style={{ color: '#9CA3AF' }}>教师注册审核系统</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { clearToken(); localStorage.removeItem('math-tutor-user'); router.push('/'); }}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-all hover:opacity-70"
              style={{ color: '#6366F1', background: '#EEF2FF' }}
            >
              <Home size={16} />
              <span>首页</span>
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-all hover:opacity-70"
              style={{ color: '#EF4444', background: '#FEF2F2' }}
            >
              <LogOut size={16} />
              <span>退出</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 p-4 rounded-xl" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        {actionMsg && (
          <div className="mb-4 p-4 rounded-xl" style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}>
            {actionMsg}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-5 rounded-2xl" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
            <div className="flex items-center gap-2 mb-2">
              <Clock size={18} style={{ color: '#F59E0B' }} />
              <span className="text-sm" style={{ color: '#6B7280' }}>待审核</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: '#F59E0B' }}>{pending.length}</p>
          </div>
          <div className="p-5 rounded-2xl" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
            <div className="flex items-center gap-2 mb-2">
              <UserCheck size={18} style={{ color: '#10B981' }} />
              <span className="text-sm" style={{ color: '#6B7280' }}>已通过教师</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: '#10B981' }}>
              {teachers.filter(t => t.status === 'approved').length}
            </p>
          </div>
          <div className="p-5 rounded-2xl" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} style={{ color: '#6366F1' }} />
              <span className="text-sm" style={{ color: '#6B7280' }}>教师总数</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: '#6366F1' }}>{teachers.length}</p>
          </div>
        </div>

        {/* Pending Section */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#312E81' }}>
            <Clock size={20} style={{ color: '#F59E0B' }} />
            待审核教师
          </h2>

          {loading ? (
            <div className="p-8 text-center rounded-2xl" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
              <p style={{ color: '#9CA3AF' }}>加载中...</p>
            </div>
          ) : pending.length === 0 ? (
            <div className="p-8 text-center rounded-2xl" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
              <p style={{ color: '#9CA3AF' }}>暂无待审核教师</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((user) => (
                <div key={user.id} className="p-5 rounded-2xl flex items-center justify-between" style={{ background: 'white', border: '1px solid #FCD34D' }}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#FEF3C7' }}>
                      <span className="text-xl">👤</span>
                    </div>
                    <div>
                      <p className="font-bold" style={{ color: '#1F2937' }}>{user.name}</p>
                      <p className="text-sm" style={{ color: '#6B7280' }}>{user.phone}</p>
                      <p className="text-xs" style={{ color: '#9CA3AF' }}>申请时间：{user.created_at}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(user.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all hover:scale-105"
                      style={{ background: '#10B981', color: 'white' }}
                    >
                      <Check size={16} />
                      通过
                    </button>
                    <button
                      onClick={() => handleReject(user.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all hover:scale-105"
                      style={{ background: '#EF4444', color: 'white' }}
                    >
                      <X size={16} />
                      驳回
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* All Teachers Section */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#312E81' }}>
            <Users size={20} style={{ color: '#6366F1' }} />
            全部教师
          </h2>

          {loading ? (
            <div className="p-8 text-center rounded-2xl" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
              <p style={{ color: '#9CA3AF' }}>加载中...</p>
            </div>
          ) : teachers.length === 0 ? (
            <div className="p-8 text-center rounded-2xl" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
              <p style={{ color: '#9CA3AF' }}>暂无教师</p>
            </div>
          ) : (
            <div className="space-y-2">
              {teachers.map((user) => (
                <div key={user.id} className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                      <span className="text-lg">📖</span>
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: '#1F2937' }}>{user.name}</p>
                      <p className="text-xs" style={{ color: '#9CA3AF' }}>{user.phone}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      background: user.status === 'approved' ? '#D1FAE5' : user.status === 'pending' ? '#FEF3C7' : '#FEE2E2',
                      color: user.status === 'approved' ? '#059669' : user.status === 'pending' ? '#D97706' : '#DC2626',
                    }}
                  >
                    {user.status === 'approved' ? '已通过' : user.status === 'pending' ? '待审核' : user.status === 'rejected' ? '已驳回' : user.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
