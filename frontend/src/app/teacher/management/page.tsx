'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Users,
  Plus,
  Copy,
  Check,
  Upload,
  FileSpreadsheet,
  Trash2,
  RefreshCw,
  School,
  ChevronRight,
  ChevronUp,
  UserPlus,
  X,
  AlertCircle,
  Layers,
  Sparkles,
  History,
} from 'lucide-react';
import {
  getToken,
  getStoredUser,
  classCreate,
  classMyList,
  classStudents,
  classImportStudents,
  classImportExcel,
  classDelete,
  classGetLayers,
  classSetStudentLayer,
  classAutoLayer,
} from '@/lib/api';

interface ClassInfo {
  id: number;
  name: string;
  class_code: string;
  student_count: number;
}

interface StudentInfo {
  id: number;
  name: string;
  student_no: string;
  points: number;
  status: string;
  layer?: string;
}

const LAYER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  basic: { label: '基础层', color: '#6B8F71', bg: '#EBF2EC', border: '#6B8F71' },
  advanced: { label: '提升层', color: '#6B7FA0', bg: '#EBF0F7', border: '#6B7FA0' },
  extension: { label: '拓展层', color: '#C0785C', bg: '#F5EDE8', border: '#C0785C' },
};

export default function TeacherManagement() {
  const [token, setToken] = useState('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Create class modal
  const [showCreate, setShowCreate] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [creating, setCreating] = useState(false);

  // Import students modal
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Excel upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelUploading, setExcelUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState('');

  // 分层管理
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [layerCounts, setLayerCounts] = useState<Record<string, number>>({});
  const [layerHistory, setLayerHistory] = useState<any[]>([]);
  const [layeringStudent, setLayeringStudent] = useState<StudentInfo | null>(null);
  const [autoLayerText, setAutoLayerText] = useState('');
  const [autoLayering, setAutoLayering] = useState(false);
  const [autoLayerResult, setAutoLayerResult] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Messages
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(''), 5000);
    return () => clearTimeout(timer);
  }, [msg]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(''), 5000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  useEffect(() => {
    const t = getToken();
    if (t) {
      setToken(t);
      loadClasses(t);
    }
  }, []);

  const loadClasses = async (t: string) => {
    setLoading(true);
    try {
      const data = await classMyList(t);
      setClasses(data.classes || []);
    } catch (e: any) {
      setErrorMsg(e.message || '获取班级列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      setErrorMsg('班级名称不能为空');
      return;
    }
    setCreating(true);
    setErrorMsg('');
    try {
      await classCreate(token, newClassName.trim());
      setMsg(`班级"${newClassName.trim()}"创建成功`);
      setNewClassName('');
      setShowCreate(false);
      await loadClasses(token);
    } catch (e: any) {
      setErrorMsg(e.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectClass = async (cls: ClassInfo) => {
    setSelectedClass(cls);
    setStudentsLoading(true);
    setShowLayerPanel(false);
    try {
      const data = await classStudents(token, cls.id);
      setStudents(data.students || []);
      // 加载分层信息
      try {
        const layerData = await classGetLayers(token, cls.id);
        // 合并 layer 到 students
        const layerMap: Record<number, string> = {};
        for (const s of (layerData.students || [])) {
          layerMap[s.id] = s.layer || 'basic';
        }
        setStudents((data.students || []).map((s: StudentInfo) => ({ ...s, layer: layerMap[s.id] || 'basic' })));
        setLayerCounts(layerData.layer_counts || {});
        setLayerHistory(layerData.history || []);
      } catch { /* 静默 */ }
    } catch (e: any) {
      setErrorMsg(e.message || '获取学生列表失败');
    } finally {
      setStudentsLoading(false);
    }
  };

  const handleSetLayer = async (student: StudentInfo, layer: string) => {
    if (!selectedClass) return;
    try {
      await classSetStudentLayer(token, selectedClass.id, student.id, layer);
      // 更新本地状态
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, layer } : s));
      // 更新统计
      setLayerCounts(prev => {
        const next = { ...prev };
        const oldLayer = student.layer || 'basic';
        if (next[oldLayer] != null) next[oldLayer] = Math.max(0, (next[oldLayer] || 0) - 1);
        if (next[layer] != null) next[layer] = (next[layer] || 0) + 1;
        return next;
      });
      setMsg(`已将 ${student.name} 设为 ${LAYER_CONFIG[layer]?.label || layer}`);
      setLayeringStudent(null);
      // 重新加载历史
      try {
        const layerData = await classGetLayers(token, selectedClass.id);
        setLayerHistory(layerData.history || []);
      } catch { /* 静默 */ }
    } catch (e: any) {
      setErrorMsg(e.message || '设置分层失败');
    }
  };

  const handleAutoLayer = async () => {
    if (!selectedClass || !autoLayerText.trim()) {
      setErrorMsg('请输入考试成绩');
      return;
    }
    setAutoLayering(true);
    setErrorMsg('');
    setAutoLayerResult(null);
    try {
      const lines = autoLayerText.trim().split('\n').filter(l => l.trim());
      const scores: { name?: string; student_no?: string; score: number }[] = [];
      for (const line of lines) {
        const parts = line.trim().split(/[,\s，\t]/).filter(p => p.trim());
        if (parts.length >= 2) {
          const last = parts[parts.length - 1];
          const score = parseFloat(last);
          if (!isNaN(score)) {
            // 倒数第二个之前都作为姓名/学号
            const identifier = parts.slice(0, -1).join('');
            scores.push({ name: identifier, score });
          }
        }
      }
      if (scores.length === 0) {
        setErrorMsg('未解析到有效成绩（需"姓名,分数"格式）');
        setAutoLayering(false);
        return;
      }
      const data = await classAutoLayer(token, selectedClass.id, scores);
      setAutoLayerResult(data);
      setMsg(data.message);
      setAutoLayerText('');
      // 重新加载学生和分层
      await handleSelectClass(selectedClass);
    } catch (e: any) {
      setErrorMsg(e.message || 'AI自动分层失败');
    } finally {
      setAutoLayering(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const handleImport = async () => {
    if (!selectedClass || !importText.trim()) {
      setErrorMsg('请输入学生名单');
      return;
    }
    setImporting(true);
    setErrorMsg('');
    setImportResult(null);
    try {
      const lines = importText.trim().split('\n').filter(l => l.trim());
      const studentList = lines.map(line => {
        const parts = line.trim().split(/[,\s，]/).filter(p => p.trim());
        return { name: parts[0] || '', student_no: parts[1] || '' };
      }).filter(s => s.name && s.student_no);

      if (studentList.length === 0) {
        setErrorMsg('未解析到有效学生（需"姓名,学号"格式）');
        setImporting(false);
        return;
      }

      const data = await classImportStudents(token, selectedClass.id, studentList);
      setImportResult(data);
      setMsg(data.message);
      setImportText('');
      await handleSelectClass(selectedClass);
      await loadClasses(token);
    } catch (e: any) {
      setErrorMsg(e.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleExcelUpload = async (file: File) => {
    if (!selectedClass) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setErrorMsg('仅支持 .xlsx 和 .csv 文件');
      return;
    }
    setExcelUploading(true);
    setErrorMsg('');
    setImportResult(null);
    try {
      const data = await classImportExcel(token, selectedClass.id, file);
      setImportResult(data);
      setMsg(data.message);
      await handleSelectClass(selectedClass);
      await loadClasses(token);
    } catch (e: any) {
      setErrorMsg(e.message || 'Excel 导入失败');
    } finally {
      setExcelUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteClass = async (cls: ClassInfo) => {
    if (!confirm(`确定删除班级"${cls.name}"吗？学生将不会被删除，但会解除班级关联。`)) return;
    try {
      await classDelete(token, cls.id);
      setMsg(`班级"${cls.name}"已删除`);
      setSelectedClass(null);
      await loadClasses(token);
    } catch (e: any) {
      setErrorMsg(e.message || '删除失败');
    }
  };

  return (
    <div className="relative">
      {/* Messages */}
      {msg && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
          <Check size={16} />
          {msg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: '#FFEBEE', color: '#C62828' }}>
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Header */}
      <div className="mb-8 text-center relative">
        <div
          className="absolute -top-2 left-8 w-16 h-5 opacity-50"
          style={{ background: 'linear-gradient(135deg, rgba(192,120,92,0.35), rgba(192,120,92,0.15))', transform: 'rotate(-8deg)', borderRadius: '2px' }}
        />
        <div
          className="absolute -top-1 right-12 w-14 h-5 opacity-40"
          style={{ background: 'linear-gradient(135deg, rgba(107,143,113,0.35), rgba(107,143,113,0.15))', transform: 'rotate(5deg)', borderRadius: '2px' }}
        />
        <h1 className="text-5xl inline-block relative" style={{ fontFamily: 'var(--font-caveat), cursive', color: '#3D3D3D', fontWeight: 700 }}>
          班级管理
          <svg className="absolute -bottom-2 left-0 w-full" height="8" viewBox="0 0 200 8" fill="none" preserveAspectRatio="none">
            <path d="M0 4 Q10 0, 20 4 Q30 8, 40 4 Q50 0, 60 4 Q70 8, 80 4 Q90 0, 100 4 Q110 8, 120 4 Q130 0, 140 4 Q150 8, 160 4 Q170 0, 180 4 Q190 8, 200 4" stroke="#B8B0A4" strokeWidth="1.5" fill="none" />
          </svg>
        </h1>
        <p className="mt-3 text-sm" style={{ color: '#7A756D' }}>创建班级、导入名单、管理学生</p>
      </div>

      {/* Create class button */}
      <div className="mb-6 flex justify-center">
        <button
          onClick={() => setShowCreate(true)}
          className="sketchy-sm px-6 py-2.5 text-sm font-medium transition-all hover:opacity-80 active:scale-[0.98] inline-flex items-center gap-2"
          style={{ backgroundColor: '#F5EDE8', color: '#C0785C' }}
        >
          <Plus className="w-4 h-4" />
          <span style={{ fontFamily: 'var(--font-caveat), cursive', fontSize: '1.125rem' }}>创建新班级</span>
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="text-center py-12" style={{ color: '#7A756D' }}>
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: '#B8B0A4' }} />
          加载中...
        </div>
      ) : classes.length === 0 ? (
        /* Empty state */
        <div className="text-center py-16">
          <School className="w-12 h-12 mx-auto mb-4" style={{ color: '#D6D0C6' }} />
          <p className="text-lg" style={{ color: '#7A756D', fontFamily: 'var(--font-caveat), cursive' }}>
            还没有班级，点击上方按钮创建吧~
          </p>
        </div>
      ) : (
        /* Class cards grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {classes.map((cls, i) => {
            const rotations = ['-1.5deg', '0.8deg', '-0.5deg', '1deg', '-0.8deg'];
            const bgColors = ['#E8F5E9', '#E3F2FD', '#FFF3E0', '#FCE4EC', '#FFFDE7'];
            const rot = rotations[i % rotations.length];
            const bg = bgColors[i % bgColors.length];
            const isSelected = selectedClass?.id === cls.id;

            return (
              <div
                key={cls.id}
                className="relative cursor-pointer transition-transform hover:scale-[1.03]"
                style={{ transform: `rotate(${rot})` }}
                onClick={() => handleSelectClass(cls)}
              >
                {/* Tape */}
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-5 z-10"
                  style={{ background: `linear-gradient(135deg, rgba(192,120,92,0.3), rgba(192,120,92,0.15))`, borderRadius: '2px' }}
                />
                <div
                  className="sketchy-sm p-5 pt-6"
                  style={{
                    backgroundColor: bg,
                    boxShadow: '3px 4px 0px rgba(60,60,60,0.10)',
                    border: isSelected ? '2px solid #C0785C' : 'none',
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl font-bold" style={{ color: '#3D3D3D', fontFamily: 'var(--font-caveat), cursive' }}>
                      {cls.name}
                    </span>
                    <span className="text-xl" style={{ color: '#5C6170', fontFamily: 'var(--font-caveat), cursive' }}>
                      {cls.student_count}人
                    </span>
                  </div>

                  {/* Class code */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 cursor-pointer transition-all hover:bg-black/5"
                    style={{ background: 'rgba(255,255,255,0.6)', border: '1px dashed #D6D0C6' }}
                    onClick={(e) => { e.stopPropagation(); handleCopyCode(cls.class_code); }}
                  >
                    <span className="text-xs" style={{ color: '#7A756D' }}>班级码</span>
                    <span className="font-mono font-bold text-lg" style={{ color: '#C0785C', letterSpacing: '2px' }}>
                      {cls.class_code}
                    </span>
                    {copiedCode === cls.class_code ? (
                      <Check className="w-4 h-4 ml-auto" style={{ color: '#73C067' }} />
                    ) : (
                      <Copy className="w-4 h-4 ml-auto" style={{ color: '#9CA3AF' }} />
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSelected) {
                          setSelectedClass(null);
                        } else {
                          handleSelectClass(cls);
                        }
                      }}
                      className="text-xs flex items-center gap-1 transition-colors hover:text-[#C0785C]"
                      style={{ color: '#7A756D' }}
                    >
                      {isSelected ? (
                        <>
                          <ChevronUp className="w-3 h-3" />
                          收起学生名单
                        </>
                      ) : (
                        <>
                          <ChevronRight className="w-3 h-3" />
                          查看学生名单
                        </>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteClass(cls); }}
                      className="p-1.5 rounded-lg transition-all hover:bg-red-50"
                      title="删除班级"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#E53935' }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Student list + AI analysis panel */}
      {selectedClass && (
        <div className="mb-8">
          {/* Student list header */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-2xl flex items-center gap-2" style={{ fontFamily: 'var(--font-caveat), cursive', color: '#3D3D3D', fontWeight: 600 }}>
              <Users className="w-5 h-5" style={{ color: '#C0785C' }} />
              {selectedClass.name} - 学生名单
              <span className="text-sm font-normal ml-2" style={{ color: '#7A756D' }}>
                （共 {students.length} 人）
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowLayerPanel(!showLayerPanel)}
                className="sketchy-sm px-4 py-2 text-sm font-medium transition-all hover:opacity-80 inline-flex items-center gap-2"
                style={{ backgroundColor: showLayerPanel ? '#F5EDE8' : '#EDEBE6', color: showLayerPanel ? '#C0785C' : '#5C6170', border: showLayerPanel ? '1.5px solid #C0785C' : 'none' }}
              >
                <Layers className="w-4 h-4" />
                <span style={{ fontFamily: 'var(--font-caveat), cursive', fontSize: '1rem' }}>分层管理</span>
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="sketchy-sm px-4 py-2 text-sm font-medium transition-all hover:opacity-80 inline-flex items-center gap-2"
                style={{ backgroundColor: '#EDEBE6', color: '#5C6170' }}
              >
                <Upload className="w-4 h-4" />
                <span style={{ fontFamily: 'var(--font-caveat), cursive', fontSize: '1rem' }}>导入名单</span>
              </button>
            </div>
          </div>

          {/* 分层统计概览条 */}
          {students.length > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl flex-wrap" style={{ background: '#F5F0E6' }}>
              <span className="text-xs font-medium" style={{ color: '#7A756D' }}>当前分层：</span>
              {Object.entries(LAYER_CONFIG).map(([key, cfg]) => (
                <span key={key} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}30` }}>
                  {cfg.label} {layerCounts[key] || 0}人
                </span>
              ))}
              <button onClick={() => setShowHistory(!showHistory)} className="text-xs flex items-center gap-1 ml-auto transition-all hover:opacity-70" style={{ color: '#9CA3AF' }}>
                <History className="w-3 h-3" />
                {showHistory ? '收起记录' : '分层记录'}
              </button>
            </div>
          )}

          {/* 分层记录 */}
          {showHistory && layerHistory.length > 0 && (
            <div className="mb-4 rounded-xl p-4 max-h-48 overflow-y-auto" style={{ background: '#FDFBF7', border: '1px solid rgba(184,176,164,0.2)' }}>
              {layerHistory.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b last:border-0" style={{ borderColor: 'rgba(184,176,164,0.1)' }}>
                  <span style={{ color: '#3D3D3D', fontWeight: 500 }}>{h.student_name}</span>
                  <span style={{ color: LAYER_CONFIG[h.old_layer]?.color || '#9CA3AF' }}>{LAYER_CONFIG[h.old_layer]?.label || h.old_layer}</span>
                  <span style={{ color: '#9CA3AF' }}>→</span>
                  <span style={{ color: LAYER_CONFIG[h.new_layer]?.color || '#9CA3AF', fontWeight: 500 }}>{LAYER_CONFIG[h.new_layer]?.label || h.new_layer}</span>
                  <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: h.source === 'ai' ? '#F3E8F9' : '#EBF2EC', color: h.source === 'ai' ? '#9C7BB8' : '#6B8F71' }}>
                    {h.source === 'ai' ? 'AI' : '手动'}
                  </span>
                  {h.exam_score != null && <span style={{ color: '#9CA3AF' }}>{h.exam_score}分</span>}
                  <span className="ml-auto" style={{ color: '#D6D0C6' }}>{h.created_at}</span>
                </div>
              ))}
            </div>
          )}

          {/* 分层管理面板 */}
          {showLayerPanel && students.length > 0 && (
            <div className="mb-4 rounded-xl p-5" style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.15)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color: '#C0785C' }} />
                <span className="text-sm font-bold" style={{ color: '#C0785C' }}>AI 自动分层</span>
                <span className="text-xs" style={{ color: '#9CA3AF' }}>上传一次考试成绩，AI 按比例自动分层（前30%拓展 / 中40%提升 / 后30%基础）</span>
              </div>
              {autoLayerResult && (
                <div className="mb-3 p-3 rounded-lg text-sm" style={{ background: '#EBF2EC', color: '#6B8F71' }}>
                  {autoLayerResult.message}
                  {autoLayerResult.unmatched?.length > 0 && (
                    <div className="mt-1 text-xs">未匹配：{autoLayerResult.unmatched.map((u: any) => u.name || u.student_no || JSON.stringify(u)).join('、')}</div>
                  )}
                </div>
              )}
              <textarea
                value={autoLayerText}
                onChange={(e) => setAutoLayerText(e.target.value)}
                placeholder={'张三,85\n李四,72\n王五,95\n赵六,60'}
                rows={5}
                className="w-full px-4 py-3 rounded-xl outline-none font-mono text-sm mb-3"
                style={{ background: '#F5F0E6', border: '1.5px solid rgba(192,120,92,0.15)', color: '#3D3D3D', resize: 'vertical' }}
              />
              <button
                onClick={handleAutoLayer}
                disabled={autoLayering}
                className="sketchy-sm px-5 py-2 text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-2"
                style={{ backgroundColor: '#C0785C', color: '#fff' }}
              >
                {autoLayering ? <><RefreshCw className="w-4 h-4 animate-spin" /> 分层中...</> : <><Sparkles className="w-4 h-4" /> 开始 AI 分层</>}
              </button>
            </div>
          )}

          {studentsLoading ? (
            <div className="text-center py-8" style={{ color: '#7A756D' }}>
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" style={{ color: '#B8B0A4' }} />
              加载中...
            </div>
          ) : students.length === 0 ? (
            <div
              className="text-center py-12 rounded-xl"
              style={{ background: '#F5F0E6', border: '2px dashed #D6D0C6' }}
            >
              <UserPlus className="w-8 h-8 mx-auto mb-3" style={{ color: '#D6D0C6' }} />
              <p className="text-sm" style={{ color: '#7A756D' }}>
                还没有学生，点击"导入名单"添加学生
              </p>
              <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
                导入格式：每行 <strong style={{ color: '#C0785C' }}>姓名,学号</strong>（学号即学生登录密码）
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {students.map((s) => {
                const layer = s.layer || 'basic';
                const cfg = LAYER_CONFIG[layer] || LAYER_CONFIG.basic;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:shadow-md"
                    style={{ background: '#FDFBF7', border: `1px solid ${cfg.border}25` }}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: cfg.bg, color: cfg.color }}
                    >
                      {s.name[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate" style={{ color: '#3D3D3D' }}>{s.name}</div>
                      <div className="text-xs truncate font-mono" style={{ color: '#9CA3AF' }}>{s.student_no}</div>
                    </div>
                    <button
                      onClick={() => setLayeringStudent(s)}
                      className="text-xs px-2 py-1 rounded-full font-medium shrink-0 transition-all hover:opacity-80"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}40` }}
                      title="点击修改分层"
                    >
                      {cfg.label}
                    </button>
                    <span className="text-xs font-bold shrink-0" style={{ color: '#FFB86C' }}>
                      {s.points}分
                    </span>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* 分层选择弹窗 */}
      {layeringStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
          onClick={() => setLayeringStudent(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setLayeringStudent(null)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5">
              <X size={20} style={{ color: '#9CA3AF' }} />
            </button>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#3D3D3D' }}>选择分层</h3>
            <p className="text-sm mb-4" style={{ color: '#7A756D' }}>
              学生：<strong style={{ color: '#3D3D3D' }}>{layeringStudent.name}</strong>
              （当前：{LAYER_CONFIG[layeringStudent.layer || 'basic']?.label}）
            </p>
            <div className="space-y-2">
              {Object.entries(LAYER_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => handleSetLayer(layeringStudent, key)}
                  className="w-full px-4 py-3 rounded-xl text-left transition-all hover:opacity-80 flex items-center gap-3"
                  style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}${layeringStudent.layer === key ? '' : '30'}` }}
                >
                  <span className="w-3 h-3 rounded-full" style={{ background: cfg.color }} />
                  <span className="text-sm font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                  {layeringStudent.layer === key && <Check className="w-4 h-4 ml-auto" style={{ color: cfg.color }} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create class modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCreate(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5"
            >
              <X size={20} style={{ color: '#9CA3AF' }} />
            </button>
            <h3 className="text-xl font-bold mb-4" style={{ color: '#3D3D3D' }}>创建新班级</h3>
            <p className="text-sm mb-4" style={{ color: '#7A756D' }}>
              创建后系统会自动生成一个6位班级码，方便管理。学生账号由您导入创建
            </p>
            <label className="block text-sm font-medium mb-2" style={{ color: '#C0785C' }}>班级名称</label>
            <input
              type="text"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="例如：五年级一班"
              autoFocus
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{ background: '#F5F0E6', border: '2px solid rgba(192,120,92,0.15)', color: '#3D3D3D' }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateClass(); }}
            />
            <button
              onClick={handleCreateClass}
              disabled={creating}
              className="w-full mt-4 py-3 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: '#C0785C' }}
            >
              {creating ? '创建中...' : '创建班级'}
            </button>
          </div>
        </div>
      )}

      {/* Import students modal */}
      {showImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
          onClick={() => { setShowImport(false); setImportResult(null); setImportText(''); }}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl p-6 shadow-2xl"
            style={{ background: '#FDFBF7', border: '2px solid rgba(192,120,92,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setShowImport(false); setImportResult(null); setImportText(''); }}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5"
            >
              <X size={20} style={{ color: '#9CA3AF' }} />
            </button>
            <h3 className="text-xl font-bold mb-2" style={{ color: '#3D3D3D' }}>
              导入学生名单
                <span className="text-sm font-normal ml-2" style={{ color: '#7A756D' }}>
                  {'->'} {selectedClass?.name}
                </span>
            </h3>

            {importResult && (
              <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                {importResult.message}
                {importResult.skipped?.length > 0 && (
                  <div className="mt-2 text-xs">
                    跳过：{importResult.skipped.map((s: any) => s.name).join('、')}
                  </div>
                )}
              </div>
            )}

            {/* Excel file upload area */}
            <div
              className="mb-3"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleExcelUpload(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleExcelUpload(file);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={excelUploading}
                className="w-full py-4 rounded-xl border-2 border-dashed transition-all hover:opacity-80 disabled:opacity-50 flex flex-col items-center gap-1"
                style={{
                  borderColor: dragOver ? '#C0785C' : 'rgba(192,120,92,0.25)',
                  background: dragOver ? 'rgba(192,120,92,0.05)' : '#FDFBF7',
                }}
              >
                {excelUploading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" style={{ color: '#C0785C' }} />
                    <span className="text-sm" style={{ color: '#C0785C' }}>导入中...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-6 h-6" style={{ color: '#C0785C' }} />
                    <span className="text-sm font-medium" style={{ color: '#C0785C' }}>
                      点击上传 Excel / CSV 文件
                    </span>
                    <span className="text-xs" style={{ color: '#9CA3AF' }}>
                      支持 .xlsx / .csv，需包含学号和姓名列
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px" style={{ background: '#E0E0E0' }} />
              <span className="text-xs" style={{ color: '#9CA3AF' }}>或手动输入</span>
              <div className="flex-1 h-px" style={{ background: '#E0E0E0' }} />
            </div>

            <p className="text-sm mb-2" style={{ color: '#7A756D' }}>
              每行一个学生，格式：<code style={{ background: '#F5F0E6', padding: '2px 6px', borderRadius: '4px' }}>姓名,学号</code>。
              学号即学生登录密码，学生用 <strong>姓名+学号</strong> 登录
            </p>

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'张三,S001\n李四,S002\n王五,S003\n赵六,S004'}
              rows={8}
              className="w-full px-4 py-3 rounded-xl outline-none font-mono text-sm"
              style={{ background: '#F5F0E6', border: '2px solid rgba(192,120,92,0.15)', color: '#3D3D3D', resize: 'vertical' }}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex-1 py-3 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: '#C0785C' }}
              >
                {importing ? '导入中...' : '确认导入'}
              </button>
              <button
                onClick={() => { setShowImport(false); setImportResult(null); setImportText(''); }}
                className="flex-1 py-3 rounded-xl font-medium transition-all hover:bg-black/5"
                style={{ border: '1.5px solid rgba(184,176,164,0.3)', color: '#7A756D' }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
