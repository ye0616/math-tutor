'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Home, Trophy, Sparkles, ArrowRight, ListChecks, PawPrint,
  Stethoscope, Map, TrendingUp, Star, Heart, Calendar,
  Award, BookOpen, CheckCircle2, RefreshCw, AlertCircle,
  Crown, Flame, Video, Lock, Lightbulb, XCircle,
} from 'lucide-react';
import { getStoredUser, fetchStudentDashboard, getToken, getTodayFact, submitFactRead, type DailyFact } from '@/lib/api';

interface VenueInfo {
  id: number;
  emoji: string;
  name: string;
  tag: string;
  status: string;
  progress: string;
  accuracy: number;
  total: number;
}

const diffConfig = [
  { key: 'basic', label: '基础', icon: Star, color: '#73C067', bg: 'rgba(232, 245, 228, 0.85)' },
  { key: 'advanced', label: '提升', icon: Flame, color: '#FFB86C', bg: 'rgba(255, 240, 219, 0.85)' },
  { key: 'extension', label: '拓展', icon: Crown, color: '#9C7BB8', bg: 'rgba(243, 232, 249, 0.85)' },
];

export default function StudentHome() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dashData, setDashData] = useState<any>(null);

  // Daily fact state
  const [todayFact, setTodayFact] = useState<DailyFact | null>(null);
  const [factSubmitting, setFactSubmitting] = useState(false);
  const [factResult, setFactResult] = useState<{ is_correct: boolean; points_earned: number; explanation?: string } | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [showFunFact, setShowFunFact] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (u) {
      setUser(u);
      loadData(u.id);
      loadDailyFact();
    } else {
      setLoading(false);
    }
  }, []);

  const loadData = async (studentId: number) => {
    try {
      const d = await fetchStudentDashboard(studentId);
      setDashData(d);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadDailyFact = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await getTodayFact(token);
      setTodayFact(res.data);
      if (res.data?.has_read) {
        setFactResult({ is_correct: res.data.answered_correctly === 1, points_earned: 0 });
      }
    } catch (e) {
      console.error('Daily fact load error:', e);
    }
  };

  const handleFactSubmit = () => {
    if (!selectedAnswer || !todayFact) return;
    const token = getToken();
    if (!token) return;
    setFactSubmitting(true);
    submitFactRead(token, todayFact.id, selectedAnswer).then(res => {
      setFactResult({
        is_correct: res.data.is_correct,
        points_earned: res.data.points_earned,
        explanation: res.data.explanation,
      });
    }).catch(err => console.error('Failed to submit fact:', err))
      .finally(() => setFactSubmitting(false));
  };

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin w-8 h-8 mx-auto mb-4 rounded-full border-2 border-[#73C067] border-t-transparent" />
        <p className="text-sm" style={{ color: '#8B7355' }}>加载我的动物园...</p>
      </div>
    );
  }

  const venues: VenueInfo[] = dashData?.venues || [];
  const unresolvedErrors = dashData?.unresolved_errors || 0;
  const totalPoints = dashData?.total_points || 0;
  const rank = dashData?.rank || 0;
  const totalStudents = dashData?.total_students || 0;
  const lastWeekRank = dashData?.last_week_rank || rank;
  const unlockedVenues = dashData?.unlocked_venues || 0;
  const completedVenues = dashData?.completed_venues || 0;
  const previewTasks = dashData?.preview_tasks || 0;
  const accuracy = dashData?.accuracy || 0;
  const dailyTasks = dashData?.daily_tasks || { total: 0, completed: 0, items: [] };

  const rankDiff = lastWeekRank - rank;
  const rankText = rankDiff > 0 ? `↑ 上升 ${rankDiff} 名` : rankDiff < 0 ? `↓ 下降 ${Math.abs(rankDiff)} 名` : '持平';

  return (
    <div className="space-y-6">
      {/* ============= Hero 欢迎横幅 ============= */}
      <section
        className="glass-card-solid relative overflow-hidden p-8 md:p-10"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(232, 245, 228, 0.85) 50%, rgba(255, 240, 219, 0.85) 100%)',
        }}
      >
        <div className="flex justify-center items-start gap-0 mb-4 -mt-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="bunting-flag" style={{ background: ['#73C067', '#95D8F0', '#FFB86C'][i % 3] }} />
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3" style={{ background: 'rgba(115, 192, 103, 0.18)', color: '#2D5A27' }}>
              <Sparkles className="w-3.5 h-3.5" />
              今日小饲养员已上线
            </div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight" style={{ color: '#4A3728' }}>
              欢迎来到<span style={{ color: '#73C067' }}> 数学动物园</span>
            </h1>
            <p className="text-base md:text-lg mt-3" style={{ color: '#8B7355' }}>
              今天用数学帮助小动物们吧 ✨
            </p>
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <Link
                href={dailyTasks.items.find((i: any) => !i.completed)?.link || '/student/preview'}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)', boxShadow: '0 6px 20px rgba(115, 192, 103, 0.4)' }}
              >
                {dailyTasks.items.some((i: any) => !i.completed) ? '开始今日任务' : '开始今天的学习'}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <span className="text-sm" style={{ color: '#8B7355' }}>
                已完成 <strong style={{ color: '#73C067' }}>{dailyTasks.completed}/{dailyTasks.total}</strong> 个任务
              </span>
            </div>

            {/* 真实任务列表 */}
            {dailyTasks.items.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {dailyTasks.items.map((task: any) => (
                  <Link
                    key={task.key}
                    href={task.link}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors hover:bg-white/40"
                    style={{ background: 'rgba(255, 255, 255, 0.35)' }}
                  >
                    <div className="flex items-center gap-2">
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4" style={{ color: '#73C067' }} />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: '#FFB86C' }} />
                      )}
                      <span style={{ color: task.completed ? '#8B7355' : '#4A3728' }}>
                        {task.title}
                      </span>
                      <span className="text-xs truncate max-w-[140px]" style={{ color: '#8B7355' }}>{task.desc}</span>
                    </div>
                    <span className="text-xs font-bold shrink-0" style={{ color: '#FFB86C' }}>{task.badge}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-end gap-3 text-6xl md:text-7xl select-none shrink-0">
            <span className="animal-bounce">🐘</span>
            <span className="animal-bounce-delay">🦒</span>
            <span className="animal-bounce-delay2">🐵</span>
          </div>
        </div>
      </section>

      {/* ============= 4 功能卡片 ============= */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#4A3728' }}>我的动物园</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(115, 192, 103, 0.15)', color: '#2D5A27' }}>4 个快捷入口</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            icon={ListChecks}
            title="今日饲养任务"
            sub={`${dailyTasks.completed}/${dailyTasks.total} 个任务待完成`}
            bg="rgba(224, 242, 250, 0.6)"
            href={dailyTasks.items.find((i: any) => !i.completed)?.link || '/student/preview'}
            active={dailyTasks.completed < dailyTasks.total}
          />
          <FeatureCard
            icon={Trophy}
            title="动物场馆闯关"
            sub={`已解锁 ${unlockedVenues}/8 场馆`}
            bg="rgba(255, 240, 219, 0.6)"
            href="/student/practice"
            active={unlockedVenues < 8}
          />
          <FeatureCard
            icon={Stethoscope}
            title="错题救助站"
            sub={`${unresolvedErrors} 道错题待复习`}
            bg="rgba(255, 232, 214, 0.6)"
            href="/student/errors"
            active={unresolvedErrors > 0}
          />
          <FeatureCard
            icon={Map}
            title="饲养员图鉴"
            sub={`积分 ${totalPoints} · 排名 ${rank}`}
            bg="rgba(232, 245, 228, 0.6)"
            href="/student/achievements"
            active={false}
          />
        </div>
      </section>

      {/* ============= 每日科普 ============= */}
      {todayFact && (
        <section>
          <DailyFactSection
            fact={todayFact}
            selectedAnswer={selectedAnswer}
            setSelectedAnswer={setSelectedAnswer}
            submitting={factSubmitting}
            onSubmit={handleFactSubmit}
            result={factResult}
            showFunFact={showFunFact}
            setShowFunFact={setShowFunFact}
          />
        </section>
      )}

      {/* ============= 场馆 + 学情面板 ============= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 场馆 */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
                <Trophy className="w-5 h-5" style={{ color: '#FFB86C' }} />
                动物闯关场馆
              </h2>
              <span className="text-xs" style={{ color: '#8B7355' }}>共 8 个场馆 · 已解锁 {unlockedVenues}</span>
            </div>
            <Link href="/student/practice" className="text-sm font-medium hover:underline inline-flex items-center gap-1" style={{ color: '#73C067' }}>
              查看全部 <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {venues.map((venue) => (
              <Link
                key={venue.id}
                href={`/student/practice?venue=${venue.tag}`}
                className="glass-card flex flex-col items-center gap-1.5 p-4 hover:scale-[1.03] transition-transform"
                style={{ opacity: venue.status === 'locked' ? 0.6 : 1 }}
              >
                <span className="text-4xl">{venue.emoji}</span>
                <span className="text-sm font-semibold text-center" style={{ color: venue.status === 'locked' ? '#8B7355' : '#4A3728' }}>{venue.name}</span>
                {venue.status === 'done' && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(232, 245, 228, 0.85)', color: '#2D5A27' }}>
                    <CheckCircle2 className="w-3 h-3 inline" /> 已通关
                  </span>
                )}
                {venue.status === 'current' && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255, 240, 219, 0.85)', color: '#8B5A1B' }}>
                    📍 进行中 {venue.progress}
                  </span>
                )}
                {venue.status === 'locked' && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(200,200,200,0.3)', color: '#8B7355' }}>
                    <Lock className="w-3 h-3 inline" /> 未解锁
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>

        {/* 右侧面板 */}
        <aside className="space-y-4">
          {/* 学情卡片 */}
          <div className="glass-card p-5" style={{ background: 'rgba(255, 240, 219, 0.7)' }}>
            <h3 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: '#4A3728' }}>
              <TrendingUp className="w-4 h-4" style={{ color: '#FFB86C' }} />
              学情情况
            </h3>

            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-4 h-4" style={{ color: '#FF8A8A' }} />
                <span className="text-sm font-medium" style={{ color: '#8B7355' }}>答题正确率</span>
                <span className="text-lg font-bold ml-auto" style={{ color: '#4A3728' }}>{accuracy}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
                <div className="h-full rounded-full progress-animated" style={{ width: `${accuracy}%`, background: 'linear-gradient(90deg, #73C067, #5CAF50)' }} />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4" style={{ color: '#FFB86C' }} />
                <span className="text-sm font-medium" style={{ color: '#8B7355' }}>已解锁场馆</span>
                <span className="text-lg font-bold ml-auto" style={{ color: '#FFB86C' }}>{unlockedVenues}/8</span>
              </div>
              <div className="flex items-center gap-1.5">
                {venues.map((v, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                    style={{
                      background: v.status !== 'locked' ? '#73C067' : 'rgba(255, 255, 255, 0.5)',
                      color: v.status !== 'locked' ? 'white' : '#8B7355',
                    }}
                  >
                    {v.emoji}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-4 h-4" style={{ color: '#95D8F0' }} />
                <span className="text-sm font-medium" style={{ color: '#8B7355' }}>班级排名</span>
                <span className="text-lg font-bold ml-auto" style={{ color: '#4A3728' }}>第 {rank} 名</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.55)' }}>
                <span className="text-xs" style={{ color: '#8B7355' }}>比上周</span>
                <span className="text-xs font-bold" style={{ color: rankDiff > 0 ? '#73C067' : rankDiff < 0 ? '#FF8A8A' : '#8B7355' }}>
                  {rankText}
                </span>
                {rankDiff > 0 && <span className="text-xs" style={{ color: '#8B7355' }}>继续加油！</span>}
              </div>
            </div>
          </div>

          {/* 今日推荐 */}
          <div className="glass-card p-4" style={{ background: 'linear-gradient(135deg, rgba(232, 245, 228, 0.85), rgba(200, 230, 192, 0.7))' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.8)' }}>
                <Calendar className="w-4 h-4" style={{ color: '#2D5A27' }} />
              </div>
              <span className="text-sm font-bold" style={{ color: '#2D5A27' }}>今日推荐</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: '#4A3728' }}>
              {unresolvedErrors > 0
                ? `你有 ${unresolvedErrors} 道错题需要救助，快去错题救助站帮小动物恢复健康吧！完成可获得 🎉`
                : unlockedVenues < 8
                ? `继续闯关解锁新场馆，完成可获得 🎉`
                : '你已经解锁了所有场馆，太厉害了！试试挑战拓展难度吧 🎉'
              }
              <span style={{ color: '#FFB86C', fontWeight: 'bold' }}> 20 爱心饲料币</span>
            </p>
          </div>

          {/* 积分卡片 */}
          <div className="glass-card p-4" style={{ background: 'linear-gradient(135deg, rgba(224, 242, 250, 0.85), rgba(149, 216, 240, 0.4))' }}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold" style={{ color: '#2A6F97' }}>爱心饲料币</span>
                <div className="text-2xl font-black" style={{ color: '#FFB86C' }}>
                  ❤️ {totalPoints}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs" style={{ color: '#7A756D' }}>排名 #{rank}/{totalStudents}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, sub, bg, href, active }: {
  icon: any; title: string; sub: string; bg: string; href: string; active: boolean;
}) {
  return (
    <Link href={href} className="glass-card flex items-center justify-between p-4 transition-all hover:scale-[1.02]" style={{ background: bg }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
          <Icon className="w-5 h-5" style={{ color: '#2D5A27' }} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold truncate" style={{ color: '#4A3728' }}>{title}</div>
          <div className="text-xs mt-0.5 truncate" style={{ color: active ? '#FF8A8A' : '#8B7355' }}>{sub}</div>
        </div>
      </div>
      {active && (
        <div className="shrink-0 w-3 h-3 rounded-full" style={{ background: '#FF8A8A', boxShadow: '0 0 4px rgba(255,138,138,0.5)' }} />
      )}
    </Link>
  );
}

function DailyFactSection({ fact, selectedAnswer, setSelectedAnswer, submitting, onSubmit, result, showFunFact, setShowFunFact }: {
  fact: DailyFact;
  selectedAnswer: string;
  setSelectedAnswer: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  result: { is_correct: boolean; points_earned: number; explanation?: string } | null;
  showFunFact: boolean;
  setShowFunFact: (v: boolean) => void;
}) {
  const categoryColors: Record<string, string> = {
    '数学趣闻': '#73C067',
    '科学常识': '#5BA7E0',
    '生活数学': '#F0A04B',
    '数学家故事': '#B88AE5',
    '趣味几何': '#E57A9E',
    '数字奥秘': '#4ECDC4',
  };
  const catColor = categoryColors[fact.category] || '#73C067';

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
          <BookOpen className="w-5 h-5" style={{ color: catColor }} />
          每日科普小知识
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full text-white font-bold" style={{ background: catColor }}>
          {fact.category}
        </span>
        <span className="text-xs ml-auto" style={{ color: '#8B7355' }}>{fact.fact_date}</span>
      </div>

      {/* Fact Content Card */}
      <div
        className="rounded-3xl p-6 shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${catColor}12, ${catColor}05)`,
          border: `2px solid ${catColor}25`,
        }}
      >
        <h3 className="text-xl font-bold mb-3" style={{ color: '#4A3728' }}>
          <Sparkles className="inline w-5 h-5 mr-1" style={{ color: catColor }} />
          {fact.title}
        </h3>
        <p className="text-base leading-relaxed mb-4" style={{ color: '#5A4632' }}>
          {fact.content}
        </p>

        {/* Fun Fact Toggle */}
        {fact.fun_fact && (
          <div
            className="rounded-2xl p-4 cursor-pointer transition-all"
            style={{ background: 'rgba(255, 240, 219, 0.5)', border: '1px dashed rgba(255, 184, 108, 0.35)' }}
            onClick={() => setShowFunFact(!showFunFact)}
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" style={{ color: '#F0A04B' }} />
              <span className="text-sm font-bold" style={{ color: '#8B6535' }}>
                {showFunFact ? '收起趣味拓展' : '点击查看趣味拓展 →'}
              </span>
            </div>
            {showFunFact && (
              <p className="text-sm mt-2" style={{ color: '#8B6535' }}>{fact.fun_fact}</p>
            )}
          </div>
        )}
      </div>

      {/* Interactive Question */}
      {!fact.has_read && !result && (
        <div className="rounded-3xl p-6 shadow-md" style={{ background: 'white', border: `2px solid ${catColor}20` }}>
          <h4 className="text-base font-bold mb-3" style={{ color: '#4A3728' }}>
            <CheckCircle2 className="inline w-5 h-5 mr-1" style={{ color: catColor }} />
            互动小问答
          </h4>
          <p className="text-sm mb-4" style={{ color: '#5A4632' }}>{fact.question}</p>
          <div className="grid grid-cols-1 gap-2 mb-4">
            {fact.options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isSelected = selectedAnswer === letter;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedAnswer(letter)}
                  className="text-left px-4 py-3 rounded-xl text-sm transition-all"
                  style={isSelected
                    ? { background: catColor, color: 'white', fontWeight: 700, border: `2px solid ${catColor}` }
                    : { background: '#F8F9FA', color: '#5A4632', border: '2px solid transparent' }}
                >
                  <span className="font-bold mr-2">{letter}.</span> {opt.replace(/^[A-D]:\s*/, '')}
                </button>
              );
            })}
          </div>
          <button
            onClick={onSubmit}
            disabled={!selectedAnswer || submitting}
            className="w-full py-3 rounded-xl font-bold text-white transition-all disabled:opacity-50"
            style={{ background: selectedAnswer ? `linear-gradient(135deg, ${catColor}, ${catColor}dd)` : '#ccc' }}
          >
            {submitting ? '提交中...' : '提交答案 +0.1分'}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className="rounded-3xl p-5 shadow-md"
          style={{
            background: result.is_correct ? 'rgba(232, 245, 228, 0.9)' : 'rgba(255, 235, 238, 0.9)',
            border: `2px solid ${result.is_correct ? '#73C067' : '#E57A9E'}`,
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            {result.is_correct ? (
              <CheckCircle2 className="w-7 h-7" style={{ color: '#2D5A27' }} />
            ) : (
              <XCircle className="w-7 h-7" style={{ color: '#C0392B' }} />
            )}
            <div>
              <p className="text-base font-bold" style={{ color: result.is_correct ? '#2D5A27' : '#C0392B' }}>
                {result.is_correct ? '回答正确！' : '答错了，没关系！'}
              </p>
              {result.points_earned > 0 && (
                <p className="text-xs" style={{ color: '#F0A04B' }}>
                  <Award className="inline w-3.5 h-3.5 mr-1" />+{result.points_earned} 爱心饲料币
                </p>
              )}
            </div>
          </div>
          <div className="text-sm" style={{ color: '#5A4632' }}>
            <p><span className="font-bold">正确答案：</span>{fact.answer}</p>
            {result.explanation && <p className="mt-1"><span className="font-bold">解析：</span>{result.explanation}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
