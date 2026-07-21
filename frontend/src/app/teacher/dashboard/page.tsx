'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck, TrendingUp, AlertCircle, BookMarked,
  CheckCircle, FileText, AlertTriangle, MessageSquare,
  BookOpen, Sparkles, ChevronRight, Users, Gift, Swords, Archive, ShoppingBag,
} from 'lucide-react';
import { getStoredUser, fetchTeacherDashboard } from '@/lib/api';

interface ClassInfo {
  id: number;
  name: string;
  student_count: number;
  preview_rate: number;
  accuracy: number;
  accuracy_trend: number;
  class_code?: string;
}

interface Activity {
  type: string;
  icon: string;
  text: string;
  time: string;
}

interface ErrorWarning {
  unit: string;
  count: number;
}

const iconMap: Record<string, any> = {
  BookOpen, CheckCircle, AlertTriangle, FileText, ClipboardCheck, MessageSquare,
};

export default function TeacherDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    class_count: number;
    student_count: number;
    question_count: number;
    pending_count: number;
    pending_redemptions: number;
    error_total: number;
    error_week: number;
    challenge_total: number;
    challenge_completed: number;
    homework_week: number;
    homework_correct: number;
    layer_stats: Record<string, number>;
    classes: ClassInfo[];
    error_warnings: ErrorWarning[];
    recent_activities: Activity[];
  } | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (u) {
      setUser(u);
      loadDashboard(u.id);
    } else {
      setLoading(false);
    }
  }, []);

  const loadDashboard = async (teacherId: number) => {
    try {
      const d = await fetchTeacherDashboard(teacherId);
      setData(d);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin w-8 h-8 mx-auto mb-4 rounded-full border-2 border-[#C0785C] border-t-transparent" />
        <p className="text-sm" style={{ color: '#7A756D' }}>加载工作台数据...</p>
      </div>
    );
  }

  const classList = data?.classes || [];
  const layerBasic = data?.layer_stats?.basic || 0;
  const layerAdvanced = data?.layer_stats?.advanced || 0;
  const layerExtension = data?.layer_stats?.extension || 0;

  return (
    <div className="relative">
      {/* 问候语 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#5C6170', fontFamily: 'var(--font-caveat), cursive' }}>
          {getGreeting()}，{user?.name || '老师'}
          <span className="text-sm ml-2 font-normal" style={{ color: '#7A756D', fontFamily: 'system-ui' }}>
            — 今天也要元气满满地教学哦 ✨
          </span>
        </h1>
      </div>

      {/* Stats - 4 sticky notes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 mb-8">
        <StatCard
          icon={ClipboardCheck}
          label="待处理"
          value={String(data?.pending_count || 0)}
          sub="预习答题+作业提交"
          bg="#FFF8DC"
          iconColor="#B8860B"
          textColor="#8B7530"
          valueColor="#5C5020"
          subColor="#A09050"
          tapeColor="rgba(255,200,120,0.45)"
          rotate="-0.8deg"
          radius="2px 2px 12px 2px"
        />
        <StatCard
          icon={Users}
          label="我的学生"
          value={String(data?.student_count || 0)}
          sub={`${data?.class_count || 0} 个班级`}
          bg="#E8F4FD"
          iconColor="#4682B4"
          textColor="#4682B4"
          valueColor="#2C5F8A"
          subColor="#6BA3CC"
          tapeColor="rgba(120,180,220,0.4)"
          rotate="0.5deg"
          radius="12px 2px 2px 2px"
        />
        <StatCard
          icon={AlertCircle}
          label="本周错题"
          value={String(data?.error_week || 0)}
          sub={`累计 ${data?.error_total || 0} 道`}
          bg="#FDE8E8"
          iconColor="#CD5C5C"
          textColor="#CD5C5C"
          valueColor="#8B3A3A"
          subColor="#C08080"
          tapeColor="rgba(220,140,140,0.4)"
          rotate="-0.3deg"
          radius="2px 12px 2px 2px"
        />
        <StatCard
          icon={BookMarked}
          label="题库总数"
          value={String(data?.question_count || 0)}
          sub="道分层练习题"
          bg="#E8F5E9"
          iconColor="#6B8F71"
          textColor="#4A7A52"
          valueColor="#2E5E3A"
          subColor="#7AAF82"
          tapeColor="rgba(120,180,120,0.4)"
          rotate="0.6deg"
          radius="2px 2px 2px 12px"
        />
      </div>

      {/* 本周学情快报 */}
      <div className="mb-8">
        <div className="relative inline-block mb-5">
          <h2 className="text-2xl font-bold" style={{ color: '#5C6170', fontFamily: 'var(--font-caveat), cursive' }}>本周学情快报</h2>
          <div className="absolute -bottom-1 left-0 w-full h-2 rounded-sm" style={{ background: 'rgba(180,200,230,0.4)', transform: 'rotate(-0.5deg)' }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniStat icon={ClipboardCheck} label="复习作业" value={data?.homework_week || 0} sub={`本周正确 ${data?.homework_correct || 0} 题`} color="#C0785C" bg="#FFF5F0" href="/teacher/grading" />
          <MiniStat icon={Swords} label="创意闯关" value={data?.challenge_total || 0} sub={`已完成 ${data?.challenge_completed || 0} 次`} color="#9C7BB8" bg="#F5F0FA" href="/student/challenge" />
          <MiniStat icon={Gift} label="待发货兑换" value={data?.pending_redemptions || 0} sub="学生商城兑换待处理" color="#D4A843" bg="#FFFBF0" href="/teacher/store" />
          <MiniStat icon={Users} label="分层分布" value={`${layerBasic}/${layerAdvanced}/${layerExtension}`} sub="基础/提升/拓展" color="#6B8F71" bg="#F0FFF4" href="/teacher/analytics" />
        </div>
      </div>

      {/* 快速操作 */}
      <div className="mb-8">
        <div className="flex flex-wrap gap-3 mb-4">
          {[
            { href: '/teacher/lesson', icon: Sparkles, label: 'AI 智能备课', desc: '生成分层教学资源', color: '#C0785C', bg: '#FFF5F0' },
            { href: '/teacher/grading', icon: ClipboardCheck, label: '查预习答题', desc: '查看学生预习情况', color: '#6B8F71', bg: '#F0FFF4' },
            { href: '/teacher/analytics', icon: TrendingUp, label: '学情分析', desc: '班级成绩报告', color: '#5C6B8A', bg: '#F0F4FF' },
            { href: '/teacher/resource-library', icon: Archive, label: '资源库', desc: '管理历年真题文件', color: '#8B7355', bg: '#F5F0E8' },
            { href: '/teacher/store', icon: ShoppingBag, label: '积分商城', desc: '管理奖品与兑换', color: '#D4A843', bg: '#FFFBF0' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="paper-card-sm px-5 py-3 flex items-center gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md group"
              style={{ background: action.bg, boxShadow: '1.5px 2px 0px rgba(60,60,60,0.06)' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.7)' }}
              >
                <action.icon className="w-4 h-4" style={{ color: action.color }} />
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: action.color }}>{action.label}</div>
                <div className="text-xs" style={{ color: '#7A756D' }}>{action.desc}</div>
              </div>
              <ChevronRight className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: action.color }} />
            </Link>
          ))}
        </div>
      </div>

      {/* 班级概览 */}
      {classList.length > 0 && (
        <div className="mb-8">
          <div className="relative inline-block mb-5">
            <h2 className="text-2xl font-bold" style={{ color: '#5C6170', fontFamily: 'var(--font-caveat), cursive' }}>班级概览</h2>
            <div className="absolute -bottom-1 left-0 w-full h-2 rounded-sm" style={{ background: 'rgba(255,180,120,0.35)', transform: 'rotate(-1deg)' }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {classList.map((cls, i) => (
              <Link
                key={cls.id}
                href={`/teacher/management?classId=${cls.id}`}
                className="paper-card p-5 transition-all hover:-translate-y-1 hover:shadow-md block"
                style={{ transform: `rotate(${i % 2 === 0 ? '-0.3deg' : '0.3deg'})` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold" style={{ color: '#5C6170', fontFamily: 'var(--font-caveat), cursive' }}>
                    {cls.name}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-sm" style={{ backgroundColor: '#EBF2EC', color: '#6B8F71' }}>
                    {cls.student_count}人
                  </span>
                </div>

                {/* 学习进度 */}
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs" style={{ color: '#7A756D' }}>预习完成率</span>
                    <span className="text-xs font-medium" style={{ color: '#5C6170' }}>{cls.preview_rate}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: '#E6E0D4' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${cls.preview_rate}%`,
                        background: 'linear-gradient(90deg, #6B8F71, #8FB996)',
                        borderRadius: '255px 8px 200px 8px/8px 200px 8px 255px',
                      }}
                    />
                  </div>
                </div>

                {/* 正确率 */}
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs" style={{ color: '#7A756D' }}>本周正确率</span>
                    <span className="text-xs font-medium" style={{ color: '#5C6170' }}>{cls.accuracy}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: '#E6E0D4' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${cls.accuracy}%`,
                        background: 'linear-gradient(90deg, #C0785C, #D4967E)',
                        borderRadius: '15px 200px 15px 255px/255px 15px 200px 15px',
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px dashed #D6D0C6' }}>
                  <span className="text-xs" style={{ color: '#7A756D' }}>
                    上周正确率 {cls.accuracy_trend?.toFixed(1)}%
                  </span>
                  <span className="text-xs" style={{ color: cls.accuracy > cls.accuracy_trend ? '#6B8F71' : '#C0785C' }}>
                    {cls.accuracy > cls.accuracy_trend ? `↑ ${(cls.accuracy - cls.accuracy_trend).toFixed(1)}` :
                     cls.accuracy < cls.accuracy_trend ? `↓ ${(cls.accuracy_trend - cls.accuracy).toFixed(1)}` : '持平'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 最近动态 */}
      <div className="mb-8">
        <div className="relative inline-block mb-6">
          <h2 className="text-2xl font-bold" style={{ color: '#5C6170', fontFamily: 'var(--font-caveat), cursive' }}>最近动态</h2>
          <div className="absolute -bottom-1 left-0 w-full h-2 rounded-sm" style={{ background: 'rgba(180,210,180,0.4)', transform: 'rotate(0.5deg)' }} />
        </div>

        {data?.recent_activities?.length ? (
          <div className="relative pl-8">
            <div className="absolute left-3 top-2 bottom-2" style={{ borderLeft: '2px dashed #D6D0C6' }} />
            {data.recent_activities.map((item, i) => {
              const Icon = iconMap[item.icon] || FileText;
              const colors: Record<string, string> = {
                preview: '#C0785C',
                submission: '#6B8F71',
                warning: '#CD5C5C',
                teach: '#4682B4',
              };
              const bgs: Record<string, string> = {
                preview: '#FFFBF0',
                submission: '#F0FFF4',
                warning: '#FFF5F5',
                teach: '#F0F8FF',
              };
              const color = colors[item.type] || '#C0785C';
              const bg = bgs[item.type] || '#FFFBF0';
              return (
                <div key={i} className="relative mb-5">
                  <div
                    className="absolute -left-5 top-1.5 w-4 h-4 rounded-full"
                    style={{ backgroundColor: color, border: '2px solid #FDFBF7', boxShadow: `0 0 0 2px ${color}40` }}
                  />
                  <div className="paper-card-sm p-3 ml-2" style={{ backgroundColor: bg, transform: `rotate(${i % 2 === 0 ? '-0.2deg' : '0.3deg'})` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                      <span className="text-sm font-medium" style={{ color: '#3D3D3D' }}>{item.text}</span>
                    </div>
                    <span className="text-xs" style={{ color: '#7A756D' }}>{item.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8" style={{ color: '#7A756D' }}>
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无最近动态，快去备一堂课吧！</p>
          </div>
        )}
      </div>

      {/* 错题预警 */}
      {data?.error_warnings?.length ? (
        <div className="mb-8" style={{
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(255,245,245,0.9), rgba(255,232,214,0.7))',
          border: '1.5px dashed rgba(205,92,92,0.3)',
          padding: '16px 20px',
        }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" style={{ color: '#CD5C5C' }} />
            <span className="text-sm font-bold" style={{ color: '#8B3A3A' }}>错题预警</span>
            <span className="text-xs" style={{ color: '#C08080' }}>最近7天高频错误知识点</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.error_warnings.map((w, i) => (
              <span
                key={i}
                className="text-xs px-3 py-1 rounded-full"
                style={{ background: 'rgba(205,92,92,0.1)', color: '#8B3A3A', border: '1px solid rgba(205,92,92,0.2)' }}
              >
                {w.unit} — {w.count}道错题
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 底部装饰 */}
      <div className="flex items-center justify-center gap-3 py-4 opacity-20">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="#B8B0A4" strokeWidth="1.2" strokeDasharray="2 2"/>
        </svg>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 3 L14 9 L20 9 L15 13 L17 19 L12 15 L7 19 L9 13 L4 9 L10 9 Z" stroke="#C0785C" strokeWidth="1" fill="none"/>
        </svg>
        <svg width="30" height="12" viewBox="0 0 30 12" fill="none">
          <path d="M2 6 Q8 2 15 6 Q22 10 28 6" stroke="#6B8F71" strokeWidth="1.2" fill="none"/>
        </svg>
        <span style={{ fontSize: '12px', color: '#B8B0A4' }}>数学智教 · AI 教学帮手</span>
      </div>
    </div>
  );
}

// ===== 子组件 =====

function MiniStat({ icon: Icon, label, value, sub, color, bg, href }: {
  icon: any; label: string; value: any; sub: string; color: string; bg: string; href: string;
}) {
  return (
    <Link href={href} className="paper-card-sm p-4 transition-all hover:-translate-y-0.5 hover:shadow-md block" style={{ backgroundColor: bg, boxShadow: '1.5px 2px 0px rgba(60,60,60,0.06)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs" style={{ color: '#7A756D' }}>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color, fontFamily: 'var(--font-caveat), cursive' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: '#7A756D' }}>{sub}</div>
    </Link>
  );
}

function StatCard({ icon: Icon, label, value, sub, bg, iconColor, textColor, valueColor, subColor, tapeColor, rotate, radius }: {
  icon: any; label: string; value: string; sub: string;
  bg: string; iconColor: string; textColor: string; valueColor: string; subColor: string;
  tapeColor: string; rotate: string; radius: string;
}) {
  return (
    <div
      className="paper-card p-4 cursor-pointer transition-transform hover:scale-105 relative"
      style={{
        backgroundColor: bg,
        transform: `rotate(${rotate})`,
        boxShadow: '2px 3px 0px rgba(60,60,60,0.08)',
        borderRadius: radius,
      }}
    >
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 rounded-sm" style={{ background: tapeColor, transform: `rotate(${rotate})` }} />
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
        <span className="text-xs" style={{ color: textColor }}>{label}</span>
      </div>
      <div className="text-3xl md:text-4xl font-bold" style={{ color: valueColor, fontFamily: 'var(--font-caveat), cursive' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: subColor }}>{sub}</div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}