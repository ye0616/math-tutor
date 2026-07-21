'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Sparkles, RefreshCw, Download, ExternalLink, FileText, Video,
  FileQuestion, BookOpen, Shield, Monitor, Star, CheckCircle2,
  AlertTriangle, Filter, Layers, FolderOpen, Trash2, Lightbulb,
  CheckSquare, Square, FolderPlus, X,
} from 'lucide-react';
import { curriculum } from '@/lib/curriculum';
import {
  getToken, resourceSearch, resourceSearchSaved,
  listCollectedResources, deleteCollectedResource, collectBatch,
  type CollectedResource,
} from '@/lib/api';

// ===== 类型 =====
interface ResourceItem {
  title: string;
  platform: string;
  resource_type: string; // 课件/教案/练习/微课
  format: string;
  size: string;
  duration?: number;
  url: string;
  embed_url?: string;
  bvid?: string;
  thumbnail?: string;
  play_count?: number;
  author?: string;
  match_score: number;
  layer: string; // basic/advanced/extension
  highlight: string;
  description: string;
  whiteboard_ready?: boolean;
}

interface SearchResult {
  lesson_title: string;
  search_info: {
    grade: string;
    subject: string;
    lesson_title: string;
    textbook_version: string;
    total_found: number;
    after_filter: number;
    filtered_out: number;
  };
  ai_note: string;
  resources: ResourceItem[];
  platforms_summary: { name: string; count: number }[];
  saved: boolean;
}

const resourceTypeConfig: Record<string, { label: string; icon: typeof FileText; color: string; bg: string }> = {
  '课件': { label: '课件', icon: Monitor, color: '#6B7FA0', bg: '#EBF0F7' },
  '教案': { label: '教案', icon: FileText, color: '#C0785C', bg: '#F5EDE8' },
  '练习': { label: '练习', icon: FileQuestion, color: '#6B8F71', bg: '#EBF2EC' },
  '微课': { label: '微课', icon: Video, color: '#9C7BB8', bg: '#F3E8F9' },
};

const LAYER_CONFIG: Record<string, { label: string; color: string; bg: string; soft: string }> = {
  basic: { label: '基础生', color: '#5B8C5A', bg: '#E8F3E8', soft: '#6B8F71' },
  advanced: { label: '提升生', color: '#C0785C', bg: '#F5EDE8', soft: '#C0785C' },
  extension: { label: '拓展生', color: '#9C7BB8', bg: '#F3E8F9', soft: '#9C7BB8' },
};

export default function TeacherResources() {
  const [token, setToken] = useState('');
  const [grade, setGrade] = useState('五年级');
  const [subject, setSubject] = useState('数学');
  const [textbookVersion, setTextbookVersion] = useState('人教版');
  const [selectedUnitCode, setSelectedUnitCode] = useState(curriculum[1].code);
  const [selectedLessonCode, setSelectedLessonCode] = useState(curriculum[1].lessons[0].code);
  const [customLesson, setCustomLesson] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [filterType, setFilterType] = useState('all');
  const [filterLayer, setFilterLayer] = useState('all');
  const [sortBy, setSortBy] = useState<'match' | 'layer' | 'type'>('match');
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 勾选
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 三层档案夹
  const [collected, setCollected] = useState<CollectedResource[]>([]);
  const [folderLayer, setFolderLayer] = useState<string>('basic');
  const [loadingFolders, setLoadingFolders] = useState(false);

  const selectedUnit = curriculum.find(u => u.code === selectedUnitCode) || curriculum[0];
  const selectedLesson = selectedUnit.lessons.find(l => l.code === selectedLessonCode) || selectedUnit.lessons[0];

  const currentLessonTitle = useCustom ? customLesson.trim() : selectedLesson.title;
  // 当前课时的 lesson_code（自定义课题时用课题名做 code）
  const currentLessonCode = useCustom ? `custom-${customLesson.trim()}` : selectedLessonCode;

  // 初始化
  useEffect(() => {
    const t = getToken();
    if (t) {
      setToken(t);
      loadSaved(t);
      loadCollected(t);
    }
  }, []);

  // 课时切换时重新加载档案夹
  useEffect(() => {
    if (token && currentLessonCode) {
      loadCollected(token);
    }
  }, [selectedLessonCode, useCustom, customLesson]);

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(timer);
  }, [msg]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(''), 5000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  const loadSaved = async (t: string) => {
    try {
      const data = await resourceSearchSaved(t);
      if (data.found) {
        setSearchResult(data as SearchResult);
        // 回填课题
        if (data.lesson_title) {
          setCustomLesson(data.lesson_title);
          setUseCustom(true);
        }
      }
    } catch { /* 静默 */ }
  };

  const loadCollected = async (t?: string) => {
    const tk = t || token;
    if (!tk) return;
    setLoadingFolders(true);
    try {
      const data = await listCollectedResources(tk, undefined, currentLessonCode);
      setCollected(data.items || []);
    } catch { /* 静默 */ } finally {
      setLoadingFolders(false);
    }
  };

  const handleUnitChange = (code: string) => {
    setSelectedUnitCode(code);
    const unit = curriculum.find(u => u.code === code);
    if (unit && unit.lessons.length > 0) setSelectedLessonCode(unit.lessons[0].code);
  };

  const handleSearch = async () => {
    if (!token) { setErrorMsg('请先登录'); return; }
    if (!currentLessonTitle) { setErrorMsg('请输入或选择教学课题'); return; }
    setSearching(true);
    setErrorMsg('');
    setSearchResult(null);
    setSelected(new Set());
    try {
      const data = await resourceSearch(token, grade, subject, currentLessonTitle, textbookVersion);
      setSearchResult(data as SearchResult);
      setMsg(`AI检索完成：共 ${data.search_info?.after_filter ?? 0} 条优质资源`);
    } catch (e: any) {
      setErrorMsg(e.message || '检索失败，请稍后重试');
    } finally {
      setSearching(false);
    }
  };

  // 过滤+排序后的资源
  const visibleResources = useMemo(() => {
    if (!searchResult) return [];
    let list = [...searchResult.resources];
    if (filterType !== 'all') list = list.filter(r => r.resource_type === filterType);
    if (filterLayer !== 'all') list = list.filter(r => r.layer === filterLayer);
    if (sortBy === 'match') list.sort((a, b) => b.match_score - a.match_score);
    else if (sortBy === 'layer') {
      const order: Record<string, number> = { basic: 0, advanced: 1, extension: 2 };
      list.sort((a, b) => (order[a.layer] ?? 9) - (order[b.layer] ?? 9));
    } else if (sortBy === 'type') {
      list.sort((a, b) => a.resource_type.localeCompare(b.resource_type));
    }
    return list;
  }, [searchResult, filterType, filterLayer, sortBy]);

  // 勾选操作
  const toggleSelect = (title: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (visibleResources.every(r => selected.has(r.title))) {
      setSelected(prev => {
        const next = new Set(prev);
        visibleResources.forEach(r => next.delete(r.title));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        visibleResources.forEach(r => next.add(r.title));
        return next;
      });
    }
  };

  const addToFolder = async (layer: string) => {
    if (!token || selected.size === 0) return;
    const items = searchResult!.resources
      .filter(r => selected.has(r.title))
      .map(r => ({
        title: r.title,
        resource_type: r.resource_type,
        url: r.url,
        embed_url: r.embed_url || '',
        platform: r.platform,
        description: r.description,
        highlight: r.highlight,
        format: r.format,
        size: r.size,
        bvid: r.bvid || '',
        match_score: r.match_score,
      }));
    try {
      const res = await collectBatch(token, layer, items, undefined, currentLessonCode, currentLessonTitle);
      setMsg(res.message || '已加入档案');
      setSelected(new Set());
      loadCollected();
    } catch (e: any) {
      setErrorMsg(e.message || '加入档案失败');
    }
  };

  const removeCollected = async (id: number) => {
    if (!token) return;
    try {
      await deleteCollectedResource(token, id);
      setCollected(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      setErrorMsg(e.message || '删除失败');
    }
  };

  const collectedByLayer = useMemo(() => {
    const g: Record<string, CollectedResource[]> = { basic: [], advanced: [], extension: [] };
    collected.forEach(r => { (g[r.layer] || (g[r.layer] = [])).push(r); });
    return g;
  }, [collected]);

  return (
    <div className="pb-10">
      {/* 消息条 */}
      {msg && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
          <CheckCircle2 size={16} /> {msg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: '#FFEBEE', color: '#C62828' }}>
          <AlertTriangle size={16} /> {errorMsg}
        </div>
      )}

      {/* 标题 */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontWeight: 600, color: '#3D3D3D', fontFamily: 'var(--font-caveat), cursive' }}>
            全学科免费备课资源 AI 整合库
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7A756D' }}>
            真实联网检索 · AI审查去劣 · 重点标注 · 三层档案夹管理
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: '#EBF2EC' }}>
          <Shield className="w-4 h-4" style={{ color: '#6B8F71' }} />
          <span className="text-xs font-medium" style={{ color: '#6B8F71' }}>检索结果自动保存 · 切页不丢</span>
        </div>
      </div>

      {/* 检索区 */}
      <div className="paper-card sketchy p-5 mb-6" style={{ boxShadow: '3px 4px 0px rgba(60,60,60,0.10)' }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#7A756D' }}>年级</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}
              className="sketchy-sm w-full px-3 py-2 text-sm outline-none cursor-pointer"
              style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D', borderColor: '#B8B0A4' }}>
              <option>三年级</option><option>四年级</option><option>五年级</option><option>六年级</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#7A756D' }}>学科</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}
              className="sketchy-sm w-full px-3 py-2 text-sm outline-none cursor-pointer"
              style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D', borderColor: '#B8B0A4' }}>
              <option>数学</option><option>语文</option><option>英语</option><option>科学</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#7A756D' }}>教材版本</label>
            <select value={textbookVersion} onChange={(e) => setTextbookVersion(e.target.value)}
              className="sketchy-sm w-full px-3 py-2 text-sm outline-none cursor-pointer"
              style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D', borderColor: '#B8B0A4' }}>
              <option>人教版</option><option>北师大版</option><option>苏教版</option><option>西师大版</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#7A756D' }}>课题来源</label>
            <select value={useCustom ? 'custom' : 'curriculum'} onChange={(e) => setUseCustom(e.target.value === 'custom')}
              className="sketchy-sm w-full px-3 py-2 text-sm outline-none cursor-pointer"
              style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D', borderColor: '#B8B0A4' }}>
              <option value="curriculum">课程目录选择</option>
              <option value="custom">手动输入课题</option>
            </select>
          </div>
        </div>

        <div className="flex items-end gap-3">
          {useCustom ? (
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#7A756D' }}>教学课题</label>
              <input type="text" placeholder="例如：小数乘整数" value={customLesson}
                onChange={(e) => setCustomLesson(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                className="sketchy-sm w-full px-4 py-2.5 text-sm outline-none"
                style={{ backgroundColor: '#FDFBF7', color: '#3D3D3D', borderColor: '#B8B0A4' }} />
            </div>
          ) : (
            <>
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#7A756D' }}>单元</label>
                <select value={selectedUnitCode} onChange={(e) => handleUnitChange(e.target.value)}
                  className="sketchy-sm w-full px-3 py-2.5 text-sm outline-none cursor-pointer"
                  style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D', borderColor: '#B8B0A4' }}>
                  {curriculum.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#7A756D' }}>课时</label>
                <select value={selectedLessonCode} onChange={(e) => setSelectedLessonCode(e.target.value)}
                  className="sketchy-sm w-full px-3 py-2.5 text-sm outline-none cursor-pointer"
                  style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D', borderColor: '#B8B0A4' }}>
                  {selectedUnit.lessons.map(l => <option key={l.code} value={l.code}>{l.title}</option>)}
                </select>
              </div>
            </>
          )}
          <button onClick={handleSearch} disabled={searching}
            className="sketchy-sm px-6 py-2.5 text-sm font-bold flex items-center gap-2 transition-all duration-200 hover:rotate-1 disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: '#EBF2EC', color: '#6B8F71', border: '1.5px solid #6B8F71', boxShadow: '3px 4px 0px rgba(60,60,60,0.10)' }}>
            {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>{searching ? 'AI检索审查中...' : 'AI 智能检索'}</span>
          </button>
        </div>
      </div>

      {/* 加载中 */}
      {searching && (
        <div className="text-center py-16">
          <div className="inline-flex items-center gap-3 mb-4">
            <Sparkles className="w-6 h-6 animate-pulse" style={{ color: '#6B8F71' }} />
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: '#6B8F71' }} />
          </div>
          <p className="text-sm" style={{ color: '#7A756D' }}>
            正在百度、B站真实检索「{currentLessonTitle}」教学资源，AI同步审查去劣...
          </p>
          <p className="text-xs mt-2" style={{ color: '#9CA3AF' }}>联网检索 → 去重评分 → AI审查 → 分层归类 → 重点标注</p>
        </div>
      )}

      {/* 检索结果 */}
      {!searching && searchResult && (
        <div className="space-y-5">
          {/* AI审查报告 */}
          <div className="paper-card sketchy-alt p-4" style={{ background: '#F5EDE8', boxShadow: '2px 2px 0px rgba(60,60,60,0.08)' }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#C0785C' }}>
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: '#3D3D3D' }}>AI 智能体审查报告</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6B7FA020', color: '#6B7FA0' }}>
                    真实检索 {searchResult.search_info.total_found} 条
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EF535020', color: '#EF5350' }}>
                    AI 剔除 {searchResult.search_info.filtered_out ?? 0} 条
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6B8F7120', color: '#6B8F71' }}>
                    保留 {searchResult.search_info.after_filter} 条
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#5C6170' }}>{searchResult.ai_note}</p>
                {searchResult.platforms_summary.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#7A756D' }}>
                      <Layers className="w-3.5 h-3.5" /> 资源来源：
                    </span>
                    {searchResult.platforms_summary.map((p, i) => (
                      <span key={i} className="text-xs px-2.5 py-0.5 rounded-full" style={{ background: '#FDFBF7', color: '#5C6170' }}>
                        {p.name} <span style={{ color: '#C0785C', fontWeight: 600 }}>{p.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 筛选/排序 + 勾选工具条 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" style={{ color: '#7A756D' }} />
              {['all', '课件', '教案', '练习', '微课'].map(t => (
                <button key={t} onClick={() => setFilterType(t)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                  style={filterType === t ? { background: '#6B8F71', color: '#fff' } : { background: '#F0EBE0', color: '#7A756D' }}>
                  {t === 'all' ? '全部类型' : t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {['all', 'basic', 'advanced', 'extension'].map(l => (
                <button key={l} onClick={() => setFilterLayer(l)}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                  style={filterLayer === l ? { background: LAYER_CONFIG[l]?.soft || '#6B7FA0', color: '#fff' } : { background: '#F0EBE0', color: '#7A756D' }}>
                  {l === 'all' ? '全部层次' : LAYER_CONFIG[l].label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={toggleSelectAll}
                className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all"
                style={{ background: '#F0EBE0', color: '#5C6170' }}>
                {visibleResources.length > 0 && visibleResources.every(r => selected.has(r.title))
                  ? <CheckSquare size={14} /> : <Square size={14} />}
                {visibleResources.length > 0 && visibleResources.every(r => selected.has(r.title)) ? '取消全选' : '全选'}
              </button>
              <span className="text-xs" style={{ color: '#9CA3AF' }}>排序：</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs px-2 py-1.5 rounded-lg outline-none cursor-pointer"
                style={{ background: '#F0EBE0', color: '#3D3D3D', border: '1px solid #D6D0C6' }}>
                <option value="match">AI匹配度</option>
                <option value="layer">按层次</option>
                <option value="type">按类型</option>
              </select>
            </div>
          </div>

          {/* 勾选后浮出的加入档案条 */}
          {selected.size > 0 && (
            <div className="sticky top-2 z-10 paper-card sketchy p-3 flex items-center gap-3 flex-wrap" style={{ background: '#FFF8E7', boxShadow: '3px 4px 0px rgba(60,60,60,0.12)' }}>
              <span className="text-sm font-bold flex items-center gap-2" style={{ color: '#3D3D3D' }}>
                <CheckSquare size={16} style={{ color: '#C0785C' }} /> 已选 {selected.size} 项，加入档案：
              </span>
              {(['basic', 'advanced', 'extension'] as const).map(l => (
                <button key={l} onClick={() => addToFolder(l)}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all hover:scale-105"
                  style={{ background: LAYER_CONFIG[l].bg, color: LAYER_CONFIG[l].color, border: `1.5px solid ${LAYER_CONFIG[l].soft}` }}>
                  <FolderPlus size={14} /> {LAYER_CONFIG[l].label}档案
                </button>
              ))}
              <button onClick={() => setSelected(new Set())}
                className="ml-auto text-xs px-2 py-1 rounded-lg flex items-center gap-1" style={{ color: '#9CA3AF' }}>
                <X size={14} /> 清除
              </button>
            </div>
          )}

          {/* 资源卡片 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visibleResources.map((r, idx) => {
              const tc = resourceTypeConfig[r.resource_type] || resourceTypeConfig['课件'];
              const TypeIcon = tc.icon;
              const lc = LAYER_CONFIG[r.layer] || LAYER_CONFIG.basic;
              const checked = selected.has(r.title);
              const isVideo = r.resource_type === '微课' || !!r.embed_url;
              return (
                <div key={idx}
                  className="paper-card sketchy p-4 transition-all hover:scale-[1.01]"
                  style={{ boxShadow: '2px 2px 0px rgba(60,60,60,0.08)', border: checked ? '2px solid #C0785C' : undefined }}>
                  <div className="flex items-start gap-3">
                    {/* 勾选框 */}
                    <button onClick={() => toggleSelect(r.title)} className="mt-1 shrink-0" aria-label="选择">
                      {checked
                        ? <CheckSquare size={20} style={{ color: '#C0785C' }} />
                        : <Square size={20} style={{ color: '#C8C2B6' }} />}
                    </button>
                    {/* 类型图标 */}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: tc.bg }}>
                      <TypeIcon className="w-6 h-6" style={{ color: tc.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* 标题行 */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="text-sm font-bold leading-snug" style={{ color: '#3D3D3D' }}>{r.title}</h3>
                        <span className="text-xs px-1.5 py-0.5 rounded shrink-0 font-bold"
                          style={{ background: r.match_score >= 85 ? '#6B8F7120' : '#FFB86C20', color: r.match_score >= 85 ? '#6B8F71' : '#FF9F4A' }}>
                          {r.match_score}%
                        </span>
                      </div>

                      {/* 标签行 */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: tc.bg, color: tc.color }}>{r.resource_type}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: lc.bg, color: lc.color }}>{lc.label}适用</span>
                        <span className="text-xs" style={{ color: '#7A756D' }}>{r.platform}</span>
                        <span className="text-xs" style={{ color: '#9CA3AF' }}>· {r.format}{r.size ? ` · ${r.size}` : ''}</span>
                      </div>

                      {/* AI重点 */}
                      {r.highlight && (
                        <div className="mb-2 px-3 py-2 rounded-lg flex items-start gap-2" style={{ background: '#FFF8E7', border: '1px dashed #E0C97A' }}>
                          <Lightbulb size={15} className="shrink-0 mt-0.5" style={{ color: '#E0A800' }} />
                          <span className="text-xs leading-relaxed" style={{ color: '#7A6520' }}>
                            <b>重点：</b>{r.highlight}
                          </span>
                        </div>
                      )}

                      {/* 描述 */}
                      {r.description && r.description !== r.highlight && (
                        <p className="text-xs mb-2" style={{ color: '#5C6170', lineHeight: 1.5 }}>{r.description}</p>
                      )}

                      {/* 属性 + 操作 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.whiteboard_ready && (
                          <span className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: '#EBF0F7', color: '#6B7FA0' }}>
                            <Monitor className="w-3 h-3" /> 白板适配
                          </span>
                        )}
                        {isVideo && r.play_count != null && (
                          <span className="text-xs flex items-center gap-1" style={{ color: '#9CA3AF' }}>
                            <Download className="w-3 h-3" /> {r.play_count.toLocaleString()} 播放
                          </span>
                        )}
                        {r.url && r.url !== '#' ? (
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all hover:opacity-80 ml-auto"
                            style={{ background: '#C0785C', color: '#fff' }}>
                            <ExternalLink className="w-3.5 h-3.5" /> {isVideo ? '播放' : '访问'}
                          </a>
                        ) : (
                          <span className="text-xs px-3 py-1.5 rounded-lg ml-auto" style={{ background: '#F0EBE0', color: '#9CA3AF' }}>暂无链接</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {visibleResources.length === 0 && (
            <div className="text-center py-12 rounded-xl" style={{ background: '#F5F0E6', border: '2px dashed #D6D0C6' }}>
              <p className="text-sm" style={{ color: '#7A756D' }}>该筛选条件下暂无资源</p>
            </div>
          )}
        </div>
      )}

      {/* 空状态 */}
      {!searching && !searchResult && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style={{ background: '#EBF2EC' }}>
            <Search className="w-10 h-10" style={{ color: '#6B8F71' }} />
          </div>
          <p className="text-lg" style={{ color: '#7A756D', fontFamily: 'var(--font-caveat), cursive' }}>
            输入教学课题，AI真实联网检索 + 审查去劣 + 重点标注
          </p>
          <p className="text-sm mt-2" style={{ color: '#9CA3AF' }}>
            勾选资源加入下方三层档案夹，随时备分层教学使用
          </p>
        </div>
      )}

      {/* ===== 三层档案夹（按课时分开） ===== */}
      <div className="mt-10">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen size={20} style={{ color: '#C0785C' }} />
          <h2 className="text-xl" style={{ fontWeight: 600, color: '#3D3D3D', fontFamily: 'var(--font-caveat), cursive' }}>
            我的备课档案夹
          </h2>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ background: '#EBF2EC', color: '#6B8F71' }}>
            课时：{currentLessonTitle}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F0EBE0', color: '#7A756D' }}>
            共 {collected.length} 条
          </span>
          <button onClick={() => loadCollected()} className="ml-auto text-xs px-2 py-1 rounded-lg flex items-center gap-1" style={{ color: '#9CA3AF' }}>
            <RefreshCw size={12} /> 刷新
          </button>
        </div>

        {/* 档案夹 Tab */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(['basic', 'advanced', 'extension'] as const).map(l => {
            const lc = LAYER_CONFIG[l];
            const active = folderLayer === l;
            return (
              <button key={l} onClick={() => setFolderLayer(l)}
                className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
                style={active
                  ? { background: lc.color, color: '#fff', boxShadow: '2px 3px 0px rgba(60,60,60,0.12)' }
                  : { background: lc.bg, color: lc.color }}>
                <FolderOpen size={16} /> {lc.label}档案
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={active ? { background: '#ffffff30' } : { background: '#ffffff80', color: lc.color }}>
                  {collectedByLayer[l]?.length || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* 当前档案夹内容 */}
        <div className="paper-card sketchy p-4" style={{ boxShadow: '2px 2px 0px rgba(60,60,60,0.08)' }}>
          {loadingFolders ? (
            <div className="text-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" style={{ color: '#9CA3AF' }} />
              <p className="text-xs" style={{ color: '#9CA3AF' }}>加载中...</p>
            </div>
          ) : (collectedByLayer[folderLayer]?.length || 0) === 0 ? (
            <div className="text-center py-8">
              <FolderOpen size={32} className="mx-auto mb-2" style={{ color: '#D6D0C6' }} />
              <p className="text-sm" style={{ color: '#9CA3AF' }}>
                {LAYER_CONFIG[folderLayer].label}档案夹还是空的，去上方勾选资源加入吧
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {collectedByLayer[folderLayer].map(r => {
                const tc = resourceTypeConfig[r.resource_type] || resourceTypeConfig['课件'];
                const TypeIcon = tc.icon;
                const isVideo = r.resource_type === '微课' || !!r.embed_url;
                return (
                  <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: '#FDFBF7', border: '1px solid #ECE6DA' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: tc.bg }}>
                      <TypeIcon className="w-4 h-4" style={{ color: tc.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold leading-snug flex items-center gap-1.5" style={{ color: '#3D3D3D' }}>
                          {r.is_ai_generated && <Sparkles size={13} style={{ color: '#C8A951', flexShrink: 0 }} />}
                          {r.title}
                        </h4>
                        <button onClick={() => removeCollected(r.id)}
                          className="text-xs p-1 rounded shrink-0 transition-all hover:bg-red-50"
                          style={{ color: '#C62828' }} aria-label="删除">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: tc.bg, color: tc.color }}>{r.resource_type || '资源'}</span>
                        {r.is_ai_generated ? (
                          <span className="text-xs flex items-center gap-1" style={{ color: '#B8A870' }}><Sparkles size={10} /> AI 智能生成</span>
                        ) : (
                          <span className="text-xs" style={{ color: '#7A756D' }}>{r.platform}</span>
                        )}
                      </div>
                      {(r.highlight || r.description) && (
                        <p className="text-xs leading-relaxed flex items-start gap-1" style={{ color: '#7A6520' }}>
                          <Lightbulb size={13} className="shrink-0 mt-0.5" style={{ color: '#E0A800' }} />
                          {r.highlight || r.description}
                        </p>
                      )}
                    </div>
                    {r.url && r.url !== '#' && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 shrink-0 self-center"
                        style={{ background: '#EBF2EC', color: '#6B8F71' }}>
                        <ExternalLink size={12} /> {isVideo ? '播放' : '访问'}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
