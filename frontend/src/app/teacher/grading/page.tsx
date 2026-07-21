'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Pencil, History, FileCheck, Lightbulb, BarChart3, Target, RefreshCw, Download, Send, ArrowRight, Plus, Trash2, Save, BookOpen, CheckCircle, XCircle, Clock, Users, ChevronDown, ChevronUp, Camera, AlertCircle, Trophy,
} from 'lucide-react';
import {
  getToken, getStoredUser, classMyList, extractHomeworkFromImage, pollExtractTask, createAssignment, getAssignments, getAssignmentDetail, publishAssignment, deleteAssignment, getAssignmentSubmissions, analyzeAssignment,
  getRandomChallengeAlerts, type ClassInfo, type Assignment, type AssignmentQuestion, type AssignmentStudentSubmission, type RandomChallengeAlert,
} from '@/lib/api';

const pageStyles = `
  .grading-washi-tape { position: absolute; width: 60px; height: 20px; opacity: 0.65; z-index: 2; }
  .grading-washi-green { background: repeating-linear-gradient(45deg, rgba(107,143,113,0.18), rgba(107,143,113,0.18) 3px, rgba(107,143,113,0.10) 3px, rgba(107,143,113,0.10) 6px); }
  .grading-washi-pink { background: repeating-linear-gradient(45deg, rgba(192,120,92,0.18), rgba(192,120,92,0.18) 3px, rgba(192,120,92,0.10) 3px, rgba(192,120,92,0.10) 6px); }
  .grading-sticky-note { position: relative; padding: 12px 14px; background-color: #FFF9E6; box-shadow: 2px 2px 4px rgba(60,60,60,0.1); }
  .grading-sticky-note::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); width: 30px; height: 12px; background: rgba(192,120,92,0.25); border-radius: 2px; }
  .grading-margin-line { border-left: 2px solid rgba(192,120,92,0.25); }
  .grading-lined-paper { background-image: repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(180,170,155,0.2) 27px, rgba(180,170,155,0.2) 28px); background-color: #FDFBF7; }
  .grading-paper-bg { background-color: #F5F0E6; background-image: repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(180,170,155,0.15) 31px, rgba(180,170,155,0.15) 32px); }
`;

const COLORS = { primary: '#C0785C', green: '#6B8F71', text: '#3D3D3D', muted: '#7A756D', paper: '#FDFBF7', bg: '#F0EBE0' };

export default function TeacherHomework() {
  const [token, setToken] = useState('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'list' | 'detail' | 'alerts'>('upload');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{text:string;type:'success'|'error'|'info'}|null>(null);
  const [extractedQuestions, setExtractedQuestions] = useState<AssignmentQuestion[]>([]);
  const [extractStatus, setExtractStatus] = useState<'idle'|'extracting'|'completed'|'failed'>('idle');
  const [extractTaskId, setExtractTaskId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number|''>('');
  const [dueDate, setDueDate] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDesc, setAssignmentDesc] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Assignment|null>(null);
  const [submissions, setSubmissions] = useState<AssignmentStudentSubmission[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [alerts, setAlerts] = useState<RandomChallengeAlert[]>([]);
  const [alertsClassId, setAlertsClassId] = useState<number|''>('');
  const [alertsLoading, setAlertsLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout|null>(null);

  useEffect(() => { const t=getToken(); if(t) setToken(t); }, []);

  const loadClasses = useCallback(async () => {
    if(!token) return;
    try { const r=await classMyList(token); setClasses(r.classes||[]); if(r.classes?.length===1) setSelectedClassId(r.classes[0].id); } catch(e){}
  }, [token]);

  const loadAssignments = useCallback(async () => {
    if(!token) return;
    try { const r=await getAssignments(token); setAssignments(r.assignments||[]); } catch(e){}
  }, [token]);

  useEffect(() => { if(token){ loadClasses(); loadAssignments(); } }, [token, loadClasses, loadAssignments]);

  const loadAlerts = useCallback(async (cid: number) => {
    if(!token) return;
    setAlertsLoading(true);
    try { const r = await getRandomChallengeAlerts(token, cid); setAlerts(r.alerts||[]); } catch(e:any){ show(e.message||'加载预警失败','error'); } finally { setAlertsLoading(false); }
  }, [token]);

  const show = (text:string, type:'success'|'error'|'info'='info') => { setMsg({text,type}); setTimeout(()=>setMsg(null),4000); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if(!file||!token) return;
    setLoading(true); setExtractStatus('extracting'); setExtractedQuestions([]);
    try { const r=await extractHomeworkFromImage(token,file); setExtractTaskId(r.task_id); show('AI 正在识别题目，请稍候...','info'); startPoll(r.task_id); }
    catch(err:any){ setExtractStatus('failed'); show(err.message||'上传失败','error'); } finally { setLoading(false); }
  };

  const startPoll = (taskId:string) => {
    if(pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try { const r=await pollExtractTask(token,taskId); if(r.status==='completed'){ setExtractStatus('completed'); if(r.result?.questions?.length){ setExtractedQuestions(r.result.questions); setAssignmentTitle(r.result.title||'AI识别的作业'); } else show('未识别到题目，请手动添加','info'); if(pollRef.current) clearInterval(pollRef.current); } else if(r.status==='failed'){ setExtractStatus('failed'); show(r.error||'识别失败','error'); if(pollRef.current) clearInterval(pollRef.current); } } catch(e){}
    }, 2000);
  };
  useEffect(() => () => { if(pollRef.current) clearInterval(pollRef.current); }, []);

  const updateQ = (idx:number, field:keyof AssignmentQuestion, val:string) => setExtractedQuestions(prev=>prev.map((q,i)=>i===idx?{...q,[field]:val}:q));
  const addQ = () => setExtractedQuestions(prev=>[...prev,{index:prev.length+1,question_text:'',correct_answer:'',analysis:'',knowledge_point:'',difficulty:'basic'}]);
  const removeQ = (idx:number) => setExtractedQuestions(prev=>prev.filter((_,i)=>i!==idx).map((q,i)=>({...q,index:i+1})));

  const create = async (publish=false) => {
    if(!selectedClassId) return show('请选择发布班级','error');
    if(!assignmentTitle.trim()) return show('请输入作业标题','error');
    if(extractedQuestions.length===0) return show('请至少添加一道题目','error');
    setLoading(true);
    try { const r=await createAssignment(token,{class_id:Number(selectedClassId),title:assignmentTitle,description:assignmentDesc,unit_code:unitCode,source_image:'',questions:extractedQuestions,due_date:dueDate||undefined}); if(publish){ await publishAssignment(token,r.id); show('作业已发布','success'); } else show('已保存草稿','success'); setExtractedQuestions([]); setAssignmentTitle(''); setAssignmentDesc(''); setUnitCode(''); setDueDate(''); setActiveTab('list'); loadAssignments(); } catch(err:any){ show(err.message||'创建失败','error'); } finally { setLoading(false); }
  };

  const openDetail = async (id:number) => { setDetailLoading(true); setActiveTab('detail'); try { const [d,s,a]=await Promise.all([getAssignmentDetail(token,id),getAssignmentSubmissions(token,id),analyzeAssignment(token,id).catch(()=>null)]); setSelected(d); setSubmissions(s.students||[]); setAnalysis(a); } catch(err:any){ show(err.message||'加载失败','error'); } finally { setDetailLoading(false); } };
  const del = async (id:number) => { if(!confirm('确定删除？')) return; try { await deleteAssignment(token,id); show('已删除','success'); loadAssignments(); } catch(err:any){ show(err.message||'删除失败','error'); } };

  return (
    <><style>{pageStyles}</style>
    <div className="relative" style={{fontFamily:"'Noto Sans SC',system-ui,sans-serif",color:COLORS.text}}>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl" style={{fontWeight:600,fontFamily:'var(--font-hand)'}}>拍照出题</h1>
          <p className="text-sm mt-1" style={{color:COLORS.muted}}>上传纸质/文档题目，AI识别后生成作业卡片，按班级发布给学生</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={()=>setActiveTab('upload')} className="sketchy-sm px-4 py-2 text-sm font-medium" style={{backgroundColor:activeTab==='upload'?COLORS.primary:COLORS.bg,color:activeTab==='upload'?'#fff':COLORS.text}}><Camera className="w-3.5 h-3.5 inline mr-1"/>上传题目</button>
          <button onClick={()=>setActiveTab('list')} className="sketchy-sm px-4 py-2 text-sm font-medium" style={{backgroundColor:activeTab==='list'?COLORS.primary:COLORS.bg,color:activeTab==='list'?'#fff':COLORS.text}}><History className="w-3.5 h-3.5 inline mr-1"/>作业卡片</button>
          <button onClick={()=>setActiveTab('alerts')} className="sketchy-sm px-4 py-2 text-sm font-medium" style={{backgroundColor:activeTab==='alerts'?COLORS.primary:COLORS.bg,color:activeTab==='alerts'?'#fff':COLORS.text}}><AlertCircle className="w-3.5 h-3.5 inline mr-1"/>考察预警</button>
        </div>
      </div>

      {msg && <div className="mb-4 sketchy-sm px-4 py-3 flex items-center gap-2" style={{backgroundColor:msg.type==='success'?'#E8F5E9':msg.type==='error'?'#FFEBEE':'#FFF8E1',color:msg.type==='success'?'#2E7D32':msg.type==='error'?'#C62828':'#F57C00'}}>{msg.type==='success'?<CheckCircle className="w-4 h-4"/>:msg.type==='error'?<AlertCircle className="w-4 h-4"/>:<Lightbulb className="w-4 h-4"/>}{msg.text}</div>}

      {activeTab==='upload' && (
        <>
          {!extractedQuestions.length && extractStatus!=='completed' && (
            <div className="mb-8 sketchy p-8 relative overflow-hidden cursor-pointer transition-all hover:opacity-90" style={{backgroundColor:COLORS.bg,boxShadow:'var(--shadow-teacher-float)'}} onClick={()=>fileRef.current?.click()}>
              <div className="grading-washi-tape grading-washi-green" style={{top:-4,left:30,transform:'rotate(-3deg)'}} />
              <div className="grading-washi-tape grading-washi-pink" style={{top:-4,right:40,transform:'rotate(2deg)'}} />
              <div className="border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center" style={{borderColor:'#B8B0A4',backgroundColor:COLORS.paper}}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{backgroundColor:'#EDEBE6'}}><Pencil className="w-7 h-7" style={{color:'#5C6170'}}/></div>
                <p className="text-2xl" style={{fontWeight:500,fontFamily:'var(--font-hand)'}}>{extractStatus==='extracting'?'AI正在识别题目...':'将试卷照片拖入信封~'}</p>
                <p className="text-sm mt-2" style={{color:COLORS.muted}}>支持 JPG、PNG 格式，建议拍照清晰、光线充足</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={loading} />
                <button onClick={e=>{e.stopPropagation();fileRef.current?.click();}} disabled={loading} className="sketchy-sm mt-5 px-6 py-2.5 text-sm font-medium disabled:opacity-50" style={{backgroundColor:COLORS.primary,color:'#fff'}}><Upload className="w-3.5 h-3.5 inline mr-1.5"/>{loading?'上传中...':'选择照片上传'}</button>
              </div>
            </div>
          )}

          {extractStatus==='extracting' && !extractedQuestions.length && (
            <div className="mb-8 sketchy p-6 text-center" style={{backgroundColor:COLORS.paper}}>
              <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-3" style={{borderColor:COLORS.primary,borderTopColor:'transparent'}} />
              <p className="text-lg" style={{fontFamily:'var(--font-hand)'}}>AI 正在逐题识别，请稍候...</p>
              <p className="text-sm mt-1" style={{color:COLORS.muted}}>大约需要 10-30 秒</p>
            </div>
          )}

          {(extractedQuestions.length>0 || extractStatus==='completed') && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl" style={{fontWeight:600,fontFamily:'var(--font-hand)'}}><FileCheck className="w-5 h-5 inline mr-1" style={{color:COLORS.green}}/>识别结果编辑</h2>
                <button onClick={()=>{setExtractedQuestions([]);setAssignmentTitle('');setAssignmentDesc('');setUnitCode('');setDueDate('');setExtractStatus('idle');}} className="text-sm underline" style={{color:COLORS.muted}}>重新上传</button>
              </div>

              <div className="paper-card sketchy p-5 mb-5" style={{backgroundColor:COLORS.paper}}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium block mb-1" style={{color:COLORS.muted}}>作业标题</label><input type="text" value={assignmentTitle} onChange={e=>setAssignmentTitle(e.target.value)} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}} placeholder="如：第三单元测试卷"/></div>
                  <div><label className="text-sm font-medium block mb-1" style={{color:COLORS.muted}}>发布班级</label><select value={selectedClassId} onChange={e=>setSelectedClassId(Number(e.target.value)||'')} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}}><option value="">选择班级</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className="text-sm font-medium block mb-1" style={{color:COLORS.muted}}>单元/课时编码</label><input type="text" value={unitCode} onChange={e=>setUnitCode(e.target.value)} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}} placeholder="如：5A-U3-L1"/></div>
                  <div><label className="text-sm font-medium block mb-1" style={{color:COLORS.muted}}>截止时间</label><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}}/></div>
                  <div className="md:col-span-2"><label className="text-sm font-medium block mb-1" style={{color:COLORS.muted}}>作业说明</label><textarea value={assignmentDesc} onChange={e=>setAssignmentDesc(e.target.value)} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}} rows={2} placeholder="可填写注意事项、答题要求等"/></div>
                </div>
              </div>

              <div className="space-y-4 mb-5">
                {extractedQuestions.map((q,idx)=> (
                  <div key={idx} className="paper-card sketchy-sm p-4 relative" style={{backgroundColor:COLORS.paper}}>
                    <div className="flex items-center justify-between mb-3"><span className="text-sm font-semibold" style={{color:COLORS.primary}}>第 {q.index} 题</span><button onClick={()=>removeQ(idx)} style={{color:'#ef4444'}}><Trash2 className="w-4 h-4"/></button></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2"><label className="text-xs block mb-1" style={{color:COLORS.muted}}>题目内容</label><textarea value={q.question_text} onChange={e=>updateQ(idx,'question_text',e.target.value)} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}} rows={2}/></div>
                      <div><label className="text-xs block mb-1" style={{color:COLORS.muted}}>正确答案</label><input type="text" value={q.correct_answer} onChange={e=>updateQ(idx,'correct_answer',e.target.value)} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}}/></div>
                      <div><label className="text-xs block mb-1" style={{color:COLORS.muted}}>知识点</label><input type="text" value={q.knowledge_point} onChange={e=>updateQ(idx,'knowledge_point',e.target.value)} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}}/></div>
                      <div className="md:col-span-2"><label className="text-xs block mb-1" style={{color:COLORS.muted}}>解析</label><textarea value={q.analysis} onChange={e=>updateQ(idx,'analysis',e.target.value)} className="w-full sketchy-sm px-3 py-2 text-sm" style={{backgroundColor:'#fff'}} rows={2}/></div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addQ} className="sketchy-sm px-4 py-2 text-sm font-medium mb-5" style={{backgroundColor:COLORS.bg,color:COLORS.text}}><Plus className="w-3.5 h-3.5 inline mr-1"/>添加题目</button>
              <div className="flex flex-wrap gap-3">
                <button onClick={()=>create(false)} disabled={loading} className="sketchy-sm px-6 py-2.5 text-sm font-medium disabled:opacity-50" style={{backgroundColor:COLORS.bg,color:COLORS.text}}><Save className="w-3.5 h-3.5 inline mr-1.5"/>{loading?'保存中...':'保存为草稿'}</button>
                <button onClick={()=>create(true)} disabled={loading} className="sketchy-sm px-6 py-2.5 text-sm font-medium disabled:opacity-50" style={{backgroundColor:COLORS.green,color:'#fff'}}><Send className="w-3.5 h-3.5 inline mr-1.5"/>{loading?'发布中...':'发布作业'}</button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab==='list' && (
        <div className="mb-8">
          <h2 className="text-2xl mb-4" style={{fontWeight:600,fontFamily:'var(--font-hand)'}}><BookOpen className="w-5 h-5 inline mr-1" style={{color:COLORS.primary}}/>已创建作业</h2>
          {assignments.length===0 ? <div className="paper-card sketchy p-8 text-center" style={{color:COLORS.muted}}>暂无作业，点击上方「上传题目」开始创建</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignments.map(a=> (
                <div key={a.id} className="paper-card sketchy-sm p-5 cursor-pointer transition-all hover:-translate-y-1" style={{backgroundColor:COLORS.paper}} onClick={()=>openDetail(a.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg" style={{fontFamily:'var(--font-hand)'}}>{a.title}</h3>
                    <span className="text-xs px-2 py-1 rounded-full" style={{backgroundColor:a.status==='published'?'#E8F5E9':'#FFF8E1',color:a.status==='published'?'#2E7D32':'#F57C00'}}>{a.status==='published'?'已发布':'草稿'}</span>
                  </div>
                  <p className="text-sm mb-2" style={{color:COLORS.muted}}>{a.class_name||'未指定班级'}</p>
                  <div className="flex items-center gap-4 text-sm" style={{color:COLORS.muted}}><span className="flex items-center gap-1"><FileCheck className="w-4 h-4"/> {a.question_count} 题</span><span className="flex items-center gap-1"><Clock className="w-4 h-4"/> {a.due_date?a.due_date.slice(0,10):'无截止'}</span></div>
                  <div className="mt-3 flex gap-2">
                    {a.status==='draft' && <button onClick={e=>{e.stopPropagation(); publishAssignment(token,a.id).then(()=>{show('已发布','success'); loadAssignments();}).catch((err:any)=>show(err.message||'失败','error'));}} className="sketchy-sm px-3 py-1 text-xs font-medium" style={{backgroundColor:COLORS.green,color:'#fff'}}>发布</button>}
                    <button onClick={e=>{e.stopPropagation(); del(a.id);}} className="sketchy-sm px-3 py-1 text-xs font-medium" style={{backgroundColor:'#FFEBEE',color:'#C62828'}}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab==='detail' && selected && (
        <div className="mb-8">
          <button onClick={()=>setActiveTab('list')} className="mb-4 sketchy-sm px-4 py-2 text-sm font-medium" style={{backgroundColor:COLORS.bg,color:COLORS.text}}><ArrowRight className="w-3.5 h-3.5 inline mr-1 rotate-180"/>返回列表</button>
          {detailLoading ? <div className="paper-card sketchy p-8 text-center">加载中...</div> : (
            <>
              <div className="paper-card sketchy p-5 mb-5" style={{backgroundColor:COLORS.paper}}>
                <h2 className="text-2xl mb-2" style={{fontWeight:600,fontFamily:'var(--font-hand)'}}>{selected.title}</h2>
                <p className="text-sm mb-3" style={{color:COLORS.muted}}>{selected.description}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 sketchy-sm" style={{backgroundColor:'#fff'}}><p className="text-xs" style={{color:COLORS.muted}}>班级</p><p className="font-semibold">{selected.class_name}</p></div>
                  <div className="text-center p-3 sketchy-sm" style={{backgroundColor:'#fff'}}><p className="text-xs" style={{color:COLORS.muted}}>题目数</p><p className="font-semibold">{selected.questions?.length||0}</p></div>
                  <div className="text-center p-3 sketchy-sm" style={{backgroundColor:'#fff'}}><p className="text-xs" style={{color:COLORS.muted}}>提交率</p><p className="font-semibold">{selected.stats?.submission_rate||0}%</p></div>
                  <div className="text-center p-3 sketchy-sm" style={{backgroundColor:'#fff'}}><p className="text-xs" style={{color:COLORS.muted}}>平均正确率</p><p className="font-semibold">{selected.stats?.avg_correct_rate||0}%</p></div>
                </div>
              </div>

              <div className="paper-card sketchy p-5 mb-5" style={{backgroundColor:COLORS.paper}}>
                <h3 className="text-xl mb-3" style={{fontWeight:600,fontFamily:'var(--font-hand)'}}><BookOpen className="w-5 h-5 inline mr-1" style={{color:COLORS.primary}}/>题目与答案</h3>
                <div className="space-y-3">
                  {selected.questions?.map((q,i)=> (
                    <div key={i} className="grading-lined-paper rounded p-3">
                      <p className="text-sm font-medium">{i+1}. {q.question_text}</p>
                      <p className="text-sm mt-1" style={{color:COLORS.green}}>答案：{q.correct_answer}</p>
                      <p className="text-xs mt-1" style={{color:COLORS.muted}}>知识点：{q.knowledge_point}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="paper-card sketchy p-5 mb-5" style={{backgroundColor:COLORS.paper}}>
                <h3 className="text-xl mb-3 flex items-center gap-2" style={{fontWeight:600,fontFamily:'var(--font-hand)'}}>
                  <Users className="w-5 h-5" style={{color:COLORS.primary}}/>学生完成情况
                  <span className="text-sm font-normal" style={{color:COLORS.muted}}>({submissions.filter(s=>s.done).length}/{submissions.length} 已提交)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {submissions.map(s=> (
                    <div key={s.id} className={`sketchy-sm p-3 ${s.done?'':'opacity-60'}`} style={{backgroundColor:s.done?'#fff':'#f5f5f5'}}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{s.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${s.done?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>{s.done?'已完成':'未提交'}</span>
                      </div>
                      {s.done && (
                        <div className="mt-2 text-sm" style={{color:COLORS.muted}}>
                          <span>正确 {s.correct_count}/{s.total_questions}</span>
                          <span className="ml-3">准确率 {s.accuracy}%</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {analysis && analysis.common_weak_points?.length > 0 && (
                <div className="paper-card sketchy p-5 mb-5" style={{backgroundColor:COLORS.paper}}>
                  <h3 className="text-xl mb-3 flex items-center gap-2" style={{fontWeight:600,fontFamily:'var(--font-hand)'}}>
                    <BarChart3 className="w-5 h-5" style={{color:COLORS.primary}}/>AI 学情分析
                  </h3>
                  <p className="text-sm mb-3" style={{color:COLORS.muted}}>{analysis.overall_analysis}</p>
                  <div className="space-y-3">
                    {analysis.common_weak_points.map((wp:any,i:number)=> (
                      <div key={i} className="grading-sticky-note sketchy-sm" style={{transform:'rotate('+(i%2===0?'0.5':'-0.5')+'deg)'}}>
                        <p className="font-medium text-sm">{wp.knowledge_point} <span style={{color:COLORS.muted}}>(错误率 {Math.round(wp.error_rate*100)}%)</span></p>
                        <p className="text-xs mt-1" style={{color:COLORS.muted}}>根因：{wp.root_cause}</p>
                        <p className="text-xs mt-1" style={{color:COLORS.primary}}>建议：{wp.teaching_suggestion}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">推荐行动：</p>
                    <ul className="list-disc list-inside text-sm" style={{color:COLORS.muted}}>
                      {analysis.urgent_actions?.map((a:string,i:number)=> <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab==='alerts' && (
        <div className="mb-8">
          <h2 className="text-2xl mb-1" style={{fontWeight:600,fontFamily:'var(--font-hand)'}}><AlertCircle className="w-5 h-5 inline mr-1" style={{color:'#C62828'}}/>随机考察预警</h2>
          <p className="text-sm mb-4" style={{color:COLORS.muted}}>学生作业全对后触发的"再考考你"挑战中，出现错误的学生会显示在这里，便于及时干预</p>

          <div className="flex items-center gap-3 mb-5">
            <select
              value={alertsClassId}
              onChange={e=>{ const v=Number(e.target.value)||''; setAlertsClassId(v); if(v) loadAlerts(v as number); }}
              className="sketchy-sm px-3 py-2 text-sm"
              style={{backgroundColor:'#fff'}}
            >
              <option value="">选择班级</option>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {alertsClassId && (
              <button onClick={()=>loadAlerts(alertsClassId as number)} className="sketchy-sm px-3 py-2 text-sm font-medium" style={{backgroundColor:COLORS.bg,color:COLORS.text}}>
                <RefreshCw className="w-3.5 h-3.5 inline mr-1"/>刷新
              </button>
            )}
          </div>

          {!alertsClassId ? (
            <div className="paper-card sketchy p-8 text-center" style={{color:COLORS.muted}}>请选择班级查看预警</div>
          ) : alertsLoading ? (
            <div className="paper-card sketchy p-8 text-center">
              <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3" style={{borderColor:COLORS.primary,borderTopColor:'transparent'}} />
              加载中...
            </div>
          ) : alerts.length===0 ? (
            <div className="paper-card sketchy p-8 text-center" style={{color:COLORS.muted}}>
              <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{color:COLORS.green}}/>
              暂无预警，学生表现都很好！
            </div>
          ) : (
            <div className="space-y-4">
              {alerts.map(a=> (
                <div key={a.id} className="paper-card sketchy-sm p-4" style={{backgroundColor:'#FFF8E1',borderLeft:'4px solid #F57C00'}}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4" style={{color:'#F57C00'}}/>
                      <span className="font-semibold">{a.student_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{backgroundColor:'#FFEBEE',color:'#C62828'}}>
                        挑战错 {a.wrong_count}/{a.total_questions} 题
                      </span>
                    </div>
                    <span className="text-xs" style={{color:COLORS.muted}}>{a.lesson_title}</span>
                  </div>
                  <p className="text-xs mb-2" style={{color:COLORS.muted}}>
                    该同学作业全对但在随机考察中出现错误，建议关注是否独立完成作业。
                  </p>
                  <div className="space-y-2">
                    {a.wrong_answers?.map((wa,i)=>(
                      <div key={i} className="rounded p-2 text-sm" style={{backgroundColor:'rgba(255,255,255,0.7)'}}>
                        <p className="font-medium">{i+1}. {wa.question}</p>
                        <div className="flex gap-4 mt-1 text-xs">
                          <span style={{color:'#C62828'}}>学生答案：{wa.student_answer||'(未作答)'}</span>
                          <span style={{color:COLORS.green}}>正确答案：{wa.correct_answer}</span>
                        </div>
                        {wa.knowledge_point && <p className="text-xs mt-1" style={{color:COLORS.muted}}>知识点：{wa.knowledge_point}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div></>
  );
}
