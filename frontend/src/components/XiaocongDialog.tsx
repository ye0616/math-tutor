'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Send, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import {
  chatWithXiaocong,
  resetXiaocongSession,
  getXiaocongStatus,
  XiaocongStage,
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
  // 当 message 是巩固题时附带
  next_question?: string | null;
  next_answer?: string | null;
  next_knowledge_point?: string | null;
  stage?: XiaocongStage;
}

let _msgId = 0;
const nextId = () => ++_msgId;

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
  const [stage, setStage] = useState<XiaocongStage>('guide');
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initStarted, setInitStarted] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 每次 open 时重置并开场
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setInput('');
    setStage('guide');
    setFinished(false);
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

  async function startConversation() {
    const token = getToken();
    if (!token) {
      setError('未登录');
      return;
    }

    // 先查会话状态，如果已经有对话则恢复历史
    try {
      const status: any = await getXiaocongStatus(token, errorNoteId);
      if (status?.session_round && status.session_round > 0) {
        // 有历史：让用户主动点击继续
        setMessages([
          {
            id: nextId(),
            role: 'system',
            content: `（欢迎回来～你之前和我想过 ${status.session_round} 轮了，要不要继续？）`,
          },
        ]);
        return;
      }
    } catch (e) {
      // ignore
    }

    // 首轮：发空消息触发小聪开场
    await sendMessageInternal('', true);
  }

  async function sendMessageInternal(text: string, isInit = false) {
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

      // 如果不是 init，把学生消息也显示出来
      if (!isInit && text) {
        setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: text }]);
      }

      setStage(resp.stage);

      // 显示小聪的回复
      const xiaocongMsg: ChatMsg = {
        id: nextId(),
        role: 'xiaocong',
        content: resp.reply,
        stage: resp.stage,
      };

      // 如果进入 practice 且有 next_question，把巩固题作为单独一条消息追加
      const newMsgs: ChatMsg[] = [xiaocongMsg];
      if (resp.stage === 'practice' && resp.next_question) {
        newMsgs.push({
          id: nextId(),
          role: 'xiaocong',
          content: `🆕 **巩固题**：${resp.next_question}`,
          next_question: resp.next_question,
          next_answer: resp.next_answer,
          next_knowledge_point: resp.next_knowledge_point,
          stage: 'practice',
        });
      }

      setMessages((prev) => [...prev, ...newMsgs]);

      // 进入 done 阶段，标记完成
      if (resp.stage === 'done') {
        setFinished(true);
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={handleFinish}>
      {/* 右侧抽屉 */}
      <div
        className="w-full max-w-md h-full bg-gradient-to-b from-orange-50 to-amber-50 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div className="bg-gradient-to-r from-orange-400 to-amber-400 text-white px-5 py-4 flex items-center justify-between shadow-md">
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

        {/* 错题上下文（如果有） */}
        {questionText && (
          <div className="bg-white/70 border-b border-orange-200 px-5 py-3 text-sm">
            <div className="text-orange-700 font-semibold mb-1">📝 当前错题</div>
            <div className="text-gray-800">{questionText}</div>
            {studentAnswer && (
              <div className="mt-1 text-xs text-gray-500">你之前答：{studentAnswer}</div>
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
              return (
                <div key={m.id} className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center text-white text-sm flex-shrink-0">
                    🦊
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%] shadow-sm text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              );
            }
            // user
            return (
              <div key={m.id} className="flex items-start gap-2 justify-end">
                <div className="bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] shadow-sm text-sm leading-relaxed whitespace-pre-wrap">
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

          {finished && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center text-sm">
              <CheckCircle2 className="inline w-4 h-4 text-green-500 mr-1" />
              太棒啦！这道错题已经搞定～
              <div className="mt-2">
                <button
                  onClick={handleFinish}
                  className="bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-600"
                >
                  完成，关闭
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 输入区 */}
        {!finished && (
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
                  stage === 'guide'
                    ? '把你的想法告诉小聪…'
                    : stage === 'practice'
                    ? '回答巩固题…'
                    : '继续和小聪聊聊'
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
            <div className="mt-2 text-[10px] text-gray-400 text-center">
              小提示：把你的思路说出来，小聪会一步步引导你～
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
