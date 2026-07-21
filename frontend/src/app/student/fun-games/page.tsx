'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Gamepad2, Trophy, Award, CheckCircle2, XCircle, RotateCcw,
  ChevronRight, Target, Map, Sparkles, Lightbulb, Home,
} from 'lucide-react';
import {
  getToken, getStoredUser,
  getTessellationQuestions, saveGameRecord, getGameLeaderboard, getMyGameRecords,
  type TessellationQuestion, type LeaderboardEntry,
} from '@/lib/api';

type PagePhase = 'menu' | 'playing' | 'finished';

export default function FunGamesPage() {
  const [phase, setPhase] = useState<PagePhase>('menu');
  const user = getStoredUser();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)' }}>
          <Gamepad2 className="w-6 h-6" style={{ color: '#1565C0' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#4A3728' }}>数学趣味闯关</h1>
          <p className="text-sm" style={{ color: '#8B7355' }}>玩游戏学数学，每完成一局 +0.1 爱心饲料币（每日最多 +1）</p>
        </div>
      </div>

      {phase === 'menu' && <GameMenu onStart={() => setPhase('playing')} />}
      {phase === 'playing' && <TessellationGame onBack={() => setPhase('menu')} studentId={user?.id} />}
    </div>
  );
}

// ===== 游戏选择菜单 =====
function GameMenu({ onStart }: { onStart: () => void }) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRecords, setMyRecords] = useState<any[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    getGameLeaderboard(token, 'tessellation').then(res => setLeaderboard(res.data || [])).catch(() => {});
    getMyGameRecords(token, 'tessellation').then(res => setMyRecords(res.data || [])).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Featured game cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 趣味数学密铺 */}
        <button
          onClick={onStart}
          className="rounded-3xl p-6 text-left transition-all hover:scale-[1.02] hover:shadow-xl cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #E8F5E4, #C8E6C0)', border: '2px solid rgba(115,192,103,0.3)' }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#73C067', color: 'white' }}>
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold mb-1" style={{ color: '#4A3728' }}>趣味数学密铺</h3>
          <p className="text-sm" style={{ color: '#8B7355' }}>探索图形密铺的奥秘，挑战内角和与图形运动</p>
          <div className="flex items-center gap-1 mt-3 text-sm font-bold" style={{ color: '#73C067' }}>
            开始挑战 <ChevronRight className="w-4 h-4" />
          </div>
        </button>

        {/* 场馆闯关入口 */}
        <Link
          href="/student/practice"
          className="rounded-3xl p-6 text-left transition-all hover:scale-[1.02] hover:shadow-xl block"
          style={{ background: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)', border: '2px solid rgba(240,160,75,0.3)' }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#F0A04B', color: 'white' }}>
            <Map className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold mb-1" style={{ color: '#4A3728' }}>场馆闯关</h3>
          <p className="text-sm" style={{ color: '#8B7355' }}>进入动物场馆，帮助小动物解决数学难题</p>
          <div className="flex items-center gap-1 mt-3 text-sm font-bold" style={{ color: '#F0A04B' }}>
            前往场馆 <ChevronRight className="w-4 h-4" />
          </div>
        </Link>
      </div>

      {/* My recent records */}
      {myRecords.length > 0 && (
        <div className="rounded-3xl p-5 shadow-md" style={{ background: 'white', border: '2px solid #E8F5E4' }}>
          <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: '#4A3728' }}>
            <Award className="w-5 h-5" style={{ color: '#F0A04B' }} /> 我的密铺挑战记录
          </h3>
          <div className="space-y-2">
            {myRecords.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-2 px-3 rounded-xl" style={{ background: '#F8F9FA' }}>
                <span style={{ color: '#5A4632' }}>趣味数学密铺</span>
                <div className="flex items-center gap-4">
                  <span style={{ color: '#8B7355' }}>{r.correct_count}/{r.total_count}题</span>
                  <span style={{ color: '#F0A04B', fontWeight: 700 }}>+{r.points_earned}分</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="rounded-3xl p-5 shadow-md" style={{ background: 'white', border: '2px solid #FFF3E0' }}>
          <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: '#4A3728' }}>
            <Trophy className="w-5 h-5" style={{ color: '#FFD700' }} /> 密铺挑战排行榜
          </h3>
          <div className="space-y-1">
            {leaderboard.slice(0, 10).map((e, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-xl" style={{ background: e.is_me ? 'rgba(232, 245, 228, 0.6)' : 'transparent' }}>
                <span className="font-bold text-lg w-8 text-center" style={{ color: i < 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][i] : '#8B7355' }}>{i + 1}</span>
                <span className="flex-1 text-sm font-medium" style={{ color: e.is_me ? '#2D5A27' : '#5A4632' }}>
                  {e.name} {e.is_me && '(我)'}
                </span>
                <span className="text-sm" style={{ color: '#8B7355' }}>
                  {e.score}分 · {e.correct_count}/{e.total_count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 趣味数学密铺游戏 =====
function TessellationGame({ onBack, studentId }: { onBack: () => void; studentId?: number }) {
  const [questions, setQuestions] = useState<TessellationQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [wrongQuestions, setWrongQuestions] = useState<{ question: string; student_answer: string; correct_answer: string; knowledge_point: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    getTessellationQuestions(token, 10).then(res => {
      setQuestions(res.data?.questions || []);
    }).catch(err => console.error('Failed to load tessellation questions:', err))
      .finally(() => setLoading(false));
  }, []);

  const current = questions[currentIdx];

  const submitAnswer = () => {
    if (!current || (!answer && current.question_type !== 'choice')) return;
    const normalizedAnswer = answer.trim();
    const normalizedCorrect = current.answer.trim();
    const isCorrect = normalizedAnswer === normalizedCorrect;

    setFeedback(isCorrect ? 'correct' : 'wrong');
    setShowAnalysis(true);
    if (isCorrect) {
      setCorrectCount(c => c + 1);
    } else {
      setWrongQuestions(wq => [
        ...wq,
        {
          question: current.question,
          student_answer: normalizedAnswer,
          correct_answer: normalizedCorrect,
          knowledge_point: current.knowledge_point,
        },
      ]);
    }
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(i => i + 1);
      setAnswer('');
      setFeedback(null);
      setShowAnalysis(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      finishGame();
    }
  };

  const finishGame = useCallback(() => {
    setFinished(true);
    const token = getToken();
    if (token) {
      saveGameRecord(token, {
        game_type: 'tessellation',
        score: correctCount * 10,
        correct_count: correctCount,
        total_count: questions.length,
        time_used: 0,
        detail: {},
        wrong_questions: wrongQuestions,
      }).then(res => {
        if (res.data) setPointsEarned(res.data.points_earned);
      }).catch(() => {});
    }
  }, [correctCount, questions.length, wrongQuestions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (feedback) handleNext();
      else submitAnswer();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 rounded-full mx-auto mb-3" style={{ borderColor: '#C8E6C0', borderTopColor: '#73C067' }} />
          <p style={{ color: '#8B7355' }}>正在生成密铺题目...</p>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <ResultScreen
        title="趣味数学密铺挑战完成！"
        correct={correctCount}
        total={questions.length}
        score={correctCount * 10}
        pointsEarned={pointsEarned}
        onBack={onBack}
        onRetry={() => { setCurrentIdx(0); setAnswer(''); setFeedback(null); setShowAnalysis(false); setCorrectCount(0); setFinished(false); setWrongQuestions([]); setPointsEarned(0); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm flex items-center gap-1" style={{ color: '#8B7355' }}>
        ← 返回闯关菜单
      </button>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {questions.map((_, i) => (
          <div key={i} className="flex-1 h-2 rounded-full" style={{ background: i < currentIdx ? '#73C067' : i === currentIdx ? '#73C067' : '#E0E0E0' }} />
        ))}
      </div>
      <p className="text-sm text-center" style={{ color: '#8B7355' }}>第 {currentIdx + 1} / {questions.length} 题 · 已答对 {correctCount} 题</p>

      {/* Question card */}
      <div
        className="rounded-3xl p-6 md:p-8 transition-all"
        style={{
          background: feedback === 'correct' ? 'rgba(232, 245, 228, 0.9)' : feedback === 'wrong' ? 'rgba(255, 235, 238, 0.9)' : 'white',
          border: `3px solid ${feedback === 'correct' ? '#73C067' : feedback === 'wrong' ? '#E57A9E' : '#73C067'}`,
        }}
      >
        {feedback === 'correct' ? (
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4" style={{ color: '#2D5A27' }} />
        ) : feedback === 'wrong' ? (
          <XCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#C0392B' }} />
        ) : (
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5" style={{ color: '#73C067' }} />
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(115,192,103,0.15)', color: '#2D5A27' }}>{current?.knowledge_point}</span>
          </div>
        )}
        <p className="text-xl md:text-2xl font-bold text-center" style={{ color: '#4A3728' }}>{current?.question}</p>

        {/* Options for choice questions */}
        {current?.question_type === 'choice' && !feedback && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
            {current.options?.map((opt, i) => (
              <button
                key={i}
                onClick={() => setAnswer(opt)}
                className="py-3 px-4 rounded-xl text-left font-medium transition-all hover:scale-[1.02]"
                style={{
                  background: answer === opt ? 'rgba(115,192,103,0.2)' : '#F8F9FA',
                  border: `2px solid ${answer === opt ? '#73C067' : '#E0E0E0'}`,
                  color: answer === opt ? '#2D5A27' : '#4A3728',
                }}
              >
                {String.fromCharCode(65 + i)}. {opt}
              </button>
            ))}
          </div>
        )}

        {/* Fill input */}
        {current?.question_type === 'fill' && !feedback && (
          <div className="mt-6">
            <input
              ref={inputRef}
              type="text"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入答案..."
              autoFocus
              className="w-full px-4 py-4 rounded-xl text-center text-2xl font-bold font-mono"
              style={{ border: '3px solid #73C067', background: 'white', color: '#4A3728' }}
            />
          </div>
        )}

        {/* Analysis */}
        {showAnalysis && (
          <div className="mt-5 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(115,192,103,0.3)' }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#F0A04B' }} />
              <div>
                <p className="font-bold text-sm mb-1" style={{ color: '#4A3728' }}>解析</p>
                <p className="text-sm" style={{ color: '#5A4632' }}>{current?.analysis}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!feedback ? (
        <button
          onClick={submitAnswer}
          disabled={!answer}
          className="w-full py-4 rounded-xl font-bold text-white text-lg disabled:opacity-50"
          style={{ background: answer ? '#73C067' : '#ccc' }}
        >
          提交答案
        </button>
      ) : (
        <button
          onClick={handleNext}
          className="w-full py-4 rounded-xl font-bold text-white text-lg"
          style={{ background: '#73C067' }}
        >
          {currentIdx < questions.length - 1 ? '下一题 →' : '完成挑战'}
        </button>
      )}
    </div>
  );
}

// ===== 通用结果界面 =====
function ResultScreen({ title, correct, total, score, pointsEarned, onBack, onRetry }: {
  title: string;
  correct: number;
  total: number;
  score: number;
  pointsEarned?: number;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-8 text-center" style={{ background: 'linear-gradient(135deg, #E8F5E4, #C8E6C0)', border: '2px solid #73C067' }}>
        <Award className="w-16 h-16 mx-auto mb-4" style={{ color: '#FFD700' }} />
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#2D5A27' }}>{title}</h2>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <p className="text-3xl font-bold" style={{ color: '#2D5A27' }}>{correct}/{total}</p>
            <p className="text-xs" style={{ color: '#8B7355' }}>答对/总题</p>
          </div>
          <div>
            <p className="text-3xl font-bold" style={{ color: '#F0A04B' }}>{score}</p>
            <p className="text-xs" style={{ color: '#8B7355' }}>得分</p>
          </div>
          <div>
            <p className="text-3xl font-bold" style={{ color: '#5BA7E0' }}>{pointsEarned ?? 0}</p>
            <p className="text-xs" style={{ color: '#8B7355' }}>获得积分</p>
          </div>
        </div>
        <p className="text-sm" style={{ color: '#8B7355' }}>
          <Award className="inline w-4 h-4 mr-1" />完成闯关 +0.1 爱心饲料币（每日最多 +1）
        </p>
      </div>
      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-1" style={{ background: '#F8F9FA', color: '#8B7355' }}>
          <Home className="w-4 h-4" /> 返回菜单
        </button>
        <button onClick={onRetry} className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-1" style={{ background: '#73C067' }}>
          <RotateCcw className="w-4 h-4" /> 再玩一次
        </button>
      </div>
    </div>
  );
}
