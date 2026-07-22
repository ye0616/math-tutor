'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Camera, Upload, Loader2, CheckCircle, XCircle, Sparkles,
  Lightbulb, Target, ChevronDown, ChevronUp, BookOpen,
  RefreshCw, History, ArrowRight, Check, Brain,
  Trophy, MessageCircle, Send, Image as ImageIcon, AlertTriangle, Star,
} from 'lucide-react';
import {
  getStoredUser, getToken, uploadHomework, pollGradingTask,
  getGuidedCorrection, getSimilarQuestions, homeworkHistory,
  getPublishedAssignments, PublishedAssignment,
  HomeworkQuestion, GuidedCorrection, SimilarQuestion,
  generateRandomChallenge, getRandomChallengeTask, submitRandomChallenge,
  askQA, getQATask, saveQASession, getQASimilar,
  RandomChallengeQuestion, QAResponse,
} from '@/lib/api';
import XiaocongDialog from '@/components/XiaocongDialog';

type Stage = 'upload' | 'grading' | 'result' | 'history';

interface SubmissionHistory {
  id: number;
  lesson_title: string;
  image_url: string;
  status: string;
  summary: string;
  total_questions: number;
  correct_count: number;
  created_at: string;
  questions: HomeworkQuestion[];
}

export default function StudentHomework() {
  const [stage, setStage] = useState<Stage>('upload');
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState<PublishedAssignment | null>(null);
  const [assignments, setAssignments] = useState<PublishedAssignment[]>([]);
  const [gradingMsg, setGradingMsg] = useState('AI正在识别你的作业...');
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<SubmissionHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u = getStoredUser();
    const t = getToken();
    if (u) setUser(u);
    if (t) {
      setToken(t);
      // 加载已发布作业列表
      getPublishedAssignments(t).then(res => {
        setAssignments(res?.assignments || []);
      }).catch(err => console.error('Failed to load assignments:', err));
    }
  }, []);

  // ===== 文件选择 =====
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件（JPG/PNG等）');
      return;
    }
    setError('');
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // ===== 上传并批改 =====
  const handleUpload = async () => {
    if (!selectedFile || !token) return;
    setStage('grading');
    setGradingMsg('AI正在识别你的作业...');

    // 动态更新等待消息
    const msgTimer = setInterval(() => {
      const msgs = [
        'AI正在识别你的作业...',
        '正在逐题批改...',
        '正在分析错题原因...',
        '马上就好，AI正在整理结果...',
      ];
      setGradingMsg(prev => {
        const idx = msgs.indexOf(prev);
        return msgs[Math.min(idx + 1, msgs.length - 1)];
      });
    }, 8000);

    try {
      const { task_id } = await uploadHomework(token, selectedFile, lessonTitle, selectedAssignment?.id);
      const taskResult = await pollGradingTask(token, task_id);
      // 后端校验：识别出的题不在布置范围内 → 拦截
      if (taskResult?.status === 'failed') {
        setError(taskResult.error || '识别出的题目与老师布置的不一致，请重新拍照');
        setStage('upload');
        return;
      }
      setResult(taskResult);
      setStage('result');
    } catch (e: any) {
      setError(e.message || '批改失败，请重试');
      setStage('upload');
    } finally {
      clearInterval(msgTimer);
    }
  };

  // ===== 加载历史 =====
  const loadHistory = async () => {
    if (!token || !user) return;
    try {
      const res = await homeworkHistory(token, user.id);
      setHistory(res?.submissions || []);
    } catch (e) {
      console.error('Load history error:', e);
    }
  };

  const toggleHistory = () => {
    if (!showHistory && history.length === 0) {
      loadHistory();
    }
    setShowHistory(!showHistory);
  };

  // ===== 重置 =====
  const handleReset = () => {
    setStage('upload');
    setSelectedFile(null);
    setPreviewUrl('');
    setLessonTitle('');
    setSelectedAssignment(null);
    setResult(null);
    setError('');
  };

  // ===== 渲染 =====
  if (stage === 'grading') {
    return (
      <div className="space-y-6">
        <div className="glass-card-solid p-12 text-center">
          <div className="relative inline-block mb-6">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto"
                 style={{ background: 'linear-gradient(135deg, rgba(149,216,240,0.3), rgba(115,192,103,0.3))' }}>
              <Brain className="w-12 h-12 animate-pulse" style={{ color: '#5CAF50' }} />
            </div>
            <div className="absolute -top-2 -right-2">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FFB86C' }} />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-3" style={{ color: '#4A3728' }}>
            AI智能体正在批改
          </h2>
          <p className="text-sm mb-4" style={{ color: '#8B7355' }}>
            {gradingMsg}
          </p>
          <div className="max-w-xs mx-auto">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(200, 230, 192, 0.4)' }}>
              <div className="h-full rounded-full animate-pulse"
                   style={{ background: 'linear-gradient(90deg, #73C067, #5CAF50, #73C067)', width: '60%' }} />
            </div>
          </div>
          <p className="text-xs mt-4" style={{ color: '#8B7355' }}>
            预计需要 30-60 秒，请耐心等待
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============= 横幅 ============= */}
      <section
        className="glass-card-solid relative overflow-hidden p-6 md:p-8"
        style={{
          background: 'linear-gradient(135deg, rgba(232, 245, 228, 0.92) 0%, rgba(224, 242, 250, 0.85) 50%, rgba(255, 240, 219, 0.85) 100%)',
        }}
      >
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="shrink-0 flex items-end gap-2 text-5xl md:text-6xl select-none">
            <span className="animal-bounce">📚</span>
            <span className="animal-bounce-delay">✏️</span>
            <span className="animal-bounce-delay2">🤖</span>
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-2"
              style={{ background: 'rgba(149, 216, 240, 0.2)', color: '#2D7A8E' }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI 智能批改
            </div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
              <BookOpen className="w-7 h-7" style={{ color: '#5CAF50' }} />
              学习作业
            </h1>
            <p className="text-sm md:text-base mt-2" style={{ color: '#8B7355' }}>
              拍照上传你的作业，AI智能体会逐题批改，错题还会引导你一步步改错。全对了还有"再考考你"挑战哦~
            </p>
          </div>
          <button
            onClick={toggleHistory}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
            style={{ background: 'rgba(255, 255, 255, 0.7)', color: '#8B7355', border: '1.5px solid rgba(200, 230, 192, 0.5)' }}
          >
            <History className="w-3.5 h-3.5" />
            批改记录
          </button>
        </div>
      </section>

      {/* ============= 上传区域 ============= */}
      {stage === 'upload' && (
        <>
          <section className="glass-card-solid p-6 md:p-8">
            <h2 className="text-lg font-bold mb-4" style={{ color: '#4A3728' }}>
              拍照上传作业
            </h2>

            {/* 作业课题选择 */}
            <div className="mb-4">
              <label className="text-sm font-semibold mb-2 block flex items-center gap-1.5" style={{ color: '#8B7355' }}>
                <BookOpen className="w-4 h-4" style={{ color: '#5CAF50' }} />
                选择作业课题
              </label>
              {assignments.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={selectedAssignment?.id || ''}
                    onChange={e => {
                      const id = parseInt(e.target.value);
                      if (id) {
                        const a = assignments.find(x => x.id === id);
                        if (a) {
                          setSelectedAssignment(a);
                          setLessonTitle(a.title);
                        }
                      } else {
                        setSelectedAssignment(null);
                        setLessonTitle('');
                      }
                    }}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all cursor-pointer"
                    style={{
                      background: 'rgba(255, 255, 255, 0.8)',
                      border: '1.5px solid rgba(200, 230, 192, 0.5)',
                      color: '#4A3728',
                    }}
                  >
                    <option value="">请选择老师发布的作业...</option>
                    {assignments.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.title}{a.question_count > 0 ? `（${a.question_count}题）` : ''}{a.submitted ? ' ✓已提交' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedAssignment && (
                    <div className="px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 flex-wrap"
                         style={{ background: 'rgba(232, 245, 228, 0.6)', color: '#2D5A27' }}>
                      <span className="font-bold">{selectedAssignment.title}</span>
                      {selectedAssignment.question_count > 0 && <span>· {selectedAssignment.question_count} 题</span>}
                      {selectedAssignment.submitted && (
                        <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(115,192,103,0.2)' }}>
                          已提交 · {selectedAssignment.correct_count}/{selectedAssignment.total_questions} 对
                        </span>
                      )}
                      {selectedAssignment.due_date && (
                        <span style={{ color: '#FF9F4A' }}>· 截止 {selectedAssignment.due_date.slice(0, 10)}</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-3 rounded-xl text-sm text-center" style={{ background: 'rgba(255, 240, 219, 0.5)', color: '#8B5A1B' }}>
                  老师还没有发布作业，你可以先拍照上传自行练习
                </div>
              )}
              {/* 手动输入课题（可选，作为备选） */}
              <input
                type="text"
                value={lessonTitle}
                onChange={e => {
                  setLessonTitle(e.target.value);
                  if (selectedAssignment && e.target.value !== selectedAssignment.title) {
                    setSelectedAssignment(null);
                  }
                }}
                placeholder="或手动输入课题名称（可选）"
                className="w-full px-4 py-2.5 mt-2 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(200, 230, 192, 0.3)',
                  color: '#4A3728',
                }}
              />
            </div>

            {/* 上传区域 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!previewUrl ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed p-8 md:p-12 text-center transition-all hover:opacity-80"
                style={{
                  borderColor: 'rgba(115, 192, 103, 0.4)',
                  background: 'rgba(232, 245, 228, 0.5)',
                }}
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                     style={{ background: 'rgba(115, 192, 103, 0.15)' }}>
                  <Camera className="w-8 h-8" style={{ color: '#5CAF50' }} />
                </div>
                <p className="text-sm font-bold mb-1" style={{ color: '#4A3728' }}>
                  点击拍照或选择作业图片
                </p>
                <p className="text-xs" style={{ color: '#8B7355' }}>
                  支持 JPG / PNG，建议拍清楚每道题目
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.5)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="作业预览" className="w-full max-h-96 object-contain" />
                  <button
                    onClick={() => { setSelectedFile(null); setPreviewUrl(''); }}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={{ background: 'rgba(255,255,255,0.9)', color: '#D04040' }}
                  >
                    重新选择
                  </button>
                </div>
                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || !token}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)',
                    boxShadow: '0 6px 20px rgba(115, 192, 103, 0.35)',
                  }}
                >
                  <Sparkles className="w-4 h-4 inline mr-1.5" />
                  开始AI批改
                </button>
              </div>
            )}
          </section>

          {/* 历史记录 */}
          {showHistory && (
            <HistoryPanel history={history} onRefresh={loadHistory} />
          )}
        </>
      )}

      {/* ============= 批改结果 ============= */}
      {stage === 'result' && result && (
        <GradingResult
          result={result}
          token={token}
          userId={user?.id || 0}
          onReset={handleReset}
          lessonCode={selectedAssignment?.unit_code || ''}
        />
      )}

      {/* ============= 学习问答区域 ============= */}
      {token && (
        <StudyQA token={token} userId={user?.id || 0} classId={user?.class_id || 0} />
      )}
    </div>
  );
}

// ============= 批改结果组件 =============
function GradingResult({ result, token, userId, onReset, lessonCode }: { result: any; token: string; userId: number; onReset: () => void; lessonCode: string }) {
  const submission = result.submission;
  const questions: HomeworkQuestion[] = result.questions || [];
  const accuracy = result.accuracy || 0;
  const correct = submission?.correct_count || 0;
  const total = submission?.total_questions || 0;
  const isAllCorrect = total > 0 && correct === total;
  const lessonTitle = submission?.lesson_title || '';

  // 把每题的 error_note_id 与 question 一一对应（按 question_index 顺序对齐）
  const errorNoteIds: (number | null)[] = questions.map((q) => {
    if (q.is_correct === 1) return null;
    const idx = (q.question_index ?? 0);
    return result.error_note_ids?.[idx] ?? null;
  });

  // 小聪对话框状态
  const [xiaocongOpen, setXiaocongOpen] = useState(false);
  const [xiaocongTarget, setXiaocongTarget] = useState<{
    errorNoteId: number;
    question: HomeworkQuestion;
  } | null>(null);
  const [autoPrompted, setAutoPrompted] = useState(false);

  // 批改结果出来后自动弹出第一道错题的小聪对话框
  useEffect(() => {
    if (autoPrompted) return;
    const firstWrongIdx = questions.findIndex((q) => q.is_correct !== 1);
    if (firstWrongIdx >= 0) {
      const errorNoteId = errorNoteIds[firstWrongIdx];
      if (errorNoteId) {
        setXiaocongTarget({ errorNoteId, question: questions[firstWrongIdx] });
        setXiaocongOpen(true);
        setAutoPrompted(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const openXiaocongFor = (question: HomeworkQuestion) => {
    const idx = question.question_index ?? 0;
    const errorNoteId = errorNoteIds[idx];
    if (!errorNoteId) return;
    setXiaocongTarget({ errorNoteId, question });
    setXiaocongOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* 结果概览 */}
      <section className="glass-card-solid p-6 text-center">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black"
            style={{
              background: accuracy >= 80
                ? 'linear-gradient(135deg, rgba(115,192,103,0.2), rgba(92,175,80,0.15))'
                : accuracy >= 60
                ? 'linear-gradient(135deg, rgba(255,184,108,0.2), rgba(255,160,80,0.15))'
                : 'linear-gradient(135deg, rgba(255,138,138,0.2), rgba(208,64,64,0.15))',
              color: accuracy >= 80 ? '#2D5A27' : accuracy >= 60 ? '#8B5A1B' : '#D04040',
            }}
          >
            {accuracy}%
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-5 h-5" style={{ color: '#5CAF50' }} />
              <span className="text-xl font-black" style={{ color: '#2D5A27' }}>{correct}</span>
              <span className="text-sm" style={{ color: '#8B7355' }}>题正确</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5" style={{ color: '#D04040' }} />
              <span className="text-xl font-black" style={{ color: '#D04040' }}>{total - correct}</span>
              <span className="text-sm" style={{ color: '#8B7355' }}>题需改错</span>
            </div>
          </div>
        </div>
        {submission?.summary && (
          <div className="rounded-xl p-3 mt-4 text-left"
               style={{ background: 'rgba(232, 245, 228, 0.6)' }}>
            <p className="text-sm" style={{ color: '#4A3728' }}>
              <Sparkles className="w-4 h-4 inline mr-1" style={{ color: '#FFB86C' }} />
              {submission.summary}
            </p>
          </div>
        )}

        {/* 全对夸奖 + 再考考你 */}
        {isAllCorrect && (
          <RandomChallenge
            token={token}
            userId={userId}
            submissionId={submission?.id || 0}
            lessonTitle={lessonTitle}
            lessonCode={lessonCode}
          />
        )}

        <button
          onClick={onReset}
          className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)' }}
        >
          <Camera className="w-4 h-4" />
          再拍一份
        </button>
      </section>

      {/* 逐题结果 */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
          <BookOpen className="w-5 h-5" style={{ color: '#5CAF50' }} />
          逐题批改详情
        </h2>
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={idx}
            token={token}
            errorNoteId={errorNoteIds[idx] ?? null}
            onOpenXiaocong={openXiaocongFor}
          />
        ))}
      </section>

      {/* 小聪智能体对话框（错题引导） */}
      {xiaocongTarget && (
        <XiaocongDialog
          open={xiaocongOpen}
          errorNoteId={xiaocongTarget.errorNoteId}
          questionText={xiaocongTarget.question.question_text}
          studentAnswer={xiaocongTarget.question.student_answer}
          correctAnswer={xiaocongTarget.question.correct_answer}
          knowledgePoint={xiaocongTarget.question.knowledge_point}
          onClose={() => setXiaocongOpen(false)}
        />
      )}
    </div>
  );
}

// ============= 单题卡片组件 =============
function QuestionCard({ question, index, token, errorNoteId, onOpenXiaocong }: { question: HomeworkQuestion; index: number; token: string; errorNoteId: number | null; onOpenXiaocong: (q: HomeworkQuestion) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [correction, setCorrection] = useState<GuidedCorrection | null>(null);
  const [loadingCorrection, setLoadingCorrection] = useState(false);
  const [similarQs, setSimilarQs] = useState<SimilarQuestion[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);

  const isCorrect = question.is_correct === 1;

  const handleGetCorrection = async () => {
    if (correction) {
      setExpanded(!expanded);
      return;
    }
    setLoadingCorrection(true);
    try {
      const res = await getGuidedCorrection(token, question.id);
      setCorrection(res);
      setExpanded(true);
    } catch (e: any) {
      setCorrection({ error_reason: 'AI引导暂不可用，请稍后重试' });
      setExpanded(true);
    } finally {
      setLoadingCorrection(false);
    }
  };

  const handleGetSimilar = async () => {
    if (similarQs.length > 0) {
      setShowSimilar(!showSimilar);
      return;
    }
    setLoadingSimilar(true);
    try {
      const res = await getSimilarQuestions(token, question.id);
      setSimilarQs(res?.questions || []);
      setShowSimilar(true);
    } catch (e: any) {
      console.error('Similar questions error:', e);
    } finally {
      setLoadingSimilar(false);
    }
  };

  return (
    <article className="glass-card-solid p-5">
      {/* 题目头部 */}
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black"
            style={{
              background: isCorrect ? 'rgba(115,192,103,0.15)' : 'rgba(255,138,138,0.15)',
              color: isCorrect ? '#2D5A27' : '#D04040',
            }}
          >
            {index + 1}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#4A3728' }}>
              {question.question_text || '(题目内容)'}
            </p>
            {question.knowledge_point && (
              <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>
                知识点：{question.knowledge_point}
              </p>
            )}
          </div>
        </div>
        {isCorrect ? (
          <CheckCircle className="w-6 h-6 shrink-0" style={{ color: '#5CAF50' }} />
        ) : (
          <XCircle className="w-6 h-6 shrink-0" style={{ color: '#D04040' }} />
        )}
      </header>

      {/* 答案对比 */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255, 248, 240, 0.8)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0"
                style={{ background: isCorrect ? 'rgba(115,192,103,0.15)' : 'rgba(255,138,138,0.15)', color: isCorrect ? '#2D5A27' : '#D04040' }}>
            你的答案
          </span>
          <span className="text-sm font-bold" style={{ color: isCorrect ? '#2D5A27' : '#D04040' }}>
            {question.student_answer || '(未作答)'}
          </span>
        </div>
        {!isCorrect && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0"
                  style={{ background: 'rgba(115,192,103,0.15)', color: '#2D5A27' }}>
              正确答案
            </span>
            <span className="text-sm font-bold" style={{ color: '#2D5A27' }}>
              {question.correct_answer}
            </span>
          </div>
        )}
      </div>

      {/* 批改分析 */}
      {question.analysis && (
        <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(232, 245, 228, 0.5)' }}>
          <p className="text-xs leading-relaxed" style={{ color: '#4A3728' }}>
            <Lightbulb className="w-3.5 h-3.5 inline mr-1" style={{ color: '#FFB86C' }} />
            <span className="font-semibold">批改分析：</span>{question.analysis}
          </p>
        </div>
      )}

      {/* 错题操作按钮 */}
      {!isCorrect && (
        <div className="mt-4 flex flex-wrap gap-2">
          {errorNoteId && (
            <button
              onClick={() => onOpenXiaocong(question)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #FFB86C 0%, #FF7F50 100%)' }}
            >
              <Brain className="w-4 h-4" />
              让小聪引导
            </button>
          )}
          <button
            onClick={handleGetCorrection}
            disabled={loadingCorrection}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #FFB86C 0%, #FF9F40 100%)' }}
          >
            {loadingCorrection ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                AI引导中...
              </>
            ) : correction ? (
              <>
                <Lightbulb className="w-4 h-4" />
                {expanded ? '收起引导' : '展开引导'}
              </>
            ) : (
              <>
                <Lightbulb className="w-4 h-4" />
                引导改错
              </>
            )}
          </button>
          <button
            onClick={handleGetSimilar}
            disabled={loadingSimilar}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-60"
            style={{ background: 'rgba(149, 216, 240, 0.2)', color: '#2D7A8E', border: '1.5px solid rgba(149, 216, 240, 0.4)' }}
          >
            {loadingSimilar ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                生成中...
              </>
            ) : showSimilar ? (
              <>
                <ChevronUp className="w-4 h-4" />
                收起巩固题
              </>
            ) : (
              <>
                <Target className="w-4 h-4" />
                巩固练习
              </>
            )}
          </button>
        </div>
      )}

      {/* 引导改错内容 */}
      {expanded && correction && (
        <div className="mt-4 p-4 rounded-2xl space-y-3"
             style={{ background: 'linear-gradient(135deg, rgba(255, 248, 240, 0.9), rgba(255, 240, 219, 0.7))', border: '1.5px dashed rgba(255, 184, 108, 0.5)' }}>
          <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#8B5A1B' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#FFB86C' }} />
            AI 分步引导改错
          </p>
          {(() => {
            // 兼容 steps 数组格式和扁平格式
            if (correction.steps && correction.steps.length > 0) {
              const typeColors: Record<string, string> = {
                hint: '#FFB86C', checkpoint: '#95D8F0', method: '#73C067', practice: '#C8A8E9',
              };
              const typeTitles: Record<string, string> = {
                hint: '思路提示', checkpoint: '检查点', method: '方法点拨', practice: '小练习',
              };
              return correction.steps.map((s, i) => (
                <CorrectionStep
                  key={i}
                  step={s.step || i + 1}
                  title={typeTitles[s.type] || s.type || `步骤${i + 1}`}
                  content={s.content}
                  color={typeColors[s.type] || '#FFB86C'}
                />
              ));
            }
            // 扁平格式兼容
            return (
              <>
                {correction.hint && <CorrectionStep step={1} title="思路提示" content={correction.hint} color="#FFB86C" />}
                {correction.checkpoint && <CorrectionStep step={2} title="检查点" content={correction.checkpoint} color="#95D8F0" />}
                {correction.method && <CorrectionStep step={3} title="方法点拨" content={correction.method} color="#73C067" />}
                {correction.practice && <CorrectionStep step={4} title="小练习" content={correction.practice} color="#C8A8E9" />}
              </>
            );
          })()}
          {correction.error_reason && (
            <div className="rounded-xl p-3" style={{ background: 'rgba(255, 138, 138, 0.1)' }}>
              <p className="text-xs" style={{ color: '#D04040' }}>
                <span className="font-bold">错因分析：</span>{correction.error_reason}
              </p>
            </div>
          )}
          {correction.full_solution && (
            <div className="rounded-xl p-3" style={{ background: 'rgba(115, 192, 103, 0.1)' }}>
              <p className="text-xs" style={{ color: '#2D5A27' }}>
                <span className="font-bold">完整解答：</span>{correction.full_solution}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 类似题目 */}
      {showSimilar && similarQs.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#2D7A8E' }}>
            <Target className="w-4 h-4" />
            巩固练习题（试试看你能做对几道~）
          </p>
          {similarQs.map((sq, i) => (
            <SimilarQuestionCard key={i} question={sq} index={i} />
          ))}
        </div>
      )}
    </article>
  );
}

// ============= 引导改错步骤组件 =============
function CorrectionStep({ step, title, content, color }: { step: number; title: string; content: string; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255, 255, 255, 0.7)' }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
             style={{ background: color }}>
          {step}
        </div>
        <span className="text-sm font-bold" style={{ color: '#4A3728' }}>{title}</span>
      </div>
      <p className="text-sm leading-relaxed pl-8" style={{ color: '#4A3728' }}>
        {content}
      </p>
    </div>
  );
}

// ============= 类似题目卡片 =============
function SimilarQuestionCard({ question, index }: { question: SimilarQuestion; index: number }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');

  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(224, 242, 250, 0.5)', border: '1.5px solid rgba(149, 216, 240, 0.3)' }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0"
              style={{ background: 'rgba(149, 216, 240, 0.2)', color: '#2D7A8E' }}>
          第{index + 1}题
        </span>
        <p className="text-sm" style={{ color: '#4A3728' }}>{question.question}</p>
      </div>
      <div className="flex items-center gap-2 pl-2">
        <input
          type="text"
          value={userAnswer}
          onChange={e => setUserAnswer(e.target.value)}
          placeholder="输入你的答案..."
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'rgba(255, 255, 255, 0.8)', border: '1.5px solid rgba(200, 230, 192, 0.5)', color: '#4A3728' }}
        />
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className="px-3 py-2 rounded-lg text-xs font-bold transition-all"
          style={{ background: 'rgba(149, 216, 240, 0.2)', color: '#2D7A8E' }}
        >
          {showAnswer ? '隐藏答案' : '查看答案'}
        </button>
      </div>
      {showAnswer && (
        <div className="mt-2 rounded-lg p-2" style={{ background: 'rgba(115, 192, 103, 0.1)' }}>
          <p className="text-sm" style={{ color: '#2D5A27' }}>
            <Check className="w-3.5 h-3.5 inline mr-1" />
            正确答案：{question.answer}
          </p>
          {question.knowledge_point && (
            <p className="text-xs mt-1" style={{ color: '#8B7355' }}>
              知识点：{question.knowledge_point}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============= 历史记录面板 =============
function HistoryPanel({ history, onRefresh }: { history: SubmissionHistory[]; onRefresh: () => void }) {
  return (
    <section className="glass-card-solid p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
          <History className="w-5 h-5" style={{ color: '#5CAF50' }} />
          批改记录
        </h2>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
          style={{ background: 'rgba(255, 255, 255, 0.7)', color: '#8B7355', border: '1px solid rgba(200, 230, 192, 0.5)' }}
        >
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>
      {history.length === 0 ? (
        <p className="text-center text-sm py-8" style={{ color: '#8B7355' }}>
          暂无批改记录
        </p>
      ) : (
        <div className="space-y-3">
          {history.map(sub => (
            <div key={sub.id} className="rounded-xl p-4" style={{ background: 'rgba(232, 245, 228, 0.5)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold" style={{ color: '#4A3728' }}>
                  {sub.lesson_title || '数学作业'}
                </span>
                <span className="text-xs" style={{ color: '#8B7355' }}>
                  {sub.created_at?.split(' ')[0] || ''}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span style={{ color: '#2D5A27' }}>
                  <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                  {sub.correct_count}/{sub.total_questions}正确
                </span>
                {sub.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sub.image_url} alt="作业" className="w-12 h-12 rounded-lg object-cover" />
                )}
              </div>
              {sub.summary && (
                <p className="text-xs mt-2" style={{ color: '#8B7355' }}>{sub.summary}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============= 随机考察（"再考考你"）组件 =============
const PRAISE_MESSAGES = [
  '太棒了！全部正确！🎉',
  '满分通过！你是数学小达人！⭐',
  '太厉害了！每一道题都做对了！🌟',
  '完美！你的数学功底很扎实！🏆',
  '全对！给你一个大大的赞！👍',
];

type ChallengeStage = 'idle' | 'generating' | 'answering' | 'submitted';

function RandomChallenge({
  token, userId, submissionId, lessonTitle, lessonCode,
}: {
  token: string; userId: number; submissionId: number; lessonTitle: string; lessonCode: string;
}) {
  const [challengeStage, setChallengeStage] = useState<ChallengeStage>('idle');
  const [questions, setQuestions] = useState<RandomChallengeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [taskId, setTaskId] = useState('');
  const [challengeTitle, setChallengeTitle] = useState('');
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const praiseRef = useRef(PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)]);

  // 生成随机考察题
  const handleStartChallenge = async () => {
    setChallengeStage('generating');
    setErrorMsg('');
    try {
      const { task_id } = await generateRandomChallenge(token, lessonTitle, submissionId, lessonCode);
      setTaskId(task_id);
      // 轮询
      const poll = async () => {
        try {
          const res = await getRandomChallengeTask(token, task_id);
          if (res.status === 'done' && res.result) {
            setQuestions(res.result.questions || []);
            setChallengeTitle(res.result.challenge_title || '再考考你');
            setChallengeStage('answering');
          } else if (res.status === 'error') {
            setErrorMsg(res.error || '生成失败，请稍后重试');
            setChallengeStage('idle');
          } else {
            setTimeout(poll, 3000);
          }
        } catch (e: any) {
          setErrorMsg(e.message || '轮询失败');
          setChallengeStage('idle');
        }
      };
      setTimeout(poll, 3000);
    } catch (e: any) {
      setErrorMsg(e.message || '发起考察失败');
      setChallengeStage('idle');
    }
  };

  // 提交考察答案
  const handleSubmit = async () => {
    const answersList = questions.map(q => ({
      index: q.index,
      question: q.question,
      answer: q.answer,
      student_answer: answers[q.index] || '',
      knowledge_point: q.knowledge_point || '',
    }));
    try {
      const res = await submitRandomChallenge(
        token, userId, submissionId, lessonTitle,
        JSON.stringify(questions),
        JSON.stringify(answersList),
      );
      setSubmitResult(res);
      setChallengeStage('submitted');
    } catch (e: any) {
      setErrorMsg(e.message || '提交失败');
    }
  };

  // ---- idle: 显示夸奖+按钮 ----
  if (challengeStage === 'idle') {
    return (
      <div className="mt-4 rounded-2xl p-5 text-center"
           style={{ background: 'linear-gradient(135deg, rgba(255,240,219,0.9), rgba(255,224,178,0.6))', border: '2px solid rgba(255,184,108,0.4)' }}>
        <Trophy className="w-10 h-10 mx-auto mb-2" style={{ color: '#FF9F40' }} />
        <p className="text-lg font-black mb-1" style={{ color: '#8B5A1B' }}>
          {praiseRef.current}
        </p>
        <p className="text-xs mb-3" style={{ color: '#8B7355' }}>
          想挑战一下自己吗？AI准备了5道拓展题，看看你能否全部答对！
        </p>
        {errorMsg && <p className="text-xs text-red-500 mb-2">{errorMsg}</p>}
        <button
          onClick={handleStartChallenge}
          className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.03]"
          style={{ background: 'linear-gradient(135deg, #FFB86C 0%, #FF9F40 100%)', boxShadow: '0 4px 16px rgba(255,159,64,0.35)' }}
        >
          <Sparkles className="w-4 h-4" />
          再考考你
        </button>
      </div>
    );
  }

  // ---- generating: 加载中 ----
  if (challengeStage === 'generating') {
    return (
      <div className="mt-4 rounded-2xl p-6 text-center"
           style={{ background: 'rgba(255,240,219,0.6)', border: '2px solid rgba(255,184,108,0.3)' }}>
        <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" style={{ color: '#FF9F40' }} />
        <p className="text-sm font-bold" style={{ color: '#8B5A1B' }}>AI正在准备挑战题目...</p>
        <p className="text-xs mt-1" style={{ color: '#8B7355' }}>预计需要10-20秒</p>
      </div>
    );
  }

  // ---- submitted: 结果展示 ----
  if (challengeStage === 'submitted' && submitResult) {
    const { correct, total, has_errors, reported } = submitResult;
    return (
      <div className="mt-4 rounded-2xl p-5"
           style={{
             background: has_errors
               ? 'linear-gradient(135deg, rgba(255,238,228,0.9), rgba(255,224,224,0.6))'
               : 'linear-gradient(135deg, rgba(232,245,228,0.9), rgba(200,230,192,0.6))',
             border: `2px solid ${has_errors ? 'rgba(255,138,138,0.4)' : 'rgba(115,192,103,0.4)'}`,
           }}>
        <div className="text-center mb-3">
          {has_errors ? (
            <AlertTriangle className="w-8 h-8 mx-auto mb-1" style={{ color: '#D04040' }} />
          ) : (
            <Trophy className="w-8 h-8 mx-auto mb-1" style={{ color: '#FF9F40' }} />
          )}
          <p className="text-lg font-black" style={{ color: has_errors ? '#D04040' : '#2D5A27' }}>
            挑战完成！{correct}/{total} 题正确
          </p>
        </div>
        {has_errors && reported === 1 && (
          <div className="rounded-xl p-3 mb-2" style={{ background: 'rgba(255,138,138,0.1)' }}>
            <p className="text-xs flex items-center gap-1.5" style={{ color: '#D04040' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              你的错题已上报老师，老师会关注你的学习情况，继续加油！
            </p>
          </div>
        )}
        {!has_errors && (
          <p className="text-sm text-center" style={{ color: '#2D5A27' }}>
            全部答对！你真的太棒了！🎉
          </p>
        )}
      </div>
    );
  }

  // ---- answering: 答题界面 ----
  return (
    <div className="mt-4 rounded-2xl p-5"
         style={{ background: 'linear-gradient(135deg, rgba(255,248,240,0.9), rgba(255,240,219,0.7))', border: '2px solid rgba(255,184,108,0.4)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Star className="w-5 h-5" style={{ color: '#FF9F40' }} />
        <h3 className="text-base font-black" style={{ color: '#8B5A1B' }}>{challengeTitle}</h3>
      </div>
      <p className="text-xs mb-4" style={{ color: '#8B7355' }}>
        请回答以下5道题目，答错会自动上报老师哦~
      </p>
      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div key={idx} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <div className="flex items-start gap-2 mb-2">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: '#FF9F40' }}>
                {idx + 1}
              </span>
              <p className="text-sm font-semibold" style={{ color: '#4A3728' }}>{q.question}</p>
            </div>
            <input
              type="text"
              value={answers[q.index] || ''}
              onChange={e => setAnswers(prev => ({ ...prev, [q.index]: e.target.value }))}
              placeholder="输入你的答案..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.9)', border: '1.5px solid rgba(255,184,108,0.3)', color: '#4A3728' }}
            />
          </div>
        ))}
      </div>
      {errorMsg && <p className="text-xs text-red-500 mt-2">{errorMsg}</p>}
      <button
        onClick={handleSubmit}
        disabled={questions.some(q => !answers[q.index]?.trim())}
        className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.01] disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #FFB86C 0%, #FF9F40 100%)' }}
      >
        <Check className="w-4 h-4 inline mr-1.5" />
        提交挑战
      </button>
    </div>
  );
}

// ============= 学习问答组件（苏格拉底式引导） =============
type QAStage = 'idle' | 'asking' | 'answered';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  image?: string;
}

function StudyQA({ token, userId, classId }: { token: string; userId: number; classId: number }) {
  const [qaStage, setQAStage] = useState<QAStage>('idle');
  const [questionText, setQuestionText] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [taskId, setTaskId] = useState('');
  const [isSolved, setIsSolved] = useState(false);
  const [suggestedAnswer, setSuggestedAnswer] = useState('');
  const [similarQuestions, setSimilarQuestions] = useState<any[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const qaImageRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, qaStage]);

  // 图片选择 → base64
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('请选择图片文件');
      return;
    }
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      // 转为 base64（去掉 data:image/xxx;base64, 前缀）
      const base64 = result.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  // 提问
  const handleAsk = async () => {
    if (!questionText.trim() && !imageBase64) return;
    setErrorMsg('');

    // 构建对话历史
    const history = conversation.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    // 添加用户消息
    const userMsg: ChatMessage = {
      role: 'user',
      content: questionText.trim() || '(上传了图片题目)',
      image: imagePreview || undefined,
    };
    setConversation(prev => [...prev, userMsg]);
    setQAStage('asking');

    const currentQuestion = questionText.trim();
    const currentImage = imageBase64;
    setQuestionText('');
    setImageBase64('');
    setImagePreview('');

    try {
      const { task_id } = await askQA(token, currentQuestion || '请看图片中的题目', currentImage || undefined, history);
      setTaskId(task_id);
      // 轮询
      const poll = async () => {
        try {
          const res = await getQATask(token, task_id);
          if (res.status === 'done' && res.result) {
            const result: QAResponse = res.result;
            setConversation(prev => [...prev, { role: 'ai', content: result.reply }]);
            if (result.is_solved) {
              setIsSolved(true);
              setSuggestedAnswer(result.suggested_answer || '');
            }
            setQAStage('answered');
          } else if (res.status === 'error') {
            setErrorMsg(res.error || 'AI回答失败');
            setQAStage('answered');
          } else {
            setTimeout(poll, 3000);
          }
        } catch (e: any) {
          setErrorMsg(e.message || '轮询失败');
          setQAStage('answered');
        }
      };
      setTimeout(poll, 3000);
    } catch (e: any) {
      setErrorMsg(e.message || '提问失败');
      setQAStage('answered');
    }
  };

  // 生成巩固题
  const handleGetSimilar = async () => {
    if (similarQuestions.length > 0) {
      setShowSimilar(!showSimilar);
      return;
    }
    setLoadingSimilar(true);
    try {
      const lastQuestion = conversation.find(m => m.role === 'user')?.content || '';
      const res = await getQASimilar(token, lastQuestion, suggestedAnswer);
      setSimilarQuestions(res?.questions || []);
      setShowSimilar(true);

      // 保存会话
      if (!sessionSaved) {
        await saveQASession(
          token, userId,
          lastQuestion,
          JSON.stringify(conversation),
          true,
          res?.questions?.[0]?.question,
          res?.questions?.[0]?.answer,
        );
        setSessionSaved(true);
      }
    } catch (e: any) {
      setErrorMsg(e.message || '生成巩固题失败');
    } finally {
      setLoadingSimilar(false);
    }
  };

  // 重置对话
  const handleNewSession = () => {
    setConversation([]);
    setQAStage('idle');
    setIsSolved(false);
    setSuggestedAnswer('');
    setSimilarQuestions([]);
    setShowSimilar(false);
    setSessionSaved(false);
    setQuestionText('');
    setImageBase64('');
    setImagePreview('');
    setErrorMsg('');
  };

  return (
    <section className="glass-card-solid p-6 md:p-8">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#4A3728' }}>
          <MessageCircle className="w-5 h-5" style={{ color: '#95D8F0' }} />
          学习问答
        </h2>
        {conversation.length > 0 && (
          <button
            onClick={handleNewSession}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.7)', color: '#8B7355', border: '1px solid rgba(200,230,192,0.5)' }}
          >
            <RefreshCw className="w-3 h-3" />
            新对话
          </button>
        )}
      </div>

      <p className="text-xs mb-4" style={{ color: '#8B7355' }}>
        💡 遇到不会的题目？输入问题或拍照上传，AI智能体会用苏格拉底式提问引导你自己思考出答案~
      </p>

      {/* 对话区域 */}
      {conversation.length > 0 && (
        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
          {conversation.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[80%] rounded-2xl p-3"
                style={{
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, rgba(149,216,240,0.2), rgba(115,192,240,0.1))'
                    : 'linear-gradient(135deg, rgba(232,245,228,0.8), rgba(200,230,192,0.5))',
                  border: msg.role === 'user'
                    ? '1.5px solid rgba(149,216,240,0.3)'
                    : '1.5px solid rgba(115,192,103,0.2)',
                }}
              >
                {msg.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={msg.image} alt="题目图片" className="w-full max-h-40 object-contain rounded-lg mb-2" />
                )}
                <p className="text-sm leading-relaxed" style={{ color: '#4A3728' }}>
                  {msg.content}
                </p>
              </div>
            </div>
          ))}

          {/* AI思考中 */}
          {qaStage === 'asking' && (
            <div className="flex justify-start">
              <div className="rounded-2xl p-3" style={{ background: 'rgba(232,245,228,0.5)' }}>
                <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" style={{ color: '#5CAF50' }} />
                <span className="text-sm" style={{ color: '#8B7355' }}>AI正在思考...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* 已解决提示 + 巩固题按钮 */}
      {isSolved && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(115,192,103,0.1)', border: '1.5px solid rgba(115,192,103,0.3)' }}>
          <p className="text-sm flex items-center gap-1.5" style={{ color: '#2D5A27' }}>
            <CheckCircle className="w-4 h-4" />
            很好！你已经找到了答案！来试试巩固练习吧~
          </p>
          {suggestedAnswer && (
            <p className="text-xs mt-1 pl-6" style={{ color: '#8B7355' }}>
              参考答案：{suggestedAnswer}
            </p>
          )}
          <button
            onClick={handleGetSimilar}
            disabled={loadingSimilar}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)' }}
          >
            {loadingSimilar ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                生成中...
              </>
            ) : showSimilar ? (
              <>
                <ChevronUp className="w-4 h-4" />
                收起巩固题
              </>
            ) : (
              <>
                <Target className="w-4 h-4" />
                生成巩固题
              </>
            )}
          </button>
        </div>
      )}

      {/* 巩固题列表 */}
      {showSimilar && similarQuestions.length > 0 && (
        <div className="space-y-3 mb-4">
          <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#2D7A8E' }}>
            <Target className="w-4 h-4" />
            巩固练习题
          </p>
          {similarQuestions.map((sq, i) => (
            <SimilarQuestionCard
              key={i}
              question={{ index: i, question: sq.question, answer: sq.answer, knowledge_point: '' }}
              index={i}
            />
          ))}
        </div>
      )}

      {/* 错误提示 */}
      {errorMsg && (
        <p className="text-xs text-red-500 mb-2">{errorMsg}</p>
      )}

      {/* 图片预览 */}
      {imagePreview && (
        <div className="mb-3 relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="预览" className="max-h-32 rounded-lg" />
          <button
            onClick={() => { setImagePreview(''); setImageBase64(''); }}
            className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.9)', color: '#D04040' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 输入区域 */}
      <div className="flex items-center gap-2">
        <input
          ref={qaImageRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageSelect}
          className="hidden"
        />
        <button
          onClick={() => qaImageRef.current?.click()}
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
          style={{ background: 'rgba(149,216,240,0.15)', border: '1.5px solid rgba(149,216,240,0.3)' }}
          title="拍照上传"
        >
          <ImageIcon className="w-5 h-5" style={{ color: '#2D7A8E' }} />
        </button>
        <input
          type="text"
          value={questionText}
          onChange={e => setQuestionText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
          placeholder="输入你的问题..."
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(200,230,192,0.5)', color: '#4A3728' }}
        />
        <button
          onClick={handleAsk}
          disabled={qaStage === 'asking' || (!questionText.trim() && !imageBase64)}
          className="shrink-0 inline-flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)' }}
        >
          {qaStage === 'asking' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          提问
        </button>
      </div>
    </section>
  );
}
