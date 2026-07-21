'use client';
import { useState, useEffect, useCallback } from 'react';
import { Gift, ShoppingBag, Coins, RefreshCw, CheckCircle, Clock, XCircle } from 'lucide-react';
import { getToken, getStoredUser, listStoreItems, redeemItem, myRedemptions, StoreItem, RedemptionRecord } from '@/lib/api';

export default function StudentStore() {
  const [token,setToken]=useState(''); const [items,setItems]=useState<StoreItem[]>([]);
  const [redemptions,setRedemptions]=useState<RedemptionRecord[]>([]);
  const [myPoints,setMyPoints]=useState(0); const [tab,setTab]=useState<'shop'|'history'>('shop');
  const [loading,setLoading]=useState(false); const [msg,setMsg]=useState<{t:string;c:'success'|'error'|'info'}|null>(null);
  const show=(t:string,c:'success'|'error'|'info'='info')=>{setMsg({t,c});setTimeout(()=>setMsg(null),4000);};

  useEffect(()=>{const t=getToken();if(t)setToken(t);},[]);

  const loadData=useCallback(async()=>{
    if(!token)return;
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
    } catch(e) {}
  }, [token]);
  useEffect(() => { if(token) loadData(); }, [token, loadData]);

  const redeem=async(itemId:number, itemName:string, pts:number)=>{
    if(!confirm(`确定用${pts}积分兑换「${itemName}」？`)) return;
    setLoading(true);
    try {
      const r = await redeemItem(token, itemId);
      setMyPoints(r.remaining_points);
      show(`成功兑换「${r.item_name}」，消耗${r.points_spent}积分`,'success');
      loadData();
    } catch(e:any) { show(e.message||'兑换失败','error'); }
    finally { setLoading(false); }
  };

  const statusLabel=(s:string)=>s==='completed'?'已完成':s==='rejected'?'已拒绝':'待处理';
  const statusColor=(s:string)=>s==='completed'?'#6B8F71':s==='rejected'?'#C0785C':'#D4A843';
  const statusIcon=(s:string)=>s==='completed'?CheckCircle:s==='rejected'?XCircle:Clock;

  return(
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold" style={{color:'#5C6170',fontFamily:'var(--font-hand), cursive'}}><span className="pencil-underline">积分商城</span></h1>
        <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{borderColor:'#B8B0A4',color:'#5C6170'}}><RefreshCw className="w-3.5 h-3.5"/>刷新</button>
      </div>
      {msg&&<div className="px-4 py-2 rounded-md text-sm" style={{backgroundColor:msg.c==='error'?'rgba(192,120,92,0.12)':msg.c==='success'?'rgba(107,143,113,0.12)':'rgba(212,168,67,0.12)',color:msg.c==='error'?'#C0785C':msg.c==='success'?'#6B8F71':'#9A7B2A'}}>{msg.t}</div>}

      {/* Points display */}
      <div className="paper-card sketchy p-4 flex items-center gap-3" style={{boxShadow:'var(--shadow-teacher-card)'}}>
        <Coins className="w-8 h-8" style={{color:'#D4A843'}}/>
        <div><div className="text-xs" style={{color:'#7A756D'}}>我的积分</div><div className="text-3xl font-bold" style={{color:'#D4A843',fontFamily:'var(--font-hand), cursive'}}>{myPoints}</div></div>
      </div>

      <div className="flex gap-3">
        {(['shop','history'] as const).map(t=>(<button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 text-sm rounded-md transition-all ${tab===t?'text-white':''}`} style={{backgroundColor:tab===t?'#5C6170':'transparent',color:tab===t?'#fff':'#7A756D',border:tab===t?'none':'1px dashed #B8B0A4'}}>{t==='shop'?'兑换奖品':'我的兑换'}</button>))}
      </div>

      {tab==='shop'&&(
        <div>
          {items.length>0?(
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(it=>{
                const canRedeem = myPoints >= it.points && it.stock > 0;
                return (
                  <div key={it.id} className={`paper-card sketchy p-4 transition-all ${canRedeem?'hover:shadow-lg':''}`} style={{boxShadow:'var(--shadow-teacher-card)',opacity:canRedeem?1:0.6}}>
                    <div className="text-3xl mb-2">{it.icon||'🎁'}</div>
                    <h3 className="font-bold text-base" style={{color:'#3D3D3D'}}>{it.name}</h3>
                    {it.description&&<p className="text-xs mt-1" style={{color:'#7A756D'}}>{it.description}</p>}
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        <span className="text-lg font-bold" style={{color:'#C0785C',fontFamily:'var(--font-hand), cursive'}}>{it.points}分</span>
                        <span className="text-xs ml-2" style={{color:it.stock>0?'#6B8F71':'#C0785C'}}>剩{it.stock}件</span>
                      </div>
                      <button onClick={()=>redeem(it.id,it.name,it.points)} disabled={!canRedeem||loading}
                        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                        style={{backgroundColor:canRedeem?'#5C6170':'#D6D0C6',color:canRedeem?'#fff':'#B8B0A4'}}>
                        {!canRedeem?'积分不足':'兑换'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ):<div className="text-center py-16 text-gray-400">暂无可兑换的奖品</div>}
        </div>
      )}

      {tab==='history'&&(
        <div>
          {redemptions.length>0?(
            <div className="paper-card sketchy p-5 space-y-2" style={{boxShadow:'var(--shadow-teacher-card)'}}>
              {redemptions.map(r=>{const Icon=statusIcon(r.status);return(
                <div key={r.id} className="flex items-center justify-between p-3 rounded" style={{backgroundColor:'#FDFBF7'}}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{r.icon||'🎁'}</span>
                    <div><div className="text-sm font-medium" style={{color:'#3D3D3D'}}>{r.item_name}</div><div className="text-xs" style={{color:'#7A756D'}}>{r.created_at?.slice(5,16)}</div></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold" style={{color:'#C0785C'}}>-{r.points}分</span>
                    <Icon className="w-4 h-4" style={{color:statusColor(r.status)}}/>
                    <span className="text-xs px-2 py-0.5 rounded-sm" style={{backgroundColor:`${statusColor(r.status)}18`,color:statusColor(r.status)}}>{statusLabel(r.status)}</span>
                  </div>
                </div>
              );})}
            </div>
          ):<div className="text-center py-16 text-gray-400">暂无兑换记录</div>}
        </div>
      )}
    </div>
  );
}
