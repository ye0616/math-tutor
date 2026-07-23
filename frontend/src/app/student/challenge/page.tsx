'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Swords, Sparkles, Play, Loader2, RefreshCw, ArrowRight, ArrowLeft,
  Trophy, Star, Zap, Target, X, Check, Lightbulb, BookOpen,
  MessageCircle, ChevronDown, ChevronRight, Shield, Flame,
} from 'lucide-react';
import {
  getToken, getStoredUser,
  getChallengeCurriculum, startChallenge, pollChallengeTask as pollTask,
  submitChallengeAnswer, submitSimilarAnswer,
  generateChallengeHint, getLessonStats, completeChallengeSession,
  type ChallengeResult, type ChallengeLevel, type ChallengeAnswerResult,
  API_BASE,
} from '@/lib/api';
import XiaocongDialog from '@/components/XiaocongDialog';

// ===== 课程映射 =====
interface UnitItem { unit: string; code: string; emoji: string; lessons: { code: string; title: string }[]; }

const CURRICULUM_DATA: UnitItem[] = [
  { unit: '第一单元 观察简单组合体', code: 'u1', emoji: '🔍', lessons: [
    { code: 'u1-l1', title: '从不同方向观察同一组合体的形状' },
    { code: 'u1-l2', title: '从同一方向观察不同组合体的形状' },
    { code: 'u1-l3', title: '根据看到的图形摆组合体' },
  ]},
  { unit: '第二单元 小数乘法', code: 'u2', emoji: '✖️', lessons: [
    { code: 'u2-l1', title: '小数乘整数（1）' },
    { code: 'u2-l2', title: '小数乘整数（2）' },
    { code: 'u2-l3', title: '小数乘小数的计算方法' },
    { code: 'u2-l4', title: '积的小数位数不够的处理方法' },
    { code: 'u2-l5', title: '求一个数的小数倍是多少' },
    { code: 'u2-l6', title: '整数乘法运算律推广到小数' },
    { code: 'u2-l7', title: '估算解决实际问题' },
    { code: 'u2-l8', title: '分段计费的实际问题' },
  ]},
  { unit: '第三单元 小数除法', code: 'u3', emoji: '➗', lessons: [
    { code: 'u3-l1', title: '整数除以整数商是小数' },
    { code: 'u3-l2', title: '小数除以整数商是小数' },
    { code: 'u3-l3', title: '商的整数部分不够商1' },
    { code: 'u3-l4', title: '循环小数' },
    { code: 'u3-l5', title: '一个数除以小数的计算方法' },
    { code: 'u3-l6', title: '被除数的小数位数比除数少' },
    { code: 'u3-l7', title: '灵活取商的近似数解决问题' },
  ]},
  { unit: '第四单元 图形的运动', code: 'u4', emoji: '🔄', lessons: [
    { code: 'u4-l1', title: '轴对称图形的特征' },
    { code: 'u4-l2', title: '补全轴对称图形' },
    { code: 'u4-l3', title: '平移的特征' },
    { code: 'u4-l4', title: '画平移后的图形' },
    { code: 'u4-l5', title: '运用平移知识解决问题' },
    { code: 'u4-l6', title: '旋转的含义和特征' },
    { code: 'u4-l7', title: '画旋转90°后的图形' },
    { code: 'u4-l8', title: '用平移和旋转解决问题' },
    { code: 'u4-l9', title: '设计图案' },
  ]},
  { unit: '第五单元 用字母表示数', code: 'u5', emoji: '🔤', lessons: [
    { code: 'u5-l1', title: '用字母表示加减数量关系' },
    { code: 'u5-l2', title: '用字母表示乘除数量关系' },
    { code: 'u5-l3', title: '用字母表示运算律和公式' },
    { code: 'u5-l4', title: '用字母表示探究的规律' },
    { code: 'u5-l5', title: '用字母解决问题' },
    { code: 'u5-l6', title: '探秘百数表' },
  ]},
  { unit: '第六单元 多边形的面积', code: 'u6', emoji: '📐', lessons: [
    { code: 'u6-l1', title: '平行四边形面积公式推导' },
    { code: 'u6-l2', title: '平行四边形面积的实际应用' },
    { code: 'u6-l3', title: '公顷与平方千米' },
    { code: 'u6-l4', title: '三角形面积公式推导' },
    { code: 'u6-l5', title: '三角形面积的实际应用' },
    { code: 'u6-l6', title: '梯形面积公式推导' },
    { code: 'u6-l7', title: '梯形面积的实际应用' },
    { code: 'u6-l8', title: '组合图形面积的计算方法' },
    { code: 'u6-l9', title: '不规则图形的面积' },
    { code: 'u6-l10', title: '格点多边形的面积' },
  ]},
  { unit: '第七单元 可能性', code: 'u7', emoji: '🎲', lessons: [
    { code: 'u7-l1', title: '事件发生的确定性和不确定性' },
    { code: 'u7-l2', title: '事件发生的可能性大小' },
    { code: 'u7-l3', title: '根据可能性大小推测' },
  ]},
  { unit: '数学广角：植树问题', code: 'u8', emoji: '🌳', lessons: [
    { code: 'u8-l1', title: '植树问题-例1' },
    { code: 'u8-l2', title: '植树问题-例2' },
    { code: 'u8-l3', title: '植树问题-例3' },
  ]},
];

// #191: unit_code → 单元中文名（解锁下一馆提示用）
const KNOWLEDGE_TREE_UNIT_NAMES: Record<string, string> = {
  u1: '第一单元 观察简单组合体',
  u2: '第二单元 小数乘法',
  u3: '第三单元 小数除法',
  u4: '第四单元 图形的运动',
  u5: '第五单元 用字母表示数',
  u6: '第六单元 多边形的面积',
  u7: '第七单元 可能性',
  u8: '数学广角 植树问题',
};

export default function ChallengePage() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<any>(null);

  // 选题
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitItem | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<{ code: string; title: string } | null>(null);

  // 闯关状态
  const [phase, setPhase] = useState<'select' | 'generating' | 'playing' | 'complete'>('select');
  const [taskId, setTaskId] = useState('');
  const [challenge, setChallenge] = useState<ChallengeResult | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ChallengeAnswerResult | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showSimilarPanel, setShowSimilarPanel] = useState(false);
  const [similarAnswers, setSimilarAnswers] = useState<Record<number, string>>({});
  const [similarResults, setSimilarResults] = useState<Record<number, boolean | null>>({});
  const [similarSubmitting, setSimilarSubmitting] = useState<Record<number, boolean>>({});

  // 统计
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 错题引导状态
  const [errorStep, setErrorStep] = useState(0); // 0=未开始, 1=看解析, 2=已理解, 3=可继续
  const [showGuidedSteps, setShowGuidedSteps] = useState(false);
  // 闯关答错自动全屏AI引导
  const [showGuidedFullscreen, setShowGuidedFullscreen] = useState(false);

  // #191 新增：小聪 dialog（答错触发）
  const [showXiaocong, setShowXiaocong] = useState(false);
  const [xiaocongErrorNoteId, setXiaocongErrorNoteId] = useState<number | null>(null);

  // #191 新增：饲养员提示
  const [hintOpen, setHintOpen] = useState(false);
  const [hintContent, setHintContent] = useState<{ hint: string; thinking_path: string } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  // #191 新增：课时正确率（Map<lesson_code, {total,correct,accuracy}>）
  const [lessonStatsMap, setLessonStatsMap] = useState<Record<string, { total: number; correct: number; accuracy: number }>>({});

  // #191 新增：完成页解锁下一馆
  const [unlockNext, setUnlockNext] = useState<{ unlocked: boolean; next_unit: string | null; completed_count: number } | null>(null);

  useEffect(() => {
    const t = getToken();
    if (t) setToken(t);
    setUser(getStoredUser());
  }, []);

  // #191：选题阶段加载所有课时正确率（一次性并发）
  useEffect(() => {
    if (phase !== 'select' || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const tasks = CURRICULUM_DATA.flatMap(u => u.lessons.map(l => ({ unit: u.code, lesson: l.code })));
        console.log('[#191] 开始拉取课时正确率，共', tasks.length, '个课时');
        const results = await Promise.allSettled(
          tasks.map(({ lesson }) => getLessonStats(token, lesson).then(r => ({ lesson, data: r.data }))),
        );
        if (cancelled) return;
        const map: Record<string, { total: number; correct: number; accuracy: number }> = {};
        let successCount = 0;
        results.forEach((r) => {
          if (r.status === 'fulfilled' && r.value.data) {
            map[r.value.lesson] = r.value.data;
            successCount++;
          } else if (r.status === 'rejected') {
            console.warn('[#191] 课时正确率拉取失败:', r.reason?.message);
          }
        });
        console.log('[#191] 课时正确率拉取完成:', successCount, '/', tasks.length, '个课时有数据');
        setLessonStatsMap(map);
      } catch (e) {
        console.error('[#191] lesson stats fetch error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [phase, token]);

  // 轮询闯关生成状态
  useEffect(() => {
    if (!taskId || phase !== 'generating') return;
    const interval = setInterval(async () => {
      try {
        const res = await pollTask(taskId);
        if (res.status === 'completed' && res.data) {
          setChallenge(res.data);
          setPhase('playing');
          setCurrentLevel(0);
          setLastResult(null);
          setScore(0);
          setCorrectCount(0);
        } else if (res.status === 'failed') {
          setPhase('select');
          alert('闯关生成失败，请重试');
        }
      } catch (e) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [taskId, phase]);

  useEffect(() => {
    if (phase === 'playing' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentLevel, phase]);

  // 开始闯关
  const handleStart = async () => {
    if (!selectedLesson || !selectedUnit) return;
    setPhase('generating');
    setChallenge(null);
    try {
      const res = await startChallenge(token, {
        unit_code: selectedUnit.code,
        lesson_code: selectedLesson.code,
      });
      if (res.success) {
        setTaskId(res.task_id);
      } else {
        setPhase('select');
      }
    } catch (e) {
      setPhase('select');
      alert('启动闯关失败');
    }
  };

  // 提交答案
  const handleSubmitAnswer = async () => {
    if (!answer.trim() || !challenge || !selectedLesson) return;
    setSubmitting(true);
    const level = challenge.levels[currentLevel];
    try {
      const res = await submitChallengeAnswer(token, {
        lesson_code: selectedLesson.code,
        level_index: currentLevel,
        question: level.question,
        student_answer: answer.trim(),
        correct_answer: level.answer,
        knowledge_point: level.knowledge_point,
      });
      if (res.success && res.data) {
        setLastResult(res.data);
        setScore(s => s + res.data.points_earned);
        if (res.data.is_correct) {
          setCorrectCount(c => c + 1);
          setShowErrorModal(false);
          setShowSimilarPanel(false);
          setErrorStep(0);
          // 答对也刷新课时正确率
          if (res.data.session_id && selectedLesson) {
            try {
              const stats = await getLessonStats(token, selectedLesson.code);
              if (stats.data) {
                setLessonStatsMap(prev => ({ ...prev, [selectedLesson.code]: stats.data }));
              }
            } catch {}
          }
        } else {
          setShowErrorModal(false);
          setShowSimilarPanel(false);
          setErrorStep(1); // 进入错题引导流程
          // #191: 答错优先弹小聪 dialog（用 LLM 持久化的多轮对话）
          if (res.data.error_note_id) {
            setXiaocongErrorNoteId(res.data.error_note_id);
            setShowXiaocong(true);
            // 同时折叠式保留原 4 步引导入口（不自动弹全屏）
            setShowGuidedSteps(false);
          } else {
            // 兜底：error_note_id 缺失时仍弹全屏 AI 引导
            setShowGuidedFullscreen(true);
          }
        }
      }
    } catch (e) {} finally {
      setSubmitting(false);
    }
  };

  // 下一题
  const handleNext = async () => {
    if (!challenge) return;
    if (currentLevel < challenge.levels.length - 1) {
      setCurrentLevel(c => c + 1);
      setAnswer('');
      setLastResult(null);
      setShowErrorModal(false);
      setShowSimilarPanel(false);
      setSimilarAnswers({});
      setSimilarResults({});
      setErrorStep(0);
      setShowGuidedSteps(false);
      setShowGuidedFullscreen(false);
      setShowXiaocong(false);
      setHintOpen(false);
      setHintContent(null);
    } else {
      // 最后关：标记 session 完成 + 检查馆解锁
      setPhase('complete');
      setUnlockNext(null);
      try {
        // #191 修复：优先用 lastResult.session_id，没有则兜底查 active session
        let sid: number | null | undefined = lastResult?.session_id;
        if (!sid && selectedUnit && user?.id) {
          // 兜底：查询该学生在该 unit 下的最新 active session
          try {
            const res = await fetch(`${API_BASE}/challenge/history/${user.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              const list = (data?.list || data?.data?.list || []) as any[];
              const found = list.find(
                (s) => s.unit_code === selectedUnit.code && s.status === 'active',
              );
              if (found?.id) sid = found.id;
            }
          } catch {}
        }
        if (sid && token) {
          const r = await completeChallengeSession(token, sid);
          if (r.success && r.data) {
            setUnlockNext({
              unlocked: r.data.venue_unlocked_next,
              next_unit: r.data.next_unit_code,
              completed_count: r.data.completed_count,
            });
            // 刷新课时正确率
            if (selectedLesson) {
              try {
                const stats = await getLessonStats(token, selectedLesson.code);
                if (stats.data) {
                  setLessonStatsMap(prev => ({ ...prev, [selectedLesson.code]: stats.data }));
                }
              } catch {}
            }
          }
        } else {
          // #191 兜底：没有 session_id 时，根据 selectedUnit 推断 unlockNext
          // 当前单元索引 + 1 = 下一馆，但需要查询 dashboard 才能知道是否达成 3 次条件
          // 这里只显示"已完成"状态 + 引导用户返回查看场馆进度
          const unitCodes = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
          const curIdx = selectedUnit ? unitCodes.indexOf(selectedUnit.code) : -1;
          const nextUnitCode = curIdx >= 0 && curIdx < unitCodes.length - 1 ? unitCodes[curIdx + 1] : null;
          setUnlockNext({
            unlocked: false,
            next_unit: nextUnitCode,
            completed_count: 0,
          });
        }
      } catch (e) {
        console.warn('complete challenge session failed', e);
      }
    }
  };

  // 返回选题
  const handleBackToSelect = () => {
    setPhase('select');
    setChallenge(null);
    setLastResult(null);
    setShowErrorModal(false);
    setShowSimilarPanel(false);
    setSimilarAnswers({});
    setSimilarResults({});
    setScore(0);
    setCorrectCount(0);
    setCurrentLevel(0);
    setErrorStep(0);
    setShowGuidedSteps(false);
    setShowGuidedFullscreen(false);
    setShowXiaocong(false);
    setXiaocongErrorNoteId(null);
    setHintOpen(false);
    setHintContent(null);
    setUnlockNext(null);
  };

  // #191: 饲养员提示 - 调 AI 生成
  const handleShowHint = async () => {
    if (!challenge || hintLoading) return;
    const level = challenge.levels[currentLevel];
    setHintLoading(true);
    setHintOpen(true);
    setHintContent(null);
    try {
      const r = await generateChallengeHint(token, {
        question: level.question,
        correct_answer: level.answer,
        knowledge_point: level.knowledge_point,
        student_answer: answer.trim() || '',
      });
      if (r.success && r.data) {
        setHintContent(r.data);
      } else {
        setHintContent({ hint: '提示生成失败，请重试', thinking_path: '' });
      }
    } catch (e) {
      setHintContent({ hint: '网络开了小差，请重试', thinking_path: '' });
    } finally {
      setHintLoading(false);
    }
  };

  // 巩固题答题
  const handleSimilarSubmit = async (index: number, question: string, correctAnswer: string, knowledgePoint: string) => {
    const sa = similarAnswers[index];
    if (!sa?.trim()) return;
    setSimilarSubmitting(p => ({ ...p, [index]: true }));
    try {
      const res = await submitSimilarAnswer(token, {
        question,
        student_answer: sa.trim(),
        correct_answer: correctAnswer,
        knowledge_point: knowledgePoint,
      });
      if (res.success) {
        setSimilarResults(p => ({ ...p, [index]: res.data.is_correct }));
        if (res.data.is_correct) setScore(s => s + res.data.points_earned);
      }
    } catch {} finally {
      setSimilarSubmitting(p => ({ ...p, [index]: false }));
    }
  };

  // ===== 选题阶段 =====
  if (phase === 'select') {
    return (
      <div className="min-h-screen p-6" style={{ background: 'linear-gradient(135deg, #F0F4FF 0%, #FFF5F5 50%, #F0FFF4 100%)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex items-center gap-2 text-3xl font-bold mb-2" style={{ color: '#4A3728' }}>
              <Swords className="w-8 h-8" style={{ color: '#F59E0B' }} /> 创意闯关
            </motion.div>
            <p className="text-sm" style={{ color: '#9CA3AF' }}>选择一个知识点，AI 为你设计专属闯关挑战！</p>
          </div>

          <div className="space-y-2">
            {CURRICULUM_DATA.map(unit => (
              <div key={unit.code} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
                <button
                  onClick={() => setExpandedUnit(expandedUnit === unit.code ? null : unit.code)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-2xl">{unit.emoji}</span>
                  <span className="flex-1 font-bold" style={{ color: '#2D3748' }}>{unit.unit}</span>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#F0F4FF', color: '#6366F1' }}>{unit.lessons.length}课时</span>
                  {expandedUnit === unit.code ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>
                <AnimatePresence>
                  {expandedUnit === unit.code && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {unit.lessons.map(lesson => {
                          const isActive = selectedLesson?.code === lesson.code && selectedUnit?.code === unit.code;
                          const stats = lessonStatsMap[lesson.code];
                          // #191 修复：total >= 1 就显示，让学生一开始就有反馈
                          const showStats = stats && stats.total >= 1;
                          return (
                            <button
                              key={lesson.code}
                              onClick={() => { setSelectedUnit(unit); setSelectedLesson(lesson); }}
                              className={`relative text-left px-3 py-2 rounded-lg text-sm transition-all ${
                                isActive ? 'font-bold shadow-sm' : 'hover:bg-slate-100'
                              }`}
                              style={isActive ? { background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', color: '#92400E' } : { color: '#4B5563' }}
                            >
                              {lesson.title}
                              {showStats && (
                                <span
                                  className="ml-2 inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm"
                                  style={{
                                    background: stats.accuracy >= 80 ? '#10B981' : stats.accuracy >= 60 ? '#F59E0B' : '#EF4444',
                                    color: '#FFFFFF',
                                  }}
                                  title={`累计 ${stats.correct}/${stats.total} 正确`}
                                >
                                  {stats.accuracy}%
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {selectedLesson && (
            <div className="mt-6 text-center">
              <motion.button
                onClick={handleStart}
                initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="px-10 py-4 rounded-2xl font-bold text-white text-lg flex items-center gap-3 mx-auto"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}
              >
                <Play className="w-6 h-6" /> 开始闯关：{selectedLesson.title}
              </motion.button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== 生成等待 =====
  if (phase === 'generating') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0F172A, #1E1B4B, #312E81)' }}>
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="text-6xl mb-6 inline-block"
          >
            🧙‍♂️
          </motion.div>
          <p className="text-2xl font-bold text-white mb-2">AI 正在设计闯关...</p>
          <p className="text-sm text-amber-200">根据知识点生成专属挑战题目</p>
          <div className="mt-4 flex justify-center gap-2">
            {[0, 1, 2].map(i => (
              <motion.div key={i}
                className="w-3 h-3 rounded-full" style={{ background: '#F59E0B' }}
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===== 闯关完成 =====
  if (phase === 'complete' && challenge) {
    const total = challenge.levels.length;
    const stars = correctCount >= total * 0.8 ? 3 : correctCount >= total * 0.5 ? 2 : 1;
    const nextUnitName = unlockNext?.next_unit ? KNOWLEDGE_TREE_UNIT_NAMES[unlockNext.next_unit] || unlockNext.next_unit : null;
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A, #D4C4FC)' }}>
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: '#2D3748' }}>闯关完成！</h2>
          <p className="text-sm mb-4" style={{ color: '#9CA3AF' }}>{challenge.theme}</p>
          <div className="flex justify-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <Star key={s} className="w-10 h-10" fill={s <= stars ? '#F59E0B' : 'none'}
                stroke={s <= stars ? '#F59E0B' : '#D1D5DB'} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-3 rounded-xl" style={{ background: '#F0FFF4' }}>
              <Check className="w-5 h-5 mx-auto mb-1" style={{ color: '#10B981' }} />
              <div className="text-xl font-bold" style={{ color: '#059669' }}>{correctCount}</div>
              <div className="text-xs" style={{ color: '#6B7280' }}>正确</div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: '#FFF7ED' }}>
              <X className="w-5 h-5 mx-auto mb-1" style={{ color: '#F97316' }} />
              <div className="text-xl font-bold" style={{ color: '#EA580C' }}>{total - correctCount}</div>
              <div className="text-xs" style={{ color: '#6B7280' }}>需要加油</div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: '#FEF3C7' }}>
              <Trophy className="w-5 h-5 mx-auto mb-1" style={{ color: '#F59E0B' }} />
              <div className="text-xl font-bold" style={{ color: '#D97706' }}>+{score}</div>
              <div className="text-xs" style={{ color: '#6B7280' }}>积分</div>
            </div>
          </div>
          {/* #191: 馆解锁提示 - 始终显示（拿到数据前显示加载） */}
          <div className="mb-4 p-4 rounded-2xl text-left" style={{
            background: unlockNext?.unlocked === true
              ? 'linear-gradient(135deg, #D1FAE5, #A7F3D0)'
              : unlockNext?.unlocked === false
              ? 'linear-gradient(135deg, #FEF3C7, #FDE68A)'
              : 'linear-gradient(135deg, #F3F4F6, #E5E7EB)',
            border: unlockNext?.unlocked === true ? '2px solid #10B981'
              : unlockNext?.unlocked === false ? '2px solid #F59E0B'
              : '2px solid #D1D5DB',
          }}>
            {unlockNext?.unlocked && nextUnitName ? (
              <>
                <div className="flex items-center gap-2 mb-1" style={{ color: '#059669' }}>
                  <Sparkles className="w-5 h-5" />
                  <span className="font-bold">🎉 已解锁下一馆：{nextUnitName}</span>
                </div>
                <div className="text-xs" style={{ color: '#065F46' }}>
                  累计完成 {unlockNext.completed_count} 个闯关会话，达到解锁条件。
                  快去「趣味数学」→「场馆闯关」挑战下一馆吧！
                </div>
              </>
            ) : unlockNext?.unlocked === false ? (
              <>
                <div className="flex items-center gap-2 mb-1" style={{ color: '#92400E' }}>
                  <Shield className="w-5 h-5" />
                  <span className="font-bold text-sm">本馆进度：{unlockNext.completed_count} / 3 闯关</span>
                </div>
                <div className="text-xs" style={{ color: '#78350F' }}>
                  完成 3 个闯关会话即可解锁下一馆。继续加油！
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2" style={{ color: '#6B7280' }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">正在检查馆解锁进度...</span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            {unlockNext?.unlocked && (
              <button onClick={() => window.location.href = '/student/fun-games'}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                <Sparkles className="w-4 h-4" /> 去下一馆挑战
              </button>
            )}
            <button onClick={handleBackToSelect}
              className={`${unlockNext?.unlocked ? 'flex-1' : 'w-full'} px-6 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2`}
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
              <ArrowLeft className="w-5 h-5" /> 再来一关
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ===== 闯关中 =====
  if (!challenge || challenge.levels.length === 0) return null;
  const level = challenge.levels[currentLevel];
  const total = challenge.levels.length;

  return (
    <div className="min-h-screen p-4" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 40%, #1E3A5F 100%)' }}>
      <div className="max-w-2xl mx-auto">
        {/* 顶部进度条 */}
        <div className="flex items-center justify-between mb-4 text-white">
          <button onClick={handleBackToSelect} className="text-white/60 hover:text-white/90">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="text-sm font-bold text-center">{challenge.theme}</div>
            <div className="text-xs text-amber-300 text-center">第 {currentLevel + 1} 关 / 共 {total} 关</div>
          </div>
          <div className="flex items-center gap-1 text-sm text-amber-400">
            <Trophy className="w-4 h-4" /> {score}
          </div>
        </div>
        <div className="w-full h-2 rounded-full mb-6" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <motion.div className="h-2 rounded-full" style={{ background: 'linear-gradient(90deg, #F59E0B, #EF4444)' }}
            animate={{ width: `${((currentLevel + 1) / total) * 100}%` }} />
        </div>

        {/* 关卡卡片 */}
        <motion.div key={currentLevel} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }}
          className="bg-white/95 backdrop-blur rounded-3xl p-6 shadow-2xl mb-4">
          {/* 关卡标题 */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">
              {level.difficulty === 'basic' ? '⭐' : level.difficulty === 'advanced' ? '🔥' : '👑'}
            </span>
            <div>
              <h3 className="font-bold text-lg" style={{ color: '#2D3748' }}>第{level.level}关：{level.level_name}</h3>
              <p className="text-xs" style={{ color: '#9CA3AF' }}>{level.scene}</p>
            </div>
          </div>

          {/* 题目 */}
          <div className="p-4 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, #F0F4FF, #FFF7ED)' }}>
            <div className="flex items-start gap-2">
              <Target className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#6366F1' }} />
              <span className="text-lg font-medium" style={{ color: '#1F2937' }}>{level.question}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F3E8F9', color: '#8B5CF6' }}>{level.knowledge_point}</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#D97706' }}>{level.difficulty === 'basic' ? '基础' : level.difficulty === 'advanced' ? '提升' : '拓展'}</span>
            </div>
          </div>

          {/* 答题区域 */}
          {!lastResult ? (
            <div>
              <div className="flex gap-2">
                <input ref={inputRef} type="text" value={answer} onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
                  placeholder="输入你的答案..."
                  className="flex-1 px-4 py-3 rounded-xl text-lg outline-none border-2 border-slate-200 focus:border-purple-400 transition-colors"
                  style={{ color: '#2D3748' }} />
                <motion.button onClick={handleSubmitAnswer} disabled={submitting || !answer.trim()}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="px-6 py-3 rounded-xl font-bold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : '确定'}
                </motion.button>
              </div>
              {/* #191: 饲养员提示按钮 */}
              <button onClick={handleShowHint} disabled={hintLoading}
                className="mt-2 w-full py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', color: '#92400E' }}>
                <Shield className="w-4 h-4" /> {hintLoading ? '饲养员在想…' : '🦊 饲养员提示（不给答案）'}
              </button>
            </div>
          ) : (
            <div>
              {/* 结果展示 */}
              <div className={`p-4 rounded-2xl mb-3 flex items-center gap-3 ${
                lastResult.is_correct ? 'bg-green-50' : 'bg-red-50'
              }`}>
                {lastResult.is_correct ? (
                  <Check className="w-8 h-8 text-green-500 flex-shrink-0" />
                ) : (
                  <X className="w-8 h-8 text-red-500 flex-shrink-0" />
                )}
                <div>
                  <div className={`font-bold ${lastResult.is_correct ? 'text-green-700' : 'text-red-700'}`}>
                    {lastResult.is_correct ? '回答正确！' : '回答错误'}
                  </div>
                  {!lastResult.is_correct && (
                    <div className="text-sm mt-1" style={{ color: '#374151' }}>
                      正确答案：<span className="font-bold text-green-600">{lastResult.correct_answer}</span>
                    </div>
                  )}
                  <div className="text-xs mt-1" style={{ color: '#6B7280' }}>
                    +{lastResult.points_earned} 积分
                  </div>
                </div>
              </div>

              {/* 解法提示 */}
              {!lastResult.is_correct && (
                <div className="p-3 rounded-xl mb-3" style={{ background: '#F0F4FF' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen className="w-4 h-4" style={{ color: '#6366F1' }} />
                    <span className="text-sm font-bold" style={{ color: '#4338CA' }}>解法提示</span>
                  </div>
                  <p className="text-sm" style={{ color: '#4B5563' }}>{level.explanation}</p>

                  {/* #191: 小聪对话引导按钮（答错后优先入口） */}
                  {lastResult.error_note_id && (
                    <button
                      onClick={() => {
                        setXiaocongErrorNoteId(lastResult.error_note_id!);
                        setShowXiaocong(true);
                      }}
                      className="mt-3 w-full py-2 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
                      style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)', color: '#FFFFFF' }}>
                      🦊 让小聪对话引导
                    </button>
                  )}

                  {/* 引导改错 - 分步骤展开（折叠式，保留 4 步引导入口） */}
                  {lastResult.guided_correction && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowGuidedSteps(!showGuidedSteps)}
                        className="text-sm font-bold flex items-center gap-1 w-full text-left"
                        style={{ color: '#F97316' }}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        {showGuidedSteps ? '▼ 4 步引导（点击收起）' : '▶ 4 步引导（点击展开）'}
                      </button>
                      {showGuidedSteps && (
                        <div className="mt-2 space-y-2">
                          {lastResult.guided_correction.steps?.map((s: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: '#FFF7ED' }}>
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: '#F97316' }}>{s.step || i + 1}</span>
                              <span className="text-sm" style={{ color: '#7C2D12' }}>{s.content}</span>
                            </div>
                          )) || (
                            <p className="text-sm" style={{ color: '#7C2D12' }}>{lastResult.guided_correction.error_reason}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 知识点解析按钮 */}
                  {lastResult.error_analysis && (
                    <button onClick={() => setShowErrorModal(true)}
                      className="mt-3 w-full py-2 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
                      style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', color: '#92400E' }}>
                      <Lightbulb className="w-4 h-4" /> 查看知识点解析
                    </button>
                  )}

                  {/* 巩固练习按钮 */}
                  {lastResult.similar_questions?.questions && lastResult.similar_questions.questions.length > 0 && (
                    <button
                      onClick={() => setShowSimilarPanel(true)}
                      className="mt-2 w-full py-2 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
                      style={{ background: '#F3E8F9', color: '#7C3AED' }}
                    >
                      <Zap className="w-4 h-4" /> 巩固练习（{lastResult.similar_questions.questions.length}道）
                    </button>
                  )}
                </div>
              )}

              {/* 下一题按钮 */}
              <div className="flex gap-3">
                <button onClick={handleNext}
                  className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                  {currentLevel < total - 1 ? (<><ArrowRight className="w-4 h-4" /> 下一关</>) : (<><Trophy className="w-4 h-4" /> 查看成绩</>)}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ===== 知识点解析弹窗 ===== */}
      <AnimatePresence>
        {showErrorModal && lastResult?.error_analysis && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowErrorModal(false)}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl max-h-[80vh] overflow-y-auto"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#2D3748' }}>
                  <BookOpen className="w-5 h-5" style={{ color: '#8B5CF6' }} /> 知识点解析
                </h3>
                <button onClick={() => setShowErrorModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="p-3 rounded-xl" style={{ background: '#F3E8F9' }}>
                  <div className="text-xs font-bold mb-1" style={{ color: '#8B5CF6' }}>📌 {lastResult.error_analysis.knowledge_point}</div>
                  <p className="text-sm" style={{ color: '#374151' }}>{lastResult.error_analysis.knowledge_explanation}</p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: '#FEF2F2' }}>
                  <div className="text-xs font-bold mb-1" style={{ color: '#EF4444' }}>⚠️ 常见误区</div>
                  <p className="text-sm" style={{ color: '#374151' }}>{lastResult.error_analysis.common_mistake}</p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: '#FEF3C7' }}>
                  <div className="text-xs font-bold mb-1" style={{ color: '#D97706' }}>🎵 解题口诀</div>
                  <p className="text-base font-bold" style={{ color: '#92400E' }}>{lastResult.error_analysis.mnemonic}</p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: '#F0FFF4' }}>
                  <div className="text-xs font-bold mb-1" style={{ color: '#10B981' }}>🔍 同类题识别</div>
                  <p className="text-sm" style={{ color: '#374151' }}>{lastResult.error_analysis.type_features}</p>
                </div>
              </div>
              <button onClick={() => { setShowErrorModal(false); setShowSimilarPanel(true); }}
                className="w-full mt-4 py-3 rounded-xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                <Zap className="w-4 h-4 inline mr-1.5" /> 来几道同方向题练习
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== 巩固练习弹窗 ===== */}
      <AnimatePresence>
        {showSimilarPanel && lastResult?.similar_questions?.questions && lastResult.similar_questions.questions.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowSimilarPanel(false)}>
            <motion.div initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 50 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl max-h-[80vh] overflow-y-auto"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#2D3748' }}>
                  <Flame className="w-5 h-5" style={{ color: '#F97316' }} /> 巩固练习
                </h3>
                <button onClick={() => setShowSimilarPanel(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {lastResult.similar_questions.questions.map((sq, i) => (
                  <div key={i} className="p-4 rounded-2xl border-2 border-slate-200">
                    <div className="flex items-start gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: '#8B5CF6' }}>{i + 1}</span>
                      <span className="text-sm font-medium" style={{ color: '#1F2937' }}>{sq.question}</span>
                    </div>
                    {similarResults[i] === undefined ? (
                      <div className="flex gap-2">
                        <input type="text" value={similarAnswers[i] || ''} placeholder="输入答案"
                          onChange={e => setSimilarAnswers(p => ({ ...p, [i]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleSimilarSubmit(i, sq.question, sq.answer, sq.knowledge_point)}
                          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border-2 border-slate-200 focus:border-purple-400" />
                        <button onClick={() => handleSimilarSubmit(i, sq.question, sq.answer, sq.knowledge_point)}
                          disabled={!similarAnswers[i]?.trim() || similarSubmitting[i]}
                          className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                          style={{ background: '#8B5CF6' }}>
                          {similarSubmitting[i] ? <Loader2 className="w-4 h-4 animate-spin" /> : '提交'}
                        </button>
                      </div>
                    ) : similarResults[i] ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <Check className="w-5 h-5" /> <span className="font-bold">正确！</span> +3积分
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-red-500">
                          <X className="w-5 h-5" /> <span className="font-bold">再想想</span>
                        </div>
                        <div className="text-sm" style={{ color: '#059669' }}>正确答案：{sq.answer}</div>
                        {sq.explanation && <div className="text-xs" style={{ color: '#6B7280' }}>{sq.explanation}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setShowSimilarPanel(false)}
                className="w-full mt-4 py-3 rounded-xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                完成练习
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== 饲养员提示弹窗 ===== */}
      <AnimatePresence>
        {hintOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setHintOpen(false)}>
            <motion.div initial={{ scale: 0.85, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 50 }}
              className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-amber-300"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }}>
                  🦊
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold" style={{ color: '#92400E' }}>饲养员提示</h3>
                  <p className="text-xs" style={{ color: '#A16207' }}>不剧透答案，启发一下你的思路</p>
                </div>
                <button onClick={() => setHintOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {hintLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-amber-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">饲养员正在想...</span>
                </div>
              ) : hintContent ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #FDE68A' }}>
                    <div className="text-xs font-bold mb-1" style={{ color: '#D97706' }}>💡 提示</div>
                    <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>{hintContent.hint}</p>
                  </div>
                  {hintContent.thinking_path && (
                    <div className="p-3 rounded-xl" style={{ background: '#FEF3C7' }}>
                      <div className="text-xs font-bold mb-1" style={{ color: '#92400E' }}>🛤 思路路径</div>
                      <p className="text-sm" style={{ color: '#78350F' }}>{hintContent.thinking_path}</p>
                    </div>
                  )}
                  <button onClick={() => setHintOpen(false)}
                    className="w-full mt-2 py-2 rounded-xl text-sm font-bold"
                    style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#FFFFFF' }}>
                    收到，去试试
                  </button>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== 小聪对话 dialog（#191 答错自动弹） ===== */}
      {xiaocongErrorNoteId && (
        <XiaocongDialog
          open={showXiaocong}
          errorNoteId={xiaocongErrorNoteId}
          questionText={challenge.levels[currentLevel]?.question}
          studentAnswer={answer.trim() || ''}
          correctAnswer={lastResult?.correct_answer || challenge.levels[currentLevel]?.answer || ''}
          knowledgePoint={challenge.levels[currentLevel]?.knowledge_point || ''}
          onClose={() => {
            setShowXiaocong(false);
            // 小聪对话结束后，让 errorStep 推进，让「下一关」按钮可用
            setErrorStep(2);
          }}
          onStageDone={() => {
            setErrorStep(2);
          }}
        />
      )}

      {/* ===== 闯关答错-全屏AI引导（兜底，原有保留） ===== */}
      <AnimatePresence>
        {showGuidedFullscreen && lastResult && !lastResult.is_correct && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowGuidedFullscreen(false)}>
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 30 }}
              className="bg-white rounded-3xl p-6 max-w-xl w-full shadow-2xl max-h-[85vh] overflow-y-auto"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              {/* 头部 */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }}>
                  <Lightbulb className="w-6 h-6" style={{ color: '#D97706' }} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold" style={{ color: '#2D3748' }}>AI 引导思考</h3>
                  <p className="text-xs" style={{ color: '#9CA3AF' }}>别着急，我们一起一步步分析</p>
                </div>
                <button onClick={() => setShowGuidedFullscreen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 题目回顾 */}
              <div className="p-4 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, #F0F4FF, #FFF7ED)' }}>
                <div className="flex items-start gap-2">
                  <Target className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#6366F1' }} />
                  <div>
                    <p className="text-sm font-bold mb-1" style={{ color: '#1F2937' }}>{level.question}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-red-500">你的答案：<span className="font-bold">{answer}</span></span>
                      <span className="text-xs text-green-600">正确答案：<span className="font-bold">{lastResult.correct_answer}</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 引导步骤 */}
              {lastResult.guided_correction?.steps && Array.isArray(lastResult.guided_correction.steps) ? (
                <div className="space-y-3 mb-5">
                  {lastResult.guided_correction.steps.map((s: any, i: number) => (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className="flex items-start gap-3 p-3 rounded-xl"
                      style={{ background: i % 2 === 0 ? '#FFF7ED' : '#F0F4FF' }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ background: i === 0 ? '#F97316' : i === 1 ? '#6366F1' : i === 2 ? '#10B981' : '#8B5CF6' }}>
                        {s.step || i + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm" style={{ color: '#374151' }}>{s.content}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl mb-4" style={{ background: '#FFF7ED' }}>
                  <p className="text-sm" style={{ color: '#7C2D12' }}>{lastResult.guided_correction?.error_reason || '正在分析你的错误...'}</p>
                </div>
              )}

              {/* 知识点标签 */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: '#F3E8F9', color: '#8B5CF6' }}>{level.knowledge_point}</span>
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: '#FEF3C7', color: '#D97706' }}>
                  {level.difficulty === 'basic' ? '基础' : level.difficulty === 'advanced' ? '提升' : '拓展'}
                </span>
              </div>

              {/* 底部按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowGuidedFullscreen(false);
                    if (errorStep === 1) setErrorStep(2);
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}>
                  <Check className="w-4 h-4" /> 我理解了
                </button>
                <button
                  onClick={() => {
                    setShowGuidedFullscreen(false);
                    setShowErrorModal(true);
                    if (errorStep === 1) setErrorStep(2);
                  }}
                  className="py-3 px-4 rounded-xl font-bold text-sm flex items-center gap-1.5"
                  style={{ background: '#F3E8F9', color: '#7C3AED' }}>
                  <BookOpen className="w-4 h-4" /> 知识点解析
                </button>
              </div>
              <button
                onClick={() => {
                  setShowGuidedFullscreen(false);
                  setShowSimilarPanel(true);
                  if (errorStep === 1) setErrorStep(2);
                }}
                className="w-full mt-2 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                style={{ background: '#F0F4FF', color: '#6366F1' }}>
                <Zap className="w-4 h-4" /> 巩固练习
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}