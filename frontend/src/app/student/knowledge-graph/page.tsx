'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain, Target, Zap, TrendingUp, TrendingDown,
  Lightbulb, Sparkles, RefreshCw, AlertCircle,
  CheckCircle2, BookOpen, Clock, Award,
} from 'lucide-react';
import { getStoredUser, getStudentKnowledgeGraph, getStudentRawData, type KnowledgeGraphData, type KnowledgeNode } from '@/lib/api';

// 掌握程度颜色
const MASTERY_COLORS: Record<string, { main: string; light: string; label: string }> = {
  mastered: { main: '#10B981', light: '#D1FAE5', label: '已掌握' },
  learning: { main: '#F59E0B', light: '#FEF3C7', label: '学习中' },
  weak: { main: '#EF4444', light: '#FEE2E2', label: '薄弱' },
  not_started: { main: '#9CA3AF', light: '#F3F4F6', label: '未学习' },
};

// 8个单元的展示颜色
const UNIT_COLORS: Record<string, { main: string; light: string; icon: string }> = {
  'u1': { main: '#6366F1', light: '#E0E7FF', icon: '🔭' },
  'u2': { main: '#F97316', light: '#FFEDD5', icon: '✖️' },
  'u3': { main: '#14B8A6', light: '#CCFBF1', icon: '➗' },
  'u4': { main: '#8B5CF6', light: '#EDE9FE', icon: '🔄' },
  'u5': { main: '#EC4899', light: '#FCE7F3', icon: '🔤' },
  'u6': { main: '#059669', light: '#D1FAE5', icon: '📐' },
  'u7': { main: '#0EA5E9', light: '#E0F2FE', icon: '🎲' },
  'u8': { main: '#D946EF', light: '#FAE8FF', icon: '🌲' },
};

const SVG_SIZE = 900;
const CENTER = SVG_SIZE / 2;
const UNIT_RADIUS = 180;
const KP_RADIUS = 350;

interface PositionedNode extends KnowledgeNode {
  x: number; y: number; parentX: number; parentY: number;
}

interface UnitGroup {
  unitCode: string;
  unitName: string;
  color: { main: string; light: string; icon: string };
  icon: string;
  x: number; y: number;
  nodes: PositionedNode[];
  avgMastery: number;
  masteredCount: number;
  weakCount: number;
  notStartedCount: number;
  totalCount: number;
}

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<KnowledgeGraphData | null>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user?.id) { router.push('/login'); return; }
    getStudentRawData(user.id).then(res => { if (res.success) setRawData(res); }).catch(() => {});
    getStudentKnowledgeGraph(user.id).then(res => {
      if (res.success && res.data?.graph) {
        setGraph(res.data.graph);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  // 计算思维导图节点位置
  const unitGroups = useMemo<UnitGroup[]>(() => {
    const nodes = graph?.nodes || [];
    if (nodes.length === 0) return [];

    // 按 unit_code 分组
    const groups: Record<string, KnowledgeNode[]> = {};
    nodes.forEach(n => {
      const uc = n.unit_code || 'u1';
      if (!groups[uc]) groups[uc] = [];
      groups[uc].push(n);
    });

    const unitCodes = Object.keys(groups).sort();
    const result: UnitGroup[] = [];

    unitCodes.forEach((uc, idx) => {
      const unitColor = UNIT_COLORS[uc] || UNIT_COLORS['u1'];
      const angle = (idx * 360 / unitCodes.length - 90) * Math.PI / 180;
      const ux = CENTER + Math.cos(angle) * UNIT_RADIUS;
      const uy = CENTER + Math.sin(angle) * UNIT_RADIUS;

      const unitNodes = groups[uc];
      const positionedNodes: PositionedNode[] = [];
      const spreadAngle = (320 / unitCodes.length) * Math.PI / 180;

      unitNodes.forEach((node, ni) => {
        const t = unitNodes.length === 1 ? 0 : (ni / (unitNodes.length - 1) - 0.5) * 2;
        const leafAngle = angle + t * spreadAngle;
        positionedNodes.push({
          ...node,
          x: CENTER + Math.cos(leafAngle) * KP_RADIUS,
          y: CENTER + Math.sin(leafAngle) * KP_RADIUS,
          parentX: ux,
          parentY: uy,
        });
      });

      const masteredCount = unitNodes.filter(n => n.status === 'mastered').length;
      const weakCount = unitNodes.filter(n => n.status === 'weak').length;
      const notStartedCount = unitNodes.filter(n => n.status === 'not_started').length;
      const avgMastery = unitNodes.length > 0
        ? Math.round(unitNodes.reduce((s, n) => s + n.mastery, 0) / unitNodes.length)
        : 0;

      result.push({
        unitCode: uc,
        unitName: unitNodes[0]?.unit_name || uc,
        color: unitColor,
        icon: unitColor.icon,
        x: ux,
        y: uy,
        nodes: positionedNodes,
        avgMastery,
        masteredCount,
        weakCount,
        notStartedCount,
        totalCount: unitNodes.length,
      });
    });

    return result;
  }, [graph]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95)' }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-indigo-300 border-t-transparent animate-spin" />
          <p className="text-xl font-bold text-white mb-2">正在构建你的知识图谱...</p>
          <p className="text-sm text-indigo-200">基于五上数学完整课程目录分析学习数据</p>
          <div className="mt-6 w-56 h-1.5 bg-white/10 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full animate-pulse" style={{ width: '70%' }} />
          </div>
        </div>
      </div>
    );
  }

  const nodes = graph?.nodes || [];
  const totalKps = nodes.length;
  const totalMastered = nodes.filter(n => n.status === 'mastered').length;
  const totalWeak = nodes.filter(n => n.status === 'weak').length;
  const totalNotStarted = nodes.filter(n => n.status === 'not_started').length;
  const totalLearning = nodes.filter(n => n.status === 'learning').length;

  return (
    <div className="min-h-screen p-4" style={{ background: 'linear-gradient(135deg, #0F172A, #1E1B4B, #0F172A)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #818CF8, #6366F1)' }}>
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">知识思维导图</h1>
              <p className="text-sm text-indigo-300">人教版五上数学 · 完整课程辐射结构</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'graph' ? 'list' : 'graph')}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all bg-white/10 text-indigo-200 hover:bg-white/20 border border-white/10"
            >
              {viewMode === 'graph' ? '📋 列表视图' : '🔮 思维导图'}
            </button>
            <button
              onClick={() => { setLoading(true); window.location.reload(); }}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all bg-white/10 text-indigo-200 hover:bg-white/20 flex items-center gap-1.5 border border-white/10"
            >
              <RefreshCw className="w-4 h-4" /> 刷新
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: '知识点总数', value: totalKps, color: '#818CF8', icon: <BookOpen className="w-4 h-4" /> },
            { label: '已掌握', value: totalMastered, color: '#10B981', icon: <CheckCircle2 className="w-4 h-4" /> },
            { label: '学习中', value: totalLearning, color: '#F59E0B', icon: <Clock className="w-4 h-4" /> },
            { label: '薄弱', value: totalWeak, color: '#EF4444', icon: <AlertCircle className="w-4 h-4" /> },
            { label: '未学习', value: totalNotStarted, color: '#9CA3AF', icon: <Target className="w-4 h-4" /> },
          ].map((stat, i) => (
            <div key={i} className="rounded-2xl p-4 border border-white/5" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2 mb-1" style={{ color: stat.color }}>{stat.icon}<span className="text-xs opacity-70">{stat.label}</span></div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* AI Summary */}
        {graph?.summary && (
          <div className="rounded-2xl p-5 mb-6 border border-indigo-500/20" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))' }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-indigo-300" />
              <span className="font-bold text-indigo-200">学习概览</span>
            </div>
            <p className="text-indigo-100/80 text-sm leading-7">{graph.summary}</p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main Graph Area */}
          <div className="flex-1">
            {viewMode === 'graph' ? (
              <div className="rounded-3xl p-4 border border-white/5 relative overflow-hidden" style={{ background: 'rgba(15,23,42,0.6)', minHeight: '700px' }}>
                {nodes.length > 0 ? (
                  <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} className="w-full" style={{ maxHeight: '750px' }}>
                    <defs>
                      <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#312E81" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="transparent" />
                      </radialGradient>
                      <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#818CF8" /><stop offset="100%" stopColor="#4F46E5" />
                      </radialGradient>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>

                    <circle cx={CENTER} cy={CENTER} r="350" fill="url(#bgGrad)" />
                    <circle cx={CENTER} cy={CENTER} r={UNIT_RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 6" />
                    <circle cx={CENTER} cy={CENTER} r={KP_RADIUS} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3 6" />

                    {/* 连接线：中心 → 单元 */}
                    {unitGroups.map((unit, i) => {
                      const midX = (CENTER + unit.x) / 2;
                      const midY = (CENTER + unit.y) / 2;
                      const isHovered = hoveredUnit === unit.unitCode;
                      return (
                        <path key={`cu-${i}`}
                          d={`M ${CENTER} ${CENTER} Q ${midX + (unit.y - CENTER) * 0.12} ${midY - (unit.x - CENTER) * 0.12} ${unit.x} ${unit.y}`}
                          fill="none" stroke={unit.color.main}
                          strokeWidth={isHovered ? 3.5 : 2}
                          strokeOpacity={isHovered ? 0.7 : 0.3}
                          style={{ transition: 'all 0.3s' }}
                        />
                      );
                    })}

                    {/* 连接线：单元 → 知识点 */}
                    {unitGroups.map((unit, ui) =>
                      unit.nodes.map((node, ni) => {
                        const mc = MASTERY_COLORS[node.status] || MASTERY_COLORS.not_started;
                        const midX = (unit.x + node.x) / 2;
                        const midY = (unit.y + node.y) / 2;
                        const isHovered = hoveredUnit === unit.unitCode;
                        return (
                          <path key={`uk-${ui}-${ni}`}
                            d={`M ${unit.x} ${unit.y} Q ${midX + (node.y - unit.y) * 0.08} ${midY - (node.x - unit.x) * 0.08} ${node.x} ${node.y}`}
                            fill="none" stroke={mc.main}
                            strokeWidth={isHovered ? 2 : 1.2}
                            strokeOpacity={isHovered ? 0.5 : 0.25}
                            style={{ transition: 'all 0.3s' }}
                          />
                        );
                      })
                    )}

                    {/* 中心节点 */}
                    <g>
                      <circle cx={CENTER} cy={CENTER} r="65" fill="none" stroke="#6366F1" strokeWidth="2" opacity="0.15">
                        <animate attributeName="r" values="60;72;60" dur="4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.2;0.05;0.2" dur="4s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={CENTER} cy={CENTER} r="50" fill="url(#centerGrad)" filter="url(#glow)" />
                      <text x={CENTER} y={CENTER - 10} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">五上数学</text>
                      <text x={CENTER} y={CENTER + 8} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="11">知识图谱</text>
                      <text x={CENTER} y={CENTER + 22} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9">{totalKps} 个知识点</text>
                    </g>

                    {/* 单元节点 */}
                    {unitGroups.map((unit, i) => {
                      const isHovered = hoveredUnit === unit.unitCode;
                      const progressColor = unit.avgMastery >= 70 ? '#10B981' : unit.avgMastery >= 40 ? '#F59E0B' : '#EF4444';
                      return (
                        <g key={`unit-${i}`}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredUnit(unit.unitCode)}
                          onMouseLeave={() => setHoveredUnit(null)}
                        >
                          {/* 进度环 */}
                          <circle cx={unit.x} cy={unit.y} r={isHovered ? 44 : 40}
                            fill="none" stroke={progressColor}
                            strokeWidth="3" strokeOpacity="0.4"
                            strokeDasharray={`${unit.avgMastery * 2.5} ${250 - unit.avgMastery * 2.5}`}
                            strokeDashoffset="62.5"
                            style={{ transform: 'rotate(-90deg)', transformOrigin: `${unit.x}px ${unit.y}px`, transition: 'all 0.3s' }}
                          />
                          {/* 背景圆 */}
                          <circle cx={unit.x} cy={unit.y} r={isHovered ? 38 : 34}
                            fill={unit.color.main} fillOpacity={isHovered ? 0.2 : 0.12}
                            stroke={unit.color.main} strokeWidth={isHovered ? 3 : 2}
                            strokeOpacity={isHovered ? 0.8 : 0.5}
                            style={{ transition: 'all 0.3s' }}
                          />
                          <text x={unit.x} y={unit.y - 4} textAnchor="middle" fontSize="16">{unit.icon}</text>
                          <text x={unit.x} y={unit.y + 12} textAnchor="middle" fontSize="10" fontWeight="bold" fill={unit.color.main}>
                            {unit.unitName.length > 6 ? unit.unitName.slice(0, 5) + '..' : unit.unitName}
                          </text>

                          {isHovered && (
                            <g>
                              <rect x={unit.x - 40} y={unit.y + 22} width="80" height="18" rx="9"
                                fill="rgba(0,0,0,0.8)" />
                              <text x={unit.x} y={unit.y + 35} textAnchor="middle" fontSize="10" fill="white">
                                掌握 {unit.avgMastery}% · {unit.masteredCount}/{unit.totalCount}已掌握
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {/* 知识点节点 */}
                    {unitGroups.map((unit, ui) =>
                      unit.nodes.map((node, ni) => {
                        const mc = MASTERY_COLORS[node.status] || MASTERY_COLORS.not_started;
                        const nodeSize = node.status === 'weak' ? 28 : node.status === 'mastered' ? 26 : 24;
                        const isHovered = hoveredUnit === unit.unitCode;
                        const isSelected = selectedNode?.id === node.id;
                        return (
                          <g key={`kp-${ui}-${ni}`}
                            style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                            onClick={() => setSelectedNode(node)}
                          >
                            {/* 选中或薄弱的脉冲环 */}
                            {(isSelected || node.status === 'weak') && (
                              <circle cx={node.x} cy={node.y} r={nodeSize + 5}
                                fill="none" stroke={mc.main} strokeWidth="2"
                                strokeOpacity={isSelected ? 0.6 : 0.3}
                                strokeDasharray={isSelected ? 'none' : '3 4'}
                              >
                                {node.status === 'weak' && !isSelected && (
                                  <animate attributeName="stroke-opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
                                )}
                              </circle>
                            )}
                            {/* 节点主体 */}
                            <circle cx={node.x} cy={node.y}
                              r={isHovered ? nodeSize + 2 : nodeSize}
                              fill={mc.light} fillOpacity={0.3}
                              stroke={mc.main} strokeWidth={isSelected ? 3 : 1.5}
                              strokeOpacity={isSelected ? 1 : 0.7}
                              filter={isSelected ? 'url(#glow)' : 'none'}
                            />
                            <circle cx={node.x} cy={node.y}
                              r={isHovered ? nodeSize - 2 : nodeSize - 3}
                              fill={mc.main} fillOpacity={0.25}
                            />
                            <text x={node.x} y={node.y + 3} textAnchor="middle"
                              fontSize={isHovered ? 9 : 8} fontWeight="600"
                              fill={mc.main} fillOpacity={0.9}
                              style={{ transition: 'all 0.3s' }}
                            >
                              {node.name.length > 5 ? node.name.slice(0, 4) + '..' : node.name}
                            </text>
                            {/* 掌握度百分比 */}
                            {node.status !== 'not_started' && (
                              <text x={node.x} y={node.y + 13} textAnchor="middle"
                                fontSize="7" fill={mc.main} fillOpacity="0.5"
                              >{node.mastery}%</text>
                            )}
                            {/* 错题数标记 */}
                            {node.error_count > 0 && (
                              <g>
                                <circle cx={node.x + nodeSize - 2} cy={node.y - nodeSize + 2} r="7" fill="#EF4444" />
                                <text x={node.x + nodeSize - 2} y={node.y - nodeSize + 4.5} textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">{node.error_count}</text>
                              </g>
                            )}
                          </g>
                        );
                      })
                    )}
                  </svg>
                ) : (
                  <div className="flex items-center justify-center" style={{ height: '600px' }}>
                    <div className="text-center">
                      <AlertCircle className="w-16 h-16 mx-auto mb-4 text-white/20" />
                      <p className="text-white/50 text-lg">暂无足够数据生成思维导图</p>
                      <p className="text-sm text-white/30 mt-2">继续练习和闯关，思维导图会自动更新</p>
                    </div>
                  </div>
                )}

                {/* 图例 */}
                <div className="flex justify-center gap-4 mt-3 flex-wrap">
                  {Object.entries(MASTERY_COLORS).map(([status, colors]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full" style={{ background: colors.main }} />
                      <span className="text-xs text-white/40">{colors.label}</span>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-2">
                  <p className="text-xs text-white/20">💡 鼠标悬停单元高亮分支 · 点击知识点查看详情</p>
                </div>
              </div>
            ) : (
              /* List View */
              <div className="space-y-4">
                {unitGroups.map((unit, ui) => (
                  <div key={ui} className="rounded-2xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: unit.color.main + '20' }}>{unit.icon}</div>
                      <div className="flex-1">
                        <h3 className="font-bold text-white text-sm">{unit.unitName}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-1.5 rounded-full bg-white/5">
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${unit.avgMastery}%`, background: unit.color.main }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: unit.color.main }}>{unit.avgMastery}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {unit.masteredCount > 0 && <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#10B98120', color: '#10B981' }}>{unit.masteredCount}已掌握</span>}
                        {unit.weakCount > 0 && <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#EF444420', color: '#EF4444' }}>{unit.weakCount}薄弱</span>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {unit.nodes.map((node, ni) => {
                        const mc = MASTERY_COLORS[node.status] || MASTERY_COLORS.not_started;
                        return (
                          <div key={ni} onClick={() => setSelectedNode(node)}
                            className="flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all hover:bg-white/5"
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs" style={{ background: mc.main + '20', color: mc.main }}>{unit.icon}</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-bold text-sm text-white">{node.name}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: mc.main + '20', color: mc.main }}>{mc.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1 rounded-full bg-white/5">
                                  <div className="h-1 rounded-full" style={{ width: `${node.mastery}%`, background: mc.main }} />
                                </div>
                                <span className="text-xs font-bold" style={{ color: mc.main }}>{node.mastery}%</span>
                              </div>
                            </div>
                            {node.error_count > 0 && <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#EF444420', color: '#EF4444' }}>错{node.error_count}次</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-full lg:w-80 space-y-4">
            {/* Selected Node Detail */}
            {selectedNode ? (
              <div className="rounded-2xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{UNIT_COLORS[selectedNode.unit_code || 'u1']?.icon || '📚'}</span>
                  <h3 className="font-bold text-white">{selectedNode.name}</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-white/40">所属单元</span>
                    <p className="text-sm text-white/70 mt-0.5">{selectedNode.unit_name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-white/40">课时</span>
                    <p className="text-sm text-white/70 mt-0.5">{selectedNode.lesson_title}</p>
                  </div>
                  <div>
                    <span className="text-xs text-white/40">掌握程度</span>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-3 rounded-full bg-white/5">
                        <div className="h-3 rounded-full transition-all" style={{
                          width: `${selectedNode.mastery}%`,
                          background: (MASTERY_COLORS[selectedNode.status] || MASTERY_COLORS.not_started).main
                        }} />
                      </div>
                      <span className="font-bold text-sm" style={{ color: (MASTERY_COLORS[selectedNode.status] || MASTERY_COLORS.not_started).main }}>
                        {selectedNode.mastery}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div><span className="text-xs text-white/40">状态</span><div className="font-bold text-white/80">{(MASTERY_COLORS[selectedNode.status] || MASTERY_COLORS.not_started).label}</div></div>
                    <div><span className="text-xs text-white/40">错题</span><div className="font-bold" style={{ color: selectedNode.error_count > 0 ? '#EF4444' : '#10B981' }}>{selectedNode.error_count}次</div></div>
                  </div>
                  <div className="p-3 rounded-xl" style={{ background: (MASTERY_COLORS[selectedNode.status] || MASTERY_COLORS.not_started).main + '15' }}>
                    <p className="text-sm text-white/70">
                      {selectedNode.status === 'mastered' ? '✅ 掌握良好，继续保持！可以尝试挑战更难的题目。'
                        : selectedNode.status === 'learning' ? '⏳ 正在学习中，多做练习可以提升掌握程度。'
                          : selectedNode.status === 'weak' ? '⚠️ 这个知识点需要重点关注，建议多做相关练习。'
                            : '📖 尚未开始学习，快去预习吧！'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-5 border border-white/5 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <BookOpen className="w-10 h-10 mx-auto mb-2 text-white/20" />
                <p className="text-sm text-white/30">点击知识节点查看详情</p>
              </div>
            )}

            {/* Weak Areas */}
            {graph?.weak_areas && graph.weak_areas.length > 0 && (
              <div className="rounded-2xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <h3 className="font-bold text-sm text-white">薄弱领域</h3>
                </div>
                <div className="space-y-2">
                  {graph.weak_areas.map((area, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#EF4444' }}>{i + 1}</span>
                      <span className="text-sm text-red-200">{area}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strength Areas */}
            {graph?.strength_areas && graph.strength_areas.length > 0 && (
              <div className="rounded-2xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-green-400" />
                  <h3 className="font-bold text-sm text-white">优势领域</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {graph.strength_areas.map((area, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-full text-xs" style={{ background: 'rgba(16,185,129,0.1)', color: '#6EE7B7' }}>✓ {area}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {graph?.suggestions && graph.suggestions.length > 0 && (
              <div className="rounded-2xl p-5 border border-amber-500/10" style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.08))' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <h3 className="font-bold text-sm text-amber-200">学习建议</h3>
                </div>
                <div className="space-y-2">
                  {graph.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400" />
                      <span className="text-sm text-amber-100/80">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
