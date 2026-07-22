'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Award, CheckCircle, Star, TrendingUp, RefreshCw, BookOpen, FileText, AlertTriangle, Target, Users, Plus, Trash2, Upload, Brain, Printer, Layers, BarChart3, X } from 'lucide-react';
import { getAnalyticsOverview, analyzeClassErrors, createExam, uploadExamImage, pollExamExtractTask, listExams, inputExamScores, getExamScores, deleteExam, generateWeeklyPlan, weeklyAutoLayer, getToken, classMyList, AnalyticsOverview, ExamInfo, ExamScore, TieredWeeklyPlan } from '@/lib/api';

const COL: Record<string,{bg:string;t:string;b:string;l:string}> = { basic:{bg:'rgba(192,120,92,0.15)',t:'#C0785C',b:'#C0785C',l:'基础'}, advanced:{bg:'rgba(212,168,67,0.15)',t:'#D4A843',b:'#D4A843',l:'提升'}, extension:{bg:'rgba(107,143,113,0.15)',t:'#6B8F71',b:'#6B8F71',l:'拓展'} };

export default function TeacherAnalytics() {
  const [token,setToken]=useState(''); const [classes,setClasses]=useState<any[]>([]); const [cid,setCid]=useState<number|''>('');
  const [tab,setTab]=useState<'overview'|'errors'|'exams'|'plans'>('overview');
  const [ov,setOv]=useState<AnalyticsOverview|null>(null); const [ea,setEa]=useState<any>(null);
  const [exams,setExams]=useState<ExamInfo[]>([]); const [selExam,setSelExam]=useState<ExamInfo|null>(null);
  const [wp,setWp]=useState<TieredWeeklyPlan|null>(null); const [la,setLa]=useState<any[]>([]);
  const [loading,setLoading]=useState(false); const [msg,setMsg]=useState<{t:string;c:'success'|'error'|'info'}|null>(null);
  const [showExamModal,setShowExamModal]=useState(false); const [showScoreModal,setShowScoreModal]=useState(false);
  const [eTitle,setETitle]=useState(''); const [eDesc,setEDesc]=useState(''); const [eUnit,setEUnit]=useState(''); const [eMax,setEMax]=useState(100); const [eDate,setEDate]=useState(new Date().toISOString().split('T')[0]);
  const [si,setSi]=useState<Record<number,number>>({}); const [extracting,setExtracting]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null); const pollRef=useRef<NodeJS.Timeout|null>(null);
  useEffect(()=>{const t=getToken();if(t)setToken(t);},[]);
  const show=(t:string,c:'success'|'error'|'info'='info')=>{setMsg({t,c});setTimeout(()=>setMsg(null),4000);};
  const lc=useCallback(async()=>{if(!token)return;try{const r=await classMyList(token);setClasses(r.classes||[]);if(r.classes?.length===1)setCid(r.classes[0].id);}catch(e){}},[token]);
  useEffect(()=>{if(token)lc();},[token,lc]);
  const lo=useCallback(async()=>{if(!token||!cid)return;setLoading(true);try{const d=await getAnalyticsOverview(token,Number(cid));setOv(d);}catch(e:any){show(e.message||'加载失败','error');}finally{setLoading(false);}},[token,cid]);
  useEffect(()=>{if(cid)lo();},[cid,lo]);
  const le=useCallback(async()=>{if(!token||!cid)return;try{const r=await listExams(token,Number(cid));setExams(r.exams||[]);}catch(e){}},[token,cid]);
  useEffect(()=>{if(tab==='exams'&&cid)le();},[tab,cid,le]);
  useEffect(()=>()=>{if(pollRef.current)clearInterval(pollRef.current);},[]);

  const runEA=async()=>{if(!token||!cid)return;setLoading(true);try{const r=await analyzeClassErrors(token,Number(cid));setEa(r.analysis);show('AI分析完成','success');}catch(e:any){show(e.message||'失败','error');}finally{setLoading(false);}};
  const hCE=async()=>{if(!eTitle.trim())return show('请输入名称','error');if(!token||!cid)return;setLoading(true);try{await createExam(token,Number(cid),{title:eTitle,description:eDesc,unit_code:eUnit,max_score:eMax,exam_date:eDate});show('创建成功','success');setShowExamModal(false);setETitle('');setEDesc('');setEUnit('');le();}catch(e:any){show(e.message||'失败','error');}finally{setLoading(false);}};
  const hUI=async(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f||!token||!cid)return;setExtracting(true);try{const r=await uploadExamImage(token,Number(cid),f);if(pollRef.current)clearInterval(pollRef.current);pollRef.current=setInterval(async()=>{try{const pr=await pollExamExtractTask(token,r.task_id);if(pr.status==='completed'){setExtracting(false);if(pr.result?.questions?.length)show(`识别到${pr.result.questions.length}道题`,'success');if(pollRef.current)clearInterval(pollRef.current);}else if(pr.status==='failed'){setExtracting(false);show(pr.error||'失败','error');if(pollRef.current)clearInterval(pollRef.current);}}catch(e2){}},2000);}catch(e:any){setExtracting(false);show(e.message||'失败','error');}};
  const hDE=async(id:number)=>{if(!confirm('确定删除？'))return;if(!token||!cid)return;try{await deleteExam(token,Number(cid),id);show('已删除','success');le();}catch(e:any){show(e.message||'失败','error');}};
  const oSM=async(ex:ExamInfo)=>{setSelExam(ex);setShowScoreModal(true);if(!token||!cid)return;try{const r=await getExamScores(token,Number(cid),ex.id);const ii:Record<number,number>={};r.scores?.forEach((s:any)=>{ii[s.student_id]=s.score;});setSi(ii);}catch(e){}};
  const sS=async()=>{if(!token||!cid||!selExam||!ov)return;const sc=ov.students.filter(s=>si[s.id]!==undefined).map(s=>({student_id:s.id,score:si[s.id]||0,correct_count:0,total_count:100}));if(!sc.length)return show('请录入至少一个成绩','error');setLoading(true);try{await inputExamScores(token,Number(cid),selExam.id,sc);show('成绩已保存','success');setShowScoreModal(false);le();lo();}catch(e:any){show(e.message||'失败','error');}finally{setLoading(false);}};
  const rAL=async()=>{if(!token||!cid)return;setLoading(true);try{const r=await weeklyAutoLayer(token,Number(cid));setLa(r.adjustments||[]);show('分层调整完成','success');lo();}catch(e:any){show(e.message||'失败','error');}finally{setLoading(false);}};
  const rWP=async(tier:'basic'|'advanced'|'extension')=>{if(!token||!cid)return;setWp(null);setLoading(true);try{const r=await generateWeeklyPlan(token,Number(cid),tier);setWp(r);show('方案生成完成','success');}catch(e:any){show(e.message||'失败','error');}finally{setLoading(false);}};
  const pP=()=>{if(!wp?.plan?.printable_html)return;const w=window.open('','_blank','width=800,height=600');if(w){w.document.write(wp.plan.printable_html);w.document.close();}};

  const trendSvg=()=>{if(!ov?.exam_trend?.length)return null;const d=ov.exam_trend;const W=600,H=220,LH=40,RH=560,TH=20,BH=200;const mx=Math.max(...d.map(x=>x.avg_score),0)+10,mn=Math.max(Math.min(...d.map(x=>x.avg_score),100)-10,0),rg=mx-mn||1,xs=d.length>1?(RH-LH)/(d.length-1):0;const tY=(v:number)=>BH-(v-mn)/rg*(BH-TH);const pts=d.map((x,i)=>`${LH+i*xs},${tY(x.avg_score)}`).join(' ');const yt=[0.2,0.4,0.6,0.8,1].map(r=>Math.round(mn+r*rg)).filter((v,i,a)=>a.indexOf(v)===i);return(<svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{maxHeight:240}}><line x1={LH} y1={TH} x2={LH} y2={BH} stroke="#B8B0A4" strokeWidth="1.5" strokeDasharray="4,2"/><line x1={LH} y1={BH} x2={RH} y2={BH} stroke="#B8B0A4" strokeWidth="1.5" strokeDasharray="4,2"/>{yt.map(v=>{const y=tY(v);return<line key={v} x1={LH} y1={y} x2={RH} y2={y} stroke="#D6D0C6" strokeWidth="0.5" strokeDasharray="3,3"/>;})}{yt.map(v=>{const y=tY(v);return<text key={v} x={LH-6} y={y+4} textAnchor="end" fontSize="10" fill="#7A756D">{v}</text>;})}{d.map((x,i)=><text key={`l${i}`} x={LH+i*xs} y={BH+16} textAnchor="middle" fontSize="10" fill="#7A756D">{x.title?.slice(0,6)||`#${i+1}`}</text>)}<polyline points={pts} fill="none" stroke="#5C6170" strokeWidth="2" strokeDasharray="6,3"/>{d.map((x,i)=><circle key={`c${i}`} cx={LH+i*xs} cy={tY(x.avg_score)} r="4" fill="#FDFBF7" stroke="#5C6170" strokeWidth="2"/>)}{d.map((x,i)=><text key={`s${i}`} x={LH+i*xs} y={tY(x.avg_score)-8} textAnchor="middle" fontSize="9" fill="#5C6170" fontWeight="bold">{x.avg_score}</text>)}</svg>);};

  return(
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><span className="pencil-underline">学情分析</span></h1><p className="text-sm mt-1" style={{color:'#7A756D'}}>真实数据驱动的教学洞察</p></div>
        <button onClick={lo} disabled={!cid||loading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{borderColor:'#B8B0A4',color:'#5C6170'}}><RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`}/>刷新</button>
      </div>
      {msg&&<div className="px-4 py-2 rounded-md text-sm" style={{backgroundColor:msg.c==='error'?'rgba(192,120,92,0.12)':msg.c==='success'?'rgba(107,143,113,0.12)':'rgba(212,168,67,0.12)',color:msg.c==='error'?'#C0785C':msg.c==='success'?'#6B8F71':'#9A7B2A'}}>{msg.t}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <select value={cid} onChange={e=>setCid(e.target.value?Number(e.target.value):'')} className="sketchy-sm px-3 py-2 text-sm bg-transparent outline-none cursor-pointer" style={{color:'#3D3D3D',backgroundColor:'#FDFBF7'}}><option value="">选择班级</option>{classes.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {(['overview','errors','exams','plans'] as const).map(t=>(<button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 text-sm rounded-md transition-all ${tab===t?'text-white':''}`} style={{backgroundColor:tab===t?'#5C6170':'transparent',color:tab===t?'#fff':'#7A756D',border:tab===t?'none':'1px dashed #B8B0A4'}}>{t==='overview'?'概览':t==='errors'?'共性错题':t==='exams'?'考试管理':'分层方案'}</button>))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={hUI} className="hidden" />
      {!cid&&<div className="text-center py-20 text-gray-400">请先选择一个班级</div>}
      {cid&&!ov&&!loading&&<div className="text-center py-10 text-gray-400">数据加载中...</div>}
      {ov&&(
        <>
          {tab==='overview'&&(
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[{icon:Award,label:'班级平均分',value:ov.exams.avg_score||'-',color:'#C0785C'},{icon:CheckCircle,label:'及格率',value:ov.exams.pass_rate>0?`${ov.exams.pass_rate}%`:'-',color:'#6B8F71'},{icon:Star,label:'优秀率',value:ov.exams.excellent_rate>0?`${ov.exams.excellent_rate}%`:'-',color:'#C0785C'},{icon:TrendingUp,label:'错题康复率',value:ov.errors.resolved_rate>0?`${ov.errors.resolved_rate}%`:'-',color:'#5C6170'}].map((s,i)=>(<div key={i} className="paper-card sketchy p-5 flex flex-col items-center" style={{boxShadow:'var(--shadow-teacher-card)'}}><s.icon className="w-5 h-5 mb-2" style={{color:s.color}}/><span className="text-3xl font-bold" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}>{s.value}</span><span className="text-xs mt-1" style={{color:'#7A756D'}}>{s.label}</span></div>))}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                {[{icon:BookOpen,label:'预习任务',val:ov.preview.total_tasks,sub:`提交率${ov.preview.submission_rate}%`},{icon:FileText,label:'作业',val:ov.homework.total_assignments,sub:`提交率${ov.homework.submission_rate}%`},{icon:AlertTriangle,label:'错题总数',val:ov.errors.total,sub:`${ov.errors.unresolved}待康复`},{icon:Target,label:'考试记录',val:ov.exams.total,sub:`${ov.student_count}名学生`}].map((it,i)=>(<div key={i} className="paper-card sketchy p-3 flex items-center gap-3"><it.icon className="w-4 h-4 shrink-0" style={{color:'#7A756D'}}/><div><div className="font-bold text-lg" style={{color:'#5C6170'}}>{it.val}</div><div className="text-xs" style={{color:'#7A756D'}}>{it.sub}</div></div></div>))}
              </div>
              <div className="paper-card sketchy p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}>
                <h2 className="text-lg font-bold mb-3" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><Layers className="w-4 h-4 inline mr-1"/>学生分层分布</h2>
                <div className="flex gap-4 flex-wrap">
                  {(['basic','advanced','extension'] as const).map(tier=>{const cnt=ov.layer_distribution[tier]||0;const pct=ov.student_count?Math.round(cnt/ov.student_count*100):0;const c=COL[tier];return(<div key={tier} className="flex-1 min-w-[120px] p-3 rounded-md text-center" style={{backgroundColor:c.bg}}><div className="text-2xl font-bold" style={{color:c.t}}>{cnt}</div><div className="text-xs" style={{color:c.t}}>{c.l}层({pct}%)</div><div className="w-full h-2 mt-2 rounded-full" style={{backgroundColor:'#E6E0D4'}}><div className="h-2 rounded-full" style={{width:`${pct}%`,backgroundColor:c.b}}/></div></div>);})}
                </div>
              </div>
              {ov.exam_trend?.length>0&&(<div className="paper-card sketchy p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}><h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><BarChart3 className="w-4 h-4"/>考试成绩趋势</h2>{trendSvg()}</div>)}
              {ov.common_errors?.length>0&&(<div className="paper-card sketchy-alt p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}><h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><AlertTriangle className="w-4 h-4" style={{color:'#C0785C'}}/>共性薄弱知识点TOP</h2><div className="space-y-2">{ov.common_errors.map((ce,i)=>(<div key={i} className="flex items-center justify-between p-2 rounded" style={{backgroundColor:i===0?'rgba(192,120,92,0.08)':'rgba(0,0,0,0.02)'}}><span className="text-sm font-medium" style={{color:'#3D3D3D'}}>{ce.knowledge_point}</span><div className="flex items-center gap-4"><span className="text-xs" style={{color:'#7A756D'}}>{ce.count}次</span><span className="text-xs font-bold" style={{color:ce.error_rate>50?'#C0785C':'#D4A843'}}>错误率{ce.error_rate}%</span></div></div>))}</div></div>)}
              <div className="paper-card sketchy p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><Users className="w-5 h-5"/>学生详情</h2>
                <div className="overflow-x-auto"><table className="w-full text-sm" style={{borderCollapse:'separate',borderSpacing:0}}><thead><tr style={{backgroundColor:'#F0EBE0'}}>{['学生','层级','预习','作业','考试','掌握度','薄弱点'].map(h=>(<th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{color:'#7A756D',borderBottom:'1.5px dashed #B8B0A4'}}>{h}</th>))}</tr></thead>
                <tbody>{ov.students.map(s=>{const mc=s.mastery;const mcC=mc>=80?'#6B8F71':mc>=60?'#D4A843':'#C0785C';const c=COL[s.layer]||COL.basic;return(<tr key={s.id} className="hover:bg-[#F0EBE0]" style={{borderBottom:'1px dashed #D6D0C6'}}><td className="px-3 py-2.5 font-medium" style={{color:'#3D3D3D'}}>{s.name}</td><td className="px-3 py-2.5"><span className="text-xs px-2 py-0.5 rounded-sm font-medium" style={{backgroundColor:c.bg,color:c.t}}>{c.l}</span></td><td className="px-3 py-2.5" style={{color:s.preview_accuracy>0?'#5C6170':'#B8B0A4'}}>{s.preview_accuracy>0?`${s.preview_accuracy}%`:'-'}</td><td className="px-3 py-2.5" style={{color:s.hw_accuracy>0?'#5C6170':'#B8B0A4'}}>{s.hw_accuracy>0?`${s.hw_accuracy}%`:'-'}</td><td className="px-3 py-2.5" style={{color:s.exam_score!==null?'#5C6170':'#B8B0A4'}}>{s.exam_score!==null?`${s.exam_score}分`:'-'}</td><td className="px-3 py-2.5"><div className="flex items-center gap-1"><div className="w-14 h-1.5 rounded-full" style={{backgroundColor:'#E6E0D4'}}><div className="h-1.5 rounded-full" style={{width:`${Math.min(mc,100)}%`,backgroundColor:mcC}}/></div><span className="text-xs" style={{color:mcC}}>{mc}%</span></div></td><td className="px-3 py-2.5 text-xs" style={{color:'#7A756D'}}>{s.weak_points?.slice(0,2).join('、')||'-'}</td></tr>);})}</tbody></table></div>
              </div>
            </>
          )}
          {tab==='errors'&&(
            <div className="space-y-5">
              <div className="flex items-center gap-3"><button onClick={runEA} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{backgroundColor:'#5C6170'}}><Brain className="w-4 h-4"/>AI深度分析共性错题</button>{loading&&<span className="text-sm" style={{color:'#7A756D'}}>AI正在分析中...</span>}</div>
              {(()=>{
                const weakPoints = ea?.weak_points || ea?.common_weak_points || [];
                const suggestions = ea?.suggestions || ea?.recommended_exercises || [];
                const urgentActions = ea?.urgent_actions || [];
                const summary = ea?.summary || ea?.overall_analysis || '班级共性错题分析';
                if (weakPoints.length > 0) {
                  return (
                    <div className="paper-card sketchy p-5 space-y-4" style={{boxShadow:'var(--shadow-teacher-card)'}}>
                      <h2 className="text-lg font-bold" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}>{summary}</h2>
                      {weakPoints.map((wp:any,i:number)=>(
                        <div key={i} className="p-4 rounded-md" style={{backgroundColor:'#FDFBF7',borderLeft:'3px solid #C0785C'}}>
                          <div className="font-bold text-sm" style={{color:'#3D3D3D'}}>{wp.knowledge_point||wp.name||`薄弱点${i+1}`}</div>
                          {wp.error_count!==undefined && <div className="text-xs mt-1" style={{color:'#7A756D'}}>错误次数:{wp.error_count}|错误率:{wp.error_rate!==undefined?`${Math.round(wp.error_rate*100)}%`:'-'}</div>}
                          {wp.root_cause && <div className="text-xs mt-1" style={{color:'#5C6170'}}>根因:{wp.root_cause}</div>}
                          {wp.teaching_suggestion && <div className="text-xs mt-1" style={{color:'#6B8F71'}}>建议:{wp.teaching_suggestion}</div>}
                        </div>
                      ))}
                      {suggestions.length > 0 && (
                        <div className="p-3 rounded-md" style={{backgroundColor:'rgba(107,143,113,0.08)'}}>
                          <div className="font-bold text-sm mb-1" style={{color:'#6B8F71'}}>教学建议</div>
                          <ul className="text-xs space-y-0.5" style={{color:'#5C6170'}}>
                            {suggestions.map((s:string,i:number)=><li key={i}>• {s}</li>)}
                          </ul>
                        </div>
                      )}
                      {urgentActions.length > 0 && (
                        <div className="p-3 rounded-md" style={{backgroundColor:'rgba(192,120,92,0.08)'}}>
                          <div className="font-bold text-sm mb-1" style={{color:'#C0785C'}}>紧急行动</div>
                          <ul className="text-xs space-y-0.5" style={{color:'#5C6170'}}>
                            {urgentActions.map((a:string,i:number)=><li key={i}>• {a}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                }
                if (ea) {
                  return (
                    <div className="paper-card sketchy p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}>
                      <div className="text-sm" style={{color:'#7A756D'}}>{summary || '班级暂无共性错题'}</div>
                    </div>
                  );
                }
                return <div className="text-center py-16 text-gray-400">点击上方按钮，让AI深度分析班级共性薄弱知识点</div>;
              })()}
              {!ea&&!loading&&<div className="text-center py-16 text-gray-400">点击上方按钮，让AI深度分析班级共性薄弱知识点</div>}
            </div>
          )}
          {tab==='exams'&&(
            <div className="space-y-5">
              <div className="flex items-center gap-3 flex-wrap"><button onClick={()=>setShowExamModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{backgroundColor:'#5C6170'}}><Plus className="w-4 h-4"/>创建考试</button><button onClick={()=>fileRef.current?.click()} disabled={extracting} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all border" style={{borderColor:'#B8B0A4',color:'#5C6170'}}><Upload className="w-4 h-4"/>{extracting?'AI识别中...':'上传试卷图片AI识别'}</button></div>
              {exams.length>0?(
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{exams.map(ex=>(<div key={ex.id} className="paper-card sketchy p-4" style={{boxShadow:'var(--shadow-teacher-card)'}}><div className="flex items-start justify-between mb-2"><div><h3 className="font-bold text-base" style={{color:'#3D3D3D'}}>{ex.title}</h3>{ex.exam_date&&<span className="text-xs" style={{color:'#7A756D'}}>{ex.exam_date}</span>}</div><div className="flex gap-1"><button onClick={()=>oSM(ex)} className="text-xs px-2 py-1 rounded" style={{backgroundColor:'#F0EBE0',color:'#5C6170'}}>录入成绩</button><button onClick={()=>hDE(ex.id)} className="text-xs px-2 py-1 rounded" style={{color:'#C0785C'}}><Trash2 className="w-3 h-3"/></button></div></div><div className="flex gap-4 text-sm mt-2"><span style={{color:'#7A756D'}}>满分:{ex.max_score}</span><span style={{color:'#7A756D'}}>已录:{ex.result_count}人</span>{ex.avg_score!==null&&<span style={{color:'#6B8F71'}}>平均:{ex.avg_score}分</span>}</div></div>))}</div>
              ):<div className="text-center py-16 text-gray-400">暂无考试记录，点击"创建考试"或"上传试卷图片"开始</div>}
            </div>
          )}
          {tab==='plans'&&(
            <div className="space-y-5">
              <div className="paper-card sketchy p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><Layers className="w-5 h-5"/>每周自动调整学生分层</h2>
                <p className="text-sm mb-3" style={{color:'#7A756D'}}>AI根据预习正确率(20%)+作业正确率(30%)+考试成绩(50%)自动调整</p>
                <button onClick={rAL} disabled={loading} className="px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{backgroundColor:'#5C6170'}}>开始调整</button>
                {la.length>0&&(<div className="mt-4 space-y-2"><div className="text-sm font-bold" style={{color:'#5C6170'}}>调整结果:</div>{la.filter(a=>a.changed!==false).map((a,i)=>(<div key={i} className="flex items-center justify-between p-2 rounded text-sm" style={{backgroundColor:COL[a.new_layer]?.bg||'#F0EBE0'}}><span style={{color:'#3D3D3D'}}>{a.name}</span><span className="text-xs" style={{color:'#7A756D'}}>综合:{a.composite_score}</span><span className="text-xs"><span style={{color:COL[a.old_layer]?.t}}>{COL[a.old_layer]?.l}</span><span style={{color:'#7A756D'}}>→</span><span style={{color:COL[a.new_layer]?.t,fontWeight:'bold'}}>{COL[a.new_layer]?.l}</span></span></div>))}{la.filter(a=>a.changed===false).length>0&&<div className="text-xs" style={{color:'#7A756D'}}>其余{la.filter(a=>a.changed===false).length}名学生层级不变</div>}</div>)}
              </div>
              <div className="paper-card sketchy p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><Printer className="w-5 h-5"/>培优补差周辅导方案</h2>
                <p className="text-sm mb-3" style={{color:'#7A756D'}}>AI根据各层学生薄弱知识点生成可打印周辅导方案</p>
                <div className="flex gap-2 mb-4">{(['basic','advanced','extension'] as const).map(tier=>(<button key={tier} onClick={()=>rWP(tier)} disabled={loading} className="px-4 py-2 rounded-md text-sm font-medium transition-all" style={{backgroundColor:COL[tier].bg,color:COL[tier].t,border:`1px solid ${COL[tier].t}`}}>{COL[tier].l}层方案</button>))}</div>
                {wp?.plan&&(<div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold text-base" style={{color:'#3D3D3D'}}>{wp.plan.title}</h3><button onClick={pP} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white" style={{backgroundColor:'#6B8F71'}}><Printer className="w-3 h-3"/>打印</button></div><div className="p-3 rounded-md" style={{backgroundColor:'rgba(107,143,113,0.08)'}}><span className="text-sm font-bold" style={{color:'#6B8F71'}}>本周目标：</span><span className="text-sm" style={{color:'#5C6170'}}>{wp.plan.weekly_goal}</span></div>{wp.plan.plan?.map((d:any,i:number)=>(<div key={i} className="p-3 rounded-md" style={{backgroundColor:'#FDFBF7'}}><div className="flex items-center gap-2 mb-1"><span className="text-xs font-bold px-2 py-0.5 rounded" style={{backgroundColor:'#5C6170',color:'#fff'}}>{d.day}</span><span className="text-sm font-medium" style={{color:'#3D3D3D'}}>{d.focus}</span></div>{d.exercises?.length>0&&<ul className="text-xs space-y-0.5 ml-4" style={{color:'#5C6170'}}>{d.exercises.map((ex:string,j:number)=><li key={j}>• {ex}</li>)}</ul>}{d.notes&&<div className="text-xs mt-1 ml-4" style={{color:'#7A756D'}}>📝 {d.notes}</div>}</div>))}{wp.plan.key_points?.length>0&&(<div className="p-3 rounded-md" style={{backgroundColor:'rgba(192,120,92,0.08)'}}><div className="font-bold text-sm mb-1" style={{color:'#C0785C'}}>关键要点</div><ul className="text-xs space-y-0.5" style={{color:'#5C6170'}}>{wp.plan.key_points.map((k:string,i:number)=><li key={i}>• {k}</li>)}</ul></div>)}</div>)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Exam Modal */}
      {showExamModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.3)'}} onClick={()=>setShowExamModal(false)}>
          <div className="paper-card sketchy p-6 w-full max-w-md space-y-4" onClick={e=>e.stopPropagation()} style={{backgroundColor:'#FDFBF7'}}>
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold" style={{color:'#5C6170'}}>创建考试</h2><button onClick={()=>setShowExamModal(false)}><X className="w-4 h-4" style={{color:'#7A756D'}}/></button></div>
            <div><label className="text-xs font-medium" style={{color:'#7A756D'}}>考试名称</label><input value={eTitle} onChange={e=>setETitle(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}} placeholder="如期中考试"/></div>
            <div><label className="text-xs font-medium" style={{color:'#7A756D'}}>单元</label><input value={eUnit} onChange={e=>setEUnit(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}} placeholder="如U3"/></div>
            <div className="flex gap-2"><div className="flex-1"><label className="text-xs font-medium" style={{color:'#7A756D'}}>满分</label><input type="number" value={eMax} onChange={e=>setEMax(Number(e.target.value))} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}}/></div><div className="flex-1"><label className="text-xs font-medium" style={{color:'#7A756D'}}>考试日期</label><input type="date" value={eDate} onChange={e=>setEDate(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}}/></div></div>
            <div><label className="text-xs font-medium" style={{color:'#7A756D'}}>描述</label><textarea value={eDesc} onChange={e=>setEDesc(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}} rows={2}/></div>
            <button onClick={hCE} disabled={loading} className="w-full px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{backgroundColor:'#5C6170'}}>{loading?'创建中...':'创建考试'}</button>
          </div>
        </div>
      )}

      {/* Score Input Modal */}
      {showScoreModal&&selExam&&ov&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.3)'}} onClick={()=>setShowScoreModal(false)}>
          <div className="paper-card sketchy p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-3" onClick={e=>e.stopPropagation()} style={{backgroundColor:'#FDFBF7'}}>
            <div className="flex items-center justify-between sticky top-0 pb-2" style={{borderBottom:'1px dashed #D6D0C6'}}>
              <h2 className="text-lg font-bold" style={{color:'#5C6170'}}>录入成绩 - {selExam.title}</h2>
              <button onClick={()=>setShowScoreModal(false)}><X className="w-4 h-4" style={{color:'#7A756D'}}/></button>
            </div>
            <div className="text-xs" style={{color:'#7A756D'}}>满分: {selExam.max_score}分 | 共 {ov.students.length} 名学生</div>
            <div className="space-y-2">
              {ov.students.map(s=>(
                <div key={s.id} className="flex items-center gap-3">
                  <span className="text-sm flex-1" style={{color:'#3D3D3D'}}>{s.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-sm" style={{backgroundColor:COL[s.layer]?.bg,color:COL[s.layer]?.t}}>{COL[s.layer]?.l}</span>
                  <input type="number" value={si[s.id]??''} onChange={e=>setSi(prev=>({...prev,[s.id]:Number(e.target.value)}))} className="w-20 px-2 py-1 text-sm text-center rounded border outline-none" style={{borderColor:'#D6D0C6'}} placeholder="分数"/>
                </div>
              ))}
            </div>
            <button onClick={sS} disabled={loading} className="w-full px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90 mt-3" style={{backgroundColor:'#6B8F71'}}>{loading?'保存中...':'保存成绩'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
