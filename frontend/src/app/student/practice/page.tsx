'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Check, Lock, Flag, Star, LifeBuoy, CheckCircle, MapPin,
  Trophy, Flame, Crown, Sparkles, ChevronRight, Target, PawPrint,
  Loader2, RefreshCw, XCircle, Lightbulb, Gamepad2, Shield, Award,
} from 'lucide-react';
import { getStoredUser, getToken, fetchStudentDashboard, fetchPracticeQuestions, generateChallengeHint, API_BASE } from '@/lib/api';
import XiaocongDialog from '@/components/XiaocongDialog';

interface VenueInfo {
  id: number;
  emoji: string;
  name: string;
  tag: string;
  status: string;
  progress: string;
  accuracy: number;
  total: number;
  challenge_count: number;
}

interface QuestionItem {
  id: number;
  question: string;
  question_type: string;
  difficulty: string;
  options: string;
  correct_answer: string;
  analysis: string;
  knowledge_point: string;
}

const difficulties = [
  { id: 'basic', icon: Star, name: '基础训练场', desc: '"小动物喂食"', color: '#73C067' },
  { id: 'advanced', icon: Flame, name: '进阶挑战区', desc: '"动物运动会"', color: '#FFB86C' },
  { id: 'extension', icon: Crown, name: '终极竞技场', desc: '"动物王者对决"', color: '#9C7BB8' },
];

// #191: 场馆 tag → unit_code 映射（用于 /challenge/answer 上报）
const TAG_TO_UNIT: Record<string, string> = {
  '加减法': 'u1',
  '小数乘法': 'u2',
  '小数除法': 'u3',
  '简易方程': 'u4',
  '多边形面积': 'u5',
  '可能性': 'u6',
  '数学广角': 'u7',
  '总复习': 'u8',
};
function mapTagToUnit(tag?: string): string {
  if (!tag) return 'u1';
  return TAG_TO_UNIT[tag] || 'u1';
}
function mapTagToLesson(tag?: string, kp?: string): string {
  const u = mapTagToUnit(tag);
  // 默认 l1，按 knowledge_point 简化映射
  if (!kp) return `${u}-l1`;
  const kpMap: Record<string, string> = {
    '小数乘整数': `${u}-l1`,
    '小数乘小数': `${u}-l3`,
    '积的近似数': `${u}-l5`,
    '除数是整数的小数除法': 'u3-l1',
    '除数是小数的小数除法': 'u3-l3',
    '混合运算': 'u3-l5',
    '用字母表示数': 'u4-l1',
    '解简易方程': 'u4-l3',
    '平行四边形面积': 'u5-l1',
    '三角形面积': 'u5-l3',
    '梯形面积': 'u5-l5',
    '可能性': 'u6-l1',
  };
  return kpMap[kp] || `${u}-l1`;
}

function StudentPractice() {
  const searchParams = useSearchParams();
  const venueParam = searchParams.get('venue');

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState<VenueInfo[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueInfo | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('basic');

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  // #191: 饲养员 AI 提示（真生成，不剧透）
  const [hintContent, setHintContent] = useState<{ hint: string; thinking_path: string } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  // #191: 答错弹小聪 dialog
  const [xiaocongOpen, setXiaocongOpen] = useState(false);
  const [xiaocongErrorNoteId, setXiaocongErrorNoteId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load user and dashboard
  useEffect(() => {
    const u = getStoredUser();
    if (u) {
      setUser(u);
      loadDashboard(u.id);
    } else {
      setLoading(false);
    }
  }, []);

  // Apply URL venue param after dashboard loads
  useEffect(() => {
    if (venueParam && venues.length > 0) {
      const v = venues.find((x) => x.tag === venueParam);
      if (v && v.status !== 'locked') {
        handleSelectVenue(v);
      }
    }
  }, [venueParam, venues]);

  const loadDashboard = async (studentId: number) => {
    try {
      const d = await fetchStudentDashboard(studentId);
      setVenues(d?.venues || []);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVenue = (venue: VenueInfo) => {
    if (venue.status === 'locked') return;
    setSelectedVenue(venue);
    resetQuiz();
  };

  const resetQuiz = () => {
    setQuestions([]);
    setCurrentQIdx(0);
    setAnswer('');
    setFeedback(null);
    setShowAnalysis(false);
    setShowHint(false);
    setAnsweredCount(0);
    setCorrectCount(0);
    setFinished(false);
  };

  const handleLoadQuestions = async () => {
    if (!selectedVenue || !user) return;
    setLoadingQuestions(true);
    resetQuiz();
    try {
      const res = await fetchPracticeQuestions(
        selectedVenue.tag,
        selectedDifficulty,
        user.id,
      );
      if (res.success && res.questions && res.questions.length > 0) {
        setQuestions(res.questions);
      }
    } catch (e) {
      console.error('Load questions error:', e);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleSubmit = async () => {
    if (answer.trim() === '') return;
    const currentQ = questions[currentQIdx];
    if (!currentQ) return;

    const isCorrect = answer.trim() === currentQ.correct_answer.trim();
    setFeedback(isCorrect ? 'correct' : 'wrong');
    setShowAnalysis(true);
    setAnsweredCount((c) => c + 1);
    if (isCorrect) setCorrectCount((c) => c + 1);

    // #191: 答错/答对都上报，让 challenge_count 实时增长（之前只答错才上报 → 答对题数不计数）
    try {
      const token = getToken();
      if (token && selectedVenue) {
        // 通过 /challenge/answer 上报（answer route 会自动创建/累加 challenge_session）
        const form = new FormData();
        form.append('unit_code', mapTagToUnit(selectedVenue.tag));
        form.append('lesson_code', mapTagToLesson(selectedVenue.tag, currentQ.knowledge_point));
        form.append('level_index', String(currentQIdx + 1));
        form.append('question', currentQ.question);
        form.append('student_answer', answer.trim());
        form.append('correct_answer', currentQ.correct_answer);
        form.append('knowledge_point', currentQ.knowledge_point || '');
        const res = await fetch(`${API_BASE}/challenge/answer`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }).then(r => r.json()).catch(() => null);
        // 答错 → 弹小聪 dialog
        if (!isCorrect && res?.success && res.data?.error_note_id) {
          setXiaocongErrorNoteId(res.data.error_note_id);
          setXiaocongOpen(true);
        }
        // 答对或答错都刷新 dashboard，让 challenge_count +1 + 正确率实时更新
        if (res?.success) {
          await loadDashboard(user.id);
        }
      }
    } catch (e) {
      console.warn('upload answer failed', e);
    }
  };

  const handleNext = () => {
    if (currentQIdx + 1 >= questions.length) {
      setFinished(true);
    } else {
      setCurrentQIdx((i) => i + 1);
      setAnswer('');
      setFeedback(null);
      setShowAnalysis(false);
      setShowHint(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleRestart = () => {
    resetQuiz();
    handleLoadQuestions();
  };

  // #191: 调 /challenge/hint 生成真 AI 提示
  const handleAskHint = async () => {
    const currentQ = questions[currentQIdx];
    if (!currentQ) return;
    const token = getToken();
    if (!token) return;
    setShowHint(true);
    setHintLoading(true);
    setHintContent(null);
    try {
      const form = new FormData();
      form.append('knowledge_point', currentQ.knowledge_point || '');
      form.append('correct_answer', currentQ.correct_answer);
      form.append('student_answer', answer || '');
      form.append('question', currentQ.question);
      const res: any = await fetch(`${API_BASE}/challenge/hint`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }).then(r => r.json()).catch(() => null);
      if (res?.success && res.data) {
        setHintContent(res.data);
      } else {
        setHintContent({ hint: '回想一下这道题的关键步骤，加油！', thinking_path: currentQ.knowledge_point || '' });
      }
    } catch {
      setHintContent({ hint: '饲养员暂时没回应，请再试一次~', thinking_path: currentQ.knowledge_point || '' });
    } finally {
      setHintLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (feedback) handleNext();
      else handleSubmit();
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-[#73C067]" />
        <p className="text-sm" style={{ color: '#8B7355' }}>加载场馆数据...</p>
      </div>
    );
  }

  const currentQ = questions[currentQIdx];
  const progressPct = questions.length > 0 ? ((currentQIdx + (feedback ? 1 : 0)) / questions.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* ============= 当前场馆横幅 ============= */}
      {selectedVenue && (
        <section className="glass-card-solid relative overflow-hidden p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="shrink-0 flex items-end gap-2 text-6xl md:text-7xl select-none">
              <span className="animal-bounce">{selectedVenue.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-2"
                style={{ background: 'rgba(255, 184, 108, 0.25)', color: '#8B5A1B' }}
              >
                <MapPin className="w-3.5 h-3.5" />
                当前场馆
              </div>
              <h2 className="text-2xl md:text-3xl font-bold" style={{ color: '#4A3728' }}>{selectedVenue.name}</h2>
              <p className="text-sm mt-1.5" style={{ color: '#8B7355' }}>
                {selectedVenue.status === 'done' ? '已完成全部挑战！可以再来一次~' : '快来帮助小动物们解决问题吧！'}
              </p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
                  style={{ background: 'rgba(255, 240, 219, 0.85)', color: '#8B5A1B' }}
                >
                  <Flag className="w-3.5 h-3.5" />
                  已闯关 {selectedVenue.progress}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: 'rgba(232, 245, 228, 0.85)', color: '#2D5A27' }}
                >
                  <Star className="w-3.5 h-3.5" />
                  正确率 {selectedVenue.accuracy}%
                </span>
                {/* #191: 闯关进度徽标（≥3 解锁下一馆） */}
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-white"
                  style={{
                    background: (selectedVenue.challenge_count || 0) >= 3
                      ? 'linear-gradient(90deg, #10B981, #059669)'
                      : 'linear-gradient(90deg, #FFB86C, #FF9F4A)',
                    boxShadow: '0 2px 8px rgba(255, 184, 108, 0.3)',
                  }}
                  title="完成 3 个闯关会话即可解锁下一馆"
                >
                  <Award className="w-3.5 h-3.5" />
                  闯关 {selectedVenue.challenge_count || 0}/3 {(selectedVenue.challenge_count || 0) >= 3 ? '✓' : ''}
                </span>
              </div>
            </div>
            {questions.length > 0 && (
              <button
                onClick={handleRestart}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
                style={{ background: 'rgba(255, 255, 255, 0.7)', color: '#8B7355', border: '1.5px solid rgba(200, 230, 192, 0.5)' }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                换一批题
              </button>
            )}
          </div>
        </section>
      )}

      {/* ============= 场馆选择 ============= */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
            <Trophy className="w-5 h-5" style={{ color: '#FFB86C' }} />
            选择场馆
          </h3>
          <span
            className="px-3 py-0.5 rounded-full text-xs font-semibold text-white"
            style={{ background: 'linear-gradient(90deg, #73C067, #5CAF50)' }}
          >
            {venues.length}个场馆
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {venues.map((v) => {
            const isCurrent = selectedVenue?.id === v.id;
            const isLocked = v.status === 'locked';
            // #191: 闯关进度 + 正确率徽标
            const challengeCount = v.challenge_count || 0;
            const challengeRatio = Math.min(challengeCount / 3, 1);
            const accuracy = v.accuracy || 0;
            const accuracyColor = accuracy >= 80 ? '#10B981' : accuracy >= 60 ? '#F59E0B' : accuracy > 0 ? '#EF4444' : '#9CA3AF';
            const accuracyBg = accuracy >= 80 ? 'rgba(16,185,129,0.15)' : accuracy >= 60 ? 'rgba(245,158,11,0.15)' : accuracy > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(156,163,175,0.15)';
            const challengeProgressColor = challengeCount >= 3 ? '#10B981' : '#FFB86C';
            return (
              <button
                key={v.id}
                onClick={() => handleSelectVenue(v)}
                disabled={isLocked}
                className="glass-card p-4 text-left transition-all relative overflow-hidden"
                style={{
                  background: isCurrent
                    ? 'linear-gradient(135deg, rgba(255, 240, 219, 0.95), rgba(255, 184, 108, 0.2))'
                    : isLocked
                    ? 'rgba(255, 255, 255, 0.55)'
                    : 'rgba(255, 255, 255, 0.8)',
                  opacity: isLocked ? 0.6 : 1,
                  boxShadow: isCurrent
                    ? '0 12px 36px rgba(255, 184, 108, 0.25), 0 2px 8px rgba(255, 184, 108, 0.1)'
                    : undefined,
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  border: isCurrent ? '2px solid #FFB86C' : 'none',
                }}
              >
                {/* #191: 右上方正确率徽标 */}
                {!isLocked && accuracy > 0 && (
                  <div
                    className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1"
                    style={{ background: accuracyBg, color: accuracyColor }}
                    title={`累计正确率 ${accuracy}%`}
                  >
                    <Star className="w-3 h-3" />
                    {accuracy}%
                  </div>
                )}

                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl select-none">{v.emoji}</span>
                  {v.status === 'done' && (
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white"
                      style={{ background: 'linear-gradient(135deg, #73C067, #5CAF50)' }}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {v.status === 'current' && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                      style={{ background: 'linear-gradient(90deg, #FFB86C, #FF9F4A)' }}
                    >
                      进行中
                    </span>
                  )}
                  {isLocked && (
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full"
                      style={{ background: 'rgba(200, 230, 192, 0.6)' }}
                    >
                      <Lock className="w-3.5 h-3.5" style={{ color: '#8B7355' }} />
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm" style={{ color: isLocked ? '#8B7355' : '#4A3728' }}>{v.name}</h4>
                <p className="text-xs mt-1" style={{ color: v.status === 'current' ? '#FFB86C' : '#8B7355' }}>
                  {isLocked ? '🔒 未解锁' : v.progress}
                </p>

                {/* #191: 闯关进度（3 个解锁下一馆） */}
                {!isLocked && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: '#8B7355' }}>
                      <span className="font-medium">闯关进度</span>
                      <span className="font-bold" style={{ color: challengeProgressColor }}>
                        {challengeCount}/3 {challengeCount >= 3 ? '✓ 已解锁' : ''}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(200, 230, 192, 0.3)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${challengeRatio * 100}%`,
                          background: challengeCount >= 3
                            ? 'linear-gradient(90deg, #10B981, #059669)'
                            : 'linear-gradient(90deg, #FFB86C, #FF9F4A)',
                        }}
                      />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ============= 趣味数学密铺入口 ============= */}
      {!selectedVenue && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
              <Gamepad2 className="w-5 h-5" style={{ color: '#73C067' }} />
              趣味挑战
            </h3>
          </div>
          <Link
            href="/student/fun-games"
            className="glass-card p-5 flex items-center gap-4 transition-all hover:scale-[1.01] block"
            style={{ background: 'linear-gradient(135deg, rgba(232, 245, 228, 0.95), rgba(200, 230, 192, 0.6))', border: '2px solid rgba(115,192,103,0.3)' }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#73C067', color: 'white' }}>
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-base mb-1" style={{ color: '#4A3728' }}>趣味数学密铺</h4>
              <p className="text-sm" style={{ color: '#8B7355' }}>探索图形密铺、内角和与图形运动，完成挑战获得爱心饲料币</p>
            </div>
            <div className="flex items-center gap-1 text-sm font-bold shrink-0" style={{ color: '#73C067' }}>
              进入挑战 <ChevronRight className="w-4 h-4" />
            </div>
          </Link>
        </section>
      )}

      {/* ============= 难度选择 ============= */}
      {selectedVenue && questions.length === 0 && !loadingQuestions && !finished && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
              <Target className="w-5 h-5" style={{ color: '#73C067' }} />
              选择难度
            </h3>
            <span
              className="px-3 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ background: 'linear-gradient(90deg, #FFB86C, #FF9F4A)' }}
            >
              3个关卡
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {difficulties.map((d) => {
              const Icon = d.icon;
              const isCurrent = selectedDifficulty === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDifficulty(d.id)}
                  className="glass-card p-5 text-left transition-all hover:scale-[1.02]"
                  style={{
                    background: isCurrent
                      ? 'linear-gradient(135deg, rgba(255, 240, 219, 0.95), rgba(255, 184, 108, 0.2))'
                      : 'linear-gradient(135deg, rgba(232, 245, 228, 0.85), rgba(200, 230, 192, 0.5))',
                    boxShadow: isCurrent ? '0 12px 36px rgba(255, 184, 108, 0.25)' : undefined,
                    border: isCurrent ? `2px solid ${d.color}` : '2px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(255, 255, 255, 0.8)' }}
                    >
                      <Icon className="w-5 h-5" style={{ color: d.color }} />
                    </div>
                    {isCurrent && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                        style={{ background: `linear-gradient(90deg, ${d.color}, ${d.color}dd)` }}
                      >
                        已选中
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-base mb-1" style={{ color: '#4A3728' }}>{d.name}</h4>
                  <p className="text-xs" style={{ color: '#8B7355' }}>{d.desc}</p>
                </button>
              );
            })}
          </div>
          <div className="text-center mt-5">
            <button
              onClick={handleLoadQuestions}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)',
                boxShadow: '0 6px 20px rgba(115, 192, 103, 0.4)',
              }}
            >
              <Sparkles className="w-4 h-4" />
              AI 生成练习题
            </button>
          </div>
        </section>
      )}

      {/* ============= 加载题目中 ============= */}
      {loadingQuestions && (
        <div className="glass-card-solid p-12 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-[#73C067]" />
          <p className="text-base font-bold" style={{ color: '#4A3728' }}>AI 正在生成题目...</p>
          <p className="text-sm mt-2" style={{ color: '#8B7355' }}>根据你选择的场馆和难度，智能出题中~</p>
        </div>
      )}

      {/* ============= 答题区 ============= */}
      {questions.length > 0 && currentQ && !finished && (
        <section>
          {/* Progress bar */}
          <div className="glass-card-solid px-6 py-3 mb-4 flex items-center gap-4">
            <span className="text-sm font-bold whitespace-nowrap" style={{ color: '#4A3728' }}>
              第 {currentQIdx + 1} / {questions.length} 题
            </span>
            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(200, 230, 192, 0.3)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #73C067, #5CAF50)' }}
              />
            </div>
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: '#2D5A27' }}>
              ✅ {correctCount} · ❌ {answeredCount - correctCount}
            </span>
          </div>

          <div className="glass-card-solid overflow-hidden">
            {/* Question header */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{
                background: 'linear-gradient(90deg, rgba(232, 245, 228, 0.7), rgba(200, 230, 192, 0.4))',
                borderBottom: '1.5px solid rgba(200, 230, 192, 0.4)',
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl select-none">{selectedVenue?.emoji}</span>
                <span className="font-bold text-sm" style={{ color: '#4A3728' }}>{selectedVenue?.name}挑战</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span style={{ color: '#8B7355' }}>难度</span>
                {selectedDifficulty === 'basic' && <span style={{ color: '#73C067' }}>★ 基础</span>}
                {selectedDifficulty === 'advanced' && <span style={{ color: '#FFB86C' }}>★★ 进阶</span>}
                {selectedDifficulty === 'extension' && <span style={{ color: '#9C7BB8' }}>★★★ 拓展</span>}
              </div>
            </div>

            {/* Question content */}
            <div className="px-6 md:px-10 py-8">
              <div className="text-center mb-8">
                <p className="text-xl md:text-2xl font-bold leading-relaxed" style={{ color: '#4A3728' }}>
                  {currentQ.question}
                </p>
              </div>

              {/* Answer input */}
              <div className="max-w-md mx-auto mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: '#8B7355' }}>输入你的答案</label>
                <input
                  ref={inputRef}
                  id="answer-input"
                  type="text"
                  placeholder="请输入答案..."
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value);
                    if (feedback) return;
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={!!feedback}
                  autoFocus
                  className="w-full px-5 py-4 text-lg font-semibold rounded-2xl transition-all outline-none disabled:opacity-70"
                  style={{
                    background: 'rgba(255, 248, 240, 0.95)',
                    border: feedback === 'wrong' ? '2px solid #FF8A8A' : feedback === 'correct' ? '2px solid #73C067' : '2px solid rgba(200, 230, 192, 0.7)',
                    color: '#4A3728',
                  }}
                />
              </div>

              {/* Action buttons */}
              {!feedback ? (
                <div className="flex items-center justify-center gap-4 mb-6 flex-wrap">
                  <button
                    id="btn-submit"
                    onClick={handleSubmit}
                    disabled={answer.trim() === ''}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
                    style={{
                      background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)',
                      boxShadow: '0 6px 20px rgba(115, 192, 103, 0.35)',
                    }}
                  >
                    <CheckCircle className="w-4 h-4" />
                    提交答案
                  </button>
                  <button
                    id="btn-help"
                    onClick={handleAskHint}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: 'linear-gradient(135deg, #FFB86C 0%, #FF9F4A 100%)',
                      boxShadow: '0 6px 20px rgba(255, 184, 108, 0.35)',
                    }}
                  >
                    <LifeBuoy className="w-4 h-4" />
                    饲养员 AI 提示（不剧透）
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-4 mb-6">
                  <button
                    onClick={handleNext}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: currentQIdx + 1 >= questions.length
                        ? 'linear-gradient(135deg, #FFB86C 0%, #FF9F4A 100%)'
                        : 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)',
                      boxShadow: '0 6px 20px rgba(115, 192, 103, 0.35)',
                    }}
                  >
                    {currentQIdx + 1 >= questions.length ? (
                      <>
                        <Trophy className="w-4 h-4" />
                        查看闯关结果
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-4 h-4" />
                        下一题
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Feedback */}
              {feedback === 'correct' && (
                <div
                  id="feedback-correct"
                  className="mx-auto max-w-md mb-4 px-5 py-4 rounded-2xl text-center glass-card"
                  style={{ background: 'rgba(232, 245, 228, 0.95)', border: '2px solid #73C067' }}
                >
                  <p className="font-bold flex items-center justify-center gap-2" style={{ color: '#2D5A27' }}>
                    <Sparkles className="w-4 h-4" />
                    太棒了！答案正确！
                  </p>
                </div>
              )}
              {feedback === 'wrong' && (
                <div
                  id="feedback-wrong"
                  className="mx-auto max-w-md mb-4 px-5 py-4 rounded-2xl text-center glass-card"
                  style={{ background: 'rgba(255, 240, 219, 0.95)', border: '2px solid #FFB86C' }}
                >
                  <p className="font-bold flex items-center justify-center gap-2" style={{ color: '#8B5A1B' }}>
                    <XCircle className="w-4 h-4" />
                    别灰心！看看正确答案和解析吧~
                  </p>
                  <p className="text-sm mt-2" style={{ color: '#2D5A27' }}>
                    正确答案：<strong>{currentQ.correct_answer}</strong>
                  </p>
                </div>
              )}

              {/* Analysis */}
              {showAnalysis && currentQ.analysis && (
                <div
                  className="mx-auto max-w-lg rounded-2xl p-5"
                  style={{ background: 'rgba(232, 245, 228, 0.85)', border: '1.5px dashed rgba(115, 192, 103, 0.5)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4" style={{ color: '#FFB86C' }} />
                    <span className="text-sm font-bold" style={{ color: '#2D5A27' }}>饲养员解析</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: '#4A3728' }}>{currentQ.analysis}</p>
                </div>
              )}

              {/* Hint */}
              {showHint && !feedback && (
                <div
                  className="mx-auto max-w-lg rounded-2xl p-5"
                  style={{ background: 'rgba(255, 240, 219, 0.95)', border: '1px dashed rgba(255, 184, 108, 0.6)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#8B5A1B' }}>
                      <Lightbulb className="w-3.5 h-3.5" />
                      🦊 饲养员的提示
                    </span>
                    <button
                      onClick={() => { setShowHint(false); setHintContent(null); }}
                      className="text-sm font-medium underline"
                      style={{ color: '#FFB86C' }}
                    >
                      收起
                    </button>
                  </div>
                  {hintLoading ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#FFB86C' }} />
                      <span className="text-sm" style={{ color: '#8B5A1B' }}>饲养员正在思考...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed font-medium" style={{ color: '#4A3728' }}>
                        💡 {hintContent?.hint || '仔细想想已知条件，一步步来~'}
                      </p>
                      {hintContent?.thinking_path && (
                        <p className="text-xs mt-2 italic" style={{ color: '#8B7355' }}>
                          思路关键词：{hintContent.thinking_path}
                        </p>
                      )}
                      <p className="text-xs mt-2" style={{ color: '#8B7355' }}>
                        📌 提示不剧透答案，自己想出来的才是真本事！
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ============= 完成画面 ============= */}
      {finished && (
        <section>
          <div className="glass-card-solid p-8 md:p-12 text-center">
            <div className="text-6xl mb-4">{correctCount >= questions.length * 0.6 ? '🏆' : '💪'}</div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#4A3728' }}>
              {correctCount >= questions.length * 0.8 ? '太厉害了！全部通关！' : correctCount >= questions.length * 0.6 ? '做得不错！继续加油！' : '别灰心，再来一次吧！'}
            </h2>
            <p className="text-base mt-2 mb-6" style={{ color: '#8B7355' }}>
              {selectedVenue?.name} · {difficulties.find((d) => d.id === selectedDifficulty)?.name}
            </p>

            <div className="flex items-center justify-center gap-6 mb-8">
              <div className="text-center">
                <div className="text-3xl font-black" style={{ color: '#73C067' }}>{correctCount}</div>
                <div className="text-xs mt-1" style={{ color: '#8B7355' }}>答对</div>
              </div>
              <div className="w-px h-12" style={{ background: 'rgba(200, 230, 192, 0.5)' }} />
              <div className="text-center">
                <div className="text-3xl font-black" style={{ color: '#FF8A8A' }}>{answeredCount - correctCount}</div>
                <div className="text-xs mt-1" style={{ color: '#8B7355' }}>答错</div>
              </div>
              <div className="w-px h-12" style={{ background: 'rgba(200, 230, 192, 0.5)' }} />
              <div className="text-center">
                <div className="text-3xl font-black" style={{ color: '#FFB86C' }}>
                  {questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0}%
                </div>
                <div className="text-xs mt-1" style={{ color: '#8B7355' }}>正确率</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <button
                onClick={handleRestart}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)', boxShadow: '0 6px 20px rgba(115, 192, 103, 0.35)' }}
              >
                <RefreshCw className="w-4 h-4" />
                再来一轮
              </button>
              <button
                onClick={() => { setSelectedVenue(null); resetQuiz(); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'rgba(255, 255, 255, 0.7)', color: '#8B7355', border: '1.5px solid rgba(200, 230, 192, 0.6)' }}
              >
                <Trophy className="w-4 h-4" />
                换个场馆
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ============= 闯关进度节点 ============= */}
      {questions.length > 0 && !finished && (
        <section>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: '#4A3728' }}>
            <ChevronRight className="w-5 h-5" style={{ color: '#73C067' }} />
            闯关进度
          </h3>
          <div className="glass-card-solid p-6">
            <div className="flex items-center justify-between mb-6 px-2 overflow-x-auto">
              {questions.map((q, index) => {
                const isCompleted = index < currentQIdx || (index === currentQIdx && feedback);
                const isCurrent = index === currentQIdx && !feedback;
                const isPending = index > currentQIdx || (index === currentQIdx && !feedback && answeredCount <= index);
                return (
                  <div
                    key={q.id}
                    className="flex items-center shrink-0"
                    style={{ flex: index < questions.length - 1 ? 1 : '0 0 auto' }}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      {isCompleted && (
                        <>
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center relative"
                            style={{ background: 'linear-gradient(135deg, #E8F5E4, #C8E6C0)', border: '2px solid #73C067' }}
                          >
                            <PawPrint className="w-4 h-4" style={{ color: '#2D5A27' }} />
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center text-white font-bold" style={{ background: '#73C067' }}>✓</span>
                          </div>
                          <span className="text-xs font-medium" style={{ color: '#2D5A27' }}>第{index + 1}题</span>
                        </>
                      )}
                      {isCurrent && (
                        <>
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center progress-pulse"
                            style={{
                              background: 'linear-gradient(135deg, #FFF0DB, #FFE0B0)',
                              border: '3px solid #FFB86C',
                              boxShadow: '0 0 0 4px rgba(255, 184, 108, 0.25)',
                            }}
                          >
                            <PawPrint className="w-5 h-5" style={{ color: '#FFB86C' }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: '#FFB86C' }}>当前</span>
                        </>
                      )}
                      {isPending && (
                        <>
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(245, 245, 240, 0.6)', border: '2px solid rgba(200, 230, 192, 0.5)' }}
                          >
                            <PawPrint className="w-4 h-4" style={{ color: '#B8B0A4', opacity: 0.5 }} />
                          </div>
                          <span className="text-xs" style={{ color: '#8B7355' }}>第{index + 1}题</span>
                        </>
                      )}
                    </div>
                    {index < questions.length - 1 && (
                      <div
                        className="flex-1 h-1 mx-1 rounded-full min-w-[20px]"
                        style={{
                          background: isCompleted ? 'linear-gradient(90deg, #73C067, #C8E6C0)' : 'rgba(200, 230, 192, 0.4)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: '#4A3728' }}>本轮进度</span>
                <span className="text-sm font-bold" style={{ color: '#2D5A27' }}>{answeredCount}/{questions.length} 已完成</span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'rgba(200, 230, 192, 0.3)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(answeredCount / questions.length) * 100}%`, background: 'linear-gradient(90deg, #73C067, #5CAF50)' }}
                />
              </div>
            </div>

            {selectedVenue && selectedVenue.status !== 'done' && (
              <div className="text-center pt-2">
                <p className="text-sm italic" style={{ color: '#8B7355' }}>
                  🌟 完成本轮练习可获得 <span style={{ color: '#FFB86C', fontWeight: 'bold' }}>10 爱心饲料币</span>，加油！
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* #191: 错题触发小聪引导 dialog */}
      <PracticeXiaocongDialog
        open={xiaocongOpen}
        errorNoteId={xiaocongErrorNoteId}
        onClose={() => {
          setXiaocongOpen(false);
          setXiaocongErrorNoteId(null);
          // 答错后刷新 dashboard，让 challenge_count 实时更新
          if (user) loadDashboard(user.id);
        }}
      />
    </div>
  );
}

// #191: 错题触发小聪 dialog（XiaocongDialog 自己渲染固定定位 modal）
function PracticeXiaocongDialog({
  open,
  errorNoteId,
  onClose,
}: { open: boolean; errorNoteId: number | null; onClose: () => void }) {
  if (!open || !errorNoteId) return null;
  return (
    <XiaocongDialog
      open={open}
      errorNoteId={errorNoteId}
      onClose={onClose}
    />
  );
}

export default function StudentPracticePage() {
  return (
    <Suspense fallback={
      <div className="text-center py-20">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-[#73C067]" />
        <p className="text-sm" style={{ color: '#8B7355' }}>加载中...</p>
      </div>
    }>
      <StudentPractice />
    </Suspense>
  );
}