'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers, FileText, Sparkles, RefreshCw, CheckCircle2,
  StickyNote, Lightbulb, Pencil, Download,
  Send, BarChart3, X, Users, Video,
  TrendingUp, Target, Brain, AlertCircle,
  FolderOpen, Folder, Presentation, Book, BookOpen,
  Search, Filter, ChevronDown, ChevronRight, PlayCircle,
  HelpCircle, AlertTriangle, Bookmark, BookmarkPlus, Trash2,
  ExternalLink, Eye, FileText as FileTextIcon,
  Undo2, RotateCcw, Wand2, MessagesSquare, ArrowRight, Save,
} from 'lucide-react';
import { curriculum, type Unit, type Lesson } from '@/lib/curriculum';
import {
  getToken, classMyList, generateTeachContent, publishPreview,
  listPreviews, previewReport, type ClassInfo,
  collectResource, listCollectedResources, deleteCollectedResource, collectBatch,
  loadSavedTeach, type CollectedResource,
  fetchPreviewProxy, type PreviewProxyResult,
  fetchResolveUrl,
  generatePreviewMaterial,
  generateBlackboard, unpublishPreview, republishPreview, deletePreview,
  generateInquiry, saveInquiry as apiSaveInquiry, loadInquiry as apiLoadInquiry,
  type InquiryResult,
} from '@/lib/api';

// ===== 类型定义 =====

interface ResourceItem {
  title: string;
  platform: string;
  platform_url?: string;
  url?: string;
  format?: string;
  size?: string;
  description: string;
  whiteboard_ready?: boolean;
  match_score?: number;
  bvid?: string;
  page?: number;
  embed_url?: string;
  duration?: number;
  highlight?: string;
  layer?: string;
  resource_type?: string;
  is_ai_generated?: boolean;
  is_kb_fallback?: boolean;
  is_real?: boolean;       // 真实搜索结果标记
  ai_content?: any;
  snippet?: string;         // 搜索结果摘要
  source?: string;          // 搜索结果来源
}

interface ResourceFolder {
  title: string;
  icon: string;
  color: string;
  items: {
    basic: ResourceItem[];
    advanced: ResourceItem[];
    extension: ResourceItem[];
  };
}

interface AgentStep {
  step: number;
  action: string;
  text: string;
  icon: string;
}

interface PreviewQuestion {
  question: string;
  type: string;
  difficulty: string;
  layer?: string;
  answer: string;
  analysis: string;
  knowledge_point?: string;
  options?: string[];
  ai_generated?: boolean;
}

interface TeachOutput {
  agent_steps?: AgentStep[];
  resource_folders?: Record<string, ResourceFolder>;
  knowledge_points?: string[];
  search_source?: string;
  ai_powered?: boolean;
  ai_model?: string;
  layer1_preview?: { title?: string; basic?: string[]; advanced?: string[]; extension?: string[] };
  layer_videos?: Record<string, any>;
  preview_questions?: PreviewQuestion[];
  layer2_inquiry?: { title?: string; stages?: { stage: string; duration: string; questions: string[] }[] };
  layer3_blackboard?: { title?: string; main_board?: string; side_board?: string; interactive_element?: string };
  search_info?: { total_found?: number; after_filter?: number; filtered_out?: number };
  ai_note?: string;
}

interface QuestionStat {
  question_id: number;
  question_text: string;
  difficulty: string;
  knowledge_point?: string;
  correct_answer: string;
  total_answers: number;
  correct_count: number;
  accuracy: number;
  wrong_students: { name: string; student_no: string }[];
}

interface PreviewTask {
  id: number;
  lesson_code: string;
  lesson_title: string;
  unit_code: string;
  preview_content: string;
  created_at: string;
  status?: string;
  questions: QuestionStat[];
  total_submissions: number;
  total_students: number;
  submission_rate: number;
  avg_accuracy: number;
  question_count: number;
}

interface AIReport {
  task: { id: number; lesson_title: string; lesson_code: string; created_at: string };
  summary: { total_students: number; total_submissions: number; submission_rate: number; total_questions: number; avg_accuracy: number };
  question_reports: any[];
  error_top: any[];
  knowledge_ranking: any[];
  layer_analysis: any[];
  ai_recommendations: string[];
  focus_questions: any[];
  mastered_questions: any[];
}

// ===== 常量 =====

const diffLayers = [
  { key: 'basic', label: '基础层', short: '基础', bg: '#EBF2EC', text: '#6B8F71', border: '#6B8F71', icon: 'A', desc: '全员必做 · 适配学困生' },
  { key: 'advanced', label: '提升层', short: '提升', bg: '#EBF0F7', text: '#6B7FA0', border: '#6B7FA0', icon: 'B', desc: '大部分选做 · 适配中等生' },
  { key: 'extension', label: '拓展层', short: '拓展', bg: '#F5EDE8', text: '#C0785C', border: '#C0785C', icon: 'C', desc: '学优生选做 · 拔高训练' },
];

const folderIcons: Record<string, any> = {
  courseware: Presentation,
  lesson_plan: BookOpen,
  exercises: Pencil,
  videos: Video,
};

const agentStepIcons: Record<string, any> = {
  search: Search,
  presentation: Presentation,
  book: Book,
  pencil: Pencil,
  video: Video,
  filter: Filter,
  sparkles: Sparkles,
  check: CheckCircle2,
};

// ===== 组件 =====

export default function TeacherLesson() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedUnitCode, setSelectedUnitCode] = useState(curriculum[1].code);
  const [selectedLessonCode, setSelectedLessonCode] = useState(curriculum[1].lessons[0].code);
  const [generating, setGenerating] = useState(false);
  const [agentStepIdx, setAgentStepIdx] = useState(-1);
  const [teachData, setTeachData] = useState<TeachOutput | null>(null);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 发布弹窗
  const [showPublish, setShowPublish] = useState(false);
  const [publishClassId, setPublishClassId] = useState(0);
  const [publishing, setPublishing] = useState(false);

  // 生成预习资料
  const [generatingMaterial, setGeneratingMaterial] = useState(false);
  const [materialData, setMaterialData] = useState<any>(null);
  const [showMaterialEdit, setShowMaterialEdit] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);

  // 预习统计
  const [previewTasks, setPreviewTasks] = useState<PreviewTask[]>([]);
  const [statsClassId, setStatsClassId] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);

  // 检索完成弹窗
  const [searchReport, setSearchReport] = useState<any>(null);

  // AI学情报告
  const [reportTaskId, setReportTaskId] = useState(0);
  const [report, setReport] = useState<AIReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // 资源勾选 + 批量入档
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  // 三层档案夹
  const [collectedResources, setCollectedResources] = useState<CollectedResource[]>([]);
  const [collectedLayer, setCollectedLayer] = useState<string>('basic');
  const [loadingCollected, setLoadingCollected] = useState(false);
  const [batching, setBatching] = useState(false);

  // 文档内嵌查看
  const [viewingResource, setViewingResource] = useState<ResourceItem | null>(null);
  const [viewingProxyData, setViewingProxyData] = useState<PreviewProxyResult | null>(null);
  const [viewingProxyLoading, setViewingProxyLoading] = useState(false);
  const [viewingProxyError, setViewingProxyError] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);

  // AI 板书设计生成
  const [generatingBoard, setGeneratingBoard] = useState(false);
  // 撤回/重新发布
  const [revokingId, setRevokingId] = useState(0);

  // AI 交互式探索提问
  const [generatingInquiry, setGeneratingInquiry] = useState(false);
  const [inquiryData, setInquiryData] = useState<InquiryResult | null>(null);
  const [loadingInquiry, setLoadingInquiry] = useState(false);

  const selectedUnit = curriculum.find(u => u.code === selectedUnitCode) || curriculum[0];
  const selectedLesson = selectedUnit.lessons.find(l => l.code === selectedLessonCode) || selectedUnit.lessons[0];

  useEffect(() => {
    const t = getToken();
    if (t) { setToken(t); loadClasses(t); loadCollected(t); }
  }, []);

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(''), 5000);
    return () => clearTimeout(timer);
  }, [msg]);

  // token 变化时重新加载备课档案夹（确保切换页面后记录不丢失）
  useEffect(() => {
    if (token) loadCollected(token);
  }, [token]);

  // statsClassId 变化时自动加载预习反馈统计（确保切换页面/班级后统计持久保留）
  useEffect(() => {
    if (token && statsClassId) loadStats(statsClassId);
  }, [statsClassId, token]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(''), 5000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  // 切换课时 → 尝试加载已存的教学结果
  useEffect(() => {
    if (!token) return;
    loadSavedTeach(token, selectedLessonCode).then((data: any) => {
      if (data.found && data.output) {
        setTeachData(data.output);
        if (data.output.resource_folders) {
          const firstKey = Object.keys(data.output.resource_folders)[0];
          setExpandedFolder(firstKey);
        }
      } else {
        setTeachData(null);
      }
    }).catch(() => { /* 静默 */ });
  }, [selectedLessonCode, token]);

  const handleUnitChange = (code: string) => {
    setSelectedUnitCode(code);
    const unit = curriculum.find(u => u.code === code);
    if (unit?.lessons.length) setSelectedLessonCode(unit.lessons[0].code);
  };

  const loadClasses = async (t: string) => {
    try {
      const data = await classMyList(t);
      setClasses(data.classes || []);
      if (data.classes?.length > 0) {
        setPublishClassId(data.classes[0].id);
        setStatsClassId(data.classes[0].id);
      }
    } catch (e: any) { setErrorMsg(e.message || '获取班级列表失败'); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg('');
    setTeachData(null);
    setExpandedFolder(null);
    setAgentStepIdx(-1);
    setSelectedItems(new Set());

    // 启动agent步骤动画
    const steps = [
      'search', 'presentation', 'book', 'pencil', 'video', 'filter', 'sparkles', 'check'
    ];
    let idx = 0;
    const stepInterval = setInterval(() => {
      if (idx < steps.length) {
        setAgentStepIdx(idx);
        idx++;
      } else {
        clearInterval(stepInterval);
      }
    }, 400);

    try {
      const data = await generateTeachContent(token, selectedLessonCode, selectedLesson.title, selectedUnitCode);
      clearInterval(stepInterval);
      setAgentStepIdx(steps.length - 1);
      setTeachData(data.output || null);
      // 默认展开第一个文件夹
      if (data.output?.resource_folders) {
        const firstKey = Object.keys(data.output.resource_folders)[0];
        setExpandedFolder(firstKey);
      }
      const info = data.output?.search_info;
      const afterFilter = info?.after_filter ?? 0;
      const filteredOut = info?.filtered_out ?? 0;
      setSearchReport({
        total_found: info?.total_found ?? 0,
        filtered_out: filteredOut,
        after_filter: afterFilter,
        ai_note: data.output?.ai_note || '',
      });
    } catch (e: any) {
      clearInterval(stepInterval);
      setErrorMsg(e.message || '生成失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  // 生成预习资料（AI 智能体）
  const handleGenerateMaterial = async () => {
    if (!teachData) { setErrorMsg('请先生成备课内容'); return; }
    setGeneratingMaterial(true);
    setErrorMsg('');
    setMaterialData(null);
    try {
      const result = await generatePreviewMaterial(token, {
        lesson_code: selectedLessonCode,
        lesson_title: selectedLesson.title,
        unit_code: selectedUnitCode,
        resource_folders: teachData.resource_folders || {},
        layer_videos: teachData.layer_videos || {},
        knowledge_points: teachData.knowledge_points || [],
        preview_questions: teachData.preview_questions || [],
      });
      setMaterialData(result);
      setEditingMaterial(JSON.parse(JSON.stringify(result))); // 深拷贝用于编辑
      setShowMaterialEdit(true);
      setMsg('AI 预习资料生成完成，请预览编辑后发布');
    } catch (e: any) {
      setErrorMsg(e.message || '生成预习资料失败，请重试');
    } finally {
      setGeneratingMaterial(false);
    }
  };

  // 发布预习资料（含结构化 material_json）
  const handlePublish = async () => {
    if (!publishClassId) { setErrorMsg('请先创建班级'); return; }
    if (!teachData) return;
    setPublishing(true);
    setErrorMsg('');
    try {
      const previewContent = JSON.stringify(teachData.layer1_preview || {});
      const inquiryContent = JSON.stringify(teachData.layer2_inquiry || {});
      const boardContent = JSON.stringify(teachData.layer3_blackboard || {});
      const layerVideos = JSON.stringify(teachData.layer_videos || {});
      // 优先使用 editingMaterial（AI生成/编辑后）的题目，降级到 teachData 原始题目
      let questions: Array<{question: string; type: string; difficulty: string; answer: string; analysis: string; knowledge_point: string; options: string[]}>;
      if (editingMaterial?.preview_questions) {
        // material_json 的 preview_questions 是按层分组的 dict: {basic: [...], advanced: [...], extension: [...]}
        const matQs = editingMaterial.preview_questions as Record<string, Array<any>>;
        questions = [];
        for (const layer of ['basic', 'advanced', 'extension'] as const) {
          for (const q of (matQs[layer] || [])) {
            questions.push({
              question: q.question || '', type: q.type || 'fill', difficulty: layer,
              answer: q.answer || '', analysis: q.analysis || '', knowledge_point: q.knowledge_point || '',
              options: q.options || [],
            });
          }
        }
      } else {
        questions = (teachData.preview_questions || []).map(q => ({
          question: q.question, type: q.type || 'choice', difficulty: q.difficulty || 'basic',
          answer: q.answer, analysis: q.analysis || '', knowledge_point: q.knowledge_point || '',
          options: q.options || [],
        }));
      }
      const materialJson = editingMaterial ? JSON.stringify(editingMaterial) : '';
      await publishPreview(token, {
        class_id: publishClassId, lesson_code: selectedLessonCode, lesson_title: selectedLesson.title,
        unit_code: selectedUnitCode, preview_content: previewContent, inquiry_content: inquiryContent,
        board_content: boardContent, layer_videos: layerVideos, questions, material_json: materialJson,
      });
      setMsg(`预习资料已发布到「${classes.find(c => c.id === publishClassId)?.name}」`);
      setShowPublish(false);
      setShowMaterialEdit(false);
      setMaterialData(null);
      setEditingMaterial(null);
      loadStats(statsClassId);
    } catch (e: any) { setErrorMsg(e.message || '发布失败'); }
    finally { setPublishing(false); }
  };

  const handleCollect = async (item: ResourceItem, layer: string, folderKey: string) => {
    if (!token) { setErrorMsg('请先登录'); return; }
    try {
      const layerLabelMap: Record<string, string> = { basic: '基础生', advanced: '提升生', extension: '拓展生' };
      const resourceTypeMap: Record<string, string> = {
        courseware: '课件', lesson_plan: '教案', exercises: '练习', videos: '微课',
      };
      await collectResource(token, {
        layer,
        lesson_code: selectedLessonCode,
        lesson_title: selectedLesson.title,
        resource_type: resourceTypeMap[folderKey] || folderKey,
        title: item.title,
        url: item.platform_url || '',
        embed_url: item.embed_url || '',
        platform: item.platform || '',
        description: item.description || '',
        highlight: item.highlight || '',
        format: item.format || '',
        size: item.size || '',
        bvid: item.bvid || '',
        match_score: item.match_score || 0,
        class_id: statsClassId || 0,
        is_ai_generated: item.is_ai_generated || false,
        is_real: item.is_real || false,
        ai_content: item.ai_content || null,
      } as any);
      setMsg(`已加入「${layerLabelMap[layer] || layer}档案」`);
      loadCollected();
    } catch (e: any) {
      setErrorMsg(e.message || '加入档案失败');
    }
  };

  // 打开资源：AI文档 → 直接渲染结构化内容，视频 → 跳转 view 页面，其他文档 → 代理抓取
  const handleOpenResource = (item: ResourceItem) => {
    const isVideo = !!item.bvid || item.resource_type === '微课' || item.resource_type === 'videos';
    if (isVideo) {
      const params = new URLSearchParams();
      params.set('title', item.title || '');
      if (item.platform_url) params.set('url', item.platform_url);
      if (item.url) params.set('url', item.url);
      params.set('platform', item.platform || '');
      params.set('type', item.resource_type || '');
      if (item.bvid) params.set('bvid', item.bvid);
      if (item.embed_url) params.set('embed_url', item.embed_url);
      if (item.duration) params.set('duration', String(item.duration));
      router.push(`/teacher/lesson/view?${params.toString()}`);
      return;
    }
    // AI 生成内容或知识库兜底内容：直接渲染结构化内容，无需代理抓取
    if ((item.is_ai_generated || item.is_kb_fallback) && item.ai_content) {
      setViewingResource(item);
      setViewingProxyData(null);
      setViewingProxyError('');
      setViewingProxyLoading(false);
      return;
    }
    // 真实搜索结果（百度搜索）：直接展示描述 + 打开原链接按钮，不走代理抓取
    if (item.is_real && !item.is_ai_generated && !item.is_kb_fallback) {
      setViewingResource(item);
      setViewingProxyData(null);
      setViewingProxyError('');
      setViewingProxyLoading(false);
      return;
    }
    // 其他文档类：代理抓取
    const docUrl = item.platform_url || item.url || '';
    setViewingResource(item);
    setViewingProxyData(null);
    setViewingProxyError('');
    const fileFormats = ['PPT', 'PPTX', 'DOC', 'DOCX', 'PDF', 'XLS', 'XLSX', 'ZIP', 'RAR', '7Z'];
    if (fileFormats.includes((item.format || '').toUpperCase())) {
      setViewingProxyData({ success: false, error: 'FILE_FORMAT', title: '', description: '', text: '', text_length: 0, images: [], final_url: docUrl, status_code: 0 } as PreviewProxyResult);
      return;
    }
    if (docUrl && token) {
      setViewingProxyLoading(true);
      fetchPreviewProxy(token, docUrl)
        .then((res) => { setViewingProxyData(res); setViewingProxyLoading(false); })
        .catch((err) => { setViewingProxyError(err.message || '获取内容失败'); setViewingProxyLoading(false); });
    }
  };

  // 检测 AI 内容类型
  const detectAIContentType = (aiContent: any): 'courseware' | 'lesson_plan' | 'exercises' | null => {
    if (!aiContent) return null;
    if (aiContent.sections?.length > 0) return 'courseware';
    if (aiContent.teaching_process?.length > 0) return 'lesson_plan';
    if (aiContent.questions?.length > 0) return 'exercises';
    return null;
  };

  // 渲染 AI 生成内容（课件/教案/练习三种格式）
  const renderAIContent = () => {
    if (!viewingResource?.ai_content) return null;
    const ac = viewingResource.ai_content;
    const aiType = detectAIContentType(ac);
    const layerColorMap: Record<string, string> = { basic: '#6B8F71', advanced: '#6B7FA0', extension: '#C0785C' };
    const lc = layerColorMap[viewingResource.layer || 'basic'] || '#6B8F71';

    // ===== 课件 =====
    if (aiType === 'courseware') {
      return (
        <div className="space-y-4">
          {ac.knowledge_points?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Brain className="w-4 h-4" style={{ color: '#9C7BB8' }} />
              <span className="text-xs font-medium" style={{ color: '#7A756D' }}>知识点：</span>
              {ac.knowledge_points.map((kp: string, i: number) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full" style={{ background: '#F3E8F9', color: '#9C7BB8' }}>{kp}</span>
              ))}
            </div>
          )}
          {ac.sections?.map((section: any, i: number) => (
            <div key={i} className="rounded-xl p-4" style={{ background: `${lc}08`, border: `1px solid ${lc}25` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: lc }}>{i + 1}</span>
                <span className="text-sm font-bold" style={{ color: lc }}>{section.phase}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap mb-3" style={{ color: '#3D3D3D', lineHeight: 1.9 }}>{section.content}</p>
              {section.examples?.map((ex: any, j: number) => (
                <div key={j} className="mt-2 rounded-lg p-3" style={{ background: '#FDFBF7', border: '1px solid rgba(184,176,164,0.2)' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: '#3D3D3D' }}>例题{j + 1}：{ex.question}</p>
                  <p className="text-sm whitespace-pre-wrap mb-1" style={{ color: '#5D5040', lineHeight: 1.8 }}>{ex.solution}</p>
                  {ex.tip && <p className="text-xs flex items-start gap-1.5" style={{ color: '#C8A951' }}><Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />{ex.tip}</p>}
                </div>
              ))}
              {section.exercises?.map((ex: any, j: number) => (
                <div key={j} className="mt-2 rounded-lg p-3" style={{ background: '#FDFBF7', border: '1px solid rgba(184,176,164,0.2)' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: '#3D3D3D' }}>练习{j + 1}：{ex.question}</p>
                  {ex.answer && <p className="text-xs" style={{ color: '#6B8F71' }}>答案：{ex.answer}</p>}
                  {ex.hint && <p className="text-xs" style={{ color: '#9CA3AF' }}>提示：{ex.hint}</p>}
                </div>
              ))}
            </div>
          ))}
          {ac.board_design && (
            <div className="rounded-xl p-4" style={{ background: '#3D4A3E' }}>
              <div className="flex items-center gap-2 mb-2"><StickyNote className="w-4 h-4 text-white/80" /><span className="text-xs font-bold text-white/80">板书设计</span></div>
              <pre className="text-sm whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-caveat), cursive', lineHeight: 1.8 }}>{ac.board_design}</pre>
            </div>
          )}
        </div>
      );
    }

    // ===== 教案 =====
    if (aiType === 'lesson_plan') {
      return (
        <div className="space-y-4">
          {ac.objectives && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { label: '知识与技能', content: ac.objectives.knowledge, color: '#6B7FA0', bg: '#EBF0F7' },
                { label: '过程与方法', content: ac.objectives.process, color: '#6B8F71', bg: '#EBF2EC' },
                { label: '情感态度', content: ac.objectives.emotion, color: '#C0785C', bg: '#F5EDE8' },
              ].map((obj, i) => obj.content ? (
                <div key={i} className="rounded-lg p-3" style={{ background: obj.bg, border: `1px solid ${obj.color}30` }}>
                  <p className="text-xs font-bold mb-1" style={{ color: obj.color }}>{obj.label}</p>
                  <p className="text-xs" style={{ color: '#3D3D3D', lineHeight: 1.7 }}>{obj.content}</p>
                </div>
              ) : null)}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ac.key_points?.length > 0 && (
              <div className="rounded-lg p-3" style={{ background: '#EBF2EC', borderLeft: '3px solid #6B8F71' }}>
                <p className="text-xs font-bold mb-2" style={{ color: '#6B8F71' }}>教学重点</p>
                {ac.key_points.map((kp: string, i: number) => <p key={i} className="text-xs mb-1" style={{ color: '#3D3D3D' }}>· {kp}</p>)}
              </div>
            )}
            {ac.difficult_points?.length > 0 && (
              <div className="rounded-lg p-3" style={{ background: '#FFEBEE', borderLeft: '3px solid #EF5350' }}>
                <p className="text-xs font-bold mb-2" style={{ color: '#EF5350' }}>教学难点</p>
                {ac.difficult_points.map((dp: string, i: number) => <p key={i} className="text-xs mb-1" style={{ color: '#3D3D3D' }}>· {dp}</p>)}
                {ac.difficult_breakthrough?.map((db: string, i: number) => <p key={`b${i}`} className="text-xs mt-1 flex items-start gap-1" style={{ color: '#6B8F71' }}><Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />{db}</p>)}
              </div>
            )}
          </div>
          {ac.teaching_process?.length > 0 && (
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: '#3D3D3D' }}>教学过程</p>
              <div className="space-y-3">
                {ac.teaching_process.map((proc: any, i: number) => (
                  <div key={i} className="rounded-lg p-3" style={{ background: `${lc}08`, borderLeft: `3px solid ${lc}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg" style={{ fontFamily: 'var(--font-caveat), cursive', color: lc }}>{'\u2460\u2461\u2462\u2463\u2464'[i] || (i + 1)}</span>
                      <span className="text-sm font-bold" style={{ color: '#3D3D3D' }}>{proc.phase}</span>
                    </div>
                    {proc.activities?.map((act: string, j: number) => (
                      <p key={j} className="text-xs mb-1 flex items-start gap-1.5" style={{ color: '#5C6170' }}><span style={{ color: lc }}>·</span>{act}</p>
                    ))}
                    {proc.teacher_guide && (
                      <p className="text-xs mt-2 pl-2.5 py-0.5 flex items-start gap-1.5" style={{ borderLeft: '2px solid #D4C5A0', color: '#8A7F6B' }}><Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#C8A951' }} />教师引导：{proc.teacher_guide}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {ac.board_design && (
            <div className="rounded-xl p-4" style={{ background: '#3D4A3E' }}>
              <div className="flex items-center gap-2 mb-2"><StickyNote className="w-4 h-4 text-white/80" /><span className="text-xs font-bold text-white/80">板书设计</span></div>
              <pre className="text-sm whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-caveat), cursive', lineHeight: 1.8 }}>{ac.board_design}</pre>
            </div>
          )}
          {ac.teaching_tips?.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: '#F5EDE8', border: '1px solid #C0785C30' }}>
              <p className="text-xs font-bold mb-2" style={{ color: '#C0785C' }}>教学建议</p>
              {ac.teaching_tips.map((tip: string, i: number) => <p key={i} className="text-xs mb-1 flex items-start gap-1.5" style={{ color: '#5D5040' }}><Lightbulb className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#C8A951' }} />{tip}</p>)}
            </div>
          )}
        </div>
      );
    }

    // ===== 练习 =====
    if (aiType === 'exercises') {
      return (
        <div className="space-y-3">
          {ac.questions?.map((q: any, i: number) => {
            const typeColors: Record<string, string> = { '选择题': '#6B7FA0', '填空题': '#6B8F71', '计算题': '#C0785C', '应用题': '#9C7BB8', '变式题': '#FFA726', '挑战题': '#EF5350', '探究题': '#26A69A', '思维题': '#7E57C2' };
            const tc = typeColors[q.type] || '#7A756D';
            return (
              <div key={i} className="rounded-lg p-4" style={{ background: '#FDFBF7', border: `1px solid ${tc}30` }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: tc }}>{i + 1}</span>
                  {q.type && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${tc}15`, color: tc }}>{q.type}</span>}
                  {q.knowledge_point && <span className="text-xs" style={{ color: '#9CA3AF' }}>{q.knowledge_point}</span>}
                </div>
                <p className="text-sm font-medium mb-2" style={{ color: '#3D3D3D', lineHeight: 1.7 }}>{q.question}</p>
                {q.options?.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mb-2">
                    {q.options.map((opt: string, j: number) => (
                      <p key={j} className="text-xs px-2 py-1.5 rounded" style={{ background: '#F5F0E6', color: '#3D3D3D' }}>{opt}</p>
                    ))}
                  </div>
                )}
                <div className="mt-2 pt-2" style={{ borderTop: '1px dashed rgba(184,176,164,0.3)' }}>
                  <p className="text-xs mb-1" style={{ color: '#6B8F71' }}><b>答案：</b>{q.answer}</p>
                  {q.analysis && <p className="text-xs whitespace-pre-wrap" style={{ color: '#7A756D', lineHeight: 1.7 }}><b>解析：</b>{q.analysis}</p>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="py-12 text-center">
        <FileTextIcon className="w-8 h-8 mx-auto mb-3" style={{ color: '#C8B88A' }} />
        <p className="text-sm" style={{ color: '#7A756D' }}>AI 内容格式未知</p>
      </div>
    );
  };

  // 打开原文：先通过后端解析真实地址（百度跳转链接 → 具体文档页）
  const handleOpenOriginal = async (rawUrl: string) => {
    if (!rawUrl || !token) return;
    setResolvingUrl(true);
    try {
      const res = await fetchResolveUrl(token, rawUrl);
      window.open(res.resolved_url || rawUrl, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setResolvingUrl(false);
    }
  };

  // ===== 资源勾选 =====
  const toggleSelect = (key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedCount = selectedItems.size;

  // 从 TeachOutput 中按 key 查找资源项
  const findItemByKey = (key: string): ResourceItem | null => {
    if (!teachData?.resource_folders) return null;
    const [folderKey, layer, idxStr] = key.split('||');
    const idx = parseInt(idxStr, 10);
    const folder = teachData.resource_folders[folderKey];
    if (!folder) return null;
    const items = (folder.items as any)[layer] || [];
    return items[idx] || null;
  };

  // 批量入档
  const handleBatchCollect = async (layer: string) => {
    if (!token || selectedCount === 0) return;
    setBatching(true);
    try {
      const resourceTypeMap: Record<string, string> = {
        courseware: '课件', lesson_plan: '教案', exercises: '练习', videos: '微课',
      };
      const items: any[] = [];
      selectedItems.forEach(key => {
        const item = findItemByKey(key);
        if (item) {
          const [folderKey] = key.split('||');
          items.push({
            title: item.title,
            resource_type: resourceTypeMap[folderKey] || folderKey,
            url: item.platform_url || '',
            embed_url: item.embed_url || '',
            platform: item.platform || '',
            description: item.highlight || item.description || '',
            highlight: item.highlight || '',
            format: item.format || '',
            size: item.size || '',
            bvid: item.bvid || '',
            match_score: item.match_score || 0,
          });
        }
      });
      if (items.length === 0) { setBatching(false); return; }
      const resp = await collectBatch(token, layer, items, statsClassId || undefined, selectedLessonCode, selectedLesson.title);
      const layerName = { basic: '基础生', advanced: '提升生', extension: '拓展生' }[layer] || layer;
      setMsg(`已将 ${items.length} 条资源加入「${layerName}档案」`);
      setSelectedItems(new Set());
      loadCollected(token);
    } catch (e: any) {
      setErrorMsg(e.message || '批量入档失败');
    } finally {
      setBatching(false);
    }
  };

  // 加载收藏列表
  const loadCollected = async (tk?: string) => {
    const useToken = tk || token;
    if (!useToken) return;
    setLoadingCollected(true);
    try {
      const data = await listCollectedResources(useToken, undefined, selectedLessonCode);
      setCollectedResources(data.items || []);
    } catch { /* 静默 */ }
    finally { setLoadingCollected(false); }
  };

  // 删除收藏
  const handleDeleteCollected = async (itemId: number) => {
    if (!token) return;
    try {
      await deleteCollectedResource(token, itemId);
      setCollectedResources(prev => prev.filter(r => r.id !== itemId));
      setMsg('已从档案夹移除');
    } catch (e: any) {
      setErrorMsg(e.message || '删除失败');
    }
  };

  const handleViewReport = async (taskId: number) => {
    setReportTaskId(taskId); setShowReport(true); setLoadingReport(true); setReport(null);
    try { setReport(await previewReport(token, taskId)); }
    catch (e: any) { setErrorMsg(e.message || '获取报告失败'); }
    finally { setLoadingReport(false); }
  };

  const loadStats = async (classId: number) => {
    if (!classId || !token) return;
    setLoadingStats(true);
    try { setPreviewTasks((await listPreviews(token, classId)).tasks || []); }
    catch (e: any) { setErrorMsg(e.message || '获取统计失败'); }
    finally { setLoadingStats(false); }
  };

  const handleStatsClassChange = (classId: number) => { setStatsClassId(classId); loadStats(classId); };

  // AI 重新生成板书设计
  const handleGenerateBoard = async () => {
    if (!token || !teachData) return;
    setGeneratingBoard(true);
    setErrorMsg('');
    try {
      const kp = teachData.knowledge_points || [];
      const previewText = teachData.layer1_preview
        ? [teachData.layer1_preview.basic, teachData.layer1_preview.advanced, teachData.layer1_preview.extension]
            .flat().join('；')
        : '';
      const result = await generateBlackboard(token, {
        lesson_title: selectedLesson.title,
        knowledge_points: kp,
        preview_content: previewText,
      });
      setTeachData({
        ...teachData,
        layer3_blackboard: {
          title: result.blackboard.title,
          main_board: result.blackboard.main_board,
          side_board: result.blackboard.side_board,
        },
      });
      setMsg('AI 板书设计生成成功');
    } catch (e: any) {
      setErrorMsg(e.message || 'AI 生成板书设计失败，请重试');
    } finally {
      setGeneratingBoard(false);
    }
  };

  // ===== AI 交互式探索提问 =====
  const handleGenerateInquiry = async () => {
    if (!token) return;
    setGeneratingInquiry(true);
    setErrorMsg('');
    try {
      const unitInfo = selectedUnit ? `五年级上册 ${selectedUnit.name}` : '';
      const result = await generateInquiry(token, {
        lesson_title: selectedLesson.title,
        unit_info: unitInfo,
        difficulty: 'mixed',
      });
      if (result.success && result.data) {
        setInquiryData(result.data);
        setMsg('AI 交互式提问生成成功');
      } else {
        setErrorMsg('AI 生成交互式提问失败');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'AI 生成交互式提问失败，请重试');
    } finally {
      setGeneratingInquiry(false);
    }
  };

  // 加载已保存的探索提问
  const handleLoadInquiry = async () => {
    if (!token || !selectedLesson) return;
    setLoadingInquiry(true);
    try {
      const result = await apiLoadInquiry(token, selectedLesson.code);
      if (result.success && result.data) {
        const saved = result.data;
        if (saved.inquiry_json) {
          try {
            const parsed = JSON.parse(saved.inquiry_json);
            setInquiryData(parsed);
          } catch {}
        }
      }
    } catch {} finally {
      setLoadingInquiry(false);
    }
  };

  // 保存探索提问
  const handleSaveInquiry = async () => {
    if (!token || !inquiryData || !selectedLesson) return;
    try {
      await apiSaveInquiry(token, {
        lesson_code: selectedLesson.code,
        lesson_title: selectedLesson.title,
        unit_code: selectedUnit?.code || '',
        inquiry_json: JSON.stringify(inquiryData),
      });
      setMsg('探索提问已保存');
    } catch (e: any) {
      setErrorMsg('保存失败');
    }
  };

  // 切换课时时自动加载探索提问
  useEffect(() => {
    if (token && selectedLesson) {
      handleLoadInquiry();
    }
  }, [selectedLesson?.code]);

  // 撤回预习发布
  const handleUnpublish = async (taskId: number) => {
    if (!token) return;
    if (!confirm('确定撤回此预习任务吗？撤回后学生端将不再可见，学生已提交的答案仍保留。')) return;
    setRevokingId(taskId);
    setErrorMsg('');
    try {
      await unpublishPreview(token, taskId);
      setMsg('预习任务已撤回');
      loadStats(statsClassId);
    } catch (e: any) {
      setErrorMsg(e.message || '撤回失败');
    } finally {
      setRevokingId(0);
    }
  };

  // 重新发布
  const handleRepublish = async (taskId: number) => {
    if (!token) return;
    if (!confirm('确定重新发布此预习任务吗？学生端将恢复可见。')) return;
    setRevokingId(taskId);
    setErrorMsg('');
    try {
      await republishPreview(token, taskId);
      setMsg('预习任务已重新发布');
      loadStats(statsClassId);
    } catch (e: any) {
      setErrorMsg(e.message || '重新发布失败');
    } finally {
      setRevokingId(0);
    }
  };

  // 彻底删除已撤回的预习任务
  const handleDelete = async (taskId: number) => {
    if (!token) return;
    if (!confirm('确定彻底删除此预习任务吗？\n\n删除后无法恢复，相关的学生答题记录、观看记录也将一并删除。')) return;
    setRevokingId(taskId);
    setErrorMsg('');
    try {
      await deletePreview(token, taskId);
      setMsg('预习任务已彻底删除');
      loadStats(statsClassId);
    } catch (e: any) {
      setErrorMsg(e.message || '删除失败');
    } finally {
      setRevokingId(0);
    }
  };

  // ===== 渲染 =====

  return (
    <div>
      {msg && <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: '#E8F5E9', color: '#2E7D32' }}><CheckCircle2 size={16} /> {msg}</div>}
      {errorMsg && <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: '#FFEBEE', color: '#C62828' }}><AlertTriangle size={16} /> {errorMsg}</div>}

      {/* 顶部选择区 */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" style={{ color: '#7A756D' }} />
            <select value={selectedUnitCode} onChange={(e) => handleUnitChange(e.target.value)}
              className="sketchy-sm px-3 py-2 text-sm font-medium outline-none cursor-pointer"
              style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D', borderColor: '#B8B0A4' }}>
              {curriculum.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: '#7A756D' }} />
            <select value={selectedLessonCode} onChange={(e) => setSelectedLessonCode(e.target.value)}
              className="sketchy-sm px-3 py-2 text-sm font-medium outline-none cursor-pointer max-w-xs"
              style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D', borderColor: '#B8B0A4' }}>
              {selectedUnit.lessons.map(l => <option key={l.code} value={l.code}>{l.title}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="sketchy-sm px-5 py-2.5 text-sm font-medium flex items-center gap-2 transition-all duration-200 hover:rotate-1 disabled:opacity-50"
          style={{ backgroundColor: '#EBF2EC', color: '#6B8F71', border: '1.5px solid #6B8F71', boxShadow: '3px 4px 0px rgba(60,60,60,0.10)' }}>
          {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{generating ? '智能体检索中...' : 'AI 智能体检索'}</span>
        </button>
      </div>

      {/* Agent 检索动画 */}
      {generating && teachData?.agent_steps && (
        <div className="paper-card sketchy p-5 mb-6" style={{ boxShadow: '2px 2px 0px rgba(60,60,60,0.08)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 animate-pulse" style={{ color: '#6B8F71' }} />
            <span className="text-lg font-bold" style={{ color: '#3D3D3D', fontFamily: 'var(--font-caveat), cursive' }}>
              智能体正在为「{selectedLesson.title}」检索教学资源...
            </span>
          </div>
          <div className="space-y-2">
            {teachData.agent_steps.map((s, i) => {
              const Icon = agentStepIcons[s.icon] || CheckCircle2;
              const done = i <= agentStepIdx;
              return (
                <div key={s.step} className={`flex items-center gap-3 transition-all duration-300 ${done ? 'opacity-100' : 'opacity-30'}`}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all"
                    style={{ background: done ? '#6B8F71' : '#F0EBE0' }}>
                    {done ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Icon className="w-3.5 h-3.5" style={{ color: '#B8B0A4' }} />}
                  </div>
                  <span className="text-sm" style={{ color: done ? '#3D3D3D' : '#9CA3AF' }}>{s.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent 动画（无steps数据时用默认动画） */}
      {generating && !teachData?.agent_steps && (
        <div className="paper-card sketchy p-5 mb-6 text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" style={{ color: '#6B8F71' }} />
          <p className="text-sm" style={{ color: '#7A756D' }}>正在为「{selectedLesson.title}」检索教学资源...</p>
        </div>
      )}

      {/* ===== 4个手帐风资源文件夹 ===== */}
      {!generating && teachData?.resource_folders && (
        <div className="mb-6">
          {/* 知识点标签 */}
          {teachData.knowledge_points && teachData.knowledge_points.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Brain className="w-4 h-4" style={{ color: '#9C7BB8' }} />
              <span className="text-xs font-medium" style={{ color: '#7A756D' }}>本课知识点：</span>
              {teachData.knowledge_points.map((kp, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full" style={{ background: '#F3E8F9', color: '#9C7BB8' }}>{kp}</span>
              ))}
            </div>
          )}

          {/* 文件夹网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(teachData.resource_folders).map(([folderKey, folder]) => {
              const Icon = folderIcons[folderKey] || Folder;
              const isExpanded = expandedFolder === folderKey;
              const totalItems = (folder.items.basic?.length || 0) + (folder.items.advanced?.length || 0) + (folder.items.extension?.length || 0);
              const color = folder.color || '#7A756D';

              return (
                <div key={folderKey}
                  className="relative cursor-pointer transition-all duration-300"
                  style={{ transform: isExpanded ? 'scale(1.02)' : 'scale(1)' }}
                  onClick={() => setExpandedFolder(isExpanded ? null : folderKey)}
                >
                  {/* 文件夹tab标签 */}
                  <div className="flex justify-center mb-[-1px]">
                    <div className="px-4 py-1.5 rounded-t-lg text-xs font-bold transition-all"
                      style={{
                        background: isExpanded ? color : `${color}30`,
                        color: isExpanded ? '#fff' : color,
                        fontFamily: 'var(--font-caveat), cursive',
                        fontSize: '1.1rem',
                        transform: isExpanded ? 'translateY(-2px)' : 'none',
                      }}>
                      {folder.title}
                    </div>
                  </div>
                  {/* 文件夹主体 */}
                  <div className="rounded-xl p-4 transition-all duration-300"
                    style={{
                      background: isExpanded ? '#FDFBF7' : `${color}12`,
                      border: `2px solid ${isExpanded ? color : `${color}40`}`,
                      boxShadow: isExpanded ? `4px 4px 0px ${color}20` : '2px 2px 0px rgba(60,60,60,0.06)',
                      minHeight: '140px',
                    }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4" style={{ color }} /> : <ChevronRight className="w-4 h-4" style={{ color: '#B8B0A4' }} />}
                    </div>
                    {!isExpanded ? (
                      <div>
                        <p className="text-sm font-bold mb-1" style={{ color: '#3D3D3D' }}>{folder.title}</p>
                        <p className="text-xs" style={{ color: '#9CA3AF' }}>{totalItems} 份资源 · 点击展开</p>
                        {/* 缩略预览 */}
                        <div className="mt-2 flex gap-1">
                          {diffLayers.map(l => {
                            const cnt = (folder.items as any)[l.key]?.length || 0;
                            return cnt > 0 ? <span key={l.key} className="text-xs px-1.5 py-0.5 rounded" style={{ background: l.bg, color: l.border }}>{l.short}{cnt}</span> : null;
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-medium" style={{ color }}>{totalItems} 份资源</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 展开的文件夹内容 */}
          {expandedFolder && teachData.resource_folders[expandedFolder] && (
            <div className="mt-4 paper-card sketchy p-5" style={{ boxShadow: '3px 3px 0px rgba(60,60,60,0.08)', animation: 'fadeInUp 0.3s ease' }}>
              {(() => {
                const folder = teachData.resource_folders[expandedFolder];
                const Icon = folderIcons[expandedFolder] || Folder;
                const color = folder.color;
                return (
                  <>
                    <div className="flex items-center gap-2 mb-5 pb-3" style={{ borderBottom: `2px dashed ${color}40` }}>
                      <Icon className="w-5 h-5" style={{ color }} />
                      <span className="text-lg font-bold" style={{ color: '#3D3D3D', fontFamily: 'var(--font-caveat), cursive' }}>{folder.title}</span>
                      <span className="text-xs" style={{ color: '#9CA3AF' }}>— 分层资源详情</span>
                    </div>
                    <div className="space-y-4">
                      {diffLayers.map(({ key, label, bg, text, border, icon, desc }) => {
                        const items: ResourceItem[] = (folder.items as any)[key] || [];
                        if (items.length === 0) return null;
                        return (
                          <div key={key} className="rounded-xl p-4" style={{ background: bg, borderLeft: `3px solid ${border}` }}>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: border }}>{icon}</span>
                              <span className="text-sm font-bold" style={{ color: text }}>{label}</span>
                              <span className="text-xs" style={{ color: '#9CA3AF' }}>{desc}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded ml-auto" style={{ background: `${border}20`, color: text }}>{items.length} 份</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {items.map((item: ResourceItem, i: number) => {
                                const itemKey = `${expandedFolder}||${key}||${i}`;
                                const isSelected = selectedItems.has(itemKey);
                                return (
                                <div key={i} className="relative">
                                  {/* 勾选框 */}
                                  <label className="absolute top-2 right-2 z-10 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(itemKey)}
                                      className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: border }} />
                                  </label>
                                  {/* 微课视频卡片 */}
                                  {item.bvid ? (
                                    <div
                                      className="rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-md"
                                      onClick={() => handleOpenResource(item)}
                                      style={{ background: '#fff', border: isSelected ? `2px solid ${border}` : `1px solid ${border}30` }}>
                                      <div className="aspect-video relative flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2d2d3a 0%, #1a1a24 100%)' }}>
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                                          <PlayCircle className="w-6 h-6 text-white" />
                                        </div>
                                        {item.duration && (
                                          <span className="absolute bottom-2 right-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                                            {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                                          </span>
                                        )}
                                      </div>
                                      <div className="p-3">
                                        <div className="flex items-start gap-2 mb-1 pr-6">
                                          <span className="text-xs font-bold flex-1" style={{ color: text }}>{item.title}</span>
                                        </div>
                                        <p className="text-xs mb-1" style={{ color: '#9CA3AF' }}>{item.platform}</p>
                                        {item.highlight && (
                                          <div className="mb-2 pl-2.5 py-0.5 text-xs flex items-start gap-1.5" style={{ borderLeft: '2px solid #D4C5A0' }}>
                                            <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#C8A951' }} />
                                            <span style={{ color: '#8A7F6B' }}>{item.highlight}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                    {/* 普通资源卡片 */}
                                    <div
                                      className="rounded-lg p-3 h-full cursor-pointer transition-all hover:shadow-md relative overflow-hidden"
                                      onClick={() => handleOpenResource(item)}
                                      style={{ background: isSelected ? `${border}08` : '#FDFBF7', border: isSelected ? `2px solid ${border}` : item.is_ai_generated ? `1px solid rgba(200,169,81,0.35)` : `1px solid ${border}25` }}>
                                      {/* AI 生成角标 */}
                                      {item.is_ai_generated && (
                                        <div className="absolute top-0 right-0">
                                          <div className="px-2 py-0.5 text-[10px] font-bold rounded-bl-lg flex items-center gap-1" style={{ background: 'linear-gradient(135deg, #C8A951, #D4C5A0)', color: '#fff' }}>
                                            <Sparkles className="w-2.5 h-2.5" /> AI
                                          </div>
                                        </div>
                                      )}
                                      <div className="flex items-start justify-between gap-2 mb-2 pr-6">
                                        <div className="flex-1">
                                          <p className="text-sm font-bold mb-0.5 flex items-center gap-1.5" style={{ color: '#3D3D3D' }}>
                                            {item.is_ai_generated && <Sparkles className="w-3 h-3 shrink-0" style={{ color: '#C8A951' }} />}
                                            {item.title}
                                          </p>
                                          <p className="text-xs" style={{ color: item.is_ai_generated ? '#B8A870' : '#9CA3AF' }}>
                                            {item.is_ai_generated ? 'AI 智能生成' : item.platform}
                                          </p>
                                        </div>
                                        {item.match_score && (
                                          <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${border}15`, color: text }}>匹配{item.match_score}%</span>
                                        )}
                                      </div>
                                      {item.highlight && (
                                        <div className="mb-2 pl-2.5 py-0.5 text-xs flex items-start gap-1.5" style={{ borderLeft: '2px solid #D4C5A0' }}>
                                          <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#C8A951' }} />
                                          <span style={{ color: '#8A7F6B' }}>{item.highlight}</span>
                                        </div>
                                      )}
                                      <p className="text-xs mb-2" style={{ color: '#7A756D' }}>{item.description}</p>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {item.format && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: item.is_ai_generated ? 'rgba(200,169,81,0.12)' : '#F0EBE0', color: item.is_ai_generated ? '#B8A870' : '#7A756D' }}>{item.format}</span>}
                                        {item.size && <span className="text-xs" style={{ color: '#9CA3AF' }}>{item.size}</span>}
                                        {item.whiteboard_ready && (
                                          <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#EBF2EC', color: '#6B8F71' }}>
                                            <CheckCircle2 className="w-3 h-3" /> 白板适配
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    </>
                                  )}
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* 批量入档工具条 */}
          {selectedCount > 0 && (
            <div className="mt-4 sticky bottom-4 z-30">
              <div className="paper-card sketchy px-5 py-3 flex items-center gap-3 flex-wrap" style={{ background: '#3D3D3D', boxShadow: '4px 4px 0px rgba(60,60,60,0.15)' }}>
                <span className="text-sm font-bold text-white">已选 {selectedCount} 项资源</span>
                <span className="text-xs text-gray-400">加入档案：</span>
                {[
                  { layer: 'basic', label: '基础生', color: '#6B8F71' },
                  { layer: 'advanced', label: '提升生', color: '#6B7FA0' },
                  { layer: 'extension', label: '拓展生', color: '#C0785C' },
                ].map(btn => (
                  <button key={btn.layer} onClick={() => handleBatchCollect(btn.layer)} disabled={batching}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ background: btn.color, color: '#fff' }}>
                    {btn.label}
                  </button>
                ))}
                <button onClick={() => setSelectedItems(new Set())}
                  className="text-xs text-gray-400 hover:text-white ml-auto transition-all">
                  取消全选
                </button>
              </div>
            </div>
          )}

          {/* ===== 我的备课档案夹（三层） ===== */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="w-5 h-5" style={{ color: '#C0785C' }} />
          <h2 className="text-2xl flex items-center gap-2" style={{ fontFamily: 'var(--font-caveat), cursive', color: '#3D3D3D', fontWeight: 600 }}>
            我的备课档案夹
          </h2>
        </div>

        {/* 三层 Tab */}
        <div className="flex gap-2 mb-4">
          {diffLayers.map(({ key, label, bg, text, border, icon }) => {
            const layerItems = collectedResources.filter(r => r.layer === key);
            const isActive = collectedLayer === key;
            return (
              <button key={key} onClick={() => setCollectedLayer(key)}
                className="flex-1 px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-2 justify-center"
                style={{
                  background: isActive ? border : bg,
                  color: isActive ? '#fff' : text,
                  border: `1.5px solid ${border}`,
                  transform: isActive ? 'translateY(-2px)' : 'none',
                  boxShadow: isActive ? `3px 3px 0px ${border}30` : 'none',
                }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: isActive ? 'rgba(255,255,255,0.25)' : border, color: isActive ? '#fff' : '#fff' }}>{icon}</span>
                <span className="text-sm font-bold">{label}档案</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: isActive ? 'rgba(255,255,255,0.2)' : `${border}20`, color: isActive ? '#fff' : text }}>{layerItems.length}</span>
              </button>
            );
          })}
        </div>

        {/* 当前层资源列表 */}
        {loadingCollected ? (
          <div className="text-center py-8"><RefreshCw className="w-5 h-5 mx-auto animate-spin" style={{ color: '#B8B0A4' }} /></div>
        ) : collectedResources.filter(r => r.layer === collectedLayer).length === 0 ? (
          <div className="text-center py-10 rounded-xl" style={{ background: '#F5F0E6', border: '2px dashed #D6D0C6' }}>
            <Folder className="w-8 h-8 mx-auto mb-2" style={{ color: '#D6D0C6' }} />
            <p className="text-sm" style={{ color: '#7A756D' }}>
              {collectedLayer === 'basic' ? '基础生' : collectedLayer === 'advanced' ? '提升生' : '拓展生'}档案夹还是空的
            </p>
            <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>在上方资源卡片勾选后，点击「加入档案」即可</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {collectedResources.filter(r => r.layer === collectedLayer).map(item => {
              const dc = diffLayers.find(d => d.key === item.layer) || diffLayers[0];
              return (
                <div key={item.id}
                  className="rounded-lg p-3 cursor-pointer transition-all hover:shadow-md"
                  onClick={() => handleOpenResource({
                    title: item.title, platform_url: item.url, url: item.url, platform: item.platform,
                    resource_type: item.resource_type, bvid: item.bvid, embed_url: item.embed_url,
                    highlight: item.highlight, description: item.description, format: item.format, size: item.size,
                  } as ResourceItem)}
                  style={{ background: '#FDFBF7', border: `1px solid ${dc.border}25` }}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: '#3D3D3D' }}>{item.title}</p>
                      <p className="text-xs" style={{ color: '#9CA3AF' }}>{item.resource_type} · {item.platform}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCollected(item.id); }}
                      className="shrink-0 p-1 rounded transition-all hover:bg-red-50"
                      title="移除">
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF5350' }} />
                    </button>
                  </div>
                  {item.highlight && (
                    <div className="mb-1 pl-2.5 py-0.5 text-xs flex items-start gap-1.5" style={{ borderLeft: '2px solid #D4C5A0' }}>
                      <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#C8A951' }} />
                      <span style={{ color: '#8A7F6B' }}>{item.highlight}</span>
                    </div>
                  )}
                  {item.description && !item.highlight && (
                    <p className="text-xs mb-1" style={{ color: '#7A756D' }}>{item.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        </div>
      )}

      {/* ===== AI交互式探索提问 + 原有探究 + 板书设计 ===== */}
      {!generating && teachData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* AI 交互式探索提问（新） */}
          <div className="paper-card sketchy p-5" style={{ boxShadow: '2px 2px 0px rgba(60,60,60,0.08)' }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-5 h-5" style={{ color: '#8B5CF6' }} />
                <span className="text-lg font-bold" style={{ color: '#3D3D3D', fontFamily: 'var(--font-caveat), cursive' }}>AI交互提问</span>
              </div>
              <div className="flex items-center gap-1.5">
                {inquiryData && (
                  <button onClick={handleSaveInquiry}
                    className="sketchy-sm px-2 py-1 text-xs font-medium flex items-center gap-1 transition-all hover:opacity-80"
                    style={{ backgroundColor: '#F3E8F9', color: '#8B5CF6', border: '1.5px solid #8B5CF6' }}>
                    <Save className="w-3 h-3" /> 保存
                  </button>
                )}
                <button onClick={handleGenerateInquiry} disabled={generatingInquiry}
                  className="sketchy-sm px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-all hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#F3E8F9', color: '#8B5CF6', border: '1.5px solid #8B5CF6' }}>
                  {generatingInquiry ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> AI 设计中...</> : <><Wand2 className="w-3.5 h-3.5" /> AI 生成提问</>}
                </button>
              </div>
            </div>

            {inquiryData && inquiryData.stages && inquiryData.stages.length > 0 ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {inquiryData.stages.map((stage, i) => {
                  const stageColors = [
                    { bg: '#F3E8F9', border: '#8B5CF6', accent: '#8B5CF6' },
                    { bg: '#FFF7ED', border: '#F97316', accent: '#F97316' },
                    { bg: '#ECFDF5', border: '#10B981', accent: '#10B981' },
                  ];
                  const sc = stageColors[i % 3];
                  return (
                    <div key={i} className="rounded-lg p-3" style={{ background: sc.bg, borderLeft: `3px solid ${sc.border}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: `${sc.accent}20`, color: sc.accent }}>
                          {['WARM-UP', 'CORE', 'CHALLENGE'][i]}
                        </span>
                        <span className="text-sm font-bold" style={{ color: '#3D3D3D' }}>{stage.stage}</span>
                      </div>
                      <p className="text-xs mb-2" style={{ color: '#6B7280' }}>🎯 {stage.stage_goal}</p>
                      {stage.questions.map((q, j) => (
                        <div key={j} className="mb-2 last:mb-0 pb-2 last:pb-0" style={{ borderBottom: j < stage.questions.length - 1 ? '1px dashed rgba(0,0,0,0.1)' : 'none' }}>
                          <div className="flex items-start gap-1.5 mb-1">
                            <span className="text-xs font-bold mt-0.5 px-1 rounded" style={{ background: `${sc.accent}20`, color: sc.accent }}>Q{j+1}</span>
                            <span className="text-sm font-medium" style={{ color: '#1F2937' }}>{q.question}</span>
                          </div>
                          <div className="ml-6 space-y-1">
                            <div className="flex items-start gap-1">
                              <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#10B981' }} />
                              <span className="text-xs" style={{ color: '#059669' }}>{q.expected_answer}</span>
                            </div>
                            <div className="flex items-start gap-1">
                              <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                              <span className="text-xs" style={{ color: '#B45309' }}>{q.guide_strategy}</span>
                            </div>
                            {q.teaching_tip && (
                              <div className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF3C7', color: '#92400E' }}>
                                💡 {q.teaching_tip}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessagesSquare className="w-10 h-10 mx-auto mb-3" style={{ color: '#D1D5DB' }} />
                <p className="text-sm" style={{ color: '#9CA3AF' }}>
                  {generatingInquiry ? 'AI 正在设计递进式提问...' : '点击「AI 生成提问」为课堂设计交互式探索问题链'}
                </p>
                <p className="text-xs mt-2" style={{ color: '#D1D5DB' }}>含热身激活→核心探究→拓展挑战</p>
              </div>
            )}
          </div>

          {/* 原有探究提问 */}
          {teachData.layer2_inquiry?.stages && (
            <div className="paper-card sketchy p-5" style={{ boxShadow: '2px 2px 0px rgba(60,60,60,0.08)' }}>
              <div className="flex items-center gap-2 mb-4">
                <HelpCircle className="w-5 h-5" style={{ color: '#C0785C' }} />
                <span className="text-lg font-bold" style={{ color: '#3D3D3D', fontFamily: 'var(--font-caveat), cursive' }}>课堂探究提问</span>
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {teachData.layer2_inquiry.stages.map((stage, i) => {
                  const stageColor = ['#C0785C', '#5C6170', '#6B8F71'][i % 3];
                  return (
                    <div key={i} className="rounded-lg p-3" style={{ background: `${stageColor}10`, borderLeft: `3px solid ${stageColor}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg" style={{ fontFamily: 'var(--font-caveat), cursive', color: stageColor }}>{['①', '②', '③'][i]}</span>
                        <span className="text-sm font-bold" style={{ color: '#3D3D3D' }}>{stage.stage}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${stageColor}20`, color: stageColor }}>{stage.duration}</span>
                      </div>
                      <div className="space-y-1.5">
                        {stage.questions.map((q, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span className="text-xs mt-0.5" style={{ color: stageColor }}>·</span>
                            <span className="text-sm" style={{ color: '#3D3D3D' }}>{q}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 板书设计 */}
          {teachData.layer3_blackboard && (() => {
            const bb = teachData.layer3_blackboard as any;
            const mainBoard = bb.main_board || bb.design || '';
            const sideBoard = bb.side_board
              || (Array.isArray(bb.key_points) && bb.key_points.length > 0
                ? '教学建议：\n' + bb.key_points.map((t: string) => `• ${t}`).join('\n')
                : '');
            return (
            <div className="paper-card sketchy p-5" style={{ boxShadow: '2px 2px 0px rgba(60,60,60,0.08)' }}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <StickyNote className="w-5 h-5" style={{ color: '#6B8F71' }} />
                  <span className="text-lg font-bold" style={{ color: '#3D3D3D', fontFamily: 'var(--font-caveat), cursive' }}>板书设计</span>
                </div>
                <button onClick={handleGenerateBoard} disabled={generatingBoard}
                  className="sketchy-sm px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-all hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#EBF2EC', color: '#6B8F71', border: '1.5px solid #6B8F71' }}>
                  {generatingBoard ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> AI 设计中...</> : <><Wand2 className="w-3.5 h-3.5" /> AI 设计板书</>}
                </button>
              </div>
              <div className="rounded-lg p-4" style={{ background: '#3D4A3E', minHeight: '200px', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)' }}>
                <div className="text-center mb-3 pb-2" style={{ borderBottom: '1px dashed rgba(255,255,255,0.2)' }}>
                  <span className="text-lg" style={{ fontFamily: 'var(--font-caveat), cursive', color: 'rgba(255,255,255,0.9)' }}>{selectedLesson.title}</span>
                </div>
                <pre className="text-sm whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-caveat), cursive', fontSize: '0.95rem', lineHeight: 1.8 }}>
                  {mainBoard || '点击「AI 设计板书」生成板书内容'}
                </pre>
              </div>
              {sideBoard && (
                <div className="mt-3 rounded-lg p-3" style={{ background: '#F0EBE0' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Lightbulb className="w-3.5 h-3.5" style={{ color: '#C0785C' }} />
                    <span className="text-xs font-bold" style={{ color: '#C0785C' }}>关键步骤/易错提醒</span>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap" style={{ color: '#3D3D3D' }}>{sideBoard}</pre>
                </div>
              )}
            </div>
            );
          })()}
        </div>
      )}

      {/* 发布按钮 */}
      {!generating && teachData && (
        <div className="mb-6 flex justify-end">
          <button onClick={handleGenerateMaterial} disabled={generatingMaterial}
            className="sketchy-sm px-5 py-2.5 text-sm font-medium flex items-center gap-2 transition-all hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: '#EBF2EC', color: '#6B8F71', border: '1.5px solid #6B8F71' }}>
            {generatingMaterial ? <><RefreshCw className="w-4 h-4 animate-spin" /> AI生成中...</> : <><Send className="w-4 h-4" /> 生成预习资料并发布</>}
          </button>
        </div>
      )}

      {/* 空状态 */}
      {!generating && !teachData && (
        <div className="text-center py-16">
          <div className="inline-flex flex-col items-center">
            <div className="flex gap-2 mb-4">
              {[Presentation, BookOpen, Pencil, Video].map((Icon, i) => (
                <div key={i} className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: ['#EBF0F7', '#F5EDE8', '#EBF2EC', '#F3E8F9'][i], transform: `rotate(${(i - 1.5) * 5}deg)` }}>
                  <Icon className="w-6 h-6" style={{ color: ['#6B7FA0', '#C0785C', '#6B8F71', '#9C7BB8'][i] }} />
                </div>
              ))}
            </div>
            <p className="text-lg" style={{ color: '#7A756D', fontFamily: 'var(--font-caveat), cursive' }}>
              选择课时，点击「AI 智能体检索」
            </p>
            <p className="text-sm mt-2" style={{ color: '#9CA3AF' }}>
              智能体将自动检索课件、教案、练习、微课视频，按基础/提升/拓展分层
            </p>
          </div>
        </div>
      )}

      {/* ===== 预习反馈统计 ===== */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-2xl flex items-center gap-2" style={{ fontFamily: 'var(--font-caveat), cursive', color: '#3D3D3D', fontWeight: 600 }}>
            <BarChart3 className="w-5 h-5" style={{ color: '#C0785C' }} /> 预习反馈统计
          </h2>
          {classes.length > 0 && (
            <select value={statsClassId} onChange={(e) => handleStatsClassChange(Number(e.target.value))}
              className="sketchy-sm px-3 py-2 text-sm font-medium outline-none cursor-pointer"
              style={{ backgroundColor: '#F0EBE0', color: '#3D3D3D' }}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {loadingStats ? (
          <div className="text-center py-8"><RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" style={{ color: '#B8B0A4' }} /></div>
        ) : previewTasks.length === 0 ? (
          <div className="text-center py-12 rounded-xl" style={{ background: '#F5F0E6', border: '2px dashed #D6D0C6' }}>
            <BarChart3 className="w-8 h-8 mx-auto mb-3" style={{ color: '#D6D0C6' }} />
            <p className="text-sm" style={{ color: '#7A756D' }}>暂无预习任务，发布后这里会显示每道题的正确率和错题学生</p>
          </div>
        ) : (
          <div className="space-y-4">
            {previewTasks.map(task => {
              const isRevoked = task.status === 'revoked';
              return (
              <div key={task.id} className="paper-card sketchy p-4" style={{ boxShadow: '2px 2px 0px rgba(60,60,60,0.08)', opacity: isRevoked ? 0.6 : 1 }}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" style={{ color: '#C0785C' }} />
                    <span className="font-bold text-sm" style={{ color: '#3D3D3D' }}>{task.lesson_title}</span>
                    <span className="text-xs" style={{ color: '#9CA3AF' }}>{task.created_at}</span>
                    {isRevoked ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#FFEBEE', color: '#EF5350' }}>已撤回</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EBF2EC', color: '#6B8F71' }}>已发布</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {task.total_submissions > 0 && !isRevoked && (
                      <button onClick={() => handleViewReport(task.id)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all hover:opacity-80"
                        style={{ background: '#C0785C', color: '#fff' }}>
                        <Brain className="w-3.5 h-3.5" /> AI学情报告
                      </button>
                    )}
                    {!isRevoked ? (
                      <button onClick={() => handleUnpublish(task.id)} disabled={revokingId === task.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all hover:opacity-80 disabled:opacity-50"
                        style={{ background: '#FFF3E0', color: '#FF9800', border: '1px solid #FFB74D' }}>
                        {revokingId === task.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                        撤回发布
                      </button>
                    ) : (
                      <>
                      <button onClick={() => handleRepublish(task.id)} disabled={revokingId === task.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all hover:opacity-80 disabled:opacity-50"
                        style={{ background: '#EBF2EC', color: '#6B8F71', border: '1px solid #6B8F71' }}>
                        {revokingId === task.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        重新发布
                      </button>
                      <button onClick={() => handleDelete(task.id)} disabled={revokingId === task.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all hover:opacity-80 disabled:opacity-50"
                        style={{ background: '#FFEBEE', color: '#EF5350', border: '1px solid #EF5350' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                      </>
                    )}
                  </div>
                </div>
                {/* 统计概览条 */}
                <div className="flex items-center gap-4 mb-3 flex-wrap text-xs" style={{ color: '#5C6170' }}>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" style={{ color: '#6B8F71' }} />
                    提交 <strong style={{ color: '#3D3D3D' }}>{task.total_submissions}</strong>/{task.total_students}人
                    <span className="ml-1 px-1.5 py-0.5 rounded-full" style={{ background: task.submission_rate >= 80 ? '#EBF2EC' : task.submission_rate >= 50 ? '#FFF3E0' : '#FFEBEE', color: task.submission_rate >= 80 ? '#6B8F71' : task.submission_rate >= 50 ? '#FF9800' : '#EF5350' }}>
                      {task.submission_rate}%
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#C0785C' }} />
                    平均正确率 <strong style={{ color: task.avg_accuracy >= 80 ? '#6B8F71' : task.avg_accuracy >= 50 ? '#FF9800' : '#EF5350' }}>{task.avg_accuracy}%</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" style={{ color: '#9CA3AF' }} />
                    {task.question_count}题
                  </span>
                </div>
                {task.questions.length > 0 && (
                  <div className="space-y-2">
                    {task.questions.map((q, i) => {
                      const dc = diffLayers.find(d => d.key === q.difficulty) || diffLayers[0];
                      const accColor = q.accuracy >= 80 ? '#6B8F71' : q.accuracy >= 50 ? '#FFA726' : '#EF5350';
                      return (
                        <div key={q.question_id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#FDFBF7', border: '1px solid rgba(184,176,164,0.15)' }}>
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold text-white shrink-0" style={{ background: dc.border }}>{dc.short}</span>
                          <span className="text-xs font-mono shrink-0" style={{ color: '#9CA3AF' }}>第{i + 1}题</span>
                          <span className="text-sm flex-1 truncate" style={{ color: '#3D3D3D' }}>{q.question_text}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-20 h-2 rounded-full overflow-hidden" style={{ background: '#F0EBE0' }}>
                              <div className="h-full rounded-full" style={{ width: `${q.accuracy}%`, background: accColor }} />
                            </div>
                            <span className="text-xs font-bold w-12 text-right" style={{ color: accColor }}>{q.accuracy}%</span>
                          </div>
                          {q.wrong_students.length > 0 && (
                            <div className="flex items-center gap-1 shrink-0" title={q.wrong_students.map((s: { name: string }) => s.name).join('、')}>
                              <Users className="w-3.5 h-3.5" style={{ color: '#EF5350' }} />
                              <span className="text-xs" style={{ color: '#EF5350' }}>{q.wrong_students.length}人错</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== 生成预习资料加载动画 ===== */}
      {generatingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}>
          <div className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl text-center" style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.2)' }}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C0785C, #E8A088)' }}>
              <Brain className="w-8 h-8 text-white animate-pulse" />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: '#3D3D3D' }}>AI 正在生成预习资料</h3>
            <p className="text-sm mb-4" style={{ color: '#7A756D' }}>智谱 GLM-4-Flash 正在整理备课档案夹资源，生成结构化预习单...</p>
            <div className="space-y-2 text-left">
              {['读取备课档案夹资源', '提取知识点和分层视频', 'AI 生成知识引导和例题解析', '整理分层知识点总结', '生成完整预习单'].map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs" style={{ color: '#5C6170' }}>
                  <RefreshCw className="w-3 h-3 animate-spin" style={{ color: '#C0785C', animationDelay: `${i * 0.3}s` }} />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 检索完成弹窗 ===== */}
      {searchReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={() => setSearchReport(null)}>
          <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSearchReport(null)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5"><X size={20} style={{ color: '#9CA3AF' }} /></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#6B8F71' }}><CheckCircle2 className="w-5 h-5 text-white" /></div>
              <h3 className="text-lg font-bold" style={{ color: '#3D3D3D' }}>智能体检索完成</h3>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: '#EBF2EC' }}>
                <span style={{ color: '#5C6170' }}>真实检索</span>
                <b style={{ color: '#3D3D3D' }}>{searchReport.total_found} 条</b>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: '#FEF2F2' }}>
                <span style={{ color: '#5C6170' }}>剔除不相关/重复</span>
                <b style={{ color: '#EF5350' }}>{searchReport.filtered_out} 条</b>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: '#EBF2EC' }}>
                <span style={{ color: '#5C6170' }}>保留优质资源</span>
                <b style={{ color: '#6B8F71' }}>{searchReport.after_filter} 条</b>
              </div>
              {searchReport.ai_note && (
                <p className="text-xs pt-2" style={{ color: '#7A756D' }}>{searchReport.ai_note}</p>
              )}
            </div>
            <button onClick={() => setSearchReport(null)} className="w-full mt-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80" style={{ background: '#6B8F71', color: '#fff' }}>查看资源</button>
          </div>
        </div>
      )}

      {/* ===== 预习资料编辑预览弹窗 ===== */}
      {showMaterialEdit && editingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={() => setShowMaterialEdit(false)}>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl" style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowMaterialEdit(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5 z-10"><X size={20} style={{ color: '#9CA3AF' }} /></button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#C0785C' }}><Sparkles className="w-5 h-5 text-white" /></div>
              <div>
                <h3 className="text-xl font-bold" style={{ color: '#3D3D3D' }}>预习资料预览与编辑</h3>
                <p className="text-xs" style={{ color: '#7A756D' }}>AI 已生成结构化预习单，可编辑后发布给学生</p>
              </div>
            </div>

            {/* 知识引导 */}
            <div className="mb-5 rounded-xl p-4" style={{ background: '#F5F0E6', border: '1px solid rgba(192,120,92,0.15)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4" style={{ color: '#C0785C' }} />
                <span className="text-sm font-bold" style={{ color: '#C0785C' }}>知识引导</span>
                {editingMaterial.ai_powered && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#C0785C20', color: '#C0785C' }}>AI生成</span>}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#7A756D' }}>主题概述</label>
                  <textarea value={editingMaterial.knowledge_guide?.topic || ''} onChange={(e) => setEditingMaterial({ ...editingMaterial, knowledge_guide: { ...editingMaterial.knowledge_guide, topic: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#FFF', border: '1px solid #E5DDD0', color: '#3D3D3D' }} rows={2} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#7A756D' }}>核心结论</label>
                  <textarea value={editingMaterial.knowledge_guide?.key_conclusion || ''} onChange={(e) => setEditingMaterial({ ...editingMaterial, knowledge_guide: { ...editingMaterial.knowledge_guide, key_conclusion: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#FFF', border: '1px solid #E5DDD0', color: '#3D3D3D' }} rows={2} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#7A756D' }}>学习目标（每行一条）</label>
                  <textarea value={(editingMaterial.knowledge_guide?.learning_goals || []).join('\n')} onChange={(e) => setEditingMaterial({ ...editingMaterial, knowledge_guide: { ...editingMaterial.knowledge_guide, learning_goals: e.target.value.split('\n').filter((s: string) => s.trim()) } })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#FFF', border: '1px solid #E5DDD0', color: '#3D3D3D' }} rows={3} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#7A756D' }}>例题解析 - 题目</label>
                  <textarea value={editingMaterial.knowledge_guide?.example_analysis?.question || ''} onChange={(e) => setEditingMaterial({ ...editingMaterial, knowledge_guide: { ...editingMaterial.knowledge_guide, example_analysis: { ...editingMaterial.knowledge_guide?.example_analysis, question: e.target.value } } })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#FFF', border: '1px solid #E5DDD0', color: '#3D3D3D' }} rows={2} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#7A756D' }}>例题解析 - 解答步骤（每行一步）</label>
                  <textarea value={(editingMaterial.knowledge_guide?.example_analysis?.steps || []).join('\n')} onChange={(e) => setEditingMaterial({ ...editingMaterial, knowledge_guide: { ...editingMaterial.knowledge_guide, example_analysis: { ...editingMaterial.knowledge_guide?.example_analysis, steps: e.target.value.split('\n').filter((s: string) => s.trim()) } } })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#FFF', border: '1px solid #E5DDD0', color: '#3D3D3D' }} rows={4} />
                </div>
              </div>
            </div>

            {/* 分层知识点总结 */}
            <div className="mb-5 rounded-xl p-4" style={{ background: '#EBF2EC', border: '1px solid rgba(107,143,113,0.2)' }}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4" style={{ color: '#6B8F71' }} />
                <span className="text-sm font-bold" style={{ color: '#6B8F71' }}>分层知识点总结</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(['basic', 'advanced', 'extension'] as const).map(layer => {
                  const labels = { basic: '基础层', advanced: '提升层', extension: '拓展层' };
                  const colors = { basic: '#73C067', advanced: '#FFB86C', extension: '#9C7BB8' };
                  return (
                    <div key={layer} className="rounded-lg p-3" style={{ background: '#FFF', border: `1px solid ${colors[layer]}30` }}>
                      <div className="text-xs font-bold mb-2" style={{ color: colors[layer] }}>{labels[layer]}</div>
                      <textarea value={(editingMaterial.knowledge_summary?.[layer] || []).join('\n')} onChange={(e) => setEditingMaterial({ ...editingMaterial, knowledge_summary: { ...editingMaterial.knowledge_summary, [layer]: e.target.value.split('\n').filter((s: string) => s.trim()) } })}
                        className="w-full px-2 py-1.5 rounded text-xs outline-none resize-none" style={{ background: '#FAFAF7', border: '1px solid #E5DDD0', color: '#3D3D3D' }} rows={4} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 微课视频 */}
            {editingMaterial.videos && (() => {
              const v = editingMaterial.videos.title ? editingMaterial.videos : Object.values(editingMaterial.videos).find((x: any) => x);
              if (!v) return null;
              return (
                <div className="mb-5 rounded-xl p-4" style={{ background: '#F0EBE0', border: '1px solid rgba(192,120,92,0.15)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="w-4 h-4" style={{ color: '#C0785C' }} />
                    <span className="text-sm font-bold" style={{ color: '#C0785C' }}>微课视频</span>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#FFF', border: '1px solid rgba(192,120,92,0.2)' }}>
                    <p className="text-sm font-medium" style={{ color: '#3D3D3D' }}>{v.title}</p>
                    <p className="text-xs mt-1" style={{ color: '#8B7355' }}>{v.platform} · {Math.floor((v.duration || 0) / 60)}分{(v.duration || 0) % 60}秒</p>
                    {v.description && <p className="text-xs mt-1" style={{ color: '#8B7355' }}>{v.description}</p>}
                  </div>
                </div>
              );
            })()}

            {/* 参考资料统计 */}
            {editingMaterial.reference_materials && (
              <div className="mb-5 rounded-xl p-4" style={{ background: '#F5F0E6', border: '1px solid rgba(192,120,92,0.1)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" style={{ color: '#5C6170' }} />
                  <span className="text-sm font-bold" style={{ color: '#5C6170' }}>参考资料</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(['courseware', 'lesson_plan', 'exercises', 'videos'] as const).map(rtype => {
                    const items = editingMaterial.reference_materials[rtype] || [];
                    const labels = { courseware: '课件', lesson_plan: '教案', exercises: '练习', videos: '微课' };
                    return (
                      <div key={rtype} className="rounded-lg p-2 text-center" style={{ background: '#FFF', border: '1px solid #E5DDD0' }}>
                        <div className="text-xs font-bold" style={{ color: '#5C6170' }}>{labels[rtype]}</div>
                        <div className="text-lg font-bold" style={{ color: '#3D3D3D' }}>{items.length}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 预习题目详情 */}
            {editingMaterial.preview_questions && (() => {
              const allLayers = ['basic', 'advanced', 'extension'] as const;
              const labels = { basic: '基础层', advanced: '提升层', extension: '拓展层' };
              const colors = { basic: '#73C067', advanced: '#FFB86C', extension: '#9C7BB8' };
              const totalCount = allLayers.reduce((acc: number, l) => acc + (editingMaterial.preview_questions[l] || []).length, 0);
              if (totalCount === 0) return null;
              return (
                <div className="mb-5 rounded-xl p-4" style={{ background: '#EBF2EC', border: '1px solid rgba(107,143,113,0.15)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4" style={{ color: '#6B8F71' }} />
                    <span className="text-sm font-bold" style={{ color: '#6B8F71' }}>预习题目（{totalCount}题）</span>
                  </div>
                  <div className="space-y-3">
                    {allLayers.map(layer => {
                      const qs = editingMaterial.preview_questions[layer] || [];
                      if (qs.length === 0) return null;
                      return (
                        <div key={layer}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ background: colors[layer] }}>{labels[layer]}</span>
                            <span className="text-xs" style={{ color: '#7A756D' }}>{qs.length}题</span>
                          </div>
                          <div className="space-y-2">
                            {qs.map((q: any, i: number) => (
                              <div key={i} className="rounded-lg p-3" style={{ background: '#FFF', border: `1px solid ${colors[layer]}30` }}>
                                <p className="text-sm font-medium mb-1" style={{ color: '#3D3D3D' }}>{i + 1}. {q.question}</p>
                                <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: '#7A756D' }}>
                                  <span>答案：<strong style={{ color: colors[layer] }}>{q.answer}</strong></span>
                                  {q.knowledge_point && <span>知识点：{q.knowledge_point}</span>}
                                </div>
                                {q.analysis && <p className="text-xs mt-1" style={{ color: '#8B7355' }}>解析：{q.analysis}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 发布按钮 */}
            <button onClick={() => setShowPublish(true)} disabled={classes.length === 0}
              className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: '#C0785C' }}>
              <Send className="w-4 h-4" /> 发布到班级
            </button>
            {classes.length === 0 && <p className="text-xs text-center mt-2" style={{ color: '#C62828' }}>请先在班级管理中创建班级</p>}
          </div>
        </div>
      )}

      {/* ===== 发布确认弹窗 ===== */}
      {showPublish && editingMaterial && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={() => setShowPublish(false)}>
          <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowPublish(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5"><X size={20} style={{ color: '#9CA3AF' }} /></button>
            <h3 className="text-xl font-bold mb-2" style={{ color: '#3D3D3D' }}>发布预习资料</h3>
            <p className="text-sm mb-4" style={{ color: '#7A756D' }}>将「{selectedLesson.title}」的预习资料发布到指定班级</p>
            <label className="block text-sm font-medium mb-2" style={{ color: '#C0785C' }}>选择班级</label>
            {classes.length === 0 ? (
              <p className="text-sm p-3 rounded-lg" style={{ background: '#FFEBEE', color: '#C62828' }}>请先在班级管理中创建班级</p>
            ) : (
              <select value={publishClassId} onChange={(e) => setPublishClassId(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl outline-none mb-4" style={{ background: '#F5F0E6', border: '2px solid rgba(192,120,92,0.15)', color: '#3D3D3D' }}>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}（{c.student_count}人）</option>)}
              </select>
            )}
            <div className="mb-4 p-3 rounded-xl" style={{ background: '#F5F0E6' }}>
              <div className="text-xs font-bold mb-2" style={{ color: '#7A756D' }}>发布内容：</div>
              <div className="text-xs space-y-1" style={{ color: '#5C6170' }}>
                <div>· 知识引导（主题+核心结论+学习目标+例题解析）</div>
                {editingMaterial.videos && (() => {
                  const v = editingMaterial.videos.title ? editingMaterial.videos : Object.values(editingMaterial.videos).find((x: any) => x);
                  return v ? <div>· 微课视频</div> : null;
                })()}
                <div>· 分层知识点总结（基础/提升/拓展）</div>
                <div>· 预习练习题 {Object.values(editingMaterial.preview_questions || {}).reduce((acc: number, qs: any) => acc + qs.length, 0)} 道</div>
                <div>· 参考资料（{Object.values(editingMaterial.reference_materials || {}).reduce((acc: number, items: any) => acc + items.length, 0)} 条链接）</div>
              </div>
            </div>
            <button onClick={handlePublish} disabled={publishing || classes.length === 0}
              className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ background: '#C0785C' }}>
              {publishing ? '发布中...' : '确认发布'}
            </button>
          </div>
        </div>
      )}

      {/* ===== AI学情报告弹窗 ===== */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={() => setShowReport(false)}>
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl" style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowReport(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5 z-10"><X size={20} style={{ color: '#9CA3AF' }} /></button>
            {loadingReport ? (
              <div className="text-center py-16"><RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" style={{ color: '#C0785C' }} /><p className="text-sm" style={{ color: '#7A756D' }}>正在生成AI学情分析报告...</p></div>
            ) : report ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#C0785C' }}><Brain className="w-5 h-5 text-white" /></div>
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: '#3D3D3D' }}>AI学情大数据报告</h3>
                    <p className="text-xs" style={{ color: '#7A756D' }}>{report.task.lesson_title} · {report.task.created_at}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: '班级总人数', value: report.summary.total_students, icon: Users, color: '#6B7FA0', bg: '#EBF0F7' },
                    { label: '提交人数', value: report.summary.total_submissions, icon: CheckCircle2, color: '#6B8F71', bg: '#EBF2EC' },
                    { label: '提交率', value: `${report.summary.submission_rate}%`, icon: TrendingUp, color: '#C0785C', bg: '#F5EDE8' },
                    { label: '平均正确率', value: `${report.summary.avg_accuracy}%`, icon: Target, color: '#9C7BB8', bg: '#F3E8F9' },
                  ].map((s, i) => { const Icon = s.icon; return (
                    <div key={i} className="rounded-xl p-3" style={{ background: s.bg }}>
                      <div className="flex items-center gap-2 mb-1"><Icon className="w-4 h-4" style={{ color: s.color }} /><span className="text-xs" style={{ color: '#7A756D' }}>{s.label}</span></div>
                      <span className="text-2xl font-bold" style={{ color: s.color, fontFamily: 'var(--font-caveat), cursive' }}>{s.value}</span>
                    </div>
                  ); })}
                </div>
                {report.ai_recommendations.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: '#F5EDE8', border: '1.5px solid #C0785C30' }}>
                    <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4" style={{ color: '#C0785C' }} /><span className="text-sm font-bold" style={{ color: '#C0785C' }}>AI智能推荐备课重点</span></div>
                    <div className="space-y-2">{report.ai_recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm" style={{ color: '#5C6170' }}><span className="text-xs font-bold shrink-0" style={{ color: '#C0785C' }}>{i + 1}.</span><span>{rec}</span></div>
                    ))}</div>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#3D3D3D' }}><Layers className="w-4 h-4" style={{ color: '#6B8F71' }} />分层学情分析</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {report.layer_analysis.map((la, i) => {
                      const dc = diffLayers.find(d => d.key === la.layer) || diffLayers[0];
                      const accColor = la.accuracy >= 80 ? '#6B8F71' : la.accuracy >= 60 ? '#FFA726' : '#EF5350';
                      return (
                        <div key={i} className="rounded-xl p-4" style={{ background: dc.bg, border: `1.5px solid ${dc.border}30` }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold" style={{ color: dc.text }}>{la.label}</span>
                            {la.weakness ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EF535020', color: '#EF5350' }}>薄弱</span> : la.total_answers > 0 ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#6B8F7120', color: '#6B8F71' }}>达标</span> : null}
                          </div>
                          <p className="text-xs mb-3" style={{ color: '#7A756D' }}>{la.description}</p>
                          {la.total_answers > 0 ? (
                            <>
                              <div className="flex items-center gap-2 mb-2"><div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0EBE0' }}><div className="h-full rounded-full" style={{ width: `${la.accuracy}%`, background: accColor }} /></div><span className="text-sm font-bold" style={{ color: accColor }}>{la.accuracy}%</span></div>
                              <p className="text-xs" style={{ color: '#9CA3AF' }}>{la.correct_answers}/{la.total_answers}人答对 · {la.question_count}题</p>
                            </>
                          ) : <p className="text-xs" style={{ color: '#9CA3AF' }}>暂无答题数据</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {report.error_top.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#3D3D3D' }}><AlertCircle className="w-4 h-4" style={{ color: '#EF5350' }} />错误率TOP {report.error_top.length} 错题</h4>
                    <div className="space-y-2">{report.error_top.map((q, i) => {
                      const dc = diffLayers.find(d => d.key === q.difficulty) || diffLayers[0];
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#FDFBF7', border: `1px solid ${dc.border}30` }}>
                          <span className="text-xs font-bold px-2 py-1 rounded-full shrink-0" style={{ background: '#EF5350', color: '#fff' }}>#{i + 1}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold text-white shrink-0" style={{ background: dc.border }}>{dc.short}</span>
                          <span className="text-sm flex-1 truncate" style={{ color: '#3D3D3D' }}>{q.question_text}</span>
                          {q.knowledge_point && <span className="text-xs shrink-0" style={{ color: '#9CA3AF' }}>{q.knowledge_point}</span>}
                          <span className="text-sm font-bold shrink-0" style={{ color: '#EF5350' }}>{q.error_rate}%</span>
                        </div>
                      );
                    })}</div>
                  </div>
                )}
                {report.knowledge_ranking.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#3D3D3D' }}><Brain className="w-4 h-4" style={{ color: '#9C7BB8' }} />高频错误知识点</h4>
                    <div className="space-y-2">{report.knowledge_ranking.map((k, i) => {
                      const errColor = k.error_rate >= 50 ? '#EF5350' : k.error_rate >= 30 ? '#FFA726' : '#6B8F71';
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#FDFBF7', border: '1px solid rgba(184,176,164,0.15)' }}>
                          <span className="text-xs font-bold w-6 text-center shrink-0" style={{ color: errColor }}>{i + 1}</span>
                          <span className="text-sm flex-1" style={{ color: '#3D3D3D' }}>{k.knowledge_point}</span>
                          <span className="text-xs shrink-0" style={{ color: '#9CA3AF' }}>{k.question_count}题 · {k.error_count}人次错</span>
                          <div className="flex items-center gap-2 shrink-0"><div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: '#F0EBE0' }}><div className="h-full rounded-full" style={{ width: `${k.error_rate}%`, background: errColor }} /></div><span className="text-xs font-bold w-10 text-right" style={{ color: errColor }}>{k.error_rate}%</span></div>
                        </div>
                      );
                    })}</div>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#3D3D3D' }}><BarChart3 className="w-4 h-4" style={{ color: '#6B7FA0' }} />逐题正确率详情</h4>
                  <div className="space-y-2">{report.question_reports.map((q, i) => {
                    const dc = diffLayers.find(d => d.key === q.difficulty) || diffLayers[0];
                    const accColor = q.accuracy >= 80 ? '#6B8F71' : q.accuracy >= 50 ? '#FFA726' : '#EF5350';
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#FDFBF7', border: q.need_focus ? '1.5px solid #EF535040' : '1px solid rgba(184,176,164,0.15)' }}>
                        {q.need_focus && <AlertCircle className="w-4 h-4 shrink-0" style={{ color: '#EF5350' }} />}
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold text-white shrink-0" style={{ background: dc.border }}>{dc.short}</span>
                        <span className="text-xs font-mono shrink-0" style={{ color: '#9CA3AF' }}>第{i + 1}题</span>
                        <span className="text-sm flex-1 truncate" style={{ color: '#3D3D3D' }}>{q.question_text}</span>
                        {q.knowledge_point && <span className="text-xs shrink-0 hidden lg:inline" style={{ color: '#9CA3AF' }}>{q.knowledge_point}</span>}
                        <div className="flex items-center gap-2 shrink-0"><div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: '#F0EBE0' }}><div className="h-full rounded-full" style={{ width: `${q.accuracy}%`, background: accColor }} /></div><span className="text-xs font-bold w-10 text-right" style={{ color: accColor }}>{q.accuracy}%</span></div>
                        {q.wrong_students.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0" title={q.wrong_students.map((s: { name: string }) => s.name).join('、')}><Users className="w-3.5 h-3.5" style={{ color: '#EF5350' }} /><span className="text-xs" style={{ color: '#EF5350' }}>{q.wrong_students.length}人错</span></div>
                        )}
                      </div>
                    );
                  })}</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16"><AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#B8B0A4' }} /><p className="text-sm" style={{ color: '#7A756D' }}>暂无报告数据</p></div>
            )}
          </div>
        </div>
      )}

      {/* ===== 文档内嵌查看 Overlay ===== */}
      {viewingResource && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)' }}
          onClick={() => { setViewingResource(null); setViewingProxyData(null); }}>
          <div className="relative w-full max-w-3xl min-h-[300px] rounded-2xl shadow-2xl mb-8"
            style={{ background: '#FDFBF7', border: '2px solid rgba(184,176,164,0.3)' }}
            onClick={(e) => e.stopPropagation()}>
            {/* 顶部栏 */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3 rounded-t-2xl"
              style={{ background: 'rgba(253,251,247,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(212,197,160,0.25)' }}>
              <FileTextIcon className="w-5 h-5 shrink-0" style={{ color: '#C8B88A' }} />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold truncate" style={{ color: '#3D3D3D' }}>{viewingResource.title}</h3>
                <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: '#9CA3AF' }}>
                  {viewingResource.platform && <span>{viewingResource.platform}</span>}
                  {viewingResource.format && <span>· {viewingResource.format}</span>}
                  {viewingResource.size && <span>· {viewingResource.size}</span>}
                </div>
              </div>
              <button onClick={() => { setViewingResource(null); setViewingProxyData(null); }}
                className="p-1.5 rounded-full transition-all hover:bg-black/5" title="关闭">
                <X size={18} style={{ color: '#9CA3AF' }} />
              </button>
            </div>

            {/* 文档内容 */}
            <div className="px-5 py-4 min-h-[200px]">
              {viewingResource.is_ai_generated && viewingResource.ai_content ? (
                renderAIContent()
              ) : viewingResource.is_real && !viewingResource.is_ai_generated && !viewingResource.is_kb_fallback ? (
                /* 真实搜索结果：展示摘要 + 匹配分 + 打开原链接 */
                <div className="py-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4" style={{ color: '#C8B88A' }} />
                    <span className="text-xs font-medium" style={{ color: '#7A756D' }}>来自 {viewingResource.platform || '网络搜索'}</span>
                    {viewingResource.match_score && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F0EBE0', color: '#7A756D' }}>
                        匹配度 {viewingResource.match_score}%
                      </span>
                    )}
                  </div>
                  <div className="rounded-xl p-4" style={{ background: '#FDFBF7', border: '1px solid rgba(212,197,160,0.3)' }}>
                    <p className="text-sm font-bold mb-2" style={{ color: '#3D3D3D' }}>{viewingResource.title}</p>
                    <p className="text-sm leading-relaxed" style={{ color: '#5D5040', lineHeight: 1.8 }}>
                      {viewingResource.description || '暂无摘要信息'}
                    </p>
                    {viewingResource.format && (
                      <p className="text-xs mt-3" style={{ color: '#9CA3AF' }}>
                        格式: {viewingResource.format} · {viewingResource.size || '未知大小'}
                      </p>
                    )}
                  </div>
                  {(viewingResource.platform_url || viewingResource.url) && (
                    <div className="text-center pt-2">
                      <p className="text-xs mb-3" style={{ color: '#9CA3AF' }}>该资源为外部链接，点击下方按钮在新窗口打开查看原文</p>
                      <button onClick={() => handleOpenOriginal(viewingResource.platform_url || viewingResource.url || '#')}
                        disabled={resolvingUrl}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90 disabled:opacity-60"
                        style={{ background: '#3D3D3D', color: '#fff' }}>
                        <ExternalLink className="w-4 h-4" /> {resolvingUrl ? '解析中...' : '打开原链接查看'}
                      </button>
                    </div>
                  )}
                </div>
              ) : viewingProxyLoading ? (
                <div className="py-16 text-center">
                  <RefreshCw className="w-6 h-6 mx-auto mb-3 animate-spin" style={{ color: '#C8B88A' }} />
                  <p className="text-sm" style={{ color: '#7A756D' }}>正在抓取文档内容…</p>
                  <p className="text-xs mt-1" style={{ color: '#B8B0A4' }}>服务端代理获取中</p>
                </div>
              ) : viewingProxyError ? (
                <div className="py-12 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#EF5350' }} />
                  <p className="text-sm mb-1" style={{ color: '#5D5040' }}>无法加载此页面</p>
                  <p className="text-xs" style={{ color: '#9CA3AF' }}>{viewingProxyError}</p>
                </div>
              ) : viewingProxyData?.success && (viewingProxyData.text?.length || 0) > 50 ? (
                <div>
                  {viewingProxyData.description && (
                    <p className="text-xs mb-4 pb-3" style={{ color: '#7A756D', borderBottom: '1px dashed #E8DCC4' }}>{viewingProxyData.description}</p>
                  )}
                  {viewingProxyData.images && viewingProxyData.images.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {viewingProxyData.images.slice(0, 4).map((img, i) => (
                        <img key={i} src={img} alt="" className="rounded-lg object-cover"
                          style={{ maxWidth: '220px', maxHeight: '160px' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ))}
                    </div>
                  )}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#3D3D3D', lineHeight: 1.9 }}>
                    {viewingProxyData.text}
                  </div>
                </div>
              ) : viewingProxyData && !viewingProxyData.success ? (
                viewingProxyData.error === 'FILE_FORMAT' ? (
                  <div className="py-10 text-center">
                    <FileTextIcon className="w-10 h-10 mx-auto mb-3" style={{ color: '#C8B88A' }} />
                    <p className="text-sm font-bold mb-1" style={{ color: '#5D5040' }}>该文件暂不支持在线预览</p>
                    <p className="text-xs mb-2" style={{ color: '#9CA3AF' }}>
                      {viewingResource.format} 格式文件需要下载后在本地打开
                    </p>
                    {viewingResource.size && (
                      <p className="text-xs mb-4" style={{ color: '#9CA3AF' }}>文件大小：{viewingResource.size}</p>
                    )}
                    <button onClick={() => handleOpenOriginal(viewingResource.platform_url || viewingResource.url || '')}
                      disabled={resolvingUrl}
                      className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg transition-all hover:opacity-90 disabled:opacity-60"
                      style={{ background: '#3D3D3D', color: '#fff' }}>
                      <Download className="w-3.5 h-3.5" /> {resolvingUrl ? '解析中...' : '下载或打开文件'}
                    </button>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#EF5350' }} />
                    <p className="text-sm mb-1" style={{ color: '#5D5040' }}>{viewingProxyData.error || '获取失败'}</p>
                  </div>
                )
              ) : (
                <div className="py-12 text-center">
                  <FileTextIcon className="w-8 h-8 mx-auto mb-3" style={{ color: '#C8B88A' }} />
                  <p className="text-sm mb-1" style={{ color: '#5D5040' }}>{viewingResource.title}</p>
                  <p className="text-xs" style={{ color: '#9CA3AF' }}>
                    {viewingProxyData?.text ? '该页面正文内容较少（可能需要登录）' : '暂无内容'}
                  </p>
                </div>
              )}
            </div>

            {/* AI 批注（仅代理抓取资源显示，排除AI生成和搜索结果） */}
            {!viewingResource.is_ai_generated && !viewingResource.is_real && viewingResource.highlight && (
              <div className="px-5 pb-3">
                <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: '#FDFBF7', border: '1px solid rgba(212,197,160,0.3)' }}>
                  <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#C8A951' }} />
                  <div>
                    <p className="text-xs font-bold mb-0.5" style={{ color: '#7A756D' }}>AI 审查重点</p>
                    <p className="text-sm" style={{ color: '#5D5040', lineHeight: 1.7 }}>{viewingResource.highlight}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 描述（仅代理抓取资源显示，排除AI生成和搜索结果） */}
            {!viewingResource.is_ai_generated && !viewingResource.is_real && viewingResource.description && !viewingResource.highlight && (
              <div className="px-5 pb-3">
                <div className="rounded-xl p-3" style={{ background: '#FDFBF7', border: '1px solid rgba(212,197,160,0.3)' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#7A756D' }}>资源简介</p>
                  <p className="text-sm" style={{ color: '#3D3D3D', lineHeight: 1.7 }}>{viewingResource.description}</p>
                </div>
              </div>
            )}

            {/* 右下角底部栏 */}
            <div className="sticky bottom-0 px-5 py-3 flex items-center justify-between"
              style={{ background: 'rgba(253,251,247,0.95)', backdropFilter: 'blur(8px)', borderTop: '1px solid rgba(212,197,160,0.25)', borderRadius: '0 0 1rem 1rem' }}>
              {viewingResource.is_ai_generated ? (
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: '#C8A951' }} />
                  <span className="text-xs" style={{ color: '#8A7F6B' }}>AI 智能生成</span>
                </div>
              ) : viewingResource.is_real ? (
                <div className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" style={{ color: '#C8B88A' }} />
                  <span className="text-xs" style={{ color: '#8A7F6B' }}>真实搜索结果</span>
                </div>
              ) : (
                <span className="text-xs" style={{ color: '#B8B0A4' }}>{viewingResource.platform || '网络资源'}</span>
              )}
              {(viewingResource.platform_url || viewingResource.url) ? (
                <button onClick={() => handleOpenOriginal(viewingResource.platform_url || viewingResource.url || '#')}
                  disabled={resolvingUrl}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-85 disabled:opacity-60"
                  style={{ background: '#3D3D3D', color: '#fff' }}>
                  <Eye className="w-4 h-4" />
                  {resolvingUrl ? '解析中...' : '预览原文'}
                </button>
              ) : viewingResource.is_ai_generated ? null : (
                <span className="text-xs" style={{ color: '#B8B0A4' }}>该资源未提供预览链接</span>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
