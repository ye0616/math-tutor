'use client';

import { useState, useEffect, useRef } from 'react';
import {
  BookOpen, Loader2, Trash2, Calendar, MessageCircle,
  ChevronRight, AlertCircle, CheckCircle2, Sparkles, ArrowLeft,
  Trophy, Clock, Brain, RefreshCw,
} from 'lucide-react';
import { getToken } from '@/lib/api';
import {
  listXiaocongSessions,
  getXiaocongSession,
  deleteXiaocongSession,
  type XiaocongSessionSummary,
  type XiaocongSessionDetail,
} from '@/lib/api';

const STAGE_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  step1_thought:       { label: '第 1 步·还原思路',   color: 'bg-blue-500',   emoji: '🤔' },
  step2_review:        { label: '第 2 步·审题核查',   color: 'bg-cyan-500',   emoji: '🔍' },
  step3_formula:       { label: '第 3 步·拆解算式',   color: 'bg-orange-500', emoji: '🛠️' },
  step4_calc:          { label: '第 4 步·计算自查',   color: 'bg-amber-500',  emoji: '🔢' },
  step5_reflect:       { label: '第 5 步·复盘反思',   color: 'bg-purple-500', emoji: '📝' },
  recovery_questions:  { label: '巩固练习',           color: 'bg-green-500',  emoji: '🎯' },
  done:                { label: '订正完成',           color: 'bg-emerald-500',emoji: '🏆' },
  b_quick_check:       { label: '粗心错·快速核对',     color: 'bg-pink-500',   emoji: '🔎' },
};

const TOPIC_LABELS: Record<string, string> = {
  decimal: '小数四则',
  equation: '简易方程',
  fraction: '分数',
  geometry: '几何形体',
  app: '应用题',
  other: '通用',
};

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  active:    { label: '进行中',  color: 'bg-blue-100 text-blue-700' },
  completed: { label: '已完成',  color: 'bg-emerald-100 text-emerald-700' },
  reset:     { label: '已重置',  color: 'bg-gray-100 text-gray-600' },
};

export default function XiaocongHistoryPage() {
  const [sessions, setSessions] = useState<XiaocongSessionSummary[]>([]);
  const [active, setActive] = useState<XiaocongSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const token = getToken();
    if (!token) {
      setError('请先登录');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listXiaocongSessions(token, 200);
      setSessions(result.sessions || []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [active?.history.length]);

  const openSession = async (sessionId: number) => {
    const token = getToken();
    if (!token) return;
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await getXiaocongSession(token, sessionId);
      setActive(detail);
    } catch (e: any) {
      setError(e?.message || '加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (sessionId: number) => {
    const token = getToken();
    if (!token) return;
    if (!confirm('确定删除这条小聪对话记录吗？删除后无法恢复。')) return;
    try {
      await deleteXiaocongSession(token, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (active?.id === sessionId) setActive(null);
    } catch (e: any) {
      setError(e?.message || '删除失败');
    }
  };

  const handleBack = () => setActive(null);

  const stats = {
    total: sessions.length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    active: sessions.filter((s) => s.status === 'active').length,
    mastered: sessions.filter((s) => s.user_mastered === 1).length,
  };

  return (
    <div className="space-y-5">
      {/* 顶部说明 + 统计 */}
      {!active && (
        <div className="rounded-2xl p-5 shadow-sm border border-orange-100"
             style={{ background: 'linear-gradient(135deg, #FFF8E7 0%, #FFEBC7 100%)' }}>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center text-2xl flex-shrink-0">
              🦊
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold text-orange-800 mb-1">小聪对话记录</div>
              <div className="text-sm text-orange-700">
                这里保存你和小聪的所有引导对话。点击任意一条可以完整翻阅。
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-xl font-bold text-orange-700">{stats.total}</div>
              <div className="text-xs text-orange-600">总记录</div>
            </div>
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-xl font-bold text-blue-600">{stats.active}</div>
              <div className="text-xs text-orange-600">进行中</div>
            </div>
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-xl font-bold text-emerald-600">{stats.completed}</div>
              <div className="text-xs text-orange-600">已完成</div>
            </div>
            <div className="bg-white/70 rounded-xl p-2.5">
              <div className="text-xl font-bold text-purple-600">{stats.mastered}</div>
              <div className="text-xs text-orange-600">已订正</div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 详情视图 */}
      {active && (
        <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-400 to-amber-400 text-white px-5 py-3 flex items-center gap-2">
            <button
              onClick={handleBack}
              className="text-white/90 hover:text-white hover:bg-white/10 rounded-lg p-1.5 flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              返回列表
            </button>
            <div className="flex-1 text-center font-bold">对话详情</div>
            <button
              onClick={() => handleDelete(active.id)}
              className="text-white/90 hover:text-white hover:bg-white/10 rounded-lg p-1.5"
              title="删除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* 错题上下文 */}
          <div className="bg-amber-50 border-b border-orange-200 px-5 py-3 text-sm">
            <div className="text-orange-700 font-semibold mb-1 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              错题原题
              {active.user_mastered === 1 && (
                <span className="ml-auto text-green-600 text-xs flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 已订正
                </span>
              )}
            </div>
            <div className="text-gray-800 whitespace-pre-wrap">{active.question_text || '（题目图片）'}</div>
            <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-3">
              {active.student_answer && <span>原错误答案：{active.student_answer}</span>}
              {active.correct_answer && <span>正确答案：{active.correct_answer}</span>}
              {active.knowledge_point && <span>知识点：{active.knowledge_point}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className={`px-2 py-0.5 rounded-full text-white ${STAGE_LABELS[active.current_node]?.color || 'bg-gray-400'}`}>
                {STAGE_LABELS[active.current_node]?.emoji} {STAGE_LABELS[active.current_node]?.label || active.current_node}
              </span>
              {active.error_type && (
                <span className={`px-2 py-0.5 rounded-full text-white ${active.error_type === 'A' ? 'bg-blue-500/90' : 'bg-pink-500/90'}`}>
                  {active.error_type === 'A' ? '🧠 思路错' : '🔎 粗心错'}
                </span>
              )}
              {active.topic && active.topic !== 'other' && (
                <span className="px-2 py-0.5 rounded-full bg-white/80 text-orange-700 border border-orange-200">
                  📚 {TOPIC_LABELS[active.topic] || active.topic}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full ${STATUS_STYLE[active.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                {STATUS_STYLE[active.status]?.label || active.status}
              </span>
              {active.message_count > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  💬 {active.message_count} 条对话
                </span>
              )}
            </div>
          </div>

          {/* 对话流 */}
          <div ref={scrollerRef} className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto bg-gradient-to-b from-orange-50/40 to-amber-50/40">
            {detailLoading && (
              <div className="text-center text-orange-400 text-sm py-8 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
              </div>
            )}
            {active.history.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8">这条记录还没有对话内容</div>
            )}
            {active.history.map((h, i) => {
              if (h.role === 'user') {
                return (
                  <div key={i} className="flex items-start gap-2 justify-end">
                    <div className="bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] shadow-sm text-sm leading-relaxed whitespace-pre-wrap">
                      {h.content}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs flex-shrink-0">
                      我
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center text-white text-sm flex-shrink-0">
                    🦊
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%] shadow-sm text-gray-800 text-sm leading-relaxed whitespace-pre-wrap border border-orange-100">
                    {h.content}
                  </div>
                </div>
              );
            })}

            {/* 完成总结 */}
            {active.summary_text && (
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-xl px-4 py-3 text-sm">
                <div className="text-emerald-700 font-bold mb-1 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4" /> 订正总结
                </div>
                <div className="text-gray-800 whitespace-pre-wrap">{active.summary_text}</div>
              </div>
            )}
          </div>

          <div className="border-t border-orange-100 px-5 py-2 text-xs text-gray-500 bg-white flex justify-between">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              开始：{(active.started_at || '').replace('T', ' ').slice(0, 16)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              最后活跃：{(active.last_active_at || '').replace('T', ' ').slice(0, 16)}
            </span>
            {active.completed_at && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3 h-3" />
                完成于：{(active.completed_at || '').replace('T', ' ').slice(0, 16)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 列表视图 */}
      {!active && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-orange-400 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> 正在加载小聪记录…
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-orange-200 p-12 text-center">
              <div className="text-5xl mb-3">📭</div>
              <div className="text-gray-700 font-semibold mb-1">还没有小聪对话记录</div>
              <div className="text-sm text-gray-500">
                去「错题救助站」点击「让小聪对话引导」，开启你的第一次 AI 引导订正～
              </div>
            </div>
          ) : (
            sessions.map((s) => {
              const stage = STAGE_LABELS[s.current_node] || { label: s.current_node, color: 'bg-gray-400', emoji: '📌' };
              const status = STATUS_STYLE[s.status] || { label: s.status, color: 'bg-gray-100 text-gray-600' };
              return (
                <div
                  key={s.id}
                  className="bg-white rounded-2xl border border-orange-100 shadow-sm hover:shadow-md hover:border-orange-300 transition-all overflow-hidden"
                >
                  <div className="px-4 py-3 flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-base flex-shrink-0 ${stage.color}`}>
                      {stage.emoji}
                    </div>
                    <button
                      onClick={() => openSession(s.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm text-gray-800 line-clamp-2 leading-snug">
                        {s.question_preview || '（题目图片）'}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded-full text-white ${stage.color}`}>
                          {stage.label}
                        </span>
                        {s.error_type && (
                          <span className={`px-1.5 py-0.5 rounded-full ${s.error_type === 'A' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                            {s.error_type === 'A' ? '🧠 思路' : '🔎 粗心'}
                          </span>
                        )}
                        {s.topic && s.topic !== 'other' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            📚 {TOPIC_LABELS[s.topic] || s.topic}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded-full ${status.color}`}>
                          {status.label}
                        </span>
                        {s.user_mastered === 1 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            ✓ 已订正
                          </span>
                        )}
                        {s.message_count > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700">
                            💬 {s.message_count}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-[11px] text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {(s.last_active_at || '').replace('T', ' ').slice(0, 16)}
                      </div>
                    </button>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openSession(s.id)}
                        className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded-lg p-1.5"
                        title="查看"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id);
                        }}
                        className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-1.5"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {!loading && sessions.length > 0 && (
            <div className="text-center pt-2">
              <button
                onClick={load}
                className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1 mx-auto"
              >
                <RefreshCw className="w-3 h-3" /> 刷新列表
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}