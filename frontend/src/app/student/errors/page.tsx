'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Stethoscope, AlertCircle, Heart, ChevronDown, ChevronUp, Sparkles,
  Activity, HeartPulse, Filter, Loader2, RefreshCw, Lightbulb,
  Zap, Target, Check, X, Trophy, Camera, Upload, Flame, Award, BookOpen,
} from 'lucide-react';
import {
  getStoredUser, getToken, fetchErrors, diagnoseError, fetchStudentDashboard,
  mistakeBreakthrough, submitBreakthroughAnswer, resolveErrorNote,
  uploadErrorPhoto, fetchReheatList, generateExpansion, getExpansionTask, submitExpansionAnswer,
} from '@/lib/api';

interface ErrorItem {
  id: number;
  student_id: number;
  question_id: number;
  status: string;
  correct_answer: string;
  student_answer: string;
  question_text: string;
  content: string;
  unit_code: string;
  question_answer: string;
  question_analysis: string;
  knowledge_point?: string;
  created_at?: string;
  source?: string;
  analysis?: string;
  needs_reheat?: boolean;
  reheat_status?: string;
  reheat_due?: string;
  reheat_count?: number;
  image_path?: string;
  error_type?: string;
}

interface VenueMap {
  emoji: string;
  name: string;
  key: string;
}

// Map unit_code or knowledge_point to venue info
function getVenueInfo(unitCode: string, knowledgePoint?: string): VenueMap {
  const kp = (knowledgePoint || '').toLowerCase();
  const uc = unitCode || '';
  const map: Record<string, VenueMap> = {
    '5A-U1': { emoji: '🦁', name: '整数加减馆', key: '加减法' },
    '5A-U2': { emoji: '🐘', name: '小数乘法馆', key: '小数乘法' },
    '5A-U3': { emoji: '🐘', name: '小数乘法馆', key: '小数乘法' },
    '5A-U4': { emoji: '🐧', name: '小数除法馆', key: '小数除法' },
    '5A-U5': { emoji: '🐒', name: '简易方程馆', key: '方程' },
    '5A-U6': { emoji: '🦋', name: '多边形面积馆', key: '面积' },
    '5A-U7': { emoji: '🦒', name: '可能性馆', key: '概率' },
    '5A-U8': { emoji: '🐴', name: '数学广角馆', key: '优化' },
    '5B-U1': { emoji: '🦛', name: '观察物体馆', key: '观察' },
    '5B-U2': { emoji: '🦛', name: '因数倍数馆', key: '因数' },
    '5B-U3': { emoji: '🦛', name: '长方体正方体馆', key: '长方体' },
    '5B-U4': { emoji: '🦛', name: '分数意义馆', key: '分数' },
    '5B-U5': { emoji: '🦛', name: '分数加减馆', key: '分数加减' },
  };

  // Try unit_code first
  if (map[uc]) return map[uc];

  // Try matching by knowledge_point keywords
  const kpMap: Record<string, VenueMap> = {
    '加减': { emoji: '🦁', name: '整数加减馆', key: '加减法' },
    '乘法': { emoji: '🐘', name: '小数乘法馆', key: '小数乘法' },
    '除法': { emoji: '🐧', name: '小数除法馆', key: '小数除法' },
    '方程': { emoji: '🐒', name: '简易方程馆', key: '方程' },
    '面积': { emoji: '🦋', name: '多边形面积馆', key: '面积' },
    '概率': { emoji: '🦒', name: '可能性馆', key: '概率' },
    '可能': { emoji: '🦒', name: '可能性馆', key: '概率' },
  };
  for (const [k, v] of Object.entries(kpMap)) {
    if (kp.includes(k)) return v;
  }

  return { emoji: '🦛', name: '综合练习', key: '综合' };
}

export default function StudentErrors() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [expandedPlans, setExpandedPlans] = useState<Record<number, boolean>>({});
  const [diagnosisMap, setDiagnosisMap] = useState<Record<number, string>>({});
  const [diagnosing, setDiagnosing] = useState<Record<number, boolean>>({});
  const [stats, setStats] = useState({ unresolved: 0, resolved: 0, total: 0 });
  const [token, setToken] = useState<string>('');
  const [breakthroughOpen, setBreakthroughOpen] = useState(false);
  const [breakthroughLoading, setBreakthroughLoading] = useState(false);
  const [breakthroughData, setBreakthroughData] = useState<any>(null);
  const [breakthroughAnswers, setBreakthroughAnswers] = useState<Record<number, string>>({});
  const [breakthroughResults, setBreakthroughResults] = useState<Record<number, boolean | null>>({});
  const [breakthroughSubmitting, setBreakthroughSubmitting] = useState<Record<number, boolean>>({});
  // 上传错题
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState('');
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 回炉 + 拓展
  const [reheatStats, setReheatStats] = useState({ total_resolved: 0, pending_count: 0, mastered_count: 0 });
  const [expansionOpen, setExpansionOpen] = useState(false);
  const [expansionLoading, setExpansionLoading] = useState(false);
  const [expansionData, setExpansionData] = useState<any>(null);
  const [expansionAnswers, setExpansionAnswers] = useState<Record<number, string>>({});
  const [expansionResults, setExpansionResults] = useState<Record<number, boolean | null>>({});
  const [expansionSubmitting, setExpansionSubmitting] = useState(false);
  // 视图模式
  const [viewMode, setViewMode] = useState<'venue' | 'knowledge'>('venue');
  const [kpGroups, setKpGroups] = useState<any[]>([]);

  useEffect(() => {
    const u = getStoredUser();
    const t = getToken();
    if (t) setToken(t);
    if (u) {
      setUser(u);
      loadData(u.id);
    } else {
      setLoading(false);
    }
  }, []);

  const loadData = async (studentId: number) => {
    try {
      const [errorRes, dashRes, reheatRes] = await Promise.all([
        fetchErrors(studentId),
        fetchStudentDashboard(studentId),
        fetchReheatList(studentId),
      ]);
      setErrors(errorRes?.errors || []);
      setKpGroups(errorRes?.kp_groups || []);
      setStats({
        unresolved: dashRes?.unresolved_errors || errorRes?.stats?.unresolved || 0,
        resolved: dashRes?.resolved_errors || errorRes?.stats?.resolved || 0,
        total: dashRes?.total_errors || errorRes?.stats?.total || 0,
      });
      setReheatStats(reheatRes?.stats || { total_resolved: 0, pending_count: 0, mastered_count: 0 });
    } catch (e) {
      console.error('Load errors error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDiagnose = async (error: ErrorItem) => {
    if (diagnosisMap[error.id]) {
      // Already diagnosed, just toggle
      setExpandedPlans((prev) => ({ ...prev, [error.id]: !prev[error.id] }));
      return;
    }
    setDiagnosing((prev) => ({ ...prev, [error.id]: true }));
    try {
      const questionContent = error.question_text || error.content || '';
      const studentAns = error.student_answer || '';
      const correctAns = error.correct_answer || error.question_answer || '';
      const venueInfo = getVenueInfo(error.unit_code, error.knowledge_point);

      const res = await diagnoseError(
        user.id,
        questionContent,
        studentAns,
        correctAns,
        venueInfo.key,
      );

      // LearnAgent returns various formats; extract the guidance text
      let guidance = '';
      if (typeof res === 'string') {
        guidance = res;
      } else if (res?.guidance) {
        guidance = res.guidance;
      } else if (res?.analysis) {
        guidance = res.analysis;
      } else if (res?.steps) {
        guidance = Array.isArray(res.steps) ? res.steps.join('\n') : String(res.steps);
      } else if (res?.message) {
        guidance = res.message;
      } else {
        guidance = JSON.stringify(res, null, 2);
      }

      setDiagnosisMap((prev) => ({ ...prev, [error.id]: guidance }));
      setExpandedPlans((prev) => ({ ...prev, [error.id]: true }));
    } catch (e) {
      console.error('Diagnose error:', e);
      setDiagnosisMap((prev) => ({ ...prev, [error.id]: 'AI 诊断暂时不可用，请稍后重试~' }));
      setExpandedPlans((prev) => ({ ...prev, [error.id]: true }));
    } finally {
      setDiagnosing((prev) => ({ ...prev, [error.id]: false }));
    }
  };

  // ===== 错题突破 =====
  const handleBreakthrough = async () => {
    if (breakthroughData) {
      setBreakthroughOpen(!breakthroughOpen);
      return;
    }
    setBreakthroughLoading(true);
    try {
      const res = await mistakeBreakthrough(token);
      setBreakthroughData(res);
      setBreakthroughOpen(true);
    } catch (e) {
      console.error('Breakthrough error:', e);
    } finally {
      setBreakthroughLoading(false);
    }
  };

  const handleBreakthroughSubmit = async (questionIndex: number, correctAnswer: string) => {
    if (!user || !token) return;
    setBreakthroughSubmitting(prev => ({ ...prev, [questionIndex]: true }));
    try {
      const studentAnswer = breakthroughAnswers[questionIndex] || '';
      const res = await submitBreakthroughAnswer(token, {
        student_id: user.id,
        question_index: questionIndex,
        student_answer: studentAnswer,
        correct_answer: correctAnswer,
      });
      setBreakthroughResults(prev => ({ ...prev, [questionIndex]: res.is_correct }));
    } catch (e) {
      console.error('Submit breakthrough error:', e);
    } finally {
      setBreakthroughSubmitting(prev => ({ ...prev, [questionIndex]: false }));
    }
  };

  // ===== 标记错题已解决 =====
  const handleResolve = async (noteId: number) => {
    if (!token) return;
    try {
      await resolveErrorNote(token, noteId);
      setErrors(prev => prev.map(e => e.id === noteId ? { ...e, status: 'resolved' } : e));
      setStats(prev => ({ ...prev, unresolved: Math.max(0, prev.unresolved - 1), resolved: prev.resolved + 1 }));
      if (user) loadData(user.id);
    } catch (e) {
      console.error('Resolve error:', e);
    }
  };

  // ===== 上传错题 =====
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadPreview(result);
      setUploadResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async () => {
    if (!user || !uploadPreview) return;
    setUploading(true);
    try {
      const res = await uploadErrorPhoto(user.id, uploadPreview);
      setUploadResult(res);
      // 刷新列表
      loadData(user.id);
    } catch (e: any) {
      setUploadResult({ error: e.message || '上传失败，请重试' });
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setUploadOpen(false);
    setUploadPreview('');
    setUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ===== 错题拓展（基于已解决错题） =====
  const handleExpansion = async () => {
    if (expansionData) {
      setExpansionOpen(!expansionOpen);
      return;
    }
    if (!user || !token) return;
    setExpansionLoading(true);
    try {
      const res = await generateExpansion(token, user.id);
      // 轮询任务状态
      const poll = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const task = await getExpansionTask(res.task_id);
          if (task.status === 'done') {
            setExpansionData(task.result);
            setExpansionOpen(true);
            setExpansionLoading(false);
            return;
          }
          if (task.status === 'error') {
            setExpansionLoading(false);
            alert('生成失败：' + (task.error || '请稍后重试'));
            return;
          }
        }
        setExpansionLoading(false);
        alert('生成超时，请稍后重试');
      };
      poll();
    } catch (e) {
      console.error('Expansion error:', e);
      setExpansionLoading(false);
    }
  };

  const handleExpansionSubmitAll = async () => {
    if (!user || !token || !expansionData?.questions) return;
    setExpansionSubmitting(true);
    const questions = expansionData.questions;
    const allCorrect = questions.every((q: any, i: number) => {
      const ans = expansionAnswers[i]?.trim();
      return ans && ans === q.answer;
    });
    // 如果有未答的题，不允许提交
    const allAnswered = questions.every((_: any, i: number) => expansionAnswers[i]?.trim());
    if (!allAnswered) {
      // 逐题标记对错
      const results: Record<number, boolean | null> = {};
      questions.forEach((q: any, i: number) => {
        const ans = expansionAnswers[i]?.trim();
        results[i] = ans ? ans === q.answer : null;
      });
      setExpansionResults(results);
      setExpansionSubmitting(false);
      return;
    }
    // 标记每题对错
    const results: Record<number, boolean> = {};
    let correct = true;
    questions.forEach((q: any, i: number) => {
      results[i] = expansionAnswers[i].trim() === q.answer;
      if (!results[i]) correct = false;
    });
    setExpansionResults(results);
    try {
      // 提交结果（使用第一道题的信息）
      await submitExpansionAnswer(token, {
        student_id: user.id,
        question_text: questions[0].question,
        student_answer: expansionAnswers[0] || '',
        correct_answer: questions[0].answer,
        knowledge_point: questions[0].knowledge_point || '',
        all_correct: correct,
      });
      if (correct) {
        // 全部正确，刷新数据
        setTimeout(() => {
          loadData(user.id);
          setExpansionData(null);
          setExpansionOpen(false);
        }, 2000);
      }
    } catch (e) {
      console.error('Expansion submit error:', e);
    } finally {
      setExpansionSubmitting(false);
    }
  };

  // Build filter options from actual error data
  const venueFilters: { label: string; key: string; emoji: string }[] = [
    { label: '全部', key: 'all', emoji: '' },
  ];
  const seenKeys = new Set<string>();
  errors.forEach((e) => {
    const vi = getVenueInfo(e.unit_code, e.knowledge_point);
    if (!seenKeys.has(vi.key)) {
      seenKeys.add(vi.key);
      venueFilters.push({ label: vi.name, key: vi.key, emoji: vi.emoji });
    }
  });

  const filtered = viewMode === 'knowledge' || activeFilter === 'all'
    ? errors
    : errors.filter((e) => getVenueInfo(e.unit_code, e.knowledge_point).key === activeFilter);

  if (loading) {
    return (
      <div className="text-center py-20">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-[#73C067]" />
        <p className="text-sm" style={{ color: '#8B7355' }}>加载错题数据...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============= 救助站横幅 ============= */}
      <section
        className="glass-card-solid relative overflow-hidden p-6 md:p-8"
        style={{
          background:
            'linear-gradient(135deg, rgba(232, 245, 228, 0.92) 0%, rgba(224, 242, 250, 0.85) 50%, rgba(255, 240, 219, 0.85) 100%)',
        }}
      >
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="shrink-0 flex items-end gap-2 text-5xl md:text-6xl select-none">
            <span className="animal-bounce">🐘</span>
            <span className="animal-bounce-delay">🦒</span>
            <span className="animal-bounce-delay2">🐵</span>
            <span style={{ fontSize: '0.7em' }} className="animal-bounce">🦛</span>
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-2"
              style={{ background: 'rgba(255, 138, 138, 0.18)', color: '#D04040' }}
            >
              <Stethoscope className="w-3.5 h-3.5" />
              AI 兽医工作站
            </div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
              <HeartPulse className="w-7 h-7" style={{ color: '#FF8A8A' }} />
              错题救助站
            </h1>
            <p className="text-sm md:text-base mt-2" style={{ color: '#8B7355' }}>
              帮助受伤的小动物恢复健康吧！每一道错题都是一只等待救助的小动物~
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, rgba(149,216,240,0.2), rgba(100,180,220,0.12))', color: '#2D7A8E', border: '1.5px solid rgba(149,216,240,0.4)' }}
            >
              <Camera className="w-3.5 h-3.5" />
              上传错题
            </button>
            <button
              onClick={() => user && loadData(user.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
              style={{ background: 'rgba(255, 255, 255, 0.7)', color: '#8B7355', border: '1.5px solid rgba(200, 230, 192, 0.5)' }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              刷新
            </button>
          </div>
        </div>
      </section>

      {/* ============= 统计 ============= */}
      <section className="grid grid-cols-3 gap-4">
        <div className="glass-card p-5 text-center" style={{ background: 'rgba(255, 138, 138, 0.12)' }}>
          <div className="w-11 h-11 mx-auto mb-2 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
            <AlertCircle className="w-5 h-5" style={{ color: '#FF8A8A' }} />
          </div>
          <div className="text-2xl font-black" style={{ color: '#D04040' }}>{stats.unresolved}</div>
          <div className="text-xs mt-1 font-semibold" style={{ color: '#8B7355' }}>待救助动物（只）</div>
        </div>
        <div className="glass-card p-5 text-center" style={{ background: 'rgba(255, 184, 108, 0.15)' }}>
          <div className="w-11 h-11 mx-auto mb-2 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
            <Activity className="w-5 h-5" style={{ color: '#FFB86C' }} />
          </div>
          <div className="text-2xl font-black" style={{ color: '#8B5A1B' }}>{stats.total}</div>
          <div className="text-xs mt-1 font-semibold" style={{ color: '#8B7355' }}>累计错题（道）</div>
        </div>
        <div className="glass-card p-5 text-center" style={{ background: 'rgba(115, 192, 103, 0.15)' }}>
          <div className="w-11 h-11 mx-auto mb-2 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
            <Heart className="w-5 h-5" style={{ color: '#73C067' }} />
          </div>
          <div className="text-2xl font-black" style={{ color: '#2D5A27' }}>{stats.resolved}</div>
          <div className="text-xs mt-1 font-semibold" style={{ color: '#8B7355' }}>已康复（只）</div>
        </div>
      </section>

      {/* ============= 每周回炉 ============= */}
      {reheatStats.total_resolved > 0 && (
        <section className="glass-card-solid p-5" style={{
          background: 'linear-gradient(135deg, rgba(255, 240, 219, 0.7), rgba(255, 220, 180, 0.4))',
        }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg, rgba(255,160,80,0.2), rgba(255,184,108,0.12))' }}>
                <Flame className="w-6 h-6" style={{ color: '#FF9F40' }} />
              </div>
              <div>
                <h3 className="text-base font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
                  每周回炉
                  {reheatStats.pending_count > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(255, 138, 138, 0.2)', color: '#D04040' }}>
                      {reheatStats.pending_count}题待回炉
                    </span>
                  )}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>
                  已康复 {reheatStats.total_resolved} 题 · 已掌握 {reheatStats.mastered_count} 题
                  {reheatStats.pending_count > 0 ? ' · 本周有错题到期需要复习' : ' · 本周无到期错题，继续保持！'}
                </p>
              </div>
            </div>
            {reheatStats.pending_count > 0 && (
              <button
                onClick={handleExpansion}
                disabled={expansionLoading || !token}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #FF9F40 0%, #FF7A1E 100%)', boxShadow: '0 4px 14px rgba(255,159,64,0.3)' }}
              >
                {expansionLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI生成中...
                  </>
                ) : expansionOpen ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    收起
                  </>
                ) : (
                  <>
                    <Award className="w-4 h-4" />
                    开始拓展确认
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ============= 拓展练习区 ============= */}
      {expansionOpen && expansionData && (
        <section className="glass-card-solid p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5" style={{ color: '#FF9F40' }} />
              <h3 className="text-lg font-bold" style={{ color: '#4A3728' }}>
                拓展确认 · {expansionData.knowledge_tag || '综合知识点'}
              </h3>
            </div>
            <span className="text-xs px-3 py-1 rounded-full" style={{ background: 'rgba(255, 184, 108, 0.15)', color: '#8B5A1B' }}>
              全部答对 = 知识点已掌握
            </span>
          </div>
          {expansionData.questions?.length ? (
            <div className="space-y-4">
              {expansionData.questions.map((q: any, i: number) => {
                const result = expansionResults[i];
                return (
                  <div key={i} className="rounded-xl p-4" style={{
                    background: result === true
                      ? 'rgba(115, 192, 103, 0.15)'
                      : result === false
                      ? 'rgba(255, 138, 138, 0.15)'
                      : 'rgba(255, 240, 219, 0.5)',
                    border: result === true ? '2px solid rgba(115,192,103,0.4)' : result === false ? '2px solid rgba(255,138,138,0.4)' : '1.5px solid rgba(255,184,108,0.3)',
                  }}>
                    <div className="flex items-start gap-2 mb-3">
                      <Target className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#FF9F40' }} />
                      <div>
                        <p className="text-sm" style={{ color: '#4A3728' }}>{q.question}</p>
                        {q.difficulty && (
                          <span className="text-xs mt-1 inline-block px-2 py-0.5 rounded-full"
                                style={{ background: q.difficulty === 'extension' ? 'rgba(168, 85, 247, 0.15)' : q.difficulty === 'advanced' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(115, 192, 103, 0.15)',
                                         color: q.difficulty === 'extension' ? '#7C3AED' : q.difficulty === 'advanced' ? '#2563EB' : '#2D5A27' }}>
                            {q.difficulty === 'extension' ? '拓展' : q.difficulty === 'advanced' ? '提升' : '基础'}
                          </span>
                        )}
                      </div>
                    </div>
                    {result === undefined || result === null ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={expansionAnswers[i] || ''}
                          onChange={e => setExpansionAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                          placeholder="输入你的答案..."
                          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                          style={{ background: 'rgba(255, 255, 255, 0.8)', border: '1.5px solid rgba(255, 184, 108, 0.4)', color: '#4A3728' }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        {result ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: '#2D5A27' }}>
                            <Check className="w-4 h-4" /> 回答正确！
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <X className="w-4 h-4" style={{ color: '#D04040' }} />
                            <span style={{ color: '#D04040', textDecoration: 'line-through' }}>{expansionAnswers[i]}</span>
                            <span style={{ color: '#2D5A27', fontWeight: 'bold' }}> → {q.answer}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {q.knowledge_point && (
                      <p className="text-xs mt-1" style={{ color: '#8B7355' }}>知识点：{q.knowledge_point}</p>
                    )}
                  </div>
                );
              })}
              <button
                onClick={handleExpansionSubmitAll}
                disabled={expansionSubmitting}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.01] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #FF9F40 0%, #FF7A1E 100%)' }}
              >
                {expansionSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '提交全部答案'}
              </button>
            </div>
          ) : (
            <p className="text-center text-sm py-6" style={{ color: '#8B7355' }}>暂无拓展题目</p>
          )}
        </section>
      )}

      {/* ============= 上传错题弹窗 ============= */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={resetUpload}>
          <div className="glass-card-solid p-6 max-w-md w-full" onClick={e => e.stopPropagation()} style={{ borderRadius: '20px' }}>
            <div className="flex items-center gap-2 mb-4">
              <Camera className="w-5 h-5" style={{ color: '#2D7A8E' }} />
              <h3 className="text-lg font-bold" style={{ color: '#4A3728' }}>上传错题</h3>
            </div>
            {!uploadPreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all hover:bg-opacity-50"
                style={{ borderColor: 'rgba(149,216,240,0.4)', background: 'rgba(224,242,250,0.3)' }}
              >
                <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: '#95D8F0' }} />
                <p className="text-sm font-semibold" style={{ color: '#4A3728' }}>点击拍照或选择图片</p>
                <p className="text-xs mt-1" style={{ color: '#8B7355' }}>拍下你做错的题目，AI自动识别录入</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : uploadResult?.error ? (
              <div className="text-center py-6">
                <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: '#D04040' }} />
                <p className="text-sm font-semibold mb-2" style={{ color: '#D04040' }}>{uploadResult.error}</p>
                <button onClick={() => { setUploadPreview(''); setUploadResult(null); }} className="mt-3 px-5 py-2 rounded-full text-sm font-bold text-white" style={{ background: '#2D7A8E' }}>
                  重新上传
                </button>
              </div>
            ) : uploadResult ? (
              <div className="space-y-3">
                <div className="rounded-xl p-4" style={{ background: 'rgba(115,192,103,0.12)' }}>
                  <p className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: '#2D5A27' }}>
                    <Check className="w-4 h-4" /> AI识别成功！
                  </p>
                  <p className="text-xs mb-1" style={{ color: '#4A3728' }}><b>题目：</b>{uploadResult.question_text}</p>
                  <p className="text-xs mb-1" style={{ color: '#2D5A27' }}><b>正确答案：</b>{uploadResult.correct_answer}</p>
                  <p className="text-xs mb-1" style={{ color: '#8B7355' }}><b>知识点：</b>{uploadResult.knowledge_point}</p>
                  {uploadResult.analysis && <p className="text-xs" style={{ color: '#8B7355' }}><b>解析：</b>{uploadResult.analysis}</p>}
                </div>
                <button onClick={resetUpload} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #73C067, #5CAF50)' }}>
                  完成
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <img src={uploadPreview} alt="预览" className="w-full rounded-xl max-h-48 object-contain" style={{ background: 'rgba(255,255,255,0.5)' }} />
                {uploading ? (
                  <div className="text-center py-3">
                    <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: '#2D7A8E' }} />
                    <p className="text-sm" style={{ color: '#8B7355' }}>AI识别中，请稍候...</p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setUploadPreview(''); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.7)', border: '1.5px solid rgba(200,230,192,0.5)', color: '#8B7355' }}>
                      重新选图
                    </button>
                    <button onClick={handleUploadSubmit} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #2D7A8E, #1E6B7E)' }}>
                      确认上传
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {stats.unresolved > 0 && (
        <section className="glass-card-solid p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                   style={{ background: 'linear-gradient(135deg, rgba(255,184,108,0.2), rgba(255,160,80,0.15))' }}>
                <Zap className="w-6 h-6" style={{ color: '#FFB86C' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: '#4A3728' }}>错题突破</h3>
                <p className="text-xs" style={{ color: '#8B7355' }}>AI 针对你的薄弱点，生成专属练习题</p>
              </div>
            </div>
            <button
              onClick={handleBreakthrough}
              disabled={breakthroughLoading || !token}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #FFB86C 0%, #FF9F40 100%)', boxShadow: '0 4px 14px rgba(255,184,108,0.3)' }}
            >
              {breakthroughLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI生成中...
                </>
              ) : breakthroughOpen ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  收起
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  开始突破
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* ============= 错题突破练习区 ============= */}
      {breakthroughOpen && breakthroughData && (
        <section className="glass-card-solid p-6">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5" style={{ color: '#FFB86C' }} />
            <h3 className="text-lg font-bold" style={{ color: '#4A3728' }}>
              错题突破 · {breakthroughData.knowledge_tag || '综合练习'}
            </h3>
          </div>
          {breakthroughData.message && !breakthroughData.questions?.length ? (
            <p className="text-center text-sm py-6" style={{ color: '#8B7355' }}>{breakthroughData.message}</p>
          ) : (
            <div className="space-y-4">
              {breakthroughData.questions?.map((q: any, i: number) => {
                const result = breakthroughResults[i];
                const isSubmitting = !!breakthroughSubmitting[i];
                return (
                  <div key={i} className="rounded-xl p-4" style={{
                    background: result === true
                      ? 'rgba(115, 192, 103, 0.15)'
                      : result === false
                      ? 'rgba(255, 138, 138, 0.15)'
                      : 'rgba(224, 242, 250, 0.5)',
                    border: result === true ? '2px solid rgba(115,192,103,0.4)' : result === false ? '2px solid rgba(255,138,138,0.4)' : '1.5px solid rgba(149,216,240,0.3)',
                  }}>
                    <div className="flex items-start gap-2 mb-3">
                      <Target className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#2D7A8E' }} />
                      <p className="text-sm" style={{ color: '#4A3728' }}>{q.question}</p>
                    </div>
                    {result === null ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={breakthroughAnswers[i] || ''}
                          onChange={e => setBreakthroughAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                          placeholder="输入你的答案..."
                          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                          style={{ background: 'rgba(255, 255, 255, 0.8)', border: '1.5px solid rgba(200, 230, 192, 0.5)', color: '#4A3728' }}
                        />
                        <button
                          onClick={() => handleBreakthroughSubmit(i, q.answer)}
                          disabled={isSubmitting || !breakthroughAnswers[i]}
                          className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)' }}
                        >
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '提交'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {result ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: '#2D5A27' }}>
                            <Check className="w-4 h-4" /> 回答正确！+5饲料币 🎉
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#4A3728' }}>
                            <X className="w-4 h-4" style={{ color: '#D04040' }} />
                            <span style={{ color: '#D04040', textDecoration: 'line-through' }}>{breakthroughAnswers[i]}</span>
                            <span style={{ color: '#2D5A27', fontWeight: 'bold' }}> → {q.answer}</span>
                            <span className="text-xs" style={{ color: '#8B7355' }}>再想想哦~</span>
                          </span>
                        )}
                      </div>
                    )}
                    {q.knowledge_point && (
                      <p className="text-xs mt-1" style={{ color: '#8B7355' }}>知识点：{q.knowledge_point}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ============= 视图切换 + 筛选 ============= */}
      {errors.length > 0 && (
        <section>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" style={{ color: '#8B7355' }} />
              <span className="text-sm font-semibold" style={{ color: '#8B7355' }}>浏览方式</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('venue')}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: viewMode === 'venue' ? 'linear-gradient(135deg, rgba(232,245,228,0.95), rgba(200,230,192,0.7))' : 'rgba(255,255,255,0.78)',
                  color: viewMode === 'venue' ? '#2D5A27' : '#8B7355',
                  border: viewMode === 'venue' ? '2px solid #73C067' : '1.5px solid rgba(200,230,192,0.5)',
                }}
              >
                按场馆
              </button>
              <button
                onClick={() => setViewMode('knowledge')}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: viewMode === 'knowledge' ? 'linear-gradient(135deg, rgba(224,242,250,0.95), rgba(149,216,240,0.5))' : 'rgba(255,255,255,0.78)',
                  color: viewMode === 'knowledge' ? '#2D7A8E' : '#8B7355',
                  border: viewMode === 'knowledge' ? '2px solid #2D7A8E' : '1.5px solid rgba(200,230,192,0.5)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 inline mr-1" />
                按知识点
              </button>
            </div>
          </div>
          {viewMode === 'venue' && venueFilters.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {venueFilters.map((filter) => {
                const isActive = activeFilter === filter.key;
                return (
                  <button
                    key={filter.key}
                    onClick={() => setActiveFilter(filter.key)}
                    className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(232, 245, 228, 0.95), rgba(200, 230, 192, 0.7))'
                        : 'rgba(255, 255, 255, 0.78)',
                      color: isActive ? '#2D5A27' : '#8B7355',
                      border: isActive ? '2px solid #73C067' : '1.5px solid rgba(200, 230, 192, 0.5)',
                      boxShadow: isActive ? '0 2px 8px rgba(115, 192, 103, 0.2)' : 'none',
                      fontWeight: isActive ? 700 : 600,
                    }}
                  >
                    {filter.emoji ? `${filter.emoji} ${filter.label}` : filter.label}
                  </button>
                );
              })}
            </div>
          )}
          {viewMode === 'knowledge' && kpGroups.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {kpGroups.map((g) => (
                <div key={g.knowledge_point} className="glass-card p-4 rounded-xl" style={{
                  background: g.unresolved > 0 ? 'rgba(255,138,138,0.08)' : 'rgba(115,192,103,0.08)',
                }}>
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: g.unresolved > 0 ? '#D04040' : '#2D5A27' }} />
                    <span className="text-xs font-bold truncate" style={{ color: '#4A3728' }}>{g.knowledge_point}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span style={{ color: '#D04040' }}>待救助 {g.unresolved}</span>
                    <span style={{ color: '#2D5A27' }}>已康复 {g.resolved}</span>
                    <span style={{ color: '#8B7355' }}>共 {g.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ============= 错题列表 ============= */}
      {filtered.length === 0 ? (
        <div className="glass-card-solid p-12 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-lg font-bold mb-2" style={{ color: '#4A3728' }}>
            {errors.length === 0 ? '暂无错题记录' : '该场馆暂无错题'}
          </h3>
          <p className="text-sm" style={{ color: '#8B7355' }}>
            {errors.length === 0 ? '继续保持，所有小动物都很健康~' : '试试切换其他场馆看看'}
          </p>
          {errors.length === 0 && (
            <Link
              href="/student/practice"
              className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)', boxShadow: '0 6px 20px rgba(115, 192, 103, 0.35)' }}
            >
              去场馆闯关
            </Link>
          )}
        </div>
      ) : (
        <section className="space-y-4">
          {filtered.map((error) => {
            const isExpanded = !!expandedPlans[error.id];
            const isDiagnosing = !!diagnosing[error.id];
            const diagnosis = diagnosisMap[error.id];
            const venueInfo = getVenueInfo(error.unit_code, error.knowledge_point);
            const isPending = error.status === 'unresolved';
            const questionContent = error.question_text || error.content || '';
            const correctAns = error.correct_answer || error.question_answer || '';
            const studentAns = error.student_answer || '(未记录)';

            return (
              <article key={error.id} className="glass-card-solid p-5">
                {/* Header */}
                <header className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                      style={{ background: 'rgba(255, 248, 240, 0.9)' }}
                    >
                      {venueInfo.emoji}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold" style={{ color: '#4A3728' }}>{venueInfo.name}</h3>
                      <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>
                        {error.knowledge_point || venueInfo.key} · {error.unit_code || '综合'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {/* 来源标签 */}
                    {error.source && error.source !== 'practice' && (() => {
                      const sourceMap: Record<string, { label: string; bg: string; color: string }> = {
                        manual:            { label: '📷 上传',     bg: 'rgba(149,216,240,0.18)', color: '#2D7A8E' },
                        preview:            { label: '📖 预习',     bg: 'rgba(255,184,108,0.18)', color: '#8B5A1B' },
                        homework:           { label: '📝 作业',     bg: 'rgba(168,85,247,0.15)',  color: '#7C3AED' },
                        challenge:          { label: '🎯 闯关',     bg: 'rgba(99,102,241,0.15)',  color: '#4F46E5' },
                        challenge_similar:  { label: '🎯 闯关巩固', bg: 'rgba(139,92,246,0.15)',  color: '#6D28D9' },
                        random_challenge:   { label: '🎲 随机考察', bg: 'rgba(236,72,153,0.15)',  color: '#BE185D' },
                        fun_game:           { label: '🎮 趣味游戏', bg: 'rgba(34,197,94,0.15)',   color: '#15803D' },
                        daily_fact:         { label: '💡 每日科普', bg: 'rgba(234,179,8,0.15)',   color: '#A16207' },
                      };
                      const info = sourceMap[error.source] || { label: `📝 ${error.source}`, bg: 'rgba(168,85,247,0.15)', color: '#7C3AED' };
                      return (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: info.bg, color: info.color }}>
                          {info.label}
                        </span>
                      );
                    })()}
                    {/* 回炉状态标签 */}
                    {error.status === 'resolved' && error.needs_reheat && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(255,159,64,0.18)', color: '#FF7A1E' }}>
                        <Flame className="w-3 h-3 inline mr-0.5" />待回炉
                      </span>
                    )}
                    {error.reheat_status === 'mastered' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(115,192,103,0.18)', color: '#2D5A27' }}>
                        <Award className="w-3 h-3 inline mr-0.5" />已掌握
                      </span>
                    )}
                    {isPending ? (
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: 'rgba(255, 138, 138, 0.18)', color: '#D04040' }}
                      >
                        <HeartPulse className="w-3 h-3" />
                        待救助
                      </span>
                    ) : !error.needs_reheat && error.reheat_status !== 'mastered' ? (
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: 'rgba(115, 192, 103, 0.18)', color: '#2D5A27' }}
                      >
                        <Heart className="w-3 h-3" />
                        已康复
                      </span>
                    ) : null}
                  </div>
                </header>

                {/* Question content */}
                <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(255, 248, 240, 0.8)' }}>
                  {questionContent && (
                    <p className="text-sm mb-3" style={{ color: '#4A3728' }}>
                      <span className="text-xs font-bold mr-2" style={{ color: '#8B7355' }}>题目：</span>
                      {questionContent}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0"
                      style={{ background: 'rgba(255, 138, 138, 0.18)', color: '#D04040' }}
                    >
                      我的答案
                    </span>
                    <span
                      className="text-sm md:text-base font-bold"
                      style={{ color: '#D04040', textDecoration: 'line-through' }}
                    >
                      {studentAns}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0"
                      style={{ background: 'rgba(115, 192, 103, 0.18)', color: '#2D5A27' }}
                    >
                      正确答案
                    </span>
                    <span className="text-sm md:text-base font-bold" style={{ color: '#2D5A27' }}>
                      {correctAns}
                    </span>
                  </div>
                </div>

                {/* Question analysis (if available) */}
                {(error.question_analysis || error.analysis) && (
                  <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(232, 245, 228, 0.6)' }}>
                    <p className="text-xs leading-relaxed" style={{ color: '#4A3728' }}>
                      <Lightbulb className="w-3.5 h-3.5 inline mr-1" style={{ color: '#FFB86C' }} />
                      <span className="font-semibold">题目解析：</span>{error.question_analysis || error.analysis}
                    </p>
                  </div>
                )}

                {/* Action row */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  {isPending ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleDiagnose(error)}
                        disabled={isDiagnosing}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                        style={{
                          background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)',
                          boxShadow: '0 4px 14px rgba(115, 192, 103, 0.3)',
                        }}
                      >
                        {isDiagnosing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            AI 诊断中...
                          </>
                        ) : diagnosis ? (
                          <>
                            <Stethoscope className="w-4 h-4" />
                            {isExpanded ? '收起救助方案' : '查看救助方案'}
                          </>
                        ) : (
                          <>
                            <Stethoscope className="w-4 h-4" />
                            开始救助
                          </>
                        )}
                      </button>
                      {token && (
                        <button
                          onClick={() => handleResolve(error.id)}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-all hover:scale-[1.02]"
                          style={{
                            background: 'rgba(255, 255, 255, 0.7)',
                            border: '1.5px solid rgba(115, 192, 103, 0.4)',
                            color: '#2D5A27',
                          }}
                        >
                          <Check className="w-4 h-4" />
                          已康复 +10
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm font-bold inline-flex items-center gap-1.5" style={{ color: '#2D5A27' }}>
                      <Heart className="w-4 h-4" />
                      已成功救助！小动物恢复健康啦~
                    </span>
                  )}
                  {diagnosis && (
                    <button
                      onClick={() => setExpandedPlans((prev) => ({ ...prev, [error.id]: !prev[error.id] }))}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-semibold transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.7)',
                        border: '1.5px solid rgba(200, 230, 192, 0.6)',
                        color: '#8B7355',
                      }}
                    >
                      {isExpanded ? '收起' : '展开'}
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* AI Diagnosis (collapsible) */}
                {isExpanded && diagnosis && (
                  <div
                    className="mt-4 p-4 rounded-2xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(232, 245, 228, 0.85), rgba(200, 230, 192, 0.5))',
                      border: '1.5px dashed rgba(115, 192, 103, 0.5)',
                    }}
                  >
                    <p className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: '#2D5A27' }}>
                      <Sparkles className="w-4 h-4" style={{ color: '#FFB86C' }} />
                      AI 兽医诊断引导：
                    </p>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#4A3728' }}>
                      {diagnosis}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {/* ============= 底部提示 ============= */}
      {errors.length > 0 && stats.unresolved > 0 && (
        <div className="text-center pt-2">
          <p className="text-sm italic" style={{ color: '#8B7355' }}>
            🌟 还有 {stats.unresolved} 只小动物等待救助，点击「开始救助」让 AI 兽医帮忙诊断吧~
          </p>
        </div>
      )}
    </div>
  );
}
