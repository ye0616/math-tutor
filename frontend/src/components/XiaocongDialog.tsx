'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Send, Sparkles, CheckCircle2, Loader2, Eye, EyeOff, RefreshCw, Trophy, MessageSquareQuote } from 'lucide-react';
import {
  chatWithXiaocong,
  resetXiaocongSession,
  getXiaocongStatus,
  type XiaocongStage,
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
}

interface ChatMsg {
  id: number;
  role: 'xiaocong' | 'user' | 'system';
  content: string;
  // 当是巩固题（或顶部展示）时附带
  question_text?: string;
  next_answer?: string | null;
  next_knowledge_point?: string | null;
  stage?: XiaocongStage;
  is_question_card?: boolean;
}

let _msgId = 0;
const nextId = () => ++_msgId;

const STAGE_LABELS: Record<XiaocongStage, { label: string; color: string; emoji: string }> = {
  understand:        { label: '理解题意',     color: 'bg-blue-500',   emoji: '🤔' },
  method_simple:     { label: '找最简方法',   color: 'bg-orange-500', emoji: '💡' },
  method_apply:      { label: '用方法做下去', color: 'bg-orange-500', emoji: '🛠️' },
  method_alt:        { label: '换一种方法',   color: 'bg-pink-500',   emoji: '🔄' },
  summary:           { label: '总结思路',     color: 'bg-purple-500', emoji: '📝' },
  practice:          { label: '做巩固题',     color: 'bg-green-500',  emoji: '🎯' },
  practice_recover:  { label: '再来一次',     color: 'bg-red-500',    emoji: '💪' },
  done:              { label: '完成啦',       color: 'bg-emerald-500',emoji: '🏆' },
};

export default function XiaocongDialog({
  open,
  errorNoteId,
  questionText,
  studentAnswer,
  correctAnswer,
  knowledgePoint,
  onClose,
}: XiaocongDialogProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<XiaocongStage>('understand');
  const [stageLabel, setStageLabel] = useState<string>(STAGE_LABELS.understand.label);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState<string | null>(null);
  const [userMastered, setUserMastered] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initStarted, setInitStarted] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 每次 open 时重置
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setInput('');
    setStage('understand');
    setStageLabel(STAGE_LABELS.understand.label);
    setCurrentQuestion(null);
    setCurrentAnswer(null);
    setUserMastered(false);
    setSummaryText(null);
    setShowAnswer(false);
    setRound(0);
    setError(null);
    setInitStarted(false);
  }, [open, errorNoteId]);

  useEffect(() => {
    if (!open || initStarted) return;
    setInitStarted(true);
    startConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initStarted]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [stage]);

  // 「卡住了，给我个提示」按钮：把 hint_for_student 作为学生的发言回传
  async function askForHint() {
    if (loading) return;
    const hintMsg = '（我卡住了，能给我一个小提示吗？）';
    // 把这个作为学生消息追加，然后调一次 chat
    await sendMessageInternal(hintMsg, false, /*isHint*/ true);
  }

  async function startConversation() {
    const token = getToken();
    if (!token) {
      setError('未登录');
      return;
    }

    try {
      const status: any = await getXiaocongStatus(token, errorNoteId);
      if (status?.session_round && status.session_round > 0) {
        setMessages([
          {
            id: nextId(),
            role: 'system',
            content: `（欢迎回来～上次我们聊了 ${status.session_round} 轮，要不要继续？）`,
          },
        ]);
        return;
      }
    } catch (e) {
      // ignore
    }

    await sendMessageInternal('', true);
  }

  async function sendMessageInternal(text: string, isInit = false, isHint = false) {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await chatWithXiaocong(token, errorNoteId, text, {
        question_text: questionText,
        correct_answer: correctAnswer,
        knowledge_point: knowledgePoint,
      });

      // 把学生消息（含 hint 标记）显示
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

      // 进入 practice → 把巩固题作为单独卡片置顶
      if (resp.stage === 'practice' && resp.next_question) {
        newMsgs.push({
          id: nextId(),
          role: 'xiaocong',
          content: '🎯 这是给你的巩固题，做完后回复答案给我看～',
          question_text: resp.next_question,
          next_answer: resp.next_answer,
          next_knowledge_point: resp.next_knowledge_point,
          stage: 'practice',
          is_question_card: true,
        });
      }

      // 进入 done → 显示总结
      if (resp.stage === 'done' && resp.summary_text) {
        newMsgs.push({
          id: nextId(),
          role: 'xiaocong',
          content: '📌 **今天的方法总结**\n\n' + resp.summary_text,
          stage: 'done',
        });
      }

      setMessages((prev) => [...prev, ...newMsgs]);

      // 更新 stage 与上下文
      setStage(resp.stage);
      setStageLabel(resp.current_stage_label || STAGE_LABELS[resp.stage]?.label || '思考中');
      setCurrentQuestion(resp.current_question);
      setCurrentAnswer(resp.current_answer);
      setUserMastered(resp.user_mastered);
      setSummaryText(resp.summary_text);
      setRound(resp.session_round);
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

  // 主动「再来一次」：发一个"我想再试试"消息推动 practice_recover / practice
  async function handleRetryPractice() {
    if (loading) return;
    await sendMessageInternal('我想再试一次', false);
  }

  if (!open) return null;

  const stageInfo = STAGE_LABELS[stage] ?? STAGE_LABELS.understand;
  const showQuestionCard = !!currentQuestion && (stage === 'practice' || stage === 'practice_recover');
  // 输入框允许：除了 done 外都能输入；stage=practice_recover 时引导也允许
  const inputDisabled = stage === 'done' || loading;

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

          {/* 阶段进度条 */}
          <div className="mt-3 flex items-center justify-between text-xs">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-white ${stageInfo.color}`}>
              <span>{stageInfo.emoji}</span>
              <span>{stageLabel}</span>
            </div>
            <div className="text-white/80">第 {round} 轮</div>
          </div>
          {/* 阶段步骤指示 */}
          <div className="mt-2 flex gap-1">
            {(['understand', 'method_simple', 'method_apply', 'summary', 'practice'] as XiaocongStage[]).map((s, i) => {
              const order = ['understand', 'method_simple', 'method_apply', 'summary', 'practice'];
              const cur = order.indexOf(stage as any);
              const idx = order.indexOf(s);
              const reached = cur >= idx && stage !== 'method_alt' && stage !== 'practice_recover';
              return (
                <div
                  key={s}
                  className={`flex-1 h-1 rounded-full ${reached ? 'bg-white' : 'bg-white/30'}`}
                  title={STAGE_LABELS[s].label}
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
                  <CheckCircle2 className="w-3 h-3" /> 已掌握
                </span>
              )}
            </div>
            <div className="text-gray-800 whitespace-pre-wrap">{questionText}</div>
            {studentAnswer && (
              <div className="mt-1 text-xs text-gray-500">你之前答：{studentAnswer}</div>
            )}
          </div>
        )}

        {/* 巩固题卡片（如果当前在 practice / practice_recover） */}
        {showQuestionCard && currentQuestion && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-b-2 border-green-300 px-5 py-3 text-sm shadow-inner">
            <div className="text-green-700 font-semibold mb-1.5 flex items-center gap-1.5">
              <Trophy className="w-4 h-4" />
              巩固题
              {stage === 'practice_recover' && (
                <span className="text-xs text-red-500 ml-2">（再来一次，加油！）</span>
              )}
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
                    <MessageSquareQuote className="w-3 h-3" />方法总结
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
                  stage === 'practice'
                    ? '把巩固题的答案告诉小聪…'
                    : stage === 'practice_recover'
                    ? '再试一次，把答案告诉小聪～'
                    : stage === 'summary'
                    ? '用 1 句话总结：这道题先做什么、再做什么…'
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

            {/* 卡住了按钮 */}
            {(stage === 'method_simple' || stage === 'method_apply' || stage === 'method_alt' || stage === 'understand') && (
              <button
                onClick={askForHint}
                disabled={loading}
                className="mt-2 text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1 disabled:text-gray-400"
              >
                💡 我卡住了，给我个小提示
              </button>
            )}

            {/* 巩固题卡住了重来按钮 */}
            {stage === 'practice_recover' && (
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
