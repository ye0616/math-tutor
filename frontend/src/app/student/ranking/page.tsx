'use client';

import { useState, useEffect } from 'react';
import { Trophy, Medal, Crown, TrendingUp, TrendingDown, Minus, Sparkles, Award } from 'lucide-react';
import { getToken, getStoredUser, fetchRanking, fetchPoints } from '@/lib/api';

interface RankStudent {
  id: number;
  name: string;
  points: number;
  rank: number;
  level: string;
}

interface PointRecord {
  id: number;
  student_id: number;
  points: number;
  reason: string;
  created_at: string;
}

export default function RankingPage() {
  const [ranking, setRanking] = useState<RankStudent[]>([]);
  const [myPoints, setMyPoints] = useState<PointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ranking' | 'records'>('ranking');
  const user = getStoredUser();

  useEffect(() => {
    const token = getToken();
    if (!token || !user?.class_id) return;
    setLoading(true);
    Promise.all([
      fetchRanking(user.class_id),
      fetchPoints(user.id),
    ]).then(([rankData, pointsData]) => {
      setRanking(rankData.ranking || []);
      setMyPoints((pointsData.points || []).slice(0, 30));
    }).catch(err => {
      console.error('Failed to load ranking:', err);
    }).finally(() => setLoading(false));
  }, []);

  const myRank = ranking.find(r => r.id === user?.id);
  const top3 = ranking.slice(0, 3);
  const restRanking = ranking.slice(3);

  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const medalIcons = [<Crown key="1" />, <Medal key="2" />, <Medal key="3" />];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 标题 */}
      <div className="text-center pt-2">
        <div className="inline-flex items-center gap-2 mb-2">
          <Trophy className="w-8 h-8" style={{ color: '#FFB86C' }} />
          <h1 className="text-2xl md:text-3xl font-black" style={{ color: '#2D5A27' }}>班级排行榜</h1>
        </div>
        <p className="text-sm" style={{ color: '#8B7355' }}>每周更新排名，努力学习赢取饲料币吧~</p>
      </div>

      {/* 我的名次卡片 */}
      {myRank && (
        <section className="glass-card-solid p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black"
              style={{
                background: myRank.rank <= 3
                  ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,184,108,0.15))'
                  : 'linear-gradient(135deg, rgba(115,192,103,0.2), rgba(92,175,80,0.15))',
                color: myRank.rank <= 3 ? '#B8860B' : '#2D5A27',
              }}
            >
              第{myRank.rank}名
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: '#2D5A27' }}>{myRank.name}</div>
              <div className="text-sm" style={{ color: '#8B7355' }}>
                <span className="font-bold text-lg" style={{ color: '#FFB86C' }}>{myRank.points}</span> 爱心饲料币
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: myRank.level === '优等生' ? 'rgba(255,215,0,0.15)' : myRank.level === '中等生' ? 'rgba(115,192,103,0.15)' : 'rgba(255,138,138,0.15)',
                       color: myRank.level === '优等生' ? '#B8860B' : myRank.level === '中等生' ? '#2D5A27' : '#D04040' }}>
              <Sparkles className="w-3 h-3" />
              {myRank.level}
            </div>
            <div className="text-xs mt-1" style={{ color: '#8B7355' }}>共 {ranking.length} 人参与排名</div>
          </div>
        </section>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('ranking')}
          className="px-5 py-2 rounded-full text-sm font-bold transition-all"
          style={tab === 'ranking'
            ? { background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)', color: '#fff' }
            : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}
        >
          <Trophy className="w-4 h-4 inline mr-1" />
          排行榜
        </button>
        <button
          onClick={() => setTab('records')}
          className="px-5 py-2 rounded-full text-sm font-bold transition-all"
          style={tab === 'records'
            ? { background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)', color: '#fff' }
            : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}
        >
          <Award className="w-4 h-4 inline mr-1" />
          积分明细
        </button>
      </div>

      {/* 排行榜内容 */}
      {tab === 'ranking' && (
        <>
          {/* 前三名领奖台 */}
          {top3.length > 0 && !loading && (
            <section className="grid grid-cols-3 gap-3">
              {top3.map((s, i) => (
                <div
                  key={s.id}
                  className="glass-card-solid p-4 text-center relative"
                  style={{
                    order: i === 0 ? 2 : i === 1 ? 1 : 3,
                    transform: i === 0 ? 'translateY(-8px)' : 'none',
                    borderColor: medalColors[i] + '60',
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ background: medalColors[i] + '22', color: medalColors[i] }}
                  >
                    {medalIcons[i]}
                  </div>
                  <div className="font-bold text-sm truncate" style={{ color: '#2D5A27' }}>{s.name}</div>
                  <div className="text-lg font-black" style={{ color: '#FFB86C' }}>{s.points}</div>
                  <div className="text-xs" style={{ color: '#8B7355' }}>饲料币</div>
                </div>
              ))}
            </section>
          )}

          {/* 第4名及以后列表 */}
          {!loading && restRanking.length > 0 && (
            <section className="space-y-2">
              {restRanking.map(s => (
                <div
                  key={s.id}
                  className="glass-card-solid px-4 py-3 flex items-center justify-between"
                  style={s.id === user?.id ? { borderColor: '#73C067', borderWidth: 2, background: 'rgba(232,245,228,0.8)' } : {}}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'rgba(200,230,192,0.3)', color: '#8B7355' }}
                    >
                      {s.rank}
                    </div>
                    <div>
                      <span className="text-sm font-bold" style={{ color: '#2D5A27' }}>
                        {s.name}
                        {s.id === user?.id && <span className="ml-1 text-xs" style={{ color: '#5CAF50' }}>(我)</span>}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black" style={{ color: '#FFB86C' }}>{s.points}</span>
                    <span className="text-xs" style={{ color: '#8B7355' }}>分</span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-3 border-[#73C067] border-t-transparent rounded-full animate-spin" />
              <p className="mt-3 text-sm" style={{ color: '#8B7355' }}>加载排名中...</p>
            </div>
          )}
        </>
      )}

      {/* 积分明细 */}
      {tab === 'records' && (
        <section className="space-y-2">
          {myPoints.length === 0 && !loading ? (
            <div className="glass-card-solid p-8 text-center">
              <Award className="w-12 h-12 mx-auto mb-3" style={{ color: '#C0C0C0' }} />
              <p className="text-sm" style={{ color: '#8B7355' }}>还没有积分记录，去完成作业赚取饲料币吧~</p>
            </div>
          ) : (
            myPoints.map(r => (
              <div key={r.id} className="glass-card-solid px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" style={{ color: '#4A3728' }}>{r.reason}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#8B7355' }}>{r.created_at}</div>
                </div>
                <div className="flex items-center gap-1">
                  {r.points > 0 ? (
                    <TrendingUp className="w-4 h-4" style={{ color: '#5CAF50' }} />
                  ) : (
                    <TrendingDown className="w-4 h-4" style={{ color: '#D04040' }} />
                  )}
                  <span
                    className="text-sm font-black"
                    style={{ color: r.points > 0 ? '#5CAF50' : '#D04040' }}
                  >
                    {r.points > 0 ? '+' : ''}{r.points}
                  </span>
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
