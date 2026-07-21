'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit3, Gift, ShoppingBag, CheckCircle, XCircle, RefreshCw, X, Award, UserPlus } from 'lucide-react';
import { getToken, classMyList, listStoreItems, createStoreItem, deleteStoreItem, updateStoreItem, listRedemptionsByClass, updateRedemption, teacherAddPoints, getClassStudentsForPoints, StoreItem, RedemptionRecord, ClassStudentForPoints } from '@/lib/api';

const ICONS = ['🎁','文具','体育','免写','特权','积分','兑换','贴纸','卡片','零食'];

export default function TeacherStore() {
  const [token,setToken]=useState(''); const [classes,setClasses]=useState<any[]>([]); const [cid,setCid]=useState<number|''>('');
  const [items,setItems]=useState<StoreItem[]>([]); const [redemptions,setRedemptions]=useState<RedemptionRecord[]>([]);
  const [tab,setTab]=useState<'items'|'redemptions'|'points'>('items');
  const [loading,setLoading]=useState(false); const [msg,setMsg]=useState<{t:string;c:'success'|'error'|'info'}|null>(null);
  const [showModal,setShowModal]=useState(false); const [editItem,setEditItem]=useState<StoreItem|null>(null);
  const [fName,setFName]=useState(''); const [fDesc,setFDesc]=useState(''); const [fPoints,setFPoints]=useState(10); const [fStock,setFStock]=useState(10); const [fIcon,setFIcon]=useState('🎁');
  // 手动加分状态
  const [students,setStudents]=useState<ClassStudentForPoints[]>([]);
  const [selStudent,setSelStudent]=useState<number|''>(''); const [addPointsVal,setAddPointsVal]=useState(1); const [addReason,setAddReason]=useState('课堂表现优秀');
  const show=(t:string,c:'success'|'error'|'info'='info')=>{setMsg({t,c});setTimeout(()=>setMsg(null),4000);};

  useEffect(()=>{const t=getToken();if(t)setToken(t);},[]);
  const lc=useCallback(async()=>{if(!token)return;try{const r=await classMyList(token);setClasses(r.classes||[]);if(r.classes?.length===1)setCid(r.classes[0].id);}catch(e){}},[token]);
  useEffect(()=>{if(token)lc();},[token,lc]);

  const li=useCallback(async()=>{if(!token||!cid)return;try{const r=await listStoreItems(token,Number(cid));setItems(r.items||[]);}catch(e){}},[token,cid]);
  const lr=useCallback(async()=>{if(!token||!cid)return;try{const r=await listRedemptionsByClass(token,Number(cid));setRedemptions(r.redemptions||[]);}catch(e){}},[token,cid]);
  const ls=useCallback(async()=>{if(!token||!cid)return;try{const r=await getClassStudentsForPoints(token,Number(cid));setStudents(r.students||[]);}catch(e){}},[token,cid]);
  useEffect(()=>{if(cid){li();lr();ls();}},[cid,li,lr,ls]);

  const openCreate=()=>{setEditItem(null);setFName('');setFDesc('');setFPoints(10);setFStock(10);setFIcon('🎁');setShowModal(true);};
  const openEdit=(it:StoreItem)=>{setEditItem(it);setFName(it.name);setFDesc(it.description);setFPoints(it.points);setFStock(it.stock);setFIcon(it.icon);setShowModal(true);};

  const save=async()=>{
    if(!fName.trim())return show('请输入奖品名称','error');
    if(!token||!cid)return;
    setLoading(true);
    try{
      if(editItem){await updateStoreItem(token,editItem.id,{class_id:Number(cid),name:fName,description:fDesc,points:fPoints,stock:fStock,icon:fIcon});show('已更新','success');}
      else{await createStoreItem(token,{class_id:Number(cid),name:fName,description:fDesc,points:fPoints,stock:fStock,icon:fIcon});show('已添加','success');}
      setShowModal(false);li();
    }catch(e:any){show(e.message||'失败','error');}finally{setLoading(false);}
  };

  const del=async(id:number)=>{if(!confirm('确定下架此奖品？'))return;if(!token)return;try{await deleteStoreItem(token,id);show('已下架','success');li();}catch(e:any){show(e.message||'失败','error');}};

  const handleRedemption=async(id:number,status:string)=>{if(!token)return;try{await updateRedemption(token,id,status);show(status==='completed'?'已标记兑换':'已拒绝','success');lr();}catch(e:any){show(e.message||'失败','error');}};

  const submitPoints=async()=>{
    if(!selStudent)return show('请选择学生','error');
    if(!token)return;
    setLoading(true);
    try{
      const r=await teacherAddPoints(token,Number(selStudent),addPointsVal,addReason);
      show(`${r.student_name} ${addPointsVal>0?'+':''}${addPointsVal}分 → ${r.new_total}分`,'success');
      setSelStudent('');setAddPointsVal(1);setAddReason('课堂表现优秀');
      ls();
    }catch(e:any){show(e.message||'加分失败','error');}finally{setLoading(false);}
  };

  const statusLabel=(s:string)=>s==='completed'?'已兑换':s==='rejected'?'已拒绝':'待处理';
  const statusColor=(s:string)=>s==='completed'?'#6B8F71':s==='rejected'?'#C0785C':'#D4A843';

  return(
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><span className="pencil-underline">积分商城</span></h1>
        <button onClick={()=>{li();lr();}} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{borderColor:'#B8B0A4',color:'#5C6170'}}><RefreshCw className="w-3.5 h-3.5"/>刷新</button>
      </div>
      {msg&&<div className="px-4 py-2 rounded-md text-sm" style={{backgroundColor:msg.c==='error'?'rgba(192,120,92,0.12)':msg.c==='success'?'rgba(107,143,113,0.12)':'rgba(212,168,67,0.12)',color:msg.c==='error'?'#C0785C':msg.c==='success'?'#6B8F71':'#9A7B2A'}}>{msg.t}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <select value={cid} onChange={e=>setCid(e.target.value?Number(e.target.value):'')} className="sketchy-sm px-3 py-2 text-sm bg-transparent outline-none cursor-pointer" style={{color:'#3D3D3D',backgroundColor:'#FDFBF7'}}><option value="">选择班级</option>{classes.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button onClick={openCreate} disabled={!cid} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{backgroundColor:'#5C6170'}}><Plus className="w-4 h-4"/>添加奖品</button>
        {(['items','redemptions','points'] as const).map(t=>(<button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 text-sm rounded-md transition-all ${tab===t?'text-white':''}`} style={{backgroundColor:tab===t?'#5C6170':'transparent',color:tab===t?'#fff':'#7A756D',border:tab===t?'none':'1px dashed #B8B0A4'}}>{t==='items'?'奖品管理':t==='redemptions'?'兑换记录':'手动加分'}</button>))}
      </div>

      {tab==='items'&&(
        <div>
          {items.length>0?(
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(it=>(
                <div key={it.id} className="paper-card sketchy p-4" style={{boxShadow:'var(--shadow-teacher-card)'}}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-3xl">{it.icon||'🎁'}</div>
                    <div className="flex gap-1">
                      <button onClick={()=>openEdit(it)} className="text-xs p-1 rounded" style={{color:'#5C6170'}}><Edit3 className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>del(it.id)} className="text-xs p-1 rounded" style={{color:'#C0785C'}}><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                  </div>
                  <h3 className="font-bold text-base" style={{color:'#3D3D3D'}}>{it.name}</h3>
                  {it.description&&<p className="text-xs mt-1" style={{color:'#7A756D'}}>{it.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-bold" style={{color:'#C0785C',fontFamily:'var(--font-hand), cursive'}}>{it.points}分</span>
                    <span className="text-xs" style={{color:it.stock>0?'#6B8F71':'#C0785C'}}>库存: {it.stock}</span>
                  </div>
                </div>
              ))}
            </div>
          ):<div className="text-center py-16 text-gray-400">{cid?'暂无奖品，点击"添加奖品"开始':'请先选择班级'}</div>}
        </div>
      )}

      {tab==='redemptions'&&(
        <div>
          {redemptions.length>0?(
            <div className="paper-card sketchy p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}>
              <table className="w-full text-sm" style={{borderCollapse:'separate',borderSpacing:0}}>
                <thead><tr style={{backgroundColor:'#F0EBE0'}}>{['商品','学生','积分','状态','时间','操作'].map(h=>(<th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{color:'#7A756D',borderBottom:'1.5px dashed #B8B0A4'}}>{h}</th>))}</tr></thead>
                <tbody>
                  {redemptions.map(r=>(
                    <tr key={r.id} className="hover:bg-[#F0EBE0]" style={{borderBottom:'1px dashed #D6D0C6'}}>
                      <td className="px-3 py-2.5"><span className="mr-1">{r.icon||'🎁'}</span><span style={{color:'#3D3D3D'}}>{r.item_name}</span></td>
                      <td className="px-3 py-2.5" style={{color:'#5C6170'}}>{r.student_name}</td>
                      <td className="px-3 py-2.5" style={{color:'#C0785C'}}>{r.points}分</td>
                      <td className="px-3 py-2.5"><span className="text-xs px-2 py-0.5 rounded-sm font-medium" style={{backgroundColor:`${statusColor(r.status)}18`,color:statusColor(r.status)}}>{statusLabel(r.status)}</span></td>
                      <td className="px-3 py-2.5 text-xs" style={{color:'#7A756D'}}>{r.created_at?.slice(5,16)}</td>
                      <td className="px-3 py-2.5">
                        {r.status==='pending'&&(
                          <div className="flex gap-1">
                            <button onClick={()=>handleRedemption(r.id,'completed')} className="text-xs px-2 py-1 rounded" style={{backgroundColor:'rgba(107,143,113,0.15)',color:'#6B8F71'}}><CheckCircle className="w-3 h-3 inline"/></button>
                            <button onClick={()=>handleRedemption(r.id,'rejected')} className="text-xs px-2 py-1 rounded" style={{backgroundColor:'rgba(192,120,92,0.15)',color:'#C0785C'}}><XCircle className="w-3 h-3 inline"/></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ):<div className="text-center py-16 text-gray-400">{cid?'暂无兑换记录':'请先选择班级'}</div>}
        </div>
      )}

      {tab==='points'&&(
        <div className="space-y-4">
          {/* 加分表单 */}
          <div className="paper-card sketchy p-5 space-y-4" style={{boxShadow:'var(--shadow-teacher-card)'}}>
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" style={{color:'#5C6170'}} />
              <h3 className="text-base font-bold" style={{color:'#5C6170'}}>手动加分/扣分</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium" style={{color:'#7A756D'}}>选择学生</label>
                <select value={selStudent} onChange={e=>setSelStudent(e.target.value?Number(e.target.value):'')} className="sketchy-sm w-full mt-1 px-3 py-2 text-sm bg-transparent outline-none cursor-pointer" style={{color:'#3D3D3D',backgroundColor:'#FDFBF7'}}>
                  <option value="">选择学生</option>
                  {students.map(s=>(<option key={s.id} value={s.id}>{s.name} ({s.points}分)</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" style={{color:'#7A756D'}}>积分（正数加/负数减）</label>
                <input type="number" step="0.1" value={addPointsVal} onChange={e=>setAddPointsVal(parseFloat(e.target.value)||0)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}} placeholder="如 0.5 或 -1" />
              </div>
              <div>
                <label className="text-xs font-medium" style={{color:'#7A756D'}}>原因</label>
                <input value={addReason} onChange={e=>setAddReason(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}} placeholder="如 课堂表现优秀" />
              </div>
            </div>
            <button onClick={submitPoints} disabled={loading||!selStudent} className="px-5 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{backgroundColor:'#5C6170'}}>{loading?'处理中...':'确认加分'}</button>
          </div>

          {/* 学生积分列表 */}
          {students.length>0?(
            <div className="paper-card sketchy p-5" style={{boxShadow:'var(--shadow-teacher-card)'}}>
              <h3 className="text-sm font-bold mb-3" style={{color:'#5C6170'}}>班级积分排名</h3>
              <div className="space-y-1.5">
                {students.map((s,i)=>(
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded" style={{backgroundColor:i===0?'rgba(255,215,0,0.08)':i<3?'rgba(212,168,67,0.06)':'transparent'}}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold w-6 text-center" style={{color:i<3?'#C0785C':'#7A756D'}}>{i+1}</span>
                      <span className="text-sm" style={{color:'#3D3D3D'}}>{s.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{backgroundColor:s.layer==='extension'?'rgba(107,143,113,0.12)':s.layer==='advanced'?'rgba(212,168,67,0.12)':'rgba(122,117,109,0.08)',color:s.layer==='extension'?'#6B8F71':s.layer==='advanced'?'#9A7B2A':'#7A756D'}}>{s.layer==='extension'?'拓展':s.layer==='advanced'?'提升':'基础'}</span>
                    </div>
                    <span className="text-sm font-bold" style={{color:'#C0785C'}}>{s.points}分</span>
                  </div>
                ))}
              </div>
            </div>
          ):<div className="text-center py-16 text-gray-400">{cid?'暂无学生数据':'请先选择班级'}</div>}
        </div>
      )}

      {/* Modal */}
      {showModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.3)'}} onClick={()=>setShowModal(false)}>
          <div className="paper-card sketchy p-6 w-full max-w-md space-y-4" onClick={e=>e.stopPropagation()} style={{backgroundColor:'#FDFBF7'}}>
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold" style={{color:'#5C6170'}}>{editItem?'编辑奖品':'添加奖品'}</h2><button onClick={()=>setShowModal(false)}><X className="w-4 h-4" style={{color:'#7A756D'}}/></button></div>
            <div><label className="text-xs font-medium" style={{color:'#7A756D'}}>奖品名称</label><input value={fName} onChange={e=>setFName(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}} placeholder="如:免写一次作业"/></div>
            <div><label className="text-xs font-medium" style={{color:'#7A756D'}}>描述</label><input value={fDesc} onChange={e=>setFDesc(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}}/></div>
            <div className="flex gap-2"><div className="flex-1"><label className="text-xs font-medium" style={{color:'#7A756D'}}>所需积分</label><input type="number" value={fPoints} onChange={e=>setFPoints(Number(e.target.value))} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}}/></div><div className="flex-1"><label className="text-xs font-medium" style={{color:'#7A756D'}}>库存数量</label><input type="number" value={fStock} onChange={e=>setFStock(Number(e.target.value))} className="w-full mt-1 px-3 py-2 text-sm rounded border outline-none" style={{borderColor:'#D6D0C6'}}/></div></div>
            <div><label className="text-xs font-medium" style={{color:'#7A756D'}}>图标</label><div className="flex flex-wrap gap-2 mt-1">{ICONS.map(ic=>(<button key={ic} onClick={()=>setFIcon(ic)} className={`px-2 py-1 text-sm rounded ${fIcon===ic?'':'opacity-50'}`} style={{backgroundColor:fIcon===ic?'rgba(92,97,112,0.15)':'transparent'}}>{ic}</button>))}</div></div>
            <button onClick={save} disabled={loading} className="w-full px-4 py-2 rounded-md text-sm font-medium text-white transition-all hover:opacity-90" style={{backgroundColor:'#5C6170'}}>{loading?'保存中...':'保存'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
