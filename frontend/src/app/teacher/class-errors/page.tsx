'use client';

import { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  Users,
  TrendingDown,
  Lightbulb,
  Upload,
  Loader2,
  CheckCircle2,
  BookOpen,
  Target,
  Sparkles,
  ChevronRight,
  AlertTriangle,
  Camera,
  FileText,
  Pencil,
} from 'lucide-react';
import {
  fetchTeacherDashboard,
  getClassCommonErrors,
  uploadTeacherQuestion,
  ocrTeacherQuestion,
  type ClassInfo,
  getToken,
  getStoredUser,
} from '@/lib/api';

interface WeakPoint {
  knowledge_point: string;
  error_count: number;
  error_rate: number;
  root_cause: string;
  teaching_suggestion: string;
}

interface AIAnalysis {
  common_weak_points: WeakPoint[];
  overall_analysis: string;
  urgent_actions: string[];
  recommended_exercises: string[];
}

interface ClassErrorData {
  student_count: number;
  total_errors: number;
  kp_stats: Record<string, { count: number; students: string[]; examples: any[] }>;
  ai_analysis: AIAnalysis;
}

// 人教版五上单元
const UNIT_OPTIONS = [
  { code: 'u1', name: '第一单元 小数乘法' },
  { code: 'u2', name: '第二单元 位置' },
  { code: 'u3', name: '第三单元 小数除法' },
  { code: 'u4', name: '第四单元 可能性' },
  { code: 'u5', name: '第五单元 简易方程' },
  { code: 'u6', name: '第六单元 多边形的面积' },
  { code: 'u7', name: '第七单元 数学广角——植树问题' },
  { code: 'u8', name: '第八单元 总复习' },
];

type TabType = 'errors' | 'create';

export default function TeacherClassErrorsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('errors');

  // ===== 共性错题分析 =====
  const [classList, setClassList] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [data, setData] = useState<ClassErrorData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // ===== 拍照出题 =====
  const [uploadForm, setUploadForm] = useState({
    unit_code: 'u1',
    question_type: 'fill',
    difficulty: 'basic',
    content: '',
    answer: '',
    analysis: '',
    knowledge_point: '',
  });
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 加载班级列表
  useEffect(() => {
    const u = getStoredUser();
    if (u) {
      fetchTeacherDashboard(u.id)
        .then((d: any) => {
          setClassList(d.classes || []);
          if (d.classes && d.classes.length > 0) {
            setSelectedClassId(d.classes[0].id);
          }
        })
        .catch((e) => setError('加载班级失败: ' + (e.message || e)))
        .finally(() => setLoadingClasses(false));
    } else {
      setLoadingClasses(false);
    }
  }, []);

  // 分析共性错题
  const handleAnalyze = async () => {
    if (!selectedClassId) return;
    setAnalyzing(true);
    setError('');
    setData(null);
    try {
      const res = await getClassCommonErrors(selectedClassId);
      setData(res.data as ClassErrorData);
    } catch (e: any) {
      setError('分析失败: ' + (e.message || e));
    } finally {
      setAnalyzing(false);
    }
  };

  // 拍照OCR识别
  const handleOcrPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 预览图片
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const token = getToken();
    if (!token) {
      setOcrMsg('请先登录');
      return;
    }

    setOcrLoading(true);
    setOcrMsg('AI 正在识别题目...');
    try {
      const res = await ocrTeacherQuestion(token, file);
      if (res.data?.error) {
        setOcrMsg('❌ ' + res.data.error);
      } else if (res.data?.question_text) {
        setUploadForm((f) => ({
          ...f,
          content: res.data.question_text,
          answer: res.data.answer || '',
          knowledge_point: res.data.knowledge_point || '',
          question_type: res.data.question_type || 'fill',
          analysis: res.data.analysis || '',
        }));
        setOcrMsg('✅ AI 识别成功，请检查并确认');
      } else {
        setOcrMsg('❌ 未能识别题目内容');
      }
    } catch (e: any) {
      setOcrMsg('❌ 识别失败: ' + (e.message || e));
    } finally {
      setOcrLoading(false);
    }
  };

  // 上传题目
  const handleUpload = async () => {
    if (!uploadForm.content.trim() || !uploadForm.answer.trim()) {
      setUploadMsg('请填写题目内容和标准答案');
      return;
    }
    const token = getToken();
    if (!token) {
      setUploadMsg('请先登录');
      return;
    }
    setUploading(true);
    setUploadMsg('');
    try {
      const res = await uploadTeacherQuestion(token, uploadForm);
      setUploadMsg('✅ ' + res.message);
      // 清空表单（保留单元/类型/难度）
      setUploadForm((f) => ({ ...f, content: '', answer: '', analysis: '', knowledge_point: '' }));
      setPreviewUrl('');
    } catch (e: any) {
      setUploadMsg('❌ 上传失败: ' + (e.message || e));
    } finally {
      setUploading(false);
    }
  };

  const sortedKps = data
    ? Object.entries(data.kp_stats).sort((a, b) => b[1].count - a[1].count)
    : [];

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#5C6170', fontFamily: 'var(--font-caveat), cursive' }}>
          错题诊疗 & 出题中心
        </h1>
        <p className="text-sm mt-1" style={{ color: '#7A756D' }}>
          AI 汇总班级共性错题 + 拍照快速出题，一站式管理题目和学情
        </p>
      </div>

      {/* 标签页切换 */}
      <div className="flex items-center gap-2 border-b" style={{ borderColor: 'rgba(192,120,92,0.15)' }}>
        <button
          onClick={() => setActiveTab('errors')}
          className="px-5 py-2.5 text-sm font-bold flex items-center gap-2 transition-all border-b-2 -mb-px"
          style={activeTab === 'errors'
            ? { borderColor: '#C0785C', color: '#C0785C' }
            : { borderColor: 'transparent', color: '#7A756D' }}
        >
          <AlertCircle className="w-4 h-4" />
          共性错题分析
        </button>
        <button
          onClick={() => setActiveTab('create')}
          className="px-5 py-2.5 text-sm font-bold flex items-center gap-2 transition-all border-b-2 -mb-px"
          style={activeTab === 'create'
            ? { borderColor: '#C0785C', color: '#C0785C' }
            : { borderColor: 'transparent', color: '#7A756D' }}
        >
          <Camera className="w-4 h-4" />
          拍照出题
        </button>
      </div>

      {/* ===== Tab 1: 共性错题分析 ===== */}
      {activeTab === 'errors' && (
        <>
          {/* 班级选择 + 分析按钮 */}
          <div className="paper-card p-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" style={{ color: '#C0785C' }} />
              <span className="text-sm font-bold" style={{ color: '#5C6170' }}>选择班级</span>
            </div>
            {loadingClasses ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#7A756D' }} />
            ) : classList.length === 0 ? (
              <span className="text-sm" style={{ color: '#7A756D' }}>暂无班级</span>
            ) : (
              <select
                value={selectedClassId || ''}
                onChange={(e) => setSelectedClassId(Number(e.target.value))}
                className="px-3 py-2 rounded-md text-sm border"
                style={{ borderColor: 'rgba(192,120,92,0.3)', backgroundColor: '#FDFBF7', color: '#5C6170' }}
              >
                {classList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.student_count}人）
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handleAnalyze}
              disabled={!selectedClassId || analyzing}
              className="ml-auto px-5 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{ backgroundColor: '#C0785C', color: '#fff' }}
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {analyzing ? 'AI 分析中...' : 'AI 分析共性错题'}
            </button>
          </div>

          {error && (
            <div className="paper-card p-4 flex items-center gap-2" style={{ borderColor: '#E8A4A4' }}>
              <AlertCircle className="w-5 h-5" style={{ color: '#C0785C' }} />
              <span className="text-sm" style={{ color: '#5C6170' }}>{error}</span>
            </div>
          )}

          {/* 分析中提示 */}
          {analyzing && !data && (
            <div className="paper-card p-8 text-center">
              <div className="inline-flex items-center gap-3 mb-3">
                <Sparkles className="w-6 h-6 animate-pulse" style={{ color: '#C0785C' }} />
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#7A756D' }} />
              </div>
              <p className="text-sm" style={{ color: '#7A756D' }}>
                AI 正在汇总全班错题数据，分析共性薄弱知识点...
              </p>
              <p className="text-xs mt-2" style={{ color: '#B8B0A4' }}>预计需要 10-20 秒</p>
            </div>
          )}

          {/* 分析结果 */}
          {data && (
            <>
              {/* 概况统计 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="paper-card-sm p-4 text-center">
                  <Users className="w-6 h-6 mx-auto mb-2" style={{ color: '#C0785C' }} />
                  <div className="text-2xl font-bold" style={{ color: '#5C6170' }}>{data.student_count}</div>
                  <div className="text-xs" style={{ color: '#7A756D' }}>班级人数</div>
                </div>
                <div className="paper-card-sm p-4 text-center">
                  <AlertTriangle className="w-6 h-6 mx-auto mb-2" style={{ color: '#E8A4A4' }} />
                  <div className="text-2xl font-bold" style={{ color: '#5C6170' }}>{data.total_errors}</div>
                  <div className="text-xs" style={{ color: '#7A756D' }}>未解决错题</div>
                </div>
                <div className="paper-card-sm p-4 text-center">
                  <Target className="w-6 h-6 mx-auto mb-2" style={{ color: '#6B8F71' }} />
                  <div className="text-2xl font-bold" style={{ color: '#5C6170' }}>{sortedKps.length}</div>
                  <div className="text-xs" style={{ color: '#7A756D' }}>薄弱知识点</div>
                </div>
              </div>

              {/* 知识点错误统计 */}
              {sortedKps.length > 0 && (
                <div className="paper-card p-5">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: '#5C6170' }}>
                    <TrendingDown className="w-5 h-5" style={{ color: '#C0785C' }} />
                    错误知识点排行（按错误人次）
                  </h2>
                  <div className="space-y-3">
                    {sortedKps.map(([kp, info], idx) => {
                      const maxCount = sortedKps[0][1].count;
                      const pct = maxCount > 0 ? (info.count / maxCount) * 100 : 0;
                      return (
                        <div key={kp} className="border rounded-md p-3" style={{ borderColor: 'rgba(192,120,92,0.15)', backgroundColor: '#FDFBF7' }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ backgroundColor: idx < 3 ? '#E8A4A4' : '#EDEBE6', color: idx < 3 ? '#fff' : '#7A756D' }}>
                                {idx + 1}
                              </span>
                              <span className="text-sm font-bold" style={{ color: '#5C6170' }}>{kp}</span>
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(192,120,92,0.15)', color: '#C0785C' }}>
                              {info.count} 人次
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: '#EDEBE6' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#C0785C' }} />
                          </div>
                          {info.examples && info.examples.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer" style={{ color: '#7A756D' }}>查看错题示例（{info.examples.length}）</summary>
                              <div className="mt-2 space-y-1.5">
                                {info.examples.map((ex: any, i: number) => (
                                  <div key={i} className="p-2 rounded" style={{ backgroundColor: '#F0EBE0' }}>
                                    <div style={{ color: '#5C6170' }}>题目：{ex.question}</div>
                                    <div style={{ color: '#C0785C' }}>学生答：{ex.student_answer}</div>
                                    <div style={{ color: '#6B8F71' }}>正确答：{ex.correct_answer}</div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI 分析 */}
              {data.ai_analysis && (
                <>
                  {/* 总体分析 */}
                  <div className="paper-card p-5" style={{ background: 'linear-gradient(135deg, rgba(192,120,92,0.06) 0%, rgba(192,120,92,0.02) 100%)' }}>
                    <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: '#5C6170' }}>
                      <Sparkles className="w-5 h-5" style={{ color: '#C0785C' }} />
                      AI 总体分析
                    </h2>
                    <p className="text-sm leading-relaxed" style={{ color: '#5C6170' }}>
                      {data.ai_analysis.overall_analysis}
                    </p>
                  </div>

                  {/* 共性薄弱点 */}
                  {data.ai_analysis.common_weak_points && data.ai_analysis.common_weak_points.length > 0 && (
                    <div className="paper-card p-5">
                      <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: '#5C6170' }}>
                        <AlertCircle className="w-5 h-5" style={{ color: '#C0785C' }} />
                        共性薄弱知识点（Top {data.ai_analysis.common_weak_points.length}）
                      </h2>
                      <div className="space-y-4">
                        {data.ai_analysis.common_weak_points.map((wp, idx) => (
                          <div key={idx} className="border-l-4 rounded-r-md p-4" style={{ borderColor: '#C0785C', backgroundColor: '#FDFBF7' }}>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="font-bold text-sm" style={{ color: '#5C6170' }}>{wp.knowledge_point}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(232,164,164,0.2)', color: '#C0785C' }}>
                                {wp.error_count} 人错
                              </span>
                              {wp.error_rate > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(232,164,164,0.15)', color: '#7A756D' }}>
                                  错误率 {(wp.error_rate * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            <div className="text-xs mb-2" style={{ color: '#7A756D' }}>
                              <span className="font-bold" style={{ color: '#5C6170' }}>根因：</span>{wp.root_cause}
                            </div>
                            <div className="text-xs p-2 rounded" style={{ backgroundColor: 'rgba(107,143,113,0.08)', color: '#6B8F71' }}>
                              <Lightbulb className="w-3.5 h-3.5 inline mr-1" />
                              <span className="font-bold">教学建议：</span>{wp.teaching_suggestion}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 紧急行动 */}
                  {data.ai_analysis.urgent_actions && data.ai_analysis.urgent_actions.length > 0 && (
                    <div className="paper-card p-5">
                      <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: '#5C6170' }}>
                        <AlertTriangle className="w-5 h-5" style={{ color: '#E8A4A4' }} />
                        紧急教学行动
                      </h2>
                      <div className="space-y-2">
                        {data.ai_analysis.urgent_actions.map((action, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm" style={{ color: '#5C6170' }}>
                            <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#C0785C' }} />
                            <span>{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 推荐练习 */}
                  {data.ai_analysis.recommended_exercises && data.ai_analysis.recommended_exercises.length > 0 && (
                    <div className="paper-card p-5">
                      <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: '#5C6170' }}>
                        <BookOpen className="w-5 h-5" style={{ color: '#6B8F71' }} />
                        推荐练习方向
                      </h2>
                      <div className="space-y-2">
                        {data.ai_analysis.recommended_exercises.map((ex, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm p-2 rounded" style={{ color: '#5C6170', backgroundColor: 'rgba(107,143,113,0.06)' }}>
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#6B8F71' }} />
                            <span>{ex}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {data.total_errors === 0 && (
                <div className="paper-card p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: '#6B8F71' }} />
                  <p className="text-sm font-bold" style={{ color: '#5C6170' }}>班级暂无未解决错题</p>
                  <p className="text-xs mt-1" style={{ color: '#7A756D' }}>同学们都做得很棒！</p>
                </div>
              )}
            </>
          )}

          {/* 无数据时的引导 */}
          {!analyzing && !data && !error && (
            <div className="paper-card p-8 text-center">
              <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: '#C0785C' }} />
              <p className="text-sm" style={{ color: '#5C6170' }}>选择班级后点击"AI 分析共性错题"</p>
              <p className="text-xs mt-1" style={{ color: '#7A756D' }}>AI 将汇总全班错题数据，识别薄弱知识点并给出教学建议</p>
            </div>
          )}
        </>
      )}

      {/* ===== Tab 2: 拍照出题 ===== */}
      {activeTab === 'create' && (
        <div className="space-y-5">
          {/* 拍照区 */}
          <div className="paper-card p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: '#5C6170' }}>
              <Camera className="w-5 h-5" style={{ color: '#C0785C' }} />
              拍照出题（AI 自动识别）
            </h2>
            <p className="text-xs mb-4" style={{ color: '#7A756D' }}>
              拍一张数学题照片上传，AI 自动识别题目内容、答案和知识点，教师确认后即可入库。
            </p>

            {/* 图片预览 / 上传区 */}
            <div className="flex items-start gap-4 mb-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-48 h-48 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all hover:bg-gray-50 shrink-0 overflow-hidden"
                style={{ borderColor: previewUrl ? '#6B8F71' : 'rgba(192,120,92,0.3)' }}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="题目预览" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center p-4">
                    <Camera className="w-10 h-10 mx-auto mb-2" style={{ color: '#B8B0A4' }} />
                    <p className="text-xs" style={{ color: '#7A756D' }}>点击上传题目照片</p>
                    <p className="text-xs mt-1" style={{ color: '#B8B0A4' }}>支持 JPG/PNG</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleOcrPhoto}
                />
              </div>

              {/* OCR 状态 */}
              <div className="flex-1 min-w-0">
                {ocrLoading ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: 'rgba(192,120,92,0.06)' }}>
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#C0785C' }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#5C6170' }}>{ocrMsg}</p>
                      <p className="text-xs" style={{ color: '#7A756D' }}>AI 视觉模型正在识别题目内容...</p>
                    </div>
                  </div>
                ) : ocrMsg ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: ocrMsg.startsWith('✅') ? 'rgba(107,143,113,0.08)' : 'rgba(232,164,164,0.08)' }}>
                    {ocrMsg.startsWith('✅') ? (
                      <CheckCircle2 className="w-5 h-5" style={{ color: '#6B8F71' }} />
                    ) : (
                      <AlertCircle className="w-5 h-5" style={{ color: '#C0785C' }} />
                    )}
                    <span className="text-sm" style={{ color: '#5C6170' }}>{ocrMsg}</span>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg" style={{ backgroundColor: '#F0EBE0' }}>
                    <p className="text-sm" style={{ color: '#5C6170' }}>上传照片后，AI 会自动：</p>
                    <ul className="text-xs mt-2 space-y-1" style={{ color: '#7A756D' }}>
                      <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3" /> 识别题目文字内容</li>
                      <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3" /> 推断标准答案</li>
                      <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3" /> 标注相关知识点</li>
                      <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3" /> 给出解题思路</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 题目编辑表单 */}
          <div className="paper-card p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: '#5C6170' }}>
              <Pencil className="w-5 h-5" style={{ color: '#C0785C' }} />
              题目信息（可手动编辑修改）
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#5C6170' }}>所属单元</label>
                <select
                  value={uploadForm.unit_code}
                  onChange={(e) => setUploadForm({ ...uploadForm, unit_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm border"
                  style={{ borderColor: 'rgba(192,120,92,0.3)', backgroundColor: '#FDFBF7', color: '#5C6170' }}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.code} value={u.code}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#5C6170' }}>题型</label>
                <select
                  value={uploadForm.question_type}
                  onChange={(e) => setUploadForm({ ...uploadForm, question_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm border"
                  style={{ borderColor: 'rgba(192,120,92,0.3)', backgroundColor: '#FDFBF7', color: '#5C6170' }}
                >
                  <option value="fill">填空题</option>
                  <option value="choice">选择题</option>
                  <option value="compute">计算题</option>
                  <option value="word">应用题</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#5C6170' }}>难度</label>
                <select
                  value={uploadForm.difficulty}
                  onChange={(e) => setUploadForm({ ...uploadForm, difficulty: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm border"
                  style={{ borderColor: 'rgba(192,120,92,0.3)', backgroundColor: '#FDFBF7', color: '#5C6170' }}
                >
                  <option value="basic">基础</option>
                  <option value="advanced">提升</option>
                  <option value="extension">拓展</option>
                </select>
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs font-bold mb-1 block" style={{ color: '#5C6170' }}>题目内容 *</label>
              <textarea
                value={uploadForm.content}
                onChange={(e) => setUploadForm({ ...uploadForm, content: e.target.value })}
                placeholder="上传照片自动识别，或手动输入题目内容，例如：2.5 × 3.2 = ___"
                rows={2}
                className="w-full px-3 py-2 rounded-md text-sm border resize-none"
                style={{ borderColor: 'rgba(192,120,92,0.3)', backgroundColor: '#FDFBF7', color: '#5C6170' }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#5C6170' }}>标准答案 *</label>
                <input
                  value={uploadForm.answer}
                  onChange={(e) => setUploadForm({ ...uploadForm, answer: e.target.value })}
                  placeholder="例如：8"
                  className="w-full px-3 py-2 rounded-md text-sm border"
                  style={{ borderColor: 'rgba(192,120,92,0.3)', backgroundColor: '#FDFBF7', color: '#5C6170' }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#5C6170' }}>知识点标注</label>
                <input
                  value={uploadForm.knowledge_point}
                  onChange={(e) => setUploadForm({ ...uploadForm, knowledge_point: e.target.value })}
                  placeholder="例如：小数乘法"
                  className="w-full px-3 py-2 rounded-md text-sm border"
                  style={{ borderColor: 'rgba(192,120,92,0.3)', backgroundColor: '#FDFBF7', color: '#5C6170' }}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold mb-1 block" style={{ color: '#5C6170' }}>解析（选填）</label>
              <textarea
                value={uploadForm.analysis}
                onChange={(e) => setUploadForm({ ...uploadForm, analysis: e.target.value })}
                placeholder="解题思路、易错点说明..."
                rows={2}
                className="w-full px-3 py-2 rounded-md text-sm border resize-none"
                style={{ borderColor: 'rgba(192,120,92,0.3)', backgroundColor: '#FDFBF7', color: '#5C6170' }}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="px-5 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: '#C0785C', color: '#fff' }}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? '上传中...' : '确认入库'}
              </button>
              {uploadMsg && (
                <span className="text-sm" style={{ color: uploadMsg.startsWith('✅') ? '#6B8F71' : '#C0785C' }}>
                  {uploadMsg}
                </span>
              )}
            </div>
          </div>

          {/* 说明卡片 */}
          <div className="paper-card p-4 flex items-start gap-3" style={{ background: 'rgba(107,143,113,0.05)' }}>
            <FileText className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#6B8F71' }} />
            <div className="text-xs" style={{ color: '#7A756D' }}>
              <p style={{ color: '#5C6170', fontWeight: 600 }}>出题说明</p>
              <ul className="mt-1 space-y-0.5">
                <li>- 上传题目照片后，AI 自动识别题目内容、答案和知识点</li>
                <li>- 识别结果可手动修改，确认无误后点击"确认入库"</li>
                <li>- 入库的题目将进入题库，供预习、闯关、作业等场景使用</li>
                <li>- 也可跳过拍照，直接在表单中手动输入题目</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
