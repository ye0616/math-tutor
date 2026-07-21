'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Lightbulb, CheckCircle2, XCircle, History, Sparkles, Award, ChevronRight } from 'lucide-react';
import { getToken, getStoredUser, getTodayFact, submitFactRead, getFactHistory, type DailyFact } from '@/lib/api';

export default function DailyFactPage() {
  const [todayFact, setTodayFact] = useState<DailyFact | null>(null);
  const [history, setHistory] = useState<DailyFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [result, setResult] = useState<{ is_correct: boolean; points_earned: number; explanation?: string } | null>(null);
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const [showFunFact, setShowFunFact] = useState(false);
  const user = getStoredUser();

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    getTodayFact(token).then(res => {
      setTodayFact(res.data);
      if (res.data?.has_read) {
        setResult({ is_correct: res.data.answered_correctly === 1, points_earned: 0 });
      }
    }).catch(err => console.error('Failed to load fact:', err))
      .finally(() => setLoading(false));
  }, []);

  const loadHistory = () => {
    const token = getToken();
    if (!token) return;
    getFactHistory(token, 1, 20).then(res => {
      setHistory(res.data?.list || []);
    }).catch(err => console.error('Failed to load history:', err));
  };

  const handleSubmit = () => {
    if (!selectedAnswer || !todayFact) return;
    const token = getToken();
    if (!token) return;
    setSubmitting(true);
    submitFactRead(token, todayFact.id, selectedAnswer).then(res => {
      setResult({
        is_correct: res.data.is_correct,
        points_earned: res.data.points_earned,
        explanation: res.data.explanation,
      });
    }).catch(err => console.error('Failed to submit:', err))
      .finally(() => setSubmitting(false));
  };

  const categoryColors: Record<string, string> = {
    '数学趣闻': '#73C067',
    '科学常识': '#5BA7E0',
    '生活数学': '#F0A04B',
    '数学家故事': '#B88AE5',
    '趣味几何': '#E57A9E',
    '数字奥秘': '#4ECDC4',
  };
  const catColor = todayFact ? (categoryColors[todayFact.category] || '#73C067') : '#73C067';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: '#C8E6C0', borderTopColor: '#73C067' }} />
          <p style={{ color: '#8B7355' }}>正在为你准备今日科普...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E8F5E4, #C8E6C0)' }}>
          <BookOpen className="w-6 h-6" style={{ color: '#2D5A27' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#4A3728' }}>每日科普小知识</h1>
          <p className="text-sm" style={{ color: '#8B7355' }}>每天学一点新知识，阅读完成 +0.1 爱心饲料币</p>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('today')}
          className="px-5 py-2 rounded-full text-sm font-bold transition-all"
          style={tab === 'today'
            ? { background: '#73C067', color: 'white', boxShadow: '0 4px 12px rgba(115,192,103,0.3)' }
            : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}
        >
          今日科普
        </button>
        <button
          onClick={() => { setTab('history'); loadHistory(); }}
          className="px-5 py-2 rounded-full text-sm font-bold transition-all"
          style={tab === 'history'
            ? { background: '#73C067', color: 'white', boxShadow: '0 4px 12px rgba(115,192,103,0.3)' }
            : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}
        >
          历史回顾
        </button>
      </div>

      {tab === 'today' && todayFact && (
        <div className="space-y-4">
          {/* Today's fact card */}
          <div
            className="rounded-3xl p-6 shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${catColor}15, ${catColor}05)`,
              border: `2px solid ${catColor}30`,
            }}
          >
            {/* Category badge */}
            <div className="flex items-center justify-between mb-4">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ background: catColor }}
              >
                {todayFact.category}
              </span>
              <span className="text-xs" style={{ color: '#8B7355' }}>{todayFact.fact_date}</span>
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold mb-3" style={{ color: '#4A3728' }}>
              <Sparkles className="inline w-5 h-5 mr-1" style={{ color: catColor }} />
              {todayFact.title}
            </h2>

            {/* Content */}
            <p className="text-base leading-relaxed mb-4" style={{ color: '#5A4632' }}>
              {todayFact.content}
            </p>

            {/* Fun fact toggle */}
            <div
              className="rounded-2xl p-4 cursor-pointer transition-all"
              style={{ background: 'rgba(255, 240, 219, 0.6)', border: '1px dashed rgba(255, 184, 108, 0.4)' }}
              onClick={() => setShowFunFact(!showFunFact)}
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" style={{ color: '#F0A04B' }} />
                <span className="text-sm font-bold" style={{ color: '#8B6535' }}>
                  {showFunFact ? '收起趣味拓展' : '点击查看趣味拓展 →'}
                </span>
              </div>
              {showFunFact && (
                <p className="text-sm mt-2" style={{ color: '#8B6535' }}>{todayFact.fun_fact}</p>
              )}
            </div>
          </div>

          {/* Interactive question */}
          {!todayFact.has_read && !result && (
            <div className="rounded-3xl p-6 shadow-md" style={{ background: 'white', border: '2px solid #E8F5E4' }}>
              <h3 className="text-base font-bold mb-3" style={{ color: '#4A3728' }}>
                <CheckCircle2 className="inline w-5 h-5 mr-1" style={{ color: '#73C067' }} />
                互动小问答
              </h3>
              <p className="text-sm mb-4" style={{ color: '#5A4632' }}>{todayFact.question}</p>
              <div className="grid grid-cols-1 gap-2 mb-4">
                {todayFact.options.map((opt, i) => {
                  const letter = String.fromCharCode(65 + i);
                  const isSelected = selectedAnswer === letter;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedAnswer(letter)}
                      className="text-left px-4 py-3 rounded-xl text-sm transition-all"
                      style={isSelected
                        ? { background: '#73C067', color: 'white', fontWeight: 700, border: '2px solid #2D5A27' }
                        : { background: '#F8F9FA', color: '#5A4632', border: '2px solid transparent' }}
                    >
                      <span className="font-bold mr-2">{letter}.</span> {opt.replace(/^[A-D]:\s*/, '')}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!selectedAnswer || submitting}
                className="w-full py-3 rounded-xl font-bold text-white transition-all disabled:opacity-50"
                style={{ background: selectedAnswer ? 'linear-gradient(135deg, #73C067, #5BA85A)' : '#ccc' }}
              >
                {submitting ? '提交中...' : '提交答案 +0.1分'}
              </button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className="rounded-3xl p-6 shadow-md"
              style={{
                background: result.is_correct ? 'rgba(232, 245, 228, 0.9)' : 'rgba(255, 235, 238, 0.9)',
                border: `2px solid ${result.is_correct ? '#73C067' : '#E57A9E'}`,
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                {result.is_correct ? (
                  <CheckCircle2 className="w-8 h-8" style={{ color: '#2D5A27' }} />
                ) : (
                  <XCircle className="w-8 h-8" style={{ color: '#C0392B' }} />
                )}
                <div>
                  <p className="text-lg font-bold" style={{ color: result.is_correct ? '#2D5A27' : '#C0392B' }}>
                    {result.is_correct ? '回答正确！' : '答错了，没关系！'}
                  </p>
                  {result.points_earned > 0 && (
                    <p className="text-sm" style={{ color: '#F0A04B' }}>
                      <Award className="inline w-4 h-4 mr-1" />+{result.points_earned} 爱心饲料币
                    </p>
                  )}
                </div>
              </div>
              <div className="text-sm space-y-2" style={{ color: '#5A4632' }}>
                <p><span className="font-bold">正确答案：</span>{todayFact.answer}</p>
                {result.explanation && <p><span className="font-bold">解析：</span>{result.explanation}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12" style={{ color: '#8B7355' }}>
              <History className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>暂无历史科普</p>
            </div>
          ) : (
            history.map(fact => {
              const c = categoryColors[fact.category] || '#73C067';
              return (
                <div
                  key={fact.id}
                  className="rounded-2xl p-4 shadow-sm transition-all hover:shadow-md cursor-pointer"
                  style={{ background: 'white', border: `1px solid ${c}20` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: c }}>
                      {fact.category}
                    </span>
                    <div className="flex items-center gap-2">
                      {fact.has_read && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#E8F5E4', color: '#2D5A27' }}>
                          {fact.answered_correctly ? '已答对' : '已阅读'}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: '#8B7355' }}>{fact.fact_date}</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-sm mb-1" style={{ color: '#4A3728' }}>{fact.title}</h3>
                  <p className="text-xs line-clamp-2" style={{ color: '#8B7355' }}>{fact.content}</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
