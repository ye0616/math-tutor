'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X, Send, Sparkles, CheckCircle2, Loader2, Eye, EyeOff, RefreshCw,
  Trophy, MessageSquareQuote, Lightbulb, AlertTriangle,
} from 'lucide-react';
import {
  chatWithXiaocong,
  resetXiaocongSession,
  getXiaocongStatus,
  getXiaocongForError,
  type XiaocongStage,
  type XiaocongChatResult,
} from '@/lib/api';
import { getToken } from '@/lib/api';

export interface XiaocongDialogProps {
  open: boolean;
  errorNoteId: number;
  questionText?: string;
  studentAnswer?: string;
  correctAnswer?: string;
  knowledgePoint?: string;
  onClose: () => void;
  /** 阶段进入 done 时回调，父组件可据此触发康复完成标记 */
  onStageDone?: (payload: { errorNoteId: number; summaryText: string; stage: string }) => void;
}

interface ChatMsg {
  id: number;
  role: 'xiaocong' | 'user' | 'system';
  content: string;
  question_text?: string;
  next_answer?: string | null;
  next_knowledge_point?: string | null;
  stage?: XiaocongStage;
  is_question_card?: boolean;
  recovery_q_index?: number;
}

let _msgId = 0;
const nextId = () => ++_msgId;

const STAGE_LABELS: Record<XiaocongStage, { label: string; color: string; emoji: string }> = {
  step1_thought:      { label: '第 1 步·还原思路',   color: 'bg-blue-500',   emoji: '🤔' },
  step2_review:       { label: '第 2 步·审题核查',   color: 'bg-cyan-500',   emoji: '🔍' },
  step3_formula:      { label: '第 3 步·拆解算式',   color: 'bg-orange-500', emoji: '🛠️' },
  step4_calc:         { label: '第 4 步·计算自查',   color: 'bg-amber-500',  emoji: '🔢' },
  step5_reflect:      { label: '第 5 步·复盘反思',   color: 'bg-purple-500', emoji: '📝' },
  recovery_questions: { label: '巩固练习',            color: 'bg-green-500',  emoji: '🎯' },
  done:               { label: '订正完成',            color: 'bg-emerald-500',emoji: '🏆' },
  b_quick_check:      { label: '粗心错·快速核对',     color: 'bg-pink-500',   emoji: '🔎' },
};

const STEPS_ORDER: XiaocongStage[] = [
  'step1_thought', 'step2_review', 'step3_formula', 'step4_calc', 'step5_reflect', 'recovery_questions', 'done',
];

const TOPIC_LABELS: Record<string, string> = {
  decimal: '小数四则',
  equation: '简易方程',
  fraction: '分数',
  geometry: '几何形体',
  app: '应用题',
  other: '通用',
};

export default function XiaocongDialog({
  open,
  errorNoteId,
  questionText,
  studentAnswer,
  correctAnswer,
  knowledgePoint,
  onClose,
  onStageDone,
}: XiaocongDialogProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<XiaocongStage>('step1_thought');
  const [stageLabel, setStageLabel] = useState<string>(STAGE_LABELS.step1_thought.label);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState<string | null>(null);
  const [userMastered, setUserMastered] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initStarted, setInitStarted] = useState(false);
  // v3 新增
  const [errorType, setErrorType] = useState<'A' | 'B' | null>(null);
  const [topic, setTopic] = useState<string>('other');
  const [recoveryQIndex, setRecoveryQIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 每次 open 时重置
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setInput('');
    setStage('step1_thought');
    setStageLabel(STAGE_LABELS.step1_thought.label);
    setCurrentQuestion(null);
    setCurrentAnswer(null);
    setUserMastered(false);
    setSummaryText(null);
    setShowAnswer(false);
    setRound(0);
    setError(null);
    setInitStarted(false);
    setErrorType(null);
    setTopic('other');
    setRecoveryQIndex(0);
  }, [open, errorNoteId]);

  useEffect(() => {
    if (!open || initStarted) return;
    setInitStarted(true);
    loadOrStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initStarted]);

  // 从 DB 加载已有对话历史（翻阅复用）
  async function loadOrStart() {
    const token = getToken();
    if (!token) {
      setError('未登录');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getXiaocongForError(token, errorNoteId);
      if (result.found && result.session && result.session.history.length > 0) {
        // 复用已有对话：把历史回放到 messages
        const sess = result.session;
        const recoveredMsgs: ChatMsg[] = [];
        for (let i = 0; i < sess.history.length; i++) {
          const h = sess.history[i];
          if (h.role === 'user') {
            recoveredMsgs.push({
              id: nextId(),
              role: 'user',
              content: h.content,
            });
          } else {
            recoveredMsgs.push({
              id: nextId(),
              role: 'xiaocong',
              content: h.content,
              stage: sess.current_node as XiaocongStage,
            });
          }
        }
        setMessages(recoveredMsgs);
        setStage(sess.current_node as XiaocongStage);
        setStageLabel(STAGE_LABELS[sess.current_node as XiaocongStage]?.label || '引导中');
        setRound(sess.round_count || 0);
        setUserMastered(sess.user_mastered === 1);
        setSummaryText(sess.summary_text || null);
        setErrorType((sess.error_type as 'A' | 'B') || null);
        setTopic(sess.topic || 'other');
        setRecoveryQIndex(sess.recovery_q_index || 0);
        // 重新进入历史已 done 的会话 → 也通知父组件
        if ((sess.current_node as string) === 'done') {
          onStageDone?.({
            errorNoteId,
            summaryText: sess.summary_text || '',
            stage: 'done',
          });
        }
        return;
      }
    } catch (e) {
      // 加载失败时退化为全新开始
    } finally {
      setLoading(false);
    }
    // 没有历史 → 开启全新对话
    await startConversation();
  }

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [stage]);

  async function askForHint() {
    if (loading) return;
    const hintMsg = '（我卡住了，能给我一个小提示吗？）';
    await sendMessageInternal(hintMsg);
  }

  async function startConversation() {
    const token = getToken();
    if (!token) {
      setError('未登录');
      return;
    }
    await sendMessageInternal('', true);
  }

  async function sendMessageInternal(text: string, isInit = false) {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const resp: XiaocongChatResult = await chatWithXiaocong(token, errorNoteId, text, {
        question_text: questionText,
        correct_answer: correctAnswer,
        knowledge_point: knowledgePoint,
      });

      const newMsgs: ChatMsg[] = [];
      if (!isInit && text) {
        newMsgs.push({
          id: nextId(),
          role: 'user',
          content: text,
        });
      }

      const xiaocongMsg: ChatMsg = {
        id: nextId(),
        role: 'xiaocong',
        content: resp.reply,
        stage: resp.stage,
      };
      newMsgs.push(xiaocongMsg);

      // 进入 recovery_questions → 把当前题作为卡片提示
      if (resp.stage === 'recovery_questions' && resp.current_question) {
        newMsgs.push({
          id: nextId(),
          role: 'xiaocong',
          content: `🎯 这是巩固题第 ${(resp.recovery_q_index ?? 0) + 1}/3 题，做完后回复答案给我看～`,
          question_text: resp.current_question,
          next_answer: resp.current_answer,
          next_knowledge_point: resp.current_knowledge_point,
          stage: 'recovery_questions',
          is_question_card: true,
          recovery_q_index: resp.recovery_q_index ?? 0,
        });
      }

      // done → 显示总结
      if (resp.stage === 'done' && resp.summary_text) {
        newMsgs.push({
          id: nextId(),
          role: 'xiaocong',
          content: '📌 **今天订正完成啦**\n\n' + resp.summary_text,
          stage: 'done',
        });
      }

      setMessages((prev) => [...prev, ...newMsgs]);

      setStage(resp.stage);
      setStageLabel(resp.current_stage_label || STAGE_LABELS[resp.stage]?.label || '引导中');
      setCurrentQuestion(resp.current_question);
      setCurrentAnswer(resp.current_answer);
      setUserMastered(resp.user_mastered);
      setSummaryText(resp.summary_text);
      setRound(resp.session_round);
      // v3 新增字段
      setErrorType(resp.error_type ?? null);
      setTopic(resp.topic ?? 'other');
      setRecoveryQIndex(resp.recovery_q_index ?? 0);

      // 阶段进入 done → 通知父组件（错题康复联动）
      if (resp.stage === 'done') {
        onStageDone?.({
          errorNoteId,
          summaryText: resp.summary_text || '',
          stage: resp.stage,
        });
      }
    } catch (e: any) {
      setError(e?.message || '小聪正在休息中…请稍后再试');
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'xiaocong', content: '哎呀，我这边网络有点问题…你能再说一遍吗？' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function handleSend() {
    const txt = input.trim();
    if (!txt || loading) return;
    setInput('');
    await sendMessageInternal(txt);
  }

  async function handleFinish() {
    const token = getToken();
    if (token) {
      try {
        await resetXiaocongSession(token, errorNoteId);
      } catch (e) {
        // ignore
      }
    }
    onClose();
  }

  async function handleRetryPractice() {
    if (loading) return;
    await sendMessageInternal('我想再试一次');
  }

  if (!open) return null;

  const stageInfo = STAGE_LABELS[stage] ?? STAGE_LABELS.step1_thought;
  const showQuestionCard = !!currentQuestion && stage === 'recovery_questions';
  const inputDisabled = stage === 'done' || loading;

  // 顶部信息条：错误类型 + 题型
  const showHeaderInfo = errorType || topic !== 'other';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={handleFinish}>
      <div
        className="w-full max-w-md h-full bg-gradient-to-b from-orange-50 to-amber-50 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div className="bg-gradient-to-r from-orange-400 to-amber-400 text-white px-5 py-4 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-2xl">
                🦊
              </div>
              <div>
                <div className="font-bold text-lg flex items-center gap-1">
                  小聪 <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-xs opacity-90">你的数学小伙伴</div>
              </div>
            </div>
            <button
              onClick={handleFinish}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1.5"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 错误类型 + 题型标签 */}
          {showHeaderInfo && (
            <div className="mt-2 flex gap-2 text-xs">
              {errorType && (
                <span className={`px-2 py-0.5 rounded-full ${errorType === 'A' ? 'bg-blue-500/80' : 'bg-pink-500/80'}`}>
                  {errorType === 'A' ? '🧠 思路错·5 步引导' : '🔎 粗心错·快速核对'}
                </span>
              )}
              {topic !== 'other' && (
                <span className="px-2 py-0.5 rounded-full bg-white/20">
                  📚 {TOPIC_LABELS[topic] ?? topic}
                </span>
              )}
            </div>
          )}

          {/* 阶段进度条 */}
          <div className="mt-3 flex items-center justify-between text-xs">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-white ${stageInfo.color}`}>
              <span>{stageInfo.emoji}</span>
              <span>{stageLabel}</span>
            </div>
            <div className="text-white/80">第 {round} 轮</div>
          </div>
          {/* 5 步阶梯 + 巩固题 进度 */}
          <div className="mt-2 flex gap-1">
            {STEPS_ORDER.map((s) => {
              // 类型 B 不显示 5 步阶梯进度
              if (errorType === 'B' && s !== 'done') return null;
              const cur = STEPS_ORDER.indexOf(stage as any);
              const idx = STEPS_ORDER.indexOf(s);
              const reached = cur >= idx;
              return (
                <div
                  key={s}
                  className={`flex-1 h-1 rounded-full ${reached ? 'bg-white' : 'bg-white/30'}`}
                  title={STAGE_LABELS[s]?.label}
                />
              );
            })}
          </div>
        </div>

        {/* 错题上下文（顶部固定卡片） */}
        {questionText && (
          <div className="bg-white/80 border-b border-orange-200 px-5 py-3 text-sm">
            <div className="text-orange-700 font-semibold mb-1 flex items-center gap-1">
              📝 当前错题
              {userMastered && (
                <span className="text-green-600 text-xs flex items-center gap-1 ml-auto">
                  <CheckCircle2 className="w-3 h-3" /> 已订正
                </span>
              )}
            </div>
            <div className="text-gray-800 whitespace-pre-wrap">{questionText}</div>
            {studentAnswer && (
              <div className="mt-1 text-xs text-gray-500">你之前答：{studentAnswer}</div>
            )}
          </div>
        )}

        {/* 巩固题卡片（recovery_questions 时显示） */}
        {showQuestionCard && currentQuestion && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-b-2 border-green-300 px-5 py-3 text-sm shadow-inner">
            <div className="text-green-700 font-semibold mb-1.5 flex items-center gap-1.5">
              <Trophy className="w-4 h-4" />
              巩固题第 {recoveryQIndex + 1}/3 题
            </div>
            <div className="text-gray-800 font-medium whitespace-pre-wrap">{currentQuestion}</div>
            {currentAnswer && (
              <button
                onClick={() => setShowAnswer((v) => !v)}
                className="mt-2 flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800"
              >
                {showAnswer ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showAnswer ? '收起答案' : '看看答案'}
              </button>
            )}
            {showAnswer && currentAnswer && (
              <div className="mt-1 text-xs text-gray-700 bg-white border border-green-200 rounded px-2 py-1.5">
                <span className="text-green-700 font-semibold">正确答案：</span>{currentAnswer}
              </div>
            )}
          </div>
        )}

        {/* 对话流 */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && loading && (
            <div className="text-center text-orange-400 text-sm py-8">小聪正在准备开场…</div>
          )}

          {messages.map((m) => {
            if (m.role === 'system') {
              return (
                <div key={m.id} className="text-center text-xs text-gray-500 italic">
                  {m.content}
                </div>
              );
            }
            if (m.role === 'xiaocong') {
              // 巩固题卡片（在对话流中）
              if (m.is_question_card && m.question_text) {
                return (
                  <div key={m.id} className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center text-white text-sm flex-shrink-0">
                      🦊
                    </div>
                    <div className="bg-green-50 border border-green-300 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] shadow-sm text-gray-800 text-sm">
                      <div className="whitespace-pre-wrap text-green-700 font-semibold mb-1">{m.content}</div>
                      <div className="text-gray-800 mt-1 whitespace-pre-wrap">{m.question_text}</div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center text-white text-sm flex-shrink-0">
                    🦊
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%] shadow-sm text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              );
            }
            // user
            return (
              <div key={m.id} className="flex items-start gap-2 justify-end">
                <div className="bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] shadow-sm text-sm leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs flex-shrink-0">
                  我
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center text-white text-sm flex-shrink-0">
                🦊
              </div>
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                小聪在想…
              </div>
            </div>
          )}

          {/* 完成时显示总结卡 + 关闭按钮 */}
          {stage === 'done' && (
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-xl px-4 py-4 text-center text-sm shadow-sm">
              <div className="text-3xl mb-2">🎉</div>
              <div className="text-emerald-700 font-semibold mb-2">
                太棒啦！这一道你已经学会了～
              </div>
              {summaryText && (
                <div className="bg-white rounded-lg p-3 text-left text-xs text-gray-700 leading-relaxed mb-3 whitespace-pre-wrap">
                  <div className="font-semibold text-emerald-700 mb-1 flex items-center gap-1">
                    <MessageSquareQuote className="w-3 h-3" />订正总结
                  </div>
                  {summaryText}
                </div>
              )}
              <button
                onClick={handleFinish}
                className="bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm hover:bg-emerald-600 flex items-center gap-1.5 mx-auto"
              >
                <CheckCircle2 className="w-4 h-4" /> 学到啦，关闭
              </button>
            </div>
          )}
        </div>

        {/* 输入区 */}
        {!inputDisabled && (
          <div className="border-t border-orange-200 bg-white px-4 py-3">
            {error && (
              <div className="text-xs text-red-500 mb-2">{error}</div>
            )}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  stage === 'recovery_questions'
                    ? `把第 ${recoveryQIndex + 1}/3 题答案告诉小聪…`
                    : stage === 'step5_reflect'
                    ? '用 1-2 句话总结：你觉得这次错在哪？以后要注意？'
                    : stage === 'b_quick_check'
                    ? '重新算一下，把答案告诉小聪…'
                    : '把你的想法告诉小聪…'
                }
                className="flex-1 border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="bg-orange-500 text-white rounded-xl px-4 py-2.5 text-sm hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Send className="w-4 h-4" />
                发送
              </button>
            </div>

            {/* 卡住了按钮 - 在所有引导节点都可用 */}
            {stage !== 'recovery_questions' && (
              <button
                onClick={askForHint}
                disabled={loading}
                className="mt-2 text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1 disabled:text-gray-400"
              >
                <Lightbulb className="w-3 h-3" /> 我卡住了，给我个小提示
              </button>
            )}

            {/* 巩固题卡住了重来按钮 */}
            {stage === 'recovery_questions' && (
              <button
                onClick={handleRetryPractice}
                disabled={loading}
                className="mt-2 w-full bg-red-50 text-red-600 hover:bg-red-100 rounded-lg py-1.5 text-xs flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> 让小聪再用最简单的方法讲一遍
              </button>
            )}

            <div className="mt-2 text-[10px] text-gray-400 text-center">
              小提示：把你的思路说出来，小聪会一步步引导你～
            </div>
          </div>
        )}
      </div>
    </div>
  );
}