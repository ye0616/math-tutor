'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Search, Trash2, Edit3, Download, FileText, Image as ImageIcon, File, RefreshCw, X, FolderOpen, Filter,
  Sparkles, ExternalLink, Video, FileQuestion, BookOpen, Monitor, Lightbulb, Star,
} from 'lucide-react';
import { curriculum } from '@/lib/curriculum';
import {
  getToken, uploadResource, listLibraryResources, deleteLibraryResource, updateLibraryResource,
  resourceSearch, collectBatch,
  type LibraryResource, type CollectedResource,
} from '@/lib/api';

const CATEGORIES = ['历年真题', '地区习题', '教学素材', '试卷', '教案', '其他'];

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function getFileIcon(fileType: string, fileName: string) {
  if (fileType.startsWith('image/')) return ImageIcon;
  if (fileType.includes('pdf') || fileName.endsWith('.pdf')) return FileText;
  return File;
}

// AI 搜寻结果类型
interface AISearchResource {
  title: string;
  platform: string;
  resource_type: string;
  format: string;
  size: string;
  url: string;
  embed_url?: string;
  thumbnail?: string;
  play_count?: number;
  match_score: number;
  layer: string;
  highlight: string;
  description: string;
}

interface AISearchResult {
  lesson_title: string;
  search_info: { total_found: number; after_filter: number; filtered_out: number };
  ai_note: string;
  resources: AISearchResource[];
  platforms_summary: { name: string; count: number }[];
}

const resourceTypeConfig: Record<string, { label: string; icon: typeof FileText; color: string; bg: string }> = {
  '课件': { label: '课件', icon: Monitor, color: '#6B7FA0', bg: '#EBF0F7' },
  '教案': { label: '教案', icon: FileText, color: '#C0785C', bg: '#F5EDE8' },
  '练习': { label: '练习', icon: FileQuestion, color: '#6B8F71', bg: '#EBF2EC' },
  '微课': { label: '微课', icon: Video, color: '#9C7BB8', bg: '#F3E8F9' },
};

export default function ResourceLibrary() {
  const [token, setToken] = useState('');
  const [resources, setResources] = useState<LibraryResource[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ t: string; c: 'success' | 'error' | 'info' } | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showEdit, setShowEdit] = useState<LibraryResource | null>(null);

  // AI 搜寻状态
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResult, setAiResult] = useState<AISearchResult | null>(null);
  const [aiError, setAiError] = useState('');
  const [grade, setGrade] = useState('五年级');
  const [subject, setSubject] = useState('数学');
  const [textbookVersion, setTextbookVersion] = useState('人教版');
  const [selectedUnitCode, setSelectedUnitCode] = useState(curriculum[1].code);
  const [selectedLessonCode, setSelectedLessonCode] = useState(curriculum[1].lessons[0].code);
  const [customLesson, setCustomLesson] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  // Upload form
  const [upTitle, setUpTitle] = useState('');
  const [upCategory, setUpCategory] = useState('历年真题');
  const [upGrade, setUpGrade] = useState('五年级');
  const [upSemester, setUpSemester] = useState('');
  const [upDesc, setUpDesc] = useState('');
  const [upTags, setUpTags] = useState('');
  const [upFile, setUpFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedUnit = curriculum.find(u => u.code === selectedUnitCode) || curriculum[0];
  const selectedLesson = selectedUnit.lessons.find(l => l.code === selectedLessonCode) || selectedUnit.lessons[0];
  const currentLessonTitle = useCustom ? customLesson.trim() : selectedLesson.title;

  const show = (t: string, c: 'success' | 'error' | 'info' = 'info') => { setMsg({ t, c }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => { const t = getToken(); if (t) setToken(t); }, []);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await listLibraryResources(token, filterCategory || undefined, undefined, searchQ || undefined);
      setResources(r.resources || []);
      setTotal(r.total || 0);
    } catch (e: any) { show(e.message || '加载失败', 'error'); }
    finally { setLoading(false); }
  }, [token, filterCategory, searchQ]);

  useEffect(() => { if (token) loadData(); }, [token, loadData]);

  const handleUnitChange = (code: string) => {
    setSelectedUnitCode(code);
    const unit = curriculum.find(u => u.code === code);
    if (unit && unit.lessons.length > 0) setSelectedLessonCode(unit.lessons[0].code);
  };

  // AI 搜寻
  const handleAiSearch = async () => {
    if (!token) { setAiError('请先登录'); return; }
    if (!currentLessonTitle) { setAiError('请输入或选择教学课题'); return; }
    setAiSearching(true);
    setAiError('');
    setAiResult(null);
    try {
      const data = await resourceSearch(token, grade, subject, currentLessonTitle, textbookVersion);
      setAiResult(data as AISearchResult);
    } catch (e: any) {
      setAiError(e.message || 'AI 检索失败，请稍后重试');
    } finally {
      setAiSearching(false);
    }
  };

  // 加入备课档案夹
  const handleCollectToFolder = async (layer: string) => {
    if (!token || !aiResult) return;
    const items = aiResult.resources.map(r => ({
      title: r.title,
      resource_type: r.resource_type,
      url: r.url,
      embed_url: r.embed_url || '',
      platform: r.platform,
      description: r.description,
      highlight: r.highlight,
      format: r.format,
      size: r.size,
      match_score: r.match_score,
    }));
    try {
      const res = await collectBatch(token, layer, items, undefined, selectedLessonCode, currentLessonTitle);
      show(res.message || '已加入备课档案夹', 'success');
    } catch (e: any) {
      show(e.message || '加入档案失败', 'error');
    }
  };

  const handleUpload = async () => {
    if (!upTitle.trim()) return show('请输入资源标题', 'error');
    if (!upFile) return show('请选择文件', 'error');
    if (!token) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title', upTitle);
      fd.append('category', upCategory);
      fd.append('grade', upGrade);
      fd.append('semester', upSemester);
      fd.append('description', upDesc);
      fd.append('tags', upTags);
      fd.append('file', upFile);
      await uploadResource(token, fd);
      show('上传成功', 'success');
      setShowUpload(false);
      setUpTitle(''); setUpDesc(''); setUpTags(''); setUpFile(null); setUpSemester('');
      loadData();
    } catch (e: any) { show(e.message || '上传失败', 'error'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此资源？文件将被永久删除。')) return;
    if (!token) return;
    try {
      await deleteLibraryResource(token, id);
      show('已删除', 'success');
      loadData();
    } catch (e: any) { show(e.message || '删除失败', 'error'); }
  };

  const handleSaveEdit = async () => {
    if (!showEdit || !token) return;
    try {
      await updateLibraryResource(token, showEdit.id, {
        title: showEdit.title, category: showEdit.category, grade: showEdit.grade,
        semester: showEdit.semester, description: showEdit.description, tags: showEdit.tags,
      });
      show('已更新', 'success');
      setShowEdit(null);
      loadData();
    } catch (e: any) { show(e.message || '更新失败', 'error'); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setUpFile(f);
      if (!upTitle) setUpTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#5C6170', fontFamily: 'var(--font-hand), cursive' }}>
            <span className="pencil-underline">资源库</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7A756D' }}>AI 辅助搜寻 + 本地资源管理</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{ borderColor: '#B8B0A4', color: '#5C6170' }}>
            <RefreshCw className="w-3.5 h-3.5" />刷新
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{ backgroundColor: '#5C6170' }}>
            <Upload className="w-4 h-4" />上传资源
          </button>
        </div>
      </div>

      {msg && <div className="px-4 py-2 rounded-md text-sm" style={{ backgroundColor: msg.c === 'error' ? 'rgba(192,120,92,0.12)' : msg.c === 'success' ? 'rgba(107,143,113,0.12)' : 'rgba(212,168,67,0.12)', color: msg.c === 'error' ? '#C0785C' : msg.c === 'success' ? '#6B8F71' : '#9A7B2A' }}>{msg.t}</div>}

      {/* ===== AI 辅助搜寻区 ===== */}
      <div className="paper-card sketchy p-5" style={{ boxShadow: '3px 4px 0px rgba(60,60,60,0.10)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5" style={{ color: '#6B8F71' }} />
          <h2 className="text-lg font-bold" style={{ color: '#3D3D3D' }}>AI 辅助搜寻</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EBF2EC', color: '#6B8F71' }}>真实联网检索 · AI 审查去劣</span>
        </div>

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
                onKeyDown={(e) => { if (e.key === 'Enter') handleAiSearch(); }}
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
          <button onClick={handleAiSearch} disabled={aiSearching}
            className="sketchy-sm px-6 py-2.5 text-sm font-bold flex items-center gap-2 transition-all duration-200 hover:rotate-1 disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: '#EBF2EC', color: '#6B8F71', border: '1.5px solid #6B8F71', boxShadow: '3px 4px 0px rgba(60,60,60,0.10)' }}>
            {aiSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>{aiSearching ? 'AI检索中...' : 'AI 智能检索'}</span>
          </button>
        </div>

        {/* AI 错误提示 */}
        {aiError && (
          <div className="mt-4 px-4 py-2 rounded-md text-sm" style={{ backgroundColor: 'rgba(192,120,92,0.1)', color: '#C0785C' }}>
            {aiError}
          </div>
        )}

        {/* AI 搜索中 */}
        {aiSearching && (
          <div className="mt-4 text-center py-8">
            <div className="inline-flex items-center gap-3 mb-3">
              <Sparkles className="w-6 h-6 animate-pulse" style={{ color: '#6B8F71' }} />
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: '#6B8F71' }} />
            </div>
            <p className="text-sm" style={{ color: '#7A756D' }}>
              正在百度、B站真实检索「{currentLessonTitle}」教学资源，AI同步审查去劣...
            </p>
            <p className="text-xs mt-2" style={{ color: '#9CA3AF' }}>联网检索 → 去重评分 → AI审查 → 重点标注</p>
          </div>
        )}

        {/* AI 搜索结果 */}
        {!aiSearching && aiResult && (
          <div className="mt-4 space-y-4">
            {/* AI 审查报告 */}
            <div className="p-3 rounded-lg flex items-start gap-3" style={{ background: '#F5EDE8' }}>
              <Sparkles className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#C0785C' }} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: '#3D3D3D' }}>AI 审查报告</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6B7FA020', color: '#6B7FA0' }}>检索 {aiResult.search_info.total_found} 条</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6B8F7120', color: '#6B8F71' }}>保留 {aiResult.search_info.after_filter} 条</span>
                  <button onClick={() => handleCollectToFolder('basic')}
                    className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto"
                    style={{ background: '#6B8F71', color: '#fff' }}>
                    全部加入备课档案
                  </button>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#5C6170' }}>{aiResult.ai_note}</p>
              </div>
            </div>

            {/* 资源卡片 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {aiResult.resources.map((r, idx) => {
                const tc = resourceTypeConfig[r.resource_type] || resourceTypeConfig['课件'];
                const TypeIcon = tc.icon;
                const isVideo = r.resource_type === '微课' || !!r.embed_url;
                return (
                  <div key={idx} className="paper-card sketchy p-3 transition-all hover:scale-[1.01]" style={{ boxShadow: '2px 2px 0px rgba(60,60,60,0.08)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: tc.bg }}>
                        <TypeIcon className="w-5 h-5" style={{ color: tc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-sm font-bold leading-snug" style={{ color: '#3D3D3D' }}>{r.title}</h4>
                          <span className="text-xs px-1.5 py-0.5 rounded shrink-0 font-bold"
                            style={{ background: r.match_score >= 85 ? '#6B8F7120' : '#FFB86C20', color: r.match_score >= 85 ? '#6B8F71' : '#FF9F4A' }}>
                            {r.match_score}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: tc.bg, color: tc.color }}>{r.resource_type}</span>
                          <span className="text-xs" style={{ color: '#7A756D' }}>{r.platform}</span>
                        </div>
                        {r.highlight && (
                          <p className="text-xs mb-1.5 flex items-start gap-1" style={{ color: '#7A6520' }}>
                            <Lightbulb size={12} className="shrink-0 mt-0.5" style={{ color: '#E0A800' }} />
                            {r.highlight}
                          </p>
                        )}
                        {r.url && r.url !== '#' ? (
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded font-medium"
                            style={{ background: '#C0785C', color: '#fff' }}>
                            <ExternalLink className="w-3 h-3" /> {isVideo ? '播放' : '访问'}
                          </a>
                        ) : (
                          <span className="text-xs" style={{ color: '#9CA3AF' }}>暂无链接</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {aiResult.resources.length === 0 && (
              <div className="text-center py-8 rounded-lg" style={{ background: '#F5F0E6', border: '2px dashed #D6D0C6' }}>
                <p className="text-sm" style={{ color: '#7A756D' }}>未找到相关资源，试试其他课题</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== 本地资源库 ===== */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen size={20} style={{ color: '#5C6170' }} />
          <h2 className="text-xl font-bold" style={{ color: '#5C6170' }}>我的资源库</h2>
          <span className="text-xs" style={{ color: '#7A756D' }}>共 {total} 个资源</span>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={{ color: '#7A756D' }} />
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="sketchy-sm px-3 py-2 text-sm bg-transparent outline-none cursor-pointer" style={{ color: '#3D3D3D', backgroundColor: '#FDFBF7' }}>
              <option value="">全部分类</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#B8B0A4' }} />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadData(); }} placeholder="搜索标题、描述、标签..." className="w-full pl-10 pr-4 py-2 text-sm rounded-md border outline-none" style={{ borderColor: '#D6D0C6', backgroundColor: '#FDFBF7' }} />
          </div>
        </div>

        {/* Resources grid */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">加载中...</div>
        ) : resources.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources.map(r => {
              const Icon = getFileIcon(r.file_type, r.file_name);
              const downloadUrl = `/uploads/${r.file_path}`;
              return (
                <div key={r.id} className="paper-card sketchy p-4 transition-all hover:shadow-lg" style={{ boxShadow: 'var(--shadow-teacher-card)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-8 h-8" style={{ color: '#5C6170' }} />
                      <span className="text-xs px-2 py-0.5 rounded-sm" style={{ backgroundColor: 'rgba(92,97,112,0.12)', color: '#5C6170' }}>{r.category}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setShowEdit(r)} className="text-xs p-1 rounded" style={{ color: '#5C6170' }}><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(r.id)} className="text-xs p-1 rounded" style={{ color: '#C0785C' }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <h3 className="font-bold text-base mb-1" style={{ color: '#3D3D3D' }}>{r.title}</h3>
                  {r.description && <p className="text-xs mb-2" style={{ color: '#7A756D' }}>{r.description}</p>}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {r.grade && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F0EBE0', color: '#7A756D' }}>{r.grade}</span>}
                    {r.semester && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F0EBE0', color: '#7A756D' }}>{r.semester}</span>}
                    {r.tags && r.tags.split(',').map((t, i) => t.trim() && <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(192,120,92,0.1)', color: '#C0785C' }}>{t.trim()}</span>)}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed" style={{ borderColor: '#D6D0C6' }}>
                    <div className="text-xs" style={{ color: '#7A756D' }}>
                      {r.file_name} · {formatSize(r.file_size)}
                    </div>
                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download={r.file_name} className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(92,97,112,0.1)', color: '#5C6170' }}>
                      <Download className="w-3 h-3" />下载
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 rounded-lg" style={{ background: '#F5F0E6', border: '2px dashed #D6D0C6' }}>
            <FolderOpen className="w-16 h-16 mx-auto mb-4" style={{ color: '#D6D0C6' }} />
            <p className="text-gray-400 mb-2">资源库还是空的</p>
            <p className="text-xs text-gray-400">点击"上传资源"添加历年真题、地区习题等文件</p>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowUpload(false)}>
          <div className="paper-card sketchy p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#FDFBF7' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: '#5C6170' }}>上传资源</h2>
              <button onClick={() => setShowUpload(false)}><X className="w-4 h-4" style={{ color: '#7A756D' }} /></button>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: '#7A756D' }}>标题 *</label>
              <input value={upTitle} onChange={e => setUpTitle(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} placeholder="如: 2024年期中考试数学真题" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium" style={{ color: '#7A756D' }}>分类</label>
                <select value={upCategory} onChange={e => setUpCategory(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6', backgroundColor: '#FDFBF7' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: '#7A756D' }}>年级</label>
                <input value={upGrade} onChange={e => setUpGrade(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: '#7A756D' }}>学期</label>
                <input value={upSemester} onChange={e => setUpSemester(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} placeholder="上/下" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: '#7A756D' }}>描述</label>
              <input value={upDesc} onChange={e => setUpDesc(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} placeholder="简短描述" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: '#7A756D' }}>标签（逗号分隔）</label>
              <input value={upTags} onChange={e => setUpTags(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} placeholder="如: 期中,2024,人教版" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: '#7A756D' }}>文件 *</label>
              <div onClick={() => fileRef.current?.click()} className="mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all hover:bg-gray-50" style={{ borderColor: upFile ? '#6B8F71' : '#D6D0C6' }}>
                {upFile ? (
                  <div>
                    <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: '#6B8F71' }} />
                    <p className="text-sm" style={{ color: '#3D3D3D' }}>{upFile.name}</p>
                    <p className="text-xs" style={{ color: '#7A756D' }}>{formatSize(upFile.size)}</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: '#B8B0A4' }} />
                    <p className="text-sm" style={{ color: '#7A756D' }}>点击选择文件</p>
                    <p className="text-xs" style={{ color: '#B8B0A4' }}>支持 PDF/Word/PPT/Excel/图片/ZIP</p>
                  </div>
                )}
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
              </div>
            </div>
            <button onClick={handleUpload} disabled={uploading} className="w-full px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#5C6170' }}>
              {uploading ? '上传中...' : '确认上传'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowEdit(null)}>
          <div className="paper-card sketchy p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#FDFBF7' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: '#5C6170' }}>编辑资源</h2>
              <button onClick={() => setShowEdit(null)}><X className="w-4 h-4" style={{ color: '#7A756D' }} /></button>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: '#7A756D' }}>标题</label>
              <input value={showEdit.title} onChange={e => setShowEdit({ ...showEdit, title: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium" style={{ color: '#7A756D' }}>分类</label>
                <select value={showEdit.category} onChange={e => setShowEdit({ ...showEdit, category: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6', backgroundColor: '#FDFBF7' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: '#7A756D' }}>年级</label>
                <input value={showEdit.grade} onChange={e => setShowEdit({ ...showEdit, grade: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: '#7A756D' }}>学期</label>
                <input value={showEdit.semester} onChange={e => setShowEdit({ ...showEdit, semester: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: '#7A756D' }}>描述</label>
              <input value={showEdit.description} onChange={e => setShowEdit({ ...showEdit, description: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: '#7A756D' }}>标签（逗号分隔）</label>
              <input value={showEdit.tags} onChange={e => setShowEdit({ ...showEdit, tags: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: '#D6D0C6' }} />
            </div>
            <button onClick={handleSaveEdit} className="w-full px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{ backgroundColor: '#5C6170' }}>保存</button>
          </div>
        </div>
      )}
    </div>
  );
}