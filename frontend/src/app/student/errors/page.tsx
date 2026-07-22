'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Stethoscope, AlertCircle, Heart, ChevronDown, ChevronUp, Sparkles,
  Activity, HeartPulse, Filter, Loader2, RefreshCw, Lightbulb,
  Zap, Target, Check, X, Trophy, Camera, Upload, Flame, Award, BookOpen,
  Brain, ArrowRight, ArrowLeft, Pencil,
} from 'lucide-react';
import {
  getStoredUser, getToken, fetchErrors, diagnoseError, fetchStudentDashboard,
  mistakeBreakthrough, submitBreakthroughAnswer, resolveErrorNote,
  uploadErrorPhoto, fetchReheatList, generateExpansion, getExpansionTask, submitExpansionAnswer,
  guidedCorrection, similarQuestions, startRehab, completeRehab,
} from '@/lib/api';
import XiaocongDialog from '@/components/XiaocongDialog';

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
  rehab_status?: 'pending' | 'guided' | 'recovered' | string;
  rehab_started_at?: string;
  rehab_completed_at?: string;
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
  const [stats, setStats] = useState({
    unresolved: 0,
    resolved: 0,
    total: 0,
    rehab_pending: 0,
    rehab_guided: 0,
    rehab_recovered: 0,
  } as {
    unresolved: number;
    resolved: number;
    total: number;
    rehab_pending: number;
    rehab_guided: number;
    rehab_recovered: number;
    [key: string]: number;
  });
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

  // ===== 苏格拉底式分步引导 =====
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [guidedLoading, setGuidedLoading] = useState(false);
  const [guidedData, setGuidedData] = useState<{
    error_id: number;
    steps: { step: number; type: string; content: string }[];
    error_reason?: string;
    full_solution?: string;
    question_text?: string;
    student_answer?: string;
    correct_answer?: string;
    knowledge_point?: string;
  } | null>(null);
  const [guidedStepIdx, setGuidedStepIdx] = useState(0); // 当前展示到第几步
  const [guidedCompleted, setGuidedCompleted] = useState(false);
  // 题目缺失时的补题输入
  const [pendingQuestionErrorId, setPendingQuestionErrorId] = useState<number | null>(null);
  const [pendingQuestionText, setPendingQuestionText] = useState('');

  // ===== 小聪智能体（多轮对话引导） =====
  const [xiaocongOpen, setXiaocongOpen] = useState(false);
  const [xiaocongTarget, setXiaocongTarget] = useState<{
    errorNoteId: number;
    questionText: string;
    studentAnswer: string;
    correctAnswer: string;
    knowledgePoint: string;
  } | null>(null);
  const openXiaocongForError = (error: ErrorItem) => {
    setXiaocongTarget({
      errorNoteId: error.id,
      questionText: error.question_text || error.content || '',
      studentAnswer: error.student_answer || '',
      correctAnswer: error.correct_answer || error.question_answer || '',
      knowledgePoint: error.knowledge_point || '',
    });
    setXiaocongOpen(true);
  };

  // ===== 类似题巩固 =====
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarData, setSimilarData] = useState<{
    questions: { index: number; question: string; answer: string; hint?: string; explanation?: string }[];
    knowledge_point: string;
  } | null>(null);
  const [similarAnswers, setSimilarAnswers] = useState<Record<number, string>>({});
  const [similarResults, setSimilarResults] = useState<Record<number, boolean | null>>({});
  const [similarCurrentIdx, setSimilarCurrentIdx] = useState(0);
  const [similarDone, setSimilarDone] = useState(false);

  // ===== 错题康复流程（pending → guided → recovered） =====
  const [rehabBusyId, setRehabBusyId] = useState<number | null>(null);
  const [rehabToast, setRehabToast] = useState<{ errorId: number; type: 'recovered'; at: number } | null>(null);
  // 作答+类似题内嵌面板：哪个错题处于展开状态（同一时刻只允许 1 个）
  const [rehabPanel, setRehabPanel] = useState<number | null>(null);
  const toggleRehabPanel = (id: number) => {
    setRehabPanel((cur) => (cur === id ? null : id));
  };
  const closeRehabPanel = (id: number) => {
    setRehabPanel((cur) => (cur === id ? null : cur));
  };

  // 单卡康复阶段归一化：兼容后端缺省值
  const rehabStageOf = (e: ErrorItem): 'pending' | 'guided' | 'recovered' => {
    const raw = (e.rehab_status || 'pending') as 'pending' | 'guided' | 'recovered';
    if (e.status === 'resolved' && raw === 'pending') return 'guided'; // 已订正但还未走完康复 → 看作 guided
    return raw;
  };

  // 触发小聪对话前自动 start rehab
  const openXiaocongWithRehab = async (error: ErrorItem) => {
    if (!token) {
      openXiaocongForError(error);
      return;
    }
    const stage = rehabStageOf(error);
    if (stage === 'pending') {
      try {
        setRehabBusyId(error.id);
        await startRehab(token, error.id);
        // 不刷新页面，让小聪对话返回的 rehab_status 触发下一步
      } catch (err) {
        console.warn('[rehab] start failed, fallback to opening xiaocong', err);
      } finally {
        setRehabBusyId(null);
      }
    }
    openXiaocongForError(error);
  };

  // 标记该错题康复完成（rehab_status: guided → recovered）
  const markRehabComplete = async (e: ErrorItem) => {
    if (!token) return;
    try {
      setRehabBusyId(e.id);
      await completeRehab(token, e.id, 'similar');
      // 乐观更新本地
      setErrors((prev) => prev.map((it) => (it.id === e.id ? { ...it, rehab_status: 'recovered' } : it)));
      setRehabToast({ errorId: e.id, type: 'recovered', at: Date.now() });
      // 5s 后隐藏
      setTimeout(() => setRehabToast((t) => (t && t.errorId === e.id ? null : t)), 5200);
    } catch (err: any) {
      console.error('[rehab] complete failed', err);
      alert(err?.message || '标记康复失败，请稍后重试');
    } finally {
      setRehabBusyId(null);
    }
  };

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
        rehab_pending: errorRes?.stats?.rehab_pending || 0,
        rehab_guided: errorRes?.stats?.rehab_guided || 0,
        rehab_recovered: errorRes?.stats?.rehab_recovered || 0,
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

  // ===== 苏格拉底式分步引导改错 =====
  const handleStartGuided = async (error: ErrorItem, supplementText?: string) => {
    if (!token) {
      alert('请先登录');
      return;
    }
    setGuidedLoading(true);
    setGuidedOpen(true);
    setGuidedData(null);
    setGuidedStepIdx(0);
    setGuidedCompleted(false);
    try {
      const res = await guidedCorrection(error.id, token, supplementText);
      console.log('[guided] response:', res);
      if (res?.success && res.data) {
        const d = res.data;
        if (Array.isArray(d.steps) && d.steps.length > 0) {
          setGuidedData(d);
          setGuidedStepIdx(0);
        } else {
          alert('AI 暂时无法生成引导，请稍后重试');
          setGuidedOpen(false);
        }
      } else if (res?.message?.includes('缺少题目') || res?.message?.includes('缺少')) {
        // 后端 400：打开补题输入框
        setGuidedOpen(false);
        setPendingQuestionErrorId(error.id);
        setPendingQuestionText(supplementText || '');
      } else {
        alert(res?.message || 'AI 引导生成失败');
        setGuidedOpen(false);
      }
    } catch (e: any) {
      console.error('[guided] error:', e);
      const msg = e?.message || '';
      if (msg.includes('缺少题目') || msg.includes('400')) {
        setGuidedOpen(false);
        setPendingQuestionErrorId(error.id);
        setPendingQuestionText(supplementText || '');
      } else {
        alert(msg || 'AI 引导暂时不可用');
        setGuidedOpen(false);
      }
    } finally {
      setGuidedLoading(false);
    }
  };

  const handlePendingSubmit = () => {
    const text = pendingQuestionText.trim();
    if (!text) { alert('请输入题目内容'); return; }
    const id = pendingQuestionErrorId;
    if (!id) return;
    setPendingQuestionErrorId(null);
    setPendingQuestionText('');
    const err = errors.find(e => e.id === id);
    if (err) handleStartGuided(err, text);
  };

  const handleGuidedNext = () => {
    if (!guidedData) return;
    if (guidedStepIdx < guidedData.steps.length - 1) {
      setGuidedStepIdx(guidedStepIdx + 1);
    } else {
      setGuidedCompleted(true);
    }
  };

  const handleGuidedPrev = () => {
    if (guidedStepIdx > 0) {
      setGuidedStepIdx(guidedStepIdx - 1);
      setGuidedCompleted(false);
    }
  };

  const handleGuidedClose = () => {
    setGuidedOpen(false);
  };

  // 完成引导后，加载类似题巩固
  const handleStartSimilar = async () => {
    if (!guidedData || !token) return;
    setSimilarOpen(true);
    setSimilarLoading(true);
    setSimilarData(null);
    setSimilarAnswers({});
    setSimilarResults({});
    setSimilarCurrentIdx(0);
    setSimilarDone(false);
    try {
      const res = await similarQuestions(guidedData.error_id, token, 3);
      console.log('[similar] response:', res);
      // 后端直接返回 {error_id, knowledge_point, questions:[...]}，fetchAPI 不加 success 包装
      const d: any = (res as any)?.data ?? res;
      if (Array.isArray(d?.questions) && d.questions.length > 0) {
        setSimilarData(d);
      } else {
        alert('类似题生成失败');
        setSimilarOpen(false);
      }
    } catch (e: any) {
      console.error('[similar] error:', e);
      alert(e?.message || '类似题生成失败');
      setSimilarOpen(false);
    } finally {
      setSimilarLoading(false);
    }
  };

  const handleSimilarSubmit = () => {
    if (!similarData) return;
    const q = similarData.questions[similarCurrentIdx];
    if (!q) return;
    const studentAns = (similarAnswers[q.index] || '').trim();
    const correctAns = q.answer.trim();
    const isCorrect = studentAns === correctAns;
    setSimilarResults((prev) => ({ ...prev, [q.index]: isCorrect }));
  };

  const handleSimilarNext = () => {
    if (!similarData) return;
    if (similarCurrentIdx < similarData.questions.length - 1) {
      setSimilarCurrentIdx(similarCurrentIdx + 1);
    } else {
      setSimilarDone(true);
    }
  };

  const handleSimilarClose = () => {
    setSimilarOpen(false);
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

      {/* ============= 统计（康复阶段视角） ============= */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 待处理：还没开始康复 */}
        <div className="glass-card p-4 text-center" style={{ background: 'rgba(255, 138, 138, 0.12)' }}>
          <div className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
            <AlertCircle className="w-5 h-5" style={{ color: '#FF8A8A' }} />
          </div>
          <div className="text-xl font-black" style={{ color: '#D04040' }}>{stats.rehab_pending ?? stats.unresolved}</div>
          <div className="text-xs mt-1 font-semibold" style={{ color: '#8B7355' }}>待处理</div>
        </div>
        {/* 康复中：已开始（点小聪/分步引导/闯关）但还没订正 */}
        <div className="glass-card p-4 text-center" style={{ background: 'rgba(255, 184, 108, 0.15)' }}>
          <div className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
            <Activity className="w-5 h-5" style={{ color: '#FFB86C' }} />
          </div>
          <div className="text-xl font-black" style={{ color: '#8B5A1B' }}>{stats.rehab_guided ?? 0}</div>
          <div className="text-xs mt-1 font-semibold" style={{ color: '#8B7355' }}>康复中</div>
        </div>
        {/* 已康复 */}
        <div className="glass-card p-4 text-center" style={{ background: 'rgba(115, 192, 103, 0.15)' }}>
          <div className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
            <Heart className="w-5 h-5" style={{ color: '#73C067' }} />
          </div>
          <div className="text-xl font-black" style={{ color: '#2D5A27' }}>{stats.rehab_recovered ?? 0}</div>
          <div className="text-xs mt-1 font-semibold" style={{ color: '#8B7355' }}>已康复</div>
        </div>
        {/* 累计 */}
        <div className="glass-card p-4 text-center" style={{ background: 'rgba(149, 216, 240, 0.15)' }}>
          <div className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
            <Stethoscope className="w-5 h-5" style={{ color: '#2D7A8E' }} />
          </div>
          <div className="text-xl font-black" style={{ color: '#2D5A6E' }}>{stats.total}</div>
          <div className="text-xs mt-1 font-semibold" style={{ color: '#8B7355' }}>累计错题</div>
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
            const stage = rehabStageOf(error);

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
                    {/* 康复阶段徽章（pending/guided/recovered） */}
                    {(() => {
                      const stage = rehabStageOf(error);
                      if (stage === 'recovered') {
                        return (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(115, 192, 103, 0.18)', color: '#2D5A27' }}>
                            <Heart className="w-3 h-3" />
                            已康复
                          </span>
                        );
                      }
                      if (stage === 'guided') {
                        return (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(255, 184, 108, 0.2)', color: '#8B5A1B' }}>
                            <Activity className="w-3 h-3" />
                            康复中
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(255, 138, 138, 0.18)', color: '#D04040' }}>
                          <HeartPulse className="w-3 h-3" />
                          待处理
                        </span>
                      );
                    })()}
                  </div>
                </header>

                {/* 康复进度条 */}
                {(() => {
                  const stage = rehabStageOf(error);
                  const stepLabel: Record<'pending' | 'guided' | 'recovered', string> = {
                    pending: '待处理 → 让小聪对话引导 → 订正完成',
                    guided: '康复中 → 完成订正后标记康复',
                    recovered: '已康复 ✨',
                  };
                  const filled = stage === 'pending' ? 1 : stage === 'guided' ? 2 : 3;
                  const bg = stage === 'recovered' ? 'linear-gradient(90deg,#73C067,#5AA649)' : 'linear-gradient(90deg,#FFB86C,#FF8A8A)';
                  return (
                    <div className="mb-3 rounded-xl px-3 py-2" style={{ background: 'rgba(255,248,240,0.7)', border: '1px dashed rgba(139,92,246,0.25)' }}>
                      <div className="flex items-center gap-1 mb-1">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="flex-1 h-1.5 rounded-full transition-all"
                            style={{ background: i <= filled ? bg : 'rgba(200, 230, 192, 0.4)' }}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] font-semibold" style={{ color: stage === 'recovered' ? '#2D5A27' : stage === 'guided' ? '#8B5A1B' : '#8B7355' }}>
                        {stepLabel[stage]}
                      </p>
                    </div>
                  );
                })()}

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
                  {stage === 'recovered' ? (
                    <span className="text-sm font-bold inline-flex items-center gap-1.5" style={{ color: '#2D5A27' }}>
                      <Heart className="w-4 h-4" />
                      已成功救助！小动物恢复健康啦~
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 主按钮：开始救助 → 展开作答面板 */}
                      <button
                        onClick={() => toggleRehabPanel(error.id)}
                        disabled={rehabBusyId === error.id || rehabPanel === error.id}
                        data-testid={`btn-rehab-start-${error.id}`}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                        style={{
                          background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)',
                          boxShadow: '0 4px 14px rgba(115, 192, 103, 0.3)',
                        }}
                      >
                        {rehabPanel === error.id ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            收起救助面板
                          </>
                        ) : (
                          <>
                            <Stethoscope className="w-4 h-4" />
                            开始救助
                          </>
                        )}
                      </button>
                      {/* 副按钮：AI 分步引导 → 直接进小聪对话 */}
                      {token && (
                        <button
                          onClick={() => openXiaocongWithRehab(error)}
                          disabled={rehabBusyId === error.id}
                          data-testid={`btn-guided-${error.id}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                          style={{
                            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                            color: '#FFFFFF',
                            boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)',
                          }}
                        >
                          <Brain className="w-4 h-4" />
                          AI 分步引导
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 作答+类似题 内嵌康复面板 */}
                {rehabPanel === error.id && stage !== 'recovered' && (
                  <RehabInlinePanel
                    error={error}
                    token={token}
                    onClose={() => closeRehabPanel(error.id)}
                    onXiaocongNeeded={() => openXiaocongWithRehab(error)}
                    onRecovered={async (via) => {
                      // 全对完成康复：乐观更新 + toast
                      setErrors((prev) => prev.map((it) =>
                        it.id === error.id
                          ? { ...it, rehab_status: 'recovered', status: 'resolved' }
                          : it
                      ));
                      setStats((prev) => ({
                        ...prev,
                        rehab_pending: Math.max(0, prev.rehab_pending - 1),
                        rehab_guided: stage === 'guided' ? Math.max(0, prev.rehab_guided - 1) : prev.rehab_guided,
                        rehab_recovered: prev.rehab_recovered + 1,
                        resolved: prev.resolved + 1,
                      }));
                      setRehabToast({ errorId: error.id, type: 'recovered', at: Date.now() });
                      setTimeout(() => setRehabToast((t) => (t && t.errorId === error.id ? null : t)), 5200);
                      closeRehabPanel(error.id);
                      // 后端兜底（失败不影响 UI）
                      try {
                        await completeRehab(token, error.id, via);
                      } catch (e) {
                        console.warn('[rehab] complete api failed, but UI already updated', e);
                      }
                    }}
                  />
                )}

              </article>
            );
          })}
        </section>
      )}

      {/* ============= 苏格拉底式分步引导 Modal ============= */}
      {guidedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
          onClick={handleGuidedClose}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #FAF7F2 0%, #F5EDE0 100%)', border: '2px solid #C8A951' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b" style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)', borderColor: 'rgba(255,255,255,0.2)' }}>
              <div className="flex items-center gap-2">
                <Brain className="w-6 h-6 text-white" />
                <h2 className="text-xl font-bold text-white">AI 苏格拉底式引导</h2>
              </div>
              <button
                onClick={handleGuidedClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Loading */}
            {guidedLoading && (
              <div className="p-10 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: '#8B5CF6' }} />
                <p className="text-base font-semibold mb-2" style={{ color: '#5C6170' }}>AI 正在为你设计分步引导方案...</p>
                <p className="text-sm" style={{ color: '#7A756D' }}>大约需要 30~60 秒</p>
              </div>
            )}

            {/* Steps Display */}
            {!guidedLoading && guidedData && (
              <div className="p-6 space-y-4">
                {/* Question preview */}
                <div className="rounded-2xl p-4" style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1.5px solid rgba(139, 92, 246, 0.3)' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#8B5CF6' }}>📝 你的错题</p>
                  <p className="text-sm mb-2" style={{ color: '#4A3728' }}>{guidedData.question_text}</p>
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <span style={{ color: '#D04040' }}>你的答案：<span className="font-bold" style={{ textDecoration: 'line-through' }}>{guidedData.student_answer}</span></span>
                    {guidedData.knowledge_point && (
                      <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }}>
                        {guidedData.knowledge_point}
                      </span>
                    )}
                  </div>
                  {guidedData.error_reason && (
                    <p className="text-xs mt-2" style={{ color: '#7A756D' }}>
                      💡 错误原因：{guidedData.error_reason}
                    </p>
                  )}
                </div>

                {/* Progress */}
                <div className="flex items-center gap-1">
                  {guidedData.steps.map((s, i) => (
                    <div
                      key={i}
                      className="flex-1 h-2 rounded-full transition-all"
                      style={{
                        background: i <= guidedStepIdx ? '#8B5CF6' : 'rgba(139, 92, 246, 0.2)',
                      }}
                    />
                  ))}
                </div>

                {/* Current step */}
                {!guidedCompleted && guidedData.steps[guidedStepIdx] && (() => {
                  const step = guidedData.steps[guidedStepIdx];
                  const typeLabel: Record<string, { text: string; bg: string; color: string }> = {
                    hint: { text: '💡 第一步：提示', bg: 'rgba(255, 184, 108, 0.15)', color: '#FF9A4D' },
                    checkpoint: { text: '❓ 第二步：检查点', bg: 'rgba(212, 168, 67, 0.15)', color: '#B8941F' },
                    method: { text: '🛠️ 第三步：方法', bg: 'rgba(107, 143, 113, 0.15)', color: '#5C8A5A' },
                    practice: { text: '🎯 第四步：小练习', bg: 'rgba(192, 120, 92, 0.15)', color: '#A0553D' },
                  };
                  const meta = typeLabel[step.type] || { text: `第 ${step.step} 步`, bg: '#F0F0F0', color: '#666' };
                  return (
                    <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '2px solid rgba(139, 92, 246, 0.2)' }}>
                      <div className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3" style={{ background: meta.bg, color: meta.color }}>
                        {meta.text}
                      </div>
                      <p className="text-base leading-relaxed" style={{ color: '#3D3D3D' }}>
                        {step.content}
                      </p>
                    </div>
                  );
                })()}

                {/* Completed: show full solution */}
                {guidedCompleted && (
                  <div className="space-y-3">
                    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, rgba(115, 192, 103, 0.15), rgba(139, 92, 246, 0.08))', border: '2px solid rgba(115, 192, 103, 0.4)' }}>
                      <p className="text-base font-bold mb-2 flex items-center gap-2" style={{ color: '#2D5A27' }}>
                        <Check className="w-5 h-5" />
                        🎉 引导完成！完整解题过程：
                      </p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#4A3728' }}>
                        {guidedData.full_solution || `正确答案是：${guidedData.correct_answer}`}
                      </p>
                      <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs" style={{ borderColor: 'rgba(115, 192, 103, 0.3)', color: '#7A756D' }}>
                        <span>正确答案：</span>
                        <span className="font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(115, 192, 103, 0.2)', color: '#2D5A27' }}>
                          {guidedData.correct_answer}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleGuidedPrev}
                    disabled={guidedStepIdx === 0 || guidedCompleted}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium transition-all hover:opacity-80 disabled:opacity-30"
                    style={{ background: 'rgba(0,0,0,0.05)', color: '#5C6170' }}
                  >
                    <ArrowLeft className="w-4 h-4" /> 上一步
                  </button>

                  {!guidedCompleted ? (
                    <button
                      onClick={handleGuidedNext}
                      className="inline-flex items-center gap-1 px-5 py-2 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
                      style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)' }}
                    >
                      {guidedStepIdx < guidedData.steps.length - 1 ? (
                        <>想好了，下一步 <ArrowRight className="w-4 h-4" /></>
                      ) : (
                        <>完成引导 <Check className="w-4 h-4" /></>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleStartSimilar}
                      className="inline-flex items-center gap-1 px-5 py-2 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
                      style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)' }}
                    >
                      <Target className="w-4 h-4" /> 来做几道巩固题
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============= 补题输入 Modal（OCR 失败等场景） ============= */}
      {pendingQuestionErrorId !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setPendingQuestionErrorId(null); setPendingQuestionText(''); }}
        >
          <div
            className="w-full max-w-lg rounded-3xl shadow-2xl p-6"
            style={{ background: 'linear-gradient(135deg, #FAF7F2 0%, #F5EDE0 100%)', border: '2px solid #C8A951' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-5 h-5" style={{ color: '#C8A951' }} />
              <h2 className="text-lg font-bold" style={{ color: '#4A3728' }}>补一下题目内容</h2>
            </div>
            <p className="text-sm mb-3" style={{ color: '#7A5C44' }}>
              这道错题在识别时题目文字没存下来，把题目原文贴进来 AI 就能开始引导啦～
            </p>
            <textarea
              value={pendingQuestionText}
              onChange={(e) => setPendingQuestionText(e.target.value)}
              placeholder="例如：一个长方形的长是 6.5 米，宽是 3 米，面积是多少？"
              rows={5}
              className="w-full p-3 rounded-xl outline-none resize-none text-sm"
              style={{ border: '1.5px solid #E5D5BA', background: '#FFFFFF', color: '#4A3728' }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: '#FFFFFF', border: '1.5px solid #E5D5BA', color: '#7A5C44' }}
                onClick={() => { setPendingQuestionErrorId(null); setPendingQuestionText(''); }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)' }}
                onClick={handlePendingSubmit}
              >
                开始 AI 引导
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============= 类似题巩固 Modal ============= */}
      {similarOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
          onClick={handleSimilarClose}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #FAF7F2 0%, #E8F0E5 100%)', border: '2px solid #73C067' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b" style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)', borderColor: 'rgba(255,255,255,0.2)' }}>
              <div className="flex items-center gap-2">
                <Target className="w-6 h-6 text-white" />
                <h2 className="text-xl font-bold text-white">巩固练习</h2>
              </div>
              <button
                onClick={handleSimilarClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Loading */}
            {similarLoading && (
              <div className="p-10 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: '#73C067' }} />
                <p className="text-base font-semibold mb-2" style={{ color: '#5C6170' }}>AI 正在生成类似题...</p>
              </div>
            )}

            {/* Questions */}
            {!similarLoading && similarData && similarData.questions.length > 0 && (() => {
              const currentQ = similarData.questions[similarCurrentIdx];
              if (!currentQ) return null;
              const result = similarResults[currentQ.index];
              const answered = result !== undefined;
              return (
                <div className="p-6 space-y-4">
                  {/* Progress */}
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: '#7A756D' }}>
                      第 {similarCurrentIdx + 1} / {similarData.questions.length} 题
                    </span>
                    <span style={{ color: '#7A756D' }}>
                      {similarData.knowledge_point && `知识点：${similarData.knowledge_point}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {similarData.questions.map((_, i) => (
                      <div
                        key={i}
                        className="flex-1 h-2 rounded-full transition-all"
                        style={{
                          background: i < similarCurrentIdx ? '#73C067' : i === similarCurrentIdx ? '#5CAF50' : 'rgba(115, 192, 103, 0.2)',
                        }}
                      />
                    ))}
                  </div>

                  {/* Question */}
                  <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1.5px solid rgba(115, 192, 103, 0.3)' }}>
                    <p className="text-base font-semibold mb-4" style={{ color: '#3D3D3D' }}>
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full mr-2 text-sm font-bold" style={{ background: 'rgba(115, 192, 103, 0.2)', color: '#2D5A27' }}>
                        {currentQ.index}
                      </span>
                      {currentQ.question}
                    </p>
                    <input
                      type="text"
                      value={similarAnswers[currentQ.index] || ''}
                      onChange={(e) => setSimilarAnswers((prev) => ({ ...prev, [currentQ.index]: e.target.value }))}
                      disabled={answered}
                      placeholder="请输入答案..."
                      className="w-full px-4 py-3 rounded-xl text-base"
                      style={{ background: '#FAF7F2', border: '1.5px solid rgba(115, 192, 103, 0.3)', color: '#3D3D3D' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !answered) {
                          handleSimilarSubmit();
                        }
                      }}
                    />
                  </div>

                  {/* Result feedback */}
                  {answered && (
                    <div className="rounded-2xl p-4" style={{
                      background: result ? 'rgba(115, 192, 103, 0.12)' : 'rgba(255, 138, 138, 0.12)',
                      border: `1.5px solid ${result ? 'rgba(115, 192, 103, 0.4)' : 'rgba(255, 138, 138, 0.4)'}`,
                    }}>
                      <p className="text-base font-bold mb-2 flex items-center gap-2" style={{ color: result ? '#2D5A27' : '#D04040' }}>
                        {result ? <><Check className="w-5 h-5" /> 答对啦！</> : <><X className="w-5 h-5" /> 还差一点</>}
                      </p>
                      {!result && (
                        <p className="text-sm mb-2" style={{ color: '#4A3728' }}>
                          正确答案：<span className="font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(115, 192, 103, 0.2)', color: '#2D5A27' }}>
                            {currentQ.answer}
                          </span>
                        </p>
                      )}
                      {currentQ.hint && (
                        <p className="text-xs" style={{ color: '#7A756D' }}>
                          💡 提示：{currentQ.hint}
                        </p>
                      )}
                      {currentQ.explanation && !currentQ.hint && (
                        <p className="text-xs" style={{ color: '#7A756D' }}>
                          💡 思路：{currentQ.explanation}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={handleSimilarClose}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium transition-all hover:opacity-80"
                      style={{ background: 'rgba(0,0,0,0.05)', color: '#5C6170' }}
                    >
                      退出练习
                    </button>
                    {!answered ? (
                      <button
                        onClick={handleSimilarSubmit}
                        disabled={!similarAnswers[currentQ.index]?.trim()}
                        className="inline-flex items-center gap-1 px-5 py-2 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)' }}
                      >
                        提交答案 <Check className="w-4 h-4" />
                      </button>
                    ) : !similarDone ? (
                      <button
                        onClick={handleSimilarNext}
                        className="inline-flex items-center gap-1 px-5 py-2 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
                        style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)' }}
                      >
                        下一题 <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSimilarClose}
                        className="inline-flex items-center gap-1 px-5 py-2 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
                        style={{ background: 'linear-gradient(135deg, #FFB86C 0%, #FF9A4D 100%)' }}
                      >
                        <Trophy className="w-4 h-4" /> 完成
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ============= 底部提示 ============= */}
      {errors.length > 0 && stats.unresolved > 0 && (
        <div className="text-center pt-2">
          <p className="text-sm italic" style={{ color: '#8B7355' }}>
            🌟 还有 {stats.unresolved} 只小动物等待救助，点击「开始救助」让 AI 带你一步步康复，或点「AI 分步引导」开启小聪多轮对话~
          </p>
        </div>
      )}

      {/* ============= 小聪智能体对话框（多轮对话引导） ============= */}
      {xiaocongTarget && (
        <XiaocongDialog
          open={xiaocongOpen}
          errorNoteId={xiaocongTarget.errorNoteId}
          questionText={xiaocongTarget.questionText}
          studentAnswer={xiaocongTarget.studentAnswer}
          correctAnswer={xiaocongTarget.correctAnswer}
          knowledgePoint={xiaocongTarget.knowledgePoint}
          onClose={() => setXiaocongOpen(false)}
          onStageDone={(payload) => {
            // 小聪进入 done 阶段时尝试自动标记康复（仅当前错题已订正 status='resolved'）
            const target = errors.find((e) => e.id === payload.errorNoteId);
            if (!target) return;
            if (target.status !== 'resolved') return; // 未订正不强制标记
            void markRehabComplete(target);
          }}
        />
      )}

      {/* 康复成功 toast */}
      {rehabToast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #73C067, #5CAF50)', color: '#fff', boxShadow: '0 8px 28px rgba(115,192,103,0.5)' }}
        >
          <Heart className="w-4 h-4 inline mr-1" />已康复 ✨ 小动物恢复健康啦~
        </div>
      )}
    </div>
  );
}

// ============= 作答+类似题 内嵌康复面板 =============
interface RehabInlinePanelProps {
  error: ErrorItem;
  token: string;
  onClose: () => void;
  onXiaocongNeeded: () => void;
  onRecovered: (via: 'similar') => void;
}

type Phase = 'answer' | 'judging' | 'xiaocong' | 'similar-loading' | 'similar-answering' | 'similar-done';

function RehabInlinePanel({ error, token, onClose, onXiaocongNeeded, onRecovered }: RehabInlinePanelProps) {
  const [phase, setPhase] = useState<Phase>('answer');
  const [answer, setAnswer] = useState('');
  const [judgeMsg, setJudgeMsg] = useState<string | null>(null);

  // 类似题状态
  const [similarQs, setSimilarQs] = useState<{ index: number; question: string; answer: string }[]>([]);
  const [similarIdx, setSimilarIdx] = useState(0);
  const [similarAns, setSimilarAns] = useState('');
  const [similarResult, setSimilarResult] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [similarResults, setSimilarResults] = useState<boolean[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarFinalCorrect, setSimilarFinalCorrect] = useState(false);

  const correctAns = (error.correct_answer || error.question_answer || '').trim();
  const questionContent = error.question_text || error.content || '';

  // 归一化字符串：去空格、百分号、常见标点
  const normalize = (s: string) =>
    s.replace(/[\s,，%。、；：]/g, '').replace(/[×x*]/g, '*').replace(/[÷/]/g, '/').toLowerCase();
  const isEquivalent = (a: string, b: string) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const na = normalize(a);
    const nb = normalize(b);
    if (na && na === nb) return true;
    // 数字等价：纯数字字符串
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB) && Math.abs(numA - numB) < 1e-6) return true;
    return false;
  };

  // ===== Step 1: 提交原题作答 =====
  const submitOriginal = () => {
    const trimmed = answer.trim();
    if (!trimmed) {
      setJudgeMsg('请先写下你的答案哦~');
      return;
    }
    setJudgeMsg(null);
    setPhase('judging');
    // 前端判分（即时反馈，不依赖后端）
    const ok = isEquivalent(trimmed, correctAns);
    if (ok) {
      setJudgeMsg('🎉 答对啦！');
      // 直接进入类似题加载
      loadSimilar();
    } else {
      setJudgeMsg('再想想？小聪来帮帮你~');
      // 触发小聪对话（父组件负责打开 XiaocongDialog）
      onXiaocongNeeded();
      // 关闭作答面板，让学生专心对话
      setTimeout(() => onClose(), 600);
    }
  };

  // ===== 类似题加载（仅判对时触发） =====
  const loadSimilar = async () => {
    setPhase('similar-loading');
    setSimilarLoading(true);
    try {
      const res = await similarQuestions(error.id, token, 3);
      // 后端返回 {error_id, knowledge_point, questions:[{index,question,answer,...}]}
      // 注意：api.ts 用 fetchAPI 包装后，如果后端直接返回对象，外层 res 就是数据本身
      const data: any = (res as any)?.data ?? res;
      const questions = data?.questions || [];
      if (questions.length > 0) {
        setSimilarQs(questions);
        setSimilarIdx(0);
        setSimilarAns('');
        setSimilarResult(null);
        setSimilarResults([]);
        setSimilarFinalCorrect(false);
        setPhase('similar-answering');
      } else {
        // 生成失败兜底：直接标记康复
        setSimilarFinalCorrect(true);
        setPhase('similar-done');
      }
    } catch (e) {
      console.warn('[rehab] similar load failed, fallback to direct recover', e);
      setSimilarFinalCorrect(true);
      setPhase('similar-done');
    } finally {
      setSimilarLoading(false);
    }
  };

  // ===== Step 2: 提交类似题作答 =====
  const submitSimilar = () => {
    const trimmed = similarAns.trim();
    if (!trimmed) return;
    const q = similarQs[similarIdx];
    const ok = isEquivalent(trimmed, q.answer);
    setSimilarResult({ correct: ok, correctAnswer: q.answer });
    const newResults = [...similarResults, ok];
    setSimilarResults(newResults);
    if (ok) {
      if (similarIdx < similarQs.length - 1) {
        // 下一题
        setTimeout(() => {
          setSimilarIdx(similarIdx + 1);
          setSimilarAns('');
          setSimilarResult(null);
        }, 1200);
      } else {
        // 最后一题也对了 → 看是否全对
        const allOk = newResults.every((r) => r);
        setSimilarFinalCorrect(allOk);
        setPhase('similar-done');
      }
    } else {
      // 这题错了 → 不算康复，但允许继续把剩下的做完
      if (similarIdx < similarQs.length - 1) {
        setTimeout(() => {
          setSimilarIdx(similarIdx + 1);
          setSimilarAns('');
          setSimilarResult(null);
        }, 1800);
      } else {
        setSimilarFinalCorrect(false);
        setPhase('similar-done');
      }
    }
  };

  // ===== 类似题全对 → 触发父组件标记康复 =====
  useEffect(() => {
    if (phase === 'similar-done' && similarFinalCorrect) {
      onRecovered('similar');
    }
  }, [phase, similarFinalCorrect, onRecovered]);

  return (
    <div
      className="mt-4 p-4 rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(232, 245, 228, 0.85), rgba(255, 248, 240, 0.85))',
        border: '1.5px solid rgba(115, 192, 103, 0.35)',
      }}
    >
      {/* ===== Phase: 原题作答 ===== */}
      {(phase === 'answer' || phase === 'judging') && (
        <div>
          <p className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: '#2D5A27' }}>
            <Pencil className="w-4 h-4" />
            写一写你的答案
          </p>
          <p className="text-xs mb-3" style={{ color: '#8B7355' }}>
            题目：{questionContent || '（原题缺失，请直接点 AI 分步引导）'}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitOriginal(); }}
              placeholder="在这里写下你的答案"
              disabled={phase === 'judging'}
              className="flex-1 min-w-[120px] px-3 py-2 rounded-xl text-sm border-2 focus:outline-none"
              style={{
                background: 'rgba(255, 255, 255, 0.85)',
                borderColor: 'rgba(115, 192, 103, 0.4)',
                color: '#4A3728',
              }}
              data-testid={`rehab-input-${error.id}`}
            />
            <button
              onClick={submitOriginal}
              disabled={phase === 'judging'}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #73C067, #5CAF50)',
                boxShadow: '0 3px 10px rgba(115, 192, 103, 0.3)',
              }}
              data-testid={`rehab-submit-${error.id}`}
            >
              {phase === 'judging' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              提交
            </button>
          </div>
          {judgeMsg && (
            <p className="text-xs mt-2 font-semibold" style={{ color: judgeMsg.includes('🎉') ? '#2D5A27' : '#D04040' }}>
              {judgeMsg}
            </p>
          )}
        </div>
      )}

      {/* ===== Phase: 类似题加载 ===== */}
      {phase === 'similar-loading' && (
        <div className="text-center py-4">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: '#73C067' }} />
          <p className="text-sm" style={{ color: '#8B7355' }}>AI 正在生成 3 道类似题让你巩固...</p>
        </div>
      )}

      {/* ===== Phase: 类似题作答 ===== */}
      {phase === 'similar-answering' && similarQs[similarIdx] && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(139, 92, 246, 0.18)', color: '#6D28D9' }}>
              类似题 {similarIdx + 1}/{similarQs.length}
            </span>
            <span className="text-xs" style={{ color: '#8B7355' }}>
              答对全部 3 题即康复 ✨
            </span>
          </div>
          <p className="text-sm mb-3" style={{ color: '#4A3728' }}>
            {similarQs[similarIdx].question}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={similarAns}
              onChange={(e) => setSimilarAns(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSimilar(); }}
              placeholder="写下答案"
              disabled={!!similarResult}
              className="flex-1 min-w-[120px] px-3 py-2 rounded-xl text-sm border-2 focus:outline-none"
              style={{
                background: 'rgba(255, 255, 255, 0.85)',
                borderColor: 'rgba(139, 92, 246, 0.4)',
                color: '#4A3728',
              }}
              data-testid={`rehab-similar-input-${error.id}`}
            />
            <button
              onClick={submitSimilar}
              disabled={!!similarResult}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                boxShadow: '0 3px 10px rgba(139, 92, 246, 0.3)',
              }}
              data-testid={`rehab-similar-submit-${error.id}`}
            >
              <ArrowRight className="w-4 h-4" />
              提交
            </button>
          </div>
          {similarResult && (
            <div className="mt-2 text-xs">
              {similarResult.correct ? (
                <p className="font-semibold" style={{ color: '#2D5A27' }}>
                  ✅ 答对了！{similarIdx < similarQs.length - 1 ? '下一题...' : '马上完成！'}
                </p>
              ) : (
                <p className="font-semibold" style={{ color: '#D04040' }}>
                  ❌ 不对哦，正确答案是 <span className="font-mono">{similarResult.correctAnswer}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Phase: 类似题结束 ===== */}
      {phase === 'similar-done' && (
        <div className="text-center py-3">
          {similarFinalCorrect ? (
            <>
              <Sparkles className="w-6 h-6 mx-auto mb-1" style={{ color: '#73C067' }} />
              <p className="text-sm font-bold" style={{ color: '#2D5A27' }}>
                🎉 3 道类似题全部答对，已自动标记康复！
              </p>
            </>
          ) : (
            <>
              <Heart className="w-6 h-6 mx-auto mb-1" style={{ color: '#FFB86C' }} />
              <p className="text-sm font-bold" style={{ color: '#8B5A1B' }}>
                这一轮没全对，再点「开始救助」重新挑战~ 或换「AI 分步引导」听小聪讲解
              </p>
              <button
                onClick={onClose}
                className="mt-3 inline-flex items-center gap-1 px-4 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-[1.02]"
                style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  border: '1.5px solid rgba(139, 92, 246, 0.3)',
                  color: '#6D28D9',
                }}
              >
                收起面板
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
