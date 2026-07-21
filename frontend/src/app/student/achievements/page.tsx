'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Award, Star, TrendingUp, Lock, ChevronRight, Heart, Map,
  Coins, Trophy, Target, Sparkles, Medal, Crown, TrendingDown,
  Gift, ShoppingBag, RefreshCw, CheckCircle, Clock, XCircle,
} from 'lucide-react';
import {
  getStoredUser, getToken, fetchStudentDashboard,
  fetchRanking, fetchPoints,
  listStoreItems, redeemItem, myRedemptions,
  StoreItem, RedemptionRecord,
} from '@/lib/api';

/* ============= Types ============= */
interface RankStudent { id: number; name: string; points: number; rank: number; level: string; }
interface PointRecord { id: number; student_id: number; points: number; reason: string; created_at: string; }

/* ============= Static data ============= */
const collections = [
  { emoji: '🐘', name: '大象', topic: '小数乘除', unlocked: true, progress: 65 },
  { emoji: '🐵', name: '猴子', topic: '简易方程', unlocked: true, progress: 40 },
  { emoji: '🦒', name: '长颈鹿', topic: '多边形面积', unlocked: true, progress: 100 },
  { emoji: '🐰', name: '兔子', topic: '因数倍数', unlocked: false, progress: 0 },
  { emoji: '🦛', name: '河马', topic: '长正方体', unlocked: false, progress: 0 },
  { emoji: '🐦', name: '小鸟', topic: '分数运算', unlocked: true, progress: 20 },
  { emoji: '🐧', name: '企鹅', topic: '统计可能性', unlocked: true, progress: 80 },
  { emoji: '🦁', name: '狮王', topic: '拓展难题', unlocked: false, progress: 0 },
];

const growthData = [
  { week: '第1周', score: 320 },
  { week: '第2周', score: 580 },
  { week: '第3周', score: 750 },
  { week: '第4周', score: 980 },
  { week: '第5周', score: 1100 },
  { week: '第6周', score: 1280 },
];

const weakPoints = [
  { topic: '因数与倍数', venue: '兔子繁殖屋', emoji: '🐰', accuracy: 45 },
  { topic: '长方体体积', venue: '河马水池', emoji: '🦛', accuracy: 52 },
  { topic: '分数通分', venue: '小鸟喂食台', emoji: '🐦', accuracy: 60 },
];

/* ============= Main component ============= */
export default function StudentAchievements() {
  const [tab, setTab] = useState<'growth' | 'ranking' | 'store'>('growth');
  const maxScore = Math.max(...growthData.map((d) => d.score));

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        <TabButton active={tab === 'growth'} onClick={() => setTab('growth')} icon={Map} label="成长图鉴" />
        <TabButton active={tab === 'ranking'} onClick={() => setTab('ranking')} icon={Trophy} label="排行榜" />
        <TabButton active={tab === 'store'} onClick={() => setTab('store')} icon={Gift} label="积分商城" />
      </div>

      {tab === 'growth' && <GrowthTab maxScore={maxScore} />}
      {tab === 'ranking' && <RankingTab />}
      {tab === 'store' && <StoreTab />}
    </div>
  );
}

/* ============= Tab button ============= */
function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: any; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2 rounded-full text-sm font-bold transition-all"
      style={active
        ? { background: 'linear-gradient(135deg, #73C067 0%, #5CAF50 100%)', color: '#fff', boxShadow: '0 4px 12px rgba(115,192,103,0.3)' }
        : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}
    >
      <Icon className="w-4 h-4 inline mr-1" />
      {label}
    </button>
  );
}

/* ============= Growth Tab ============= */
function GrowthTab({ maxScore }: { maxScore: number }) {
  const [user, setUser] = useState<any>(null);
  const [dashData, setDashData] = useState<any>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (u) {
      setUser(u);
      fetchStudentDashboard(u.id).then(setDashData).catch(() => {});
    }
  }, []);

  const totalPoints = dashData?.total_points || user?.points || 0;
  const rank = dashData?.rank || 0;
  const unlockedVenues = dashData?.unlocked_venues || 0;

  return (
    <>
      {/* Profile card */}
      <section
        className="glass-card-solid p-6"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(232,245,228,0.85) 50%, rgba(255,240,219,0.8) 100%)' }}
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: 'linear-gradient(135deg, #95D8F0, #73C067)', boxShadow: '0 6px 20px rgba(115,192,103,0.3)' }}>
            🧒
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold" style={{ color: '#4A3728' }}>我的饲养成长图鉴</h1>
            <p className="text-sm mt-1 inline-flex items-center gap-1.5" style={{ color: '#8B7355' }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#FFB86C' }} />
              Lv.5 资深饲养员
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="text-center p-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.7)' }}>
            <Coins className="w-4 h-4 mx-auto mb-1" style={{ color: '#FFB86C' }} />
            <p className="text-lg font-bold" style={{ color: '#FFB86C' }}>{totalPoints}</p>
            <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>饲料币</p>
          </div>
          <div className="text-center p-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.7)' }}>
            <Trophy className="w-4 h-4 mx-auto mb-1" style={{ color: '#73C067' }} />
            <p className="text-lg font-bold" style={{ color: '#2D5A27' }}>{unlockedVenues}/8</p>
            <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>通关场馆</p>
          </div>
          <div className="text-center p-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.7)' }}>
            <Medal className="w-4 h-4 mx-auto mb-1" style={{ color: '#95D8F0' }} />
            <p className="text-lg font-bold" style={{ color: '#2A6F97' }}>第{rank}名</p>
            <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>全园排名</p>
          </div>
        </div>
      </section>

      {/* Collection wall */}
      <section className="glass-card-solid p-5">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: '#4A3728' }}>
          <Map className="w-5 h-5" style={{ color: '#73C067' }} />动物园全景图鉴
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {collections.map((item) => (
            <div key={item.name} className="flex flex-col items-center p-3 rounded-2xl transition-all"
              style={{
                background: item.unlocked ? 'linear-gradient(135deg, rgba(232,245,228,0.95), rgba(200,230,192,0.6))' : 'rgba(245,245,240,0.6)',
                border: `1.5px solid ${item.unlocked ? 'rgba(115,192,103,0.4)' : 'rgba(184,176,164,0.3)'}`,
                opacity: item.unlocked ? 1 : 0.55,
              }}>
              <span className="text-3xl">{item.emoji}</span>
              <p className="text-sm font-bold mt-1.5" style={{ color: item.unlocked ? '#4A3728' : '#B8B0A4' }}>{item.name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>{item.topic}</p>
              {item.unlocked ? (
                <div className="w-full mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(200,230,192,0.4)' }}>
                  <div className="h-full rounded-full" style={{ width: `${item.progress}%`, background: 'linear-gradient(90deg, #73C067, #5CAF50)' }} />
                </div>
              ) : (
                <Lock className="w-3.5 h-3.5 mt-2" style={{ color: '#B8B0A4' }} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Growth chart */}
      <section className="glass-card-solid p-5">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: '#4A3728' }}>
          <TrendingUp className="w-5 h-5" style={{ color: '#73C067' }} />成长曲线
        </h2>
        <div className="flex items-end gap-2 h-36">
          {growthData.map((data, i) => {
            const height = (data.score / maxScore) * 100;
            const isLatest = i === growthData.length - 1;
            return (
              <div key={data.week} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs font-bold" style={{ color: isLatest ? '#2D5A27' : '#8B7355' }}>{data.score}</span>
                <div className="w-full flex-1 flex items-end">
                  <div className="w-full rounded-t-lg transition-all"
                    style={{
                      height: `${height}%`, minHeight: '8px',
                      background: isLatest ? 'linear-gradient(180deg, #73C067, #5CAF50)' : 'linear-gradient(180deg, rgba(200,230,192,0.9), rgba(200,230,192,0.5))',
                      boxShadow: isLatest ? '0 -2px 8px rgba(115,192,103,0.3)' : 'none',
                    }} />
                </div>
                <span className="text-xs" style={{ color: '#8B7355' }}>{data.week.replace('第', '').replace('周', '')}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Weak points */}
      <section className="glass-card-solid p-5">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: '#4A3728' }}>
          <Target className="w-5 h-5" style={{ color: '#FFB86C' }} />薄弱知识点
        </h2>
        <div className="space-y-3">
          {weakPoints.map((point) => (
            <div key={point.topic} className="flex items-center gap-3 p-3.5 rounded-2xl"
              style={{ background: 'rgba(255,248,240,0.85)', border: '1px solid rgba(200,230,192,0.4)' }}>
              <span className="text-2xl shrink-0">{point.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: '#4A3728' }}>{point.topic}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>{point.venue}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(200,230,192,0.4)' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${point.accuracy}%`, background: point.accuracy < 50 ? 'linear-gradient(90deg, #F28B82, #E07060)' : 'linear-gradient(90deg, #FFB86C, #FF9F4A)' }} />
                  </div>
                  <span className="text-xs font-semibold shrink-0" style={{ color: '#8B7355' }}>{point.accuracy}%</span>
                </div>
              </div>
              <Link href="/student/errors" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all hover:scale-[1.05] active:scale-[0.95]"
                style={{ background: 'linear-gradient(135deg, #73C067, #5CAF50)', color: 'white', textDecoration: 'none', boxShadow: '0 2px 8px rgba(115,192,103,0.3)' }}>
                去补救<ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ============= Ranking Tab ============= */
function RankingTab() {
  const [ranking, setRanking] = useState<RankStudent[]>([]);
  const [myPoints, setMyPoints] = useState<PointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'ranking' | 'records'>('ranking');
  const user = getStoredUser();

  useEffect(() => {
    const token = getToken();
    if (!token || !user?.class_id) return;
    setLoading(true);
    Promise.all([fetchRanking(user.class_id), fetchPoints(user.id)])
      .then(([rankData, pointsData]) => {
        setRanking(rankData.ranking || []);
        setMyPoints((pointsData.points || []).slice(0, 30));
      }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const myRank = ranking.find(r => r.id === user?.id);
  const top3 = ranking.slice(0, 3);
  const restRanking = ranking.slice(3);
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const medalIcons = [<Crown key="1" />, <Medal key="2" />, <Medal key="3" />];

  return (
    <div className="space-y-5">
      {myRank && (
        <section className="glass-card-solid p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black"
              style={{
                background: myRank.rank <= 3 ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,184,108,0.15))' : 'linear-gradient(135deg, rgba(115,192,103,0.2), rgba(92,175,80,0.15))',
                color: myRank.rank <= 3 ? '#B8860B' : '#2D5A27',
              }}>第{myRank.rank}名</div>
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
              <Sparkles className="w-3 h-3" />{myRank.level}
            </div>
            <div className="text-xs mt-1" style={{ color: '#8B7355' }}>共 {ranking.length} 人参与排名</div>
          </div>
        </section>
      )}

      <div className="flex gap-2">
        <button onClick={() => setSubTab('ranking')} className="px-5 py-2 rounded-full text-sm font-bold transition-all"
          style={subTab === 'ranking' ? { background: 'linear-gradient(135deg, #73C067, #5CAF50)', color: '#fff' } : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}>
          <Trophy className="w-4 h-4 inline mr-1" />排行榜
        </button>
        <button onClick={() => setSubTab('records')} className="px-5 py-2 rounded-full text-sm font-bold transition-all"
          style={subTab === 'records' ? { background: 'linear-gradient(135deg, #73C067, #5CAF50)', color: '#fff' } : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}>
          <Award className="w-4 h-4 inline mr-1" />积分明细
        </button>
      </div>

      {subTab === 'ranking' && (
        <>
          {top3.length > 0 && !loading && (
            <section className="grid grid-cols-3 gap-3">
              {top3.map((s, i) => (
                <div key={s.id} className="glass-card-solid p-4 text-center relative"
                  style={{ order: i === 0 ? 2 : i === 1 ? 1 : 3, transform: i === 0 ? 'translateY(-8px)' : 'none' }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ background: medalColors[i] + '22', color: medalColors[i] }}>{medalIcons[i]}</div>
                  <div className="font-bold text-sm truncate" style={{ color: '#2D5A27' }}>{s.name}</div>
                  <div className="text-lg font-black" style={{ color: '#FFB86C' }}>{s.points}</div>
                  <div className="text-xs" style={{ color: '#8B7355' }}>饲料币</div>
                </div>
              ))}
            </section>
          )}
          {!loading && restRanking.length > 0 && (
            <section className="space-y-2">
              {restRanking.map(s => (
                <div key={s.id} className="glass-card-solid px-4 py-3 flex items-center justify-between"
                  style={s.id === user?.id ? { borderColor: '#73C067', borderWidth: 2, background: 'rgba(232,245,228,0.8)' } : {}}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'rgba(200,230,192,0.3)', color: '#8B7355' }}>{s.rank}</div>
                    <span className="text-sm font-bold" style={{ color: '#2D5A27' }}>
                      {s.name}{s.id === user?.id && <span className="ml-1 text-xs" style={{ color: '#5CAF50' }}>(我)</span>}
                    </span>
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

      {subTab === 'records' && (
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
                  {r.points > 0 ? <TrendingUp className="w-4 h-4" style={{ color: '#5CAF50' }} /> : <TrendingDown className="w-4 h-4" style={{ color: '#D04040' }} />}
                  <span className="text-sm font-black" style={{ color: r.points > 0 ? '#5CAF50' : '#D04040' }}>
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

/* ============= Store Tab ============= */
function StoreTab() {
  const [token, setToken] = useState('');
  const [items, setItems] = useState<StoreItem[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [myPoints, setMyPoints] = useState(0);
  const [subTab, setSubTab] = useState<'shop' | 'history'>('shop');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ t: string; c: 'success' | 'error' | 'info' } | null>(null);

  const show = (t: string, c: 'success' | 'error' | 'info' = 'info') => { setMsg({ t, c }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => { const t = getToken(); if (t) setToken(t); }, []);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const user = getStoredUser();
      setMyPoints(user?.points ?? 0);
      const classId = user?.class_id;
      if (classId) {
        const r = await listStoreItems(token, classId);
        setItems(r.items || []);
      }
      const r2 = await myRedemptions(token);
      setRedemptions(r2.redemptions || []);
    } catch (e) { }
  }, [token]);
  useEffect(() => { if (token) loadData(); }, [token, loadData]);

  const redeem = async (itemId: number, itemName: string, pts: number) => {
    if (!confirm(`确定用${pts}积分兑换「${itemName}」？`)) return;
    setLoading(true);
    try {
      const r = await redeemItem(token, itemId);
      setMyPoints(r.remaining_points);
      show(`成功兑换「${r.item_name}」，消耗${r.points_spent}积分`, 'success');
      loadData();
    } catch (e: any) { show(e.message || '兑换失败', 'error'); }
    finally { setLoading(false); }
  };

  const statusLabel = (s: string) => s === 'completed' ? '已完成' : s === 'rejected' ? '已拒绝' : '待处理';
  const statusColor = (s: string) => s === 'completed' ? '#6B8F71' : s === 'rejected' ? '#C0785C' : '#D4A843';
  const statusIcon = (s: string) => s === 'completed' ? CheckCircle : s === 'rejected' ? XCircle : Clock;

  return (
    <div className="space-y-5">
      {msg && (
        <div className="px-4 py-2 rounded-md text-sm"
          style={{ backgroundColor: msg.c === 'error' ? 'rgba(192,120,92,0.12)' : msg.c === 'success' ? 'rgba(107,143,113,0.12)' : 'rgba(212,168,67,0.12)',
                   color: msg.c === 'error' ? '#C0785C' : msg.c === 'success' ? '#6B8F71' : '#9A7B2A' }}>
          {msg.t}
        </div>
      )}

      {/* Points display */}
      <div className="glass-card-solid p-5 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, rgba(255,240,219,0.85), rgba(255,184,108,0.15))' }}>
        <Coins className="w-10 h-10" style={{ color: '#FFB86C' }} />
        <div>
          <div className="text-xs" style={{ color: '#8B7355' }}>我的爱心饲料币</div>
          <div className="text-3xl font-black" style={{ color: '#FFB86C' }}>{myPoints}</div>
        </div>
        <button onClick={loadData} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full"
          style={{ border: '1px solid rgba(200,230,192,0.5)', color: '#8B7355', background: 'rgba(255,255,255,0.6)' }}>
          <RefreshCw className="w-3.5 h-3.5" />刷新
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setSubTab('shop')} className="px-5 py-2 rounded-full text-sm font-bold transition-all"
          style={subTab === 'shop' ? { background: 'linear-gradient(135deg, #73C067, #5CAF50)', color: '#fff' } : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}>
          <ShoppingBag className="w-4 h-4 inline mr-1" />兑换奖品
        </button>
        <button onClick={() => setSubTab('history')} className="px-5 py-2 rounded-full text-sm font-bold transition-all"
          style={subTab === 'history' ? { background: 'linear-gradient(135deg, #73C067, #5CAF50)', color: '#fff' } : { background: 'rgba(255,255,255,0.6)', color: '#8B7355' }}>
          <Clock className="w-4 h-4 inline mr-1" />我的兑换
        </button>
      </div>

      {subTab === 'shop' && (
        <div>
          {items.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(it => {
                const canRedeem = myPoints >= it.points && it.stock > 0;
                return (
                  <div key={it.id} className="glass-card-solid p-4 transition-all" style={{ opacity: canRedeem ? 1 : 0.6 }}>
                    <div className="text-3xl mb-2">{it.icon || '🎁'}</div>
                    <h3 className="font-bold text-base" style={{ color: '#4A3728' }}>{it.name}</h3>
                    {it.description && <p className="text-xs mt-1" style={{ color: '#8B7355' }}>{it.description}</p>}
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        <span className="text-lg font-bold" style={{ color: '#FFB86C' }}>{it.points}分</span>
                        <span className="text-xs ml-2" style={{ color: it.stock > 0 ? '#6B8F71' : '#C0785C' }}>剩{it.stock}件</span>
                      </div>
                      <button onClick={() => redeem(it.id, it.name, it.points)} disabled={!canRedeem || loading}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                        style={{ backgroundColor: canRedeem ? '#73C067' : '#D6D0C6', color: canRedeem ? '#fff' : '#B8B0A4' }}>
                        {!canRedeem ? '积分不足' : '兑换'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card-solid p-12 text-center">
              <Gift className="w-12 h-12 mx-auto mb-3" style={{ color: '#C0C0C0' }} />
              <p className="text-sm" style={{ color: '#8B7355' }}>暂无可兑换的奖品</p>
            </div>
          )}
        </div>
      )}

      {subTab === 'history' && (
        <div>
          {redemptions.length > 0 ? (
            <div className="glass-card-solid p-5 space-y-2">
              {redemptions.map(r => {
                const Icon = statusIcon(r.status);
                return (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{r.icon || '🎁'}</span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: '#4A3728' }}>{r.item_name}</div>
                        <div className="text-xs" style={{ color: '#8B7355' }}>{r.created_at?.slice(5, 16)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold" style={{ color: '#FFB86C' }}>-{r.points}分</span>
                      <Icon className="w-4 h-4" style={{ color: statusColor(r.status) }} />
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${statusColor(r.status)}18`, color: statusColor(r.status) }}>{statusLabel(r.status)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card-solid p-12 text-center">
              <Gift className="w-12 h-12 mx-auto mb-3" style={{ color: '#C0C0C0' }} />
              <p className="text-sm" style={{ color: '#8B7355' }}>暂无兑换记录</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
