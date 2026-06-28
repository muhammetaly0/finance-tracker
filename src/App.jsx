import React, { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import {
  Plus, CreditCard, Calendar, TrendingUp, TrendingDown, Wallet,
  PieChart, ArrowRightLeft, AlertCircle, Clock, Trash2, X,
  Edit3, Calculator, ChevronDown, ChevronUp, Settings, Tag, Menu,
  Check, Scissors, Download, Upload, BarChart3
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
   1. UTILS — Tarih yardımcıları ve finans hesaplamaları
   ═══════════════════════════════════════════════════════════ */
const SK = 'finans-takip-data';
const CL = ['#6366f1','#f59e0b','#10b981','#ec4899','#f97316','#8b5cf6','#14b8a6','#3b82f6','#ef4444','#64748b','#22c55e','#06b6d4'];
const toISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today = new Date(); today.setHours(0,0,0,0);
const todayISO = toISO(today);
const smartDate = (y,m,day) => { const last=new Date(y,m+1,0).getDate(); return new Date(y,m,Math.min(day,last)); };
const getNext = day => { const n=new Date();n.setHours(0,0,0,0); const t=smartDate(n.getFullYear(),n.getMonth(),day); return t>=n?t:smartDate(n.getFullYear(),n.getMonth()+1,day); };
const getPrev = day => { const n=new Date();n.setHours(0,0,0,0); const t=smartDate(n.getFullYear(),n.getMonth(),day); return t<n?t:smartDate(n.getFullYear(),n.getMonth()-1,day); };
const fS = ds => { if(!ds)return'—'; try{return new Date(ds+'T00:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short'});}catch{return ds;} };
const dU = ds => { if(!ds)return null; const t=new Date(ds+'T00:00:00'),n=new Date();n.setHours(0,0,0,0); return Math.ceil((t-n)/864e5); };
const uid = () => Math.random().toString(36).substr(2,9);

const getInstPeriods = (purchaseISO, stmtDay) => {
  const pd=new Date(purchaseISO+'T00:00:00');
  let first=smartDate(pd.getFullYear(),pd.getMonth(),stmtDay);
  if(first<=pd) first=smartDate(pd.getFullYear(),pd.getMonth()+1,stmtDay);
  const next=getNext(stmtDay);
  return Math.max(1,(next.getFullYear()-first.getFullYear())*12+(next.getMonth()-first.getMonth())+1);
};

// Kart dönem + borç hesaplama
const calcCard = (card, tx, subs) => {
  const sd=card.statementDay||15, pd=card.paymentDay||5;
  const now2=new Date();now2.setHours(0,0,0,0);
  const thisS=smartDate(now2.getFullYear(),now2.getMonth(),sd);
  const prevS=smartDate(now2.getFullYear(),now2.getMonth()-1,sd);
  const recent=thisS<=now2?thisS:prevS;
  const payFor=pd>sd?smartDate(recent.getFullYear(),recent.getMonth(),pd):smartDate(recent.getFullYear(),recent.getMonth()+1,pd);
  let status,sISO,pISO,sDL,pDL;
  if(now2>=recent&&now2<payFor){status='between';sISO=toISO(recent);pISO=toISO(payFor);sDL=null;pDL=dU(pISO);}
  else{status='normal';const ns=thisS>now2?thisS:smartDate(now2.getFullYear(),now2.getMonth()+1,sd);const np=pd>sd?smartDate(ns.getFullYear(),ns.getMonth(),pd):smartDate(ns.getFullYear(),ns.getMonth()+1,pd);sISO=toISO(ns);pISO=toISO(np);sDL=dU(sISO);pDL=dU(pISO);}
  const ns2=getNext(sd),ps2=getPrev(sd),nsi=toISO(ns2),psi=toISO(ps2);
  let debt=card.amount||0;
  debt+=tx.filter(t=>t.type==='expense'&&t.cardId===card.id&&!t.isInstallment&&t.date&&t.date>psi&&t.date<=nsi).reduce((a,b)=>a+b.amount,0);
  tx.filter(t=>t.type==='expense'&&t.cardId===card.id&&t.isInstallment).forEach(t=>{if(getInstPeriods(t.date,sd)<=(t.installmentCount||1))debt+=(t.monthlyAmount||(t.amount/(t.installmentCount||1)));});
  debt+=subs.filter(s=>s.cardId===card.id).reduce((a,b)=>a+b.amount,0);
  let nd=0;
  nd+=tx.filter(t=>t.type==='expense'&&t.cardId===card.id&&!t.isInstallment&&t.date&&t.date>nsi).reduce((a,b)=>a+b.amount,0);
  tx.filter(t=>t.type==='expense'&&t.cardId===card.id&&t.isInstallment).forEach(t=>{if(getInstPeriods(t.date,sd)+1<=(t.installmentCount||1))nd+=(t.monthlyAmount||(t.amount/(t.installmentCount||1)));});
  nd+=subs.filter(s=>s.cardId===card.id).reduce((a,b)=>a+b.amount,0);
  return{...card,calculatedDebt:Math.round(debt*100)/100,nextPeriodDebt:Math.round(nd*100)/100,showStmtISO:sISO,showPayISO:pISO,stmtDaysLeft:sDL,payDaysLeft:pDL,status,nextPayISO:pISO};
};

const calcTotals = (cash,tx,subs,cc,debts) => {
  const inc=tx.filter(t=>t.type==='income').reduce((a,b)=>a+(b.amount||0),0);
  const ce=tx.filter(t=>t.type==='expense'&&!t.cardId).reduce((a,b)=>a+(b.amount||0),0);
  const cs=subs.filter(s=>!s.cardId).reduce((a,b)=>a+(b.amount||0),0);
  const ccT=cc.reduce((a,b)=>a+(b.calculatedDebt||0),0);
  const pd=debts.filter(d=>d.type==='payable'&&d.paymentDate).reduce((a,b)=>a+(b.amount||0),0);
  const owed=ccT+pd; const bal=cash+inc-ce-cs;
  return{income:inc,cc:ccT,totalOwed:owed,balance:bal,afterPayments:bal-owed};
};

const calcFlow = (card,tx,subs,bal) => {
  const pISO=card.showPayISO;
  const fixed=tx.filter(t=>t.type==='income'&&!t.isRecurring&&t.date&&t.date<=pISO).reduce((a,b)=>a+b.amount,0);
  const rec=tx.filter(t=>t.type==='income'&&t.isRecurring).reduce((a,b)=>{const p=new Date(pISO+'T00:00:00');return smartDate(p.getFullYear(),p.getMonth(),t.recurringDay||1)<=p?a+b.amount:a;},0);
  const sb=subs.filter(s=>!s.cardId&&s.payDate&&s.payDate<=pISO).reduce((a,b)=>a+b.amount,0);
  const proj=bal+fixed+rec-sb;
  return{...card,afterPay:proj-card.calculatedDebt,isSafe:proj>=card.calculatedDebt};
};

const buildChart = (tx,cats,type) => {
  const c={};tx.filter(t=>t.type===type).forEach(t=>{const k=t.category||'Diğer';c[k]=(c[k]||0)+(type==='expense'&&t.isInstallment?(t.monthlyAmount||(t.amount/(t.installmentCount||1))):t.amount);});
  return Object.entries(c).map(([n,v])=>({name:n,value:v,color:cats.find(x=>x.name===n)?.color||(type==='expense'?'#64748b':'#22c55e')}));
};

/* ═══════════════════════════════════════════════════════════
   2. DATA — Başlangıç verileri (boş)
   ═══════════════════════════════════════════════════════════ */
const DEF_CARDS=[];
const INIT={currentCash:0,tx:[],subs:[],debts:[]};
const DEF_CATS=[{id:'c1',name:'Market',color:'#6366f1',type:'expense'},{id:'c2',name:'Fatura',color:'#f59e0b',type:'expense'},{id:'c3',name:'Ulaşım',color:'#10b981',type:'expense'},{id:'c4',name:'Giyim',color:'#ec4899',type:'expense'},{id:'c5',name:'Yeme-İçme',color:'#f97316',type:'expense'},{id:'c6',name:'Eğlence',color:'#8b5cf6',type:'expense'},{id:'c7',name:'Sağlık',color:'#14b8a6',type:'expense'},{id:'c8',name:'Eğitim',color:'#3b82f6',type:'expense'},{id:'c10',name:'Maaş',color:'#22c55e',type:'income'},{id:'c11',name:'Freelance',color:'#06b6d4',type:'income'},{id:'c12',name:'Diğer Gelir',color:'#84cc16',type:'income'}];

/* localStorage wrapper (window.storage yerine) */
const storage = {
  get: async (k) => { try { return { value: localStorage.getItem(k) }; } catch { return null; } },
  set: async (k, v) => { try { localStorage.setItem(k, v); } catch (e) { console.error(e); } },
  remove: (k) => { try { localStorage.removeItem(k); } catch (e) { console.error(e); } }
};

/* ═══════════════════════════════════════════════════════════
   3. CUSTOM HOOK — useFinanceStore
   ═══════════════════════════════════════════════════════════ */
const Ctx = createContext(null);
const useStore = () => useContext(Ctx);

const useFinanceStore = () => {
  const [loading,sL]=useState(true);const [importing,sImp]=useState(false);
  const [cash,sCash]=useState(0);const [tx,sTx]=useState([]);const [subs,sSubs]=useState([]);
  const [cards,sCards]=useState([]);const [debts,sDebts]=useState([]);const [cats,sCats]=useState([]);

  useEffect(()=>{(async()=>{try{const r=await storage.get(SK);if(r?.value){const d=JSON.parse(r.value);sCash(d.currentCash??0);sTx(d.transactions??[]);sSubs(d.subscriptions??[]);
    sCards(d.creditCards?.length>0?d.creditCards.map(c=>({id:c.id,bank:c.bank,amount:c.amount||0,createdAt:c.createdAt,statementDay:c.statementDay||(c.statementDate?new Date(c.statementDate+'T00:00:00').getDate():15),paymentDay:c.paymentDay||(c.paymentDate?new Date(c.paymentDate+'T00:00:00').getDate():5)})):DEF_CARDS);
    sDebts(d.personalDebts??[]);sCats(d.categories?.length>0?d.categories:DEF_CATS);}
  else{sCash(INIT.currentCash);sTx(INIT.tx);sSubs(INIT.subs);sCards(DEF_CARDS);sDebts(INIT.debts);sCats(DEF_CATS);}
  }catch{sCash(INIT.currentCash);sTx(INIT.tx);sSubs(INIT.subs);sCards(DEF_CARDS);sDebts(INIT.debts);sCats(DEF_CATS);}sL(false);})();},[]);

  const save=useCallback(async(a,b,c,d,e,f)=>{try{await storage.set(SK,JSON.stringify({currentCash:a,transactions:b,subscriptions:c,creditCards:d,personalDebts:e,categories:f}));}catch(x){console.error(x);}},[]);
  useEffect(()=>{if(!loading&&!importing)save(cash,tx,subs,cards,debts,cats);},[cash,tx,subs,cards,debts,cats,loading,importing,save]);

  const addTx=useCallback(i=>sTx(p=>[...p,{id:uid(),...i,createdAt:new Date().toISOString()}]),[]);
  const updateTx=useCallback((id,u)=>sTx(p=>p.map(t=>t.id===id?{...t,...u}:t)),[]);
  const deleteTx=useCallback(id=>sTx(p=>p.filter(t=>t.id!==id)),[]);
  const addSub=useCallback(i=>sSubs(p=>[...p,{id:uid(),...i,createdAt:new Date().toISOString()}]),[]);
  const deleteSub=useCallback(id=>sSubs(p=>p.filter(s=>s.id!==id)),[]);
  const addCard=useCallback(i=>sCards(p=>[...p,{id:'card_'+uid(),...i,createdAt:new Date().toISOString()}]),[]);
  const updateCard=useCallback((id,f,v)=>sCards(p=>p.map(c=>c.id===id?{...c,[f]:(f==='statementDay'||f==='paymentDay')?Math.min(31,Math.max(1,parseInt(v)||1)):f==='amount'?parseFloat(v)||0:v}:c)),[]);
  const deleteCard=useCallback(id=>sCards(p=>p.filter(c=>c.id!==id)),[]);
  const addDebt=useCallback(i=>sDebts(p=>[...p,{id:uid(),...i,createdAt:new Date().toISOString()}]),[]);
  const deleteDebt=useCallback(id=>sDebts(p=>p.filter(d=>d.id!==id)),[]);
  const addCat=useCallback((n,c,t)=>{if(!n.trim())return;sCats(p=>[...p,{id:'cat_'+uid(),name:n.trim(),color:c,type:t}]);},[]);
  const delCat=useCallback(id=>sCats(p=>p.filter(c=>c.id!==id)),[]);

  const importAll=useCallback(async raw=>{try{const d=JSON.parse(raw);const o={currentCash:d.currentCash??0,transactions:d.transactions??[],subscriptions:d.subscriptions??[],creditCards:d.creditCards??[],personalDebts:d.personalDebts??[],categories:d.categories??[]};sImp(true);await storage.set(SK,JSON.stringify(o));sCash(o.currentCash);sTx(o.transactions);sSubs(o.subscriptions);sCards(o.creditCards.length>0?o.creditCards:DEF_CARDS);sDebts(o.personalDebts);sCats(o.categories.length>0?o.categories:DEF_CATS);setTimeout(()=>sImp(false),500);}catch{alert('Dosya okunamadı.');};},[]);
  const exportAll=useCallback(()=>{const d=JSON.stringify({currentCash:cash,transactions:tx,subscriptions:subs,creditCards:cards,personalDebts:debts,categories:cats,exportDate:new Date().toISOString()},null,2);const b=new Blob([d],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`finans-yedek-${todayISO}.json`;a.click();URL.revokeObjectURL(u);},[cash,tx,subs,cards,debts,cats]);
  const resetAll=useCallback(()=>{if(!window.confirm('TÜM verileri silmek istediğine emin misin? Bu işlem geri alınamaz!'))return;storage.remove(SK);sImp(true);sCash(0);sTx([]);sSubs([]);sCards([]);sDebts([]);sCats(DEF_CATS);setTimeout(()=>sImp(false),300);},[]);

  const computed=useMemo(()=>cards.map(c=>calcCard(c,tx,subs)),[cards,tx,subs]);
  const totals=useMemo(()=>calcTotals(cash,tx,subs,computed,debts),[cash,tx,subs,computed,debts]);
  const flow=useMemo(()=>computed.map(c=>calcFlow(c,tx,subs,totals.balance)),[computed,tx,subs,totals.balance]);
  const expChart=useMemo(()=>buildChart(tx,cats,'expense'),[tx,cats]);
  const incChart=useMemo(()=>buildChart(tx,cats,'income'),[tx,cats]);
  const cardName=useCallback(id=>cards.find(c=>c.id===id)?.bank||'Silinmiş',[cards]);
  const eCats=useMemo(()=>cats.filter(c=>c.type==='expense'),[cats]);
  const iCats=useMemo(()=>cats.filter(c=>c.type==='income'),[cats]);

  return{loading,cash,sCash,tx,subs,cards,debts,cats,addTx,updateTx,deleteTx,addSub,deleteSub,addCard,updateCard,deleteCard,addDebt,deleteDebt,addCat,delCat,importAll,exportAll,resetAll,computed,totals,flow,expChart,incChart,cardName,eCats,iCats};
};

/* ═══════════════════════════════════════════════════════════
   4. UI COMPONENTS — Her biri kendi sorumluluğunda
   ═══════════════════════════════════════════════════════════ */

const LiveClock = () => {
  const [n,sN]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>sN(new Date()),1000);return()=>clearInterval(t);},[]);
  return <p className="text-slate-500 mt-1 font-medium flex items-center flex-wrap gap-1 text-xs md:text-sm"><Calendar size={12}/><span>{n.toLocaleDateString('tr-TR',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</span><span className="text-slate-300">|</span><Clock size={12}/><span className="tabular-nums">{n.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span></p>;
};

const DonutChart = ({data,size=200}) => {
  const total=data.reduce((s,d)=>s+d.value,0);
  if(!total) return <div className="flex flex-col items-center py-6 opacity-50"><PieChart size={48} className="text-slate-300"/><p className="text-xs text-slate-400 mt-2">Veri yok</p></div>;
  const cx=size/2,cy=size/2,r=size*.35,sw=size*.18,C=2*Math.PI*r; let o=0;
  const arcs=data.map(d=>{const p=d.value/total,dl=p*C;const a={...d,da:`${dl} ${C-dl}`,o:-o,p};o+=dl;return a;});
  return <div className="flex flex-col items-center"><svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw}/>{arcs.map((a,i)=><circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.color||CL[i%CL.length]} strokeWidth={sw} strokeDasharray={a.da} strokeDashoffset={a.o} strokeLinecap="butt" transform={`rotate(-90 ${cx} ${cy})`} style={{transition:'all .5s'}}/>)}<text x={cx} y={cy-6} textAnchor="middle" className="fill-slate-800" style={{fontSize:size*.1,fontWeight:900}}>{total.toLocaleString('tr-TR')}</text><text x={cx} y={cy+12} textAnchor="middle" className="fill-slate-400" style={{fontSize:size*.055,fontWeight:700}}>TOPLAM ₺</text></svg><div className="w-full mt-3 space-y-1.5 max-h-40 overflow-y-auto">{arcs.map((a,i)=><div key={i} className="flex items-center justify-between text-xs px-1"><div className="flex items-center space-x-2 min-w-0"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor:a.color||CL[i]}}/><span className="font-bold text-slate-600 truncate">{a.name}</span></div><div className="flex items-center space-x-2 flex-shrink-0 ml-2"><span className="font-black text-slate-800">{a.value.toLocaleString('tr-TR')}₺</span><span className="text-slate-400 font-bold" style={{fontSize:10}}>{Math.round(a.p*100)}%</span></div></div>)}</div></div>;
};

const BarComp = ({data}) => {
  const total=data.reduce((s,d)=>s+d.value,0);
  if(!total) return <div className="flex flex-col items-center py-6 opacity-50"><BarChart3 size={48} className="text-slate-300"/><p className="text-xs text-slate-400 mt-2">Veri yok</p></div>;
  const max=Math.max(...data.map(d=>d.value)); const sorted=[...data].sort((a,b)=>b.value-a.value);
  return <div className="space-y-3">{sorted.map((d,i)=>{const pct=(d.value/max)*100,tp=Math.round((d.value/total)*100);return <div key={i}><div className="flex justify-between items-center mb-1"><div className="flex items-center space-x-2"><div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:d.color||CL[i%CL.length]}}/><span className="text-xs font-bold text-slate-600">{d.name}</span></div><div className="flex items-center space-x-2"><span className="text-xs font-black text-slate-800">{d.value.toLocaleString('tr-TR')} ₺</span><span className="text-slate-400 font-bold" style={{fontSize:10}}>{tp}%</span></div></div><div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{width:`${pct}%`,backgroundColor:d.color||CL[i%CL.length]}}/></div></div>;})}<div className="pt-2 border-t border-slate-100 flex justify-between"><span className="text-xs font-bold text-slate-400">Toplam</span><span className="text-sm font-black text-slate-800">{total.toLocaleString('tr-TR')} ₺</span></div></div>;
};

// Özet Kartları
const Summary = ({onEditCash}) => {
  const {cash,totals}=useStore();
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
    <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 relative group"><button onClick={onEditCash} className="absolute top-3 right-3 p-1.5 bg-slate-50 rounded-full text-indigo-600 md:opacity-0 md:group-hover:opacity-100"><Edit3 size={14}/></button><Wallet className="text-indigo-500 mb-2" size={20}/><p className="text-slate-400 font-black uppercase tracking-widest" style={{fontSize:9}}>Mevcut Nakit</p><p className="text-lg md:text-2xl font-black text-slate-800 break-all">{cash.toLocaleString('tr-TR')} ₺</p>{totals.totalOwed>0&&<p className={`mt-1 font-bold ${totals.afterPayments>=0?'text-slate-400':'text-rose-400'}`} style={{fontSize:10}}>Sonra: {totals.afterPayments.toLocaleString('tr-TR')} ₺</p>}</div>
    <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100"><TrendingUp className="text-emerald-500 mb-2" size={20}/><p className="text-slate-400 font-black uppercase tracking-widest" style={{fontSize:9}}>Beklenen Gelir</p><p className="text-lg md:text-2xl font-black text-slate-800 break-all">{totals.income.toLocaleString('tr-TR')} ₺</p></div>
    <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100"><Clock className="text-blue-500 mb-2" size={20}/><p className="text-slate-400 font-black uppercase tracking-widest" style={{fontSize:9}}>Tahmini Bakiye</p><p className={`text-lg md:text-2xl font-black break-all ${totals.balance>=0?'text-slate-800':'text-rose-600'}`}>{totals.balance.toLocaleString('tr-TR')} ₺</p></div>
    <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100"><CreditCard className="text-amber-500 mb-2" size={20}/><p className="text-slate-400 font-black uppercase tracking-widest" style={{fontSize:9}}>Toplam Ödenecek</p><p className="text-lg md:text-2xl font-black text-slate-800 break-all">{totals.totalOwed.toLocaleString('tr-TR')} ₺</p>{totals.cc!==totals.totalOwed&&<p className="text-slate-400 font-medium mt-1" style={{fontSize:10}}>K:{totals.cc.toLocaleString('tr-TR')}₺ B:{(totals.totalOwed-totals.cc).toLocaleString('tr-TR')}₺</p>}</div>
  </div>;
};

// Ödeme Projeksiyonu
const Projection = ({onOpenCard}) => {
  const {flow}=useStore(); if(!flow.length)return null;
  return <section className="mb-6 md:mb-8 bg-slate-900 rounded-2xl md:rounded-3xl p-4 md:p-8 text-white shadow-2xl"><h2 className="text-base md:text-xl font-bold mb-4 md:mb-6 flex items-center italic"><AlertCircle className="mr-2 text-indigo-400" size={18}/> Akıllı Ödeme Projeksiyonu</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">{flow.map(a=><div key={a.id} onClick={()=>onOpenCard&&onOpenCard(a.id)} className={`p-4 md:p-6 rounded-2xl md:rounded-3xl border cursor-pointer transition-all active:scale-95 hover:border-indigo-500/40 ${a.isSafe?'bg-white/5 border-white/10':'bg-rose-500/10 border-rose-500/20'}`}><div className="flex justify-between items-start mb-3"><span className="text-slate-400 font-black uppercase tracking-widest" style={{fontSize:10}}>{a.bank}</span><span className={`px-2 md:px-3 py-1 rounded-full font-black ${a.isSafe?'bg-emerald-500/20 text-emerald-400':'bg-rose-500/20 text-rose-400'}`} style={{fontSize:10}}>{a.isSafe?'GÜVENLİ':'KRİTİK'}</span></div><p className="text-xl md:text-2xl font-black break-all">{a.calculatedDebt.toLocaleString('tr-TR')} ₺</p><p className={`text-xs font-bold mt-1 ${a.afterPay>=0?'text-slate-400':'text-rose-400'}`}>Ödeme sonrası: {a.afterPay.toLocaleString('tr-TR')} ₺</p>
    <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5"><div className="flex justify-between"><span className="text-slate-500 font-bold" style={{fontSize:10}}>Ekstre Kesim</span><div className="flex items-center space-x-2"><span className="text-xs text-slate-300">{fS(a.showStmtISO)}</span>{a.status==='between'?<span className="font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400" style={{fontSize:9}}>Kesildi</span>:a.stmtDaysLeft>0&&<span className={`font-black px-1.5 py-0.5 rounded-full ${a.stmtDaysLeft<=3?'bg-amber-500/20 text-amber-400':'bg-white/10 text-slate-500'}`} style={{fontSize:9}}>{a.stmtDaysLeft}g</span>}</div></div>
    <div className="flex justify-between"><span className="text-slate-500 font-bold" style={{fontSize:10}}>Son Ödeme</span><div className="flex items-center space-x-2"><span className="text-xs text-slate-300">{fS(a.showPayISO)}</span>{a.payDaysLeft>0&&<span className={`font-black px-1.5 py-0.5 rounded-full ${a.status==='between'&&a.payDaysLeft<=7?'bg-rose-500/20 text-rose-400':'bg-white/10 text-slate-500'}`} style={{fontSize:9}}>{a.payDaysLeft}g</span>}</div></div></div></div>)}</div></section>;
};

// Borç Paneli
const DebtPanel = ({onAdd}) => {
  const {debts,deleteDebt}=useStore();
  return <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100"><div className="flex items-center justify-between mb-4 md:mb-6 gap-2"><h3 className="font-black text-slate-400 uppercase" style={{fontSize:10,letterSpacing:'0.15em'}}>Şahıs Borçları</h3><button onClick={onAdd} className="flex items-center space-x-1 px-3 py-2 bg-slate-50 active:bg-indigo-100 text-slate-400 active:text-indigo-600 rounded-xl flex-shrink-0" style={{fontSize:10}}><Plus size={12}/><span className="font-black">Ekle</span></button></div>
  {debts.length>0?<div className="space-y-2">{debts.map(d=><div key={d.id} className={`flex justify-between items-center p-3 md:p-4 rounded-2xl group border gap-2 ${d.type==='payable'?'bg-rose-50/30 border-rose-100/50':'bg-emerald-50/30 border-emerald-100/50'}`}><div className="min-w-0 flex-1"><p className="text-sm font-black text-slate-800 truncate">{d.person}</p><div className="flex items-center flex-wrap gap-1 mt-0.5"><span className={`font-bold uppercase ${d.type==='payable'?'text-rose-400':'text-emerald-400'}`} style={{fontSize:10}}>{d.type==='payable'?'Borcum':'Alacağım'}</span>{d.indefinite?<span className="text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full" style={{fontSize:10}}>Süresiz</span>:d.paymentDate&&<span className="text-slate-400" style={{fontSize:10}}>{fS(d.paymentDate)}</span>}</div></div><div className="flex items-center space-x-2 flex-shrink-0"><span className="font-black text-slate-900 text-sm">{d.amount?.toLocaleString('tr-TR')} ₺</span><button onClick={()=>deleteDebt(d.id)} className="text-slate-300 active:text-rose-500 p-1"><Trash2 size={14}/></button></div></div>)}</div>:<p className="text-slate-400 text-sm italic text-center py-6">Kayıtlı borç yok.</p>}</div>;
};

// Abonelik Paneli
const SubPanel = ({onAdd}) => {
  const {subs,deleteSub,cardName}=useStore();
  return <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100"><div className="flex items-center justify-between mb-4 md:mb-6 gap-2"><h3 className="font-black text-slate-400 uppercase" style={{fontSize:10,letterSpacing:'0.15em'}}>Sabit Ödemeler</h3><button onClick={onAdd} className="flex items-center space-x-1 px-3 py-2 bg-slate-50 active:bg-purple-100 text-slate-400 active:text-purple-600 rounded-xl flex-shrink-0" style={{fontSize:10}}><Plus size={12}/><span className="font-black">Ekle</span></button></div>
  {subs.length>0?subs.map(s=><div key={s.id} className="flex justify-between items-center p-3 mb-2 bg-purple-50/30 rounded-xl group border border-purple-100/50 gap-2"><div className="min-w-0 flex-1"><p className="text-sm font-black text-slate-800 truncate">{s.name}</p><p className="text-purple-400 font-bold uppercase truncate" style={{fontSize:10}}>{s.cardId?`${cardName(s.cardId)} • Her dönem`:s.payDate?fS(s.payDate):'Nakit'}</p></div><div className="flex items-center space-x-2 flex-shrink-0"><span className="font-black text-slate-900 text-sm">{s.amount} ₺</span><button onClick={()=>deleteSub(s.id)} className="text-slate-300 active:text-rose-500 p-1"><Trash2 size={14}/></button></div></div>):<p className="text-slate-400 text-sm italic text-center py-6">Abonelik yok.</p>}</div>;
};

// İşlem Listesi
const TxList = () => {
  const {tx,cats,deleteTx,updateTx,cardName,eCats,iCats}=useStore();
  const [ed,sEd]=useState(null);
  const save=()=>{if(!ed)return;updateTx(ed.id,ed);sEd(null);};
  return <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 mb-6 md:mb-8"><h3 className="font-black text-slate-400 uppercase mb-4 md:mb-8" style={{fontSize:10,letterSpacing:'0.15em'}}>Finansal Hareketler</h3><div className="space-y-3 md:space-y-4">
    {tx.length>0?[...tx].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(t=>{
      const cat=cats.find(c=>c.name===t.category);
      if(ed?.id===t.id) return <div key={t.id} className="p-3 md:p-5 bg-indigo-50 rounded-2xl md:rounded-3xl border-2 border-indigo-200 space-y-3"><div className="flex justify-between items-center"><span className="text-xs font-black text-indigo-600 uppercase">Düzenleniyor</span><div className="flex space-x-2"><button onClick={save} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-black"><Check size={12} className="inline mr-1"/>Kaydet</button><button onClick={()=>sEd(null)} className="px-3 py-2 bg-slate-200 text-slate-600 rounded-lg text-xs font-black"><X size={12} className="inline mr-1"/>İptal</button></div></div><input value={ed.description||''} onChange={e=>sEd({...ed,description:e.target.value})} className="w-full p-3 bg-white rounded-xl font-bold border-none outline-none text-sm"/><div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><input type="number" step="0.01" value={ed.amount||''} onChange={e=>sEd({...ed,amount:parseFloat(e.target.value)||0})} className="p-3 bg-white rounded-xl font-bold border-none outline-none text-sm" placeholder="Tutar"/><select value={ed.category||''} onChange={e=>sEd({...ed,category:e.target.value})} className="p-3 bg-white rounded-xl font-bold border-none outline-none text-sm">{(t.type==='expense'?eCats:iCats).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select>{ed.isRecurring?<input type="number" min="1" max="31" value={ed.recurringDay||''} onChange={e=>sEd({...ed,recurringDay:parseInt(e.target.value)||1})} className="p-3 bg-white rounded-xl font-bold border-none outline-none text-sm" placeholder="Gün"/>:<input type="date" value={ed.date||''} onChange={e=>sEd({...ed,date:e.target.value})} className="p-3 bg-white rounded-xl font-bold border-none outline-none text-sm"/>}</div></div>;
      return <div key={t.id} className="flex items-center justify-between p-3 md:p-5 bg-slate-50 rounded-2xl md:rounded-3xl border border-slate-100 group hover:border-indigo-200 gap-2"><div className="flex items-center space-x-3 md:space-x-5 min-w-0 flex-1"><div className={`p-2 md:p-3 rounded-xl md:rounded-2xl flex-shrink-0 ${t.type==='income'?'bg-emerald-100 text-emerald-600':'bg-rose-100 text-rose-600'}`}>{t.type==='income'?<TrendingUp size={18}/>:<TrendingDown size={18}/>}</div><div className="min-w-0 flex-1"><p className="font-black text-slate-800 text-sm md:text-base truncate">{t.description}</p><div className="flex items-center flex-wrap gap-1 mt-0.5">{cat&&<div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:cat.color}}/>}<span className="text-slate-400 uppercase font-black tracking-wide truncate" style={{fontSize:9}}>{t.category}{t.cardId&&` • ${cardName(t.cardId)}`}{t.isInstallment&&` (${t.installmentCount}ay × ${(t.monthlyAmount||(t.amount/(t.installmentCount||1))).toLocaleString('tr-TR')}₺)`}{t.isRecurring?` • Her ayın ${t.recurringDay}'i`:t.date&&` • ${fS(t.date)}`}</span></div></div></div><div className="flex items-center space-x-1 md:space-x-3 flex-shrink-0"><span className={`text-sm md:text-lg font-black whitespace-nowrap ${t.type==='income'?'text-emerald-600':'text-slate-900'}`}>{t.type==='income'?'+':'-'}{t.amount.toLocaleString('tr-TR')}₺</span><button onClick={()=>sEd({...t})} className="text-slate-400 active:text-indigo-600 p-2 active:bg-indigo-50 rounded-full"><Edit3 size={14}/></button><button onClick={()=>deleteTx(t.id)} className="text-slate-400 active:text-rose-600 p-2 active:bg-rose-50 rounded-full"><Trash2 size={14}/></button></div></div>;
    }):<div className="text-center py-12 md:py-20 bg-slate-50 rounded-2xl md:rounded-3xl border-2 border-dashed border-slate-200"><ArrowRightLeft className="mx-auto text-slate-300 mb-4" size={40}/><p className="text-slate-400 text-sm">Henüz hareket yok.</p></div>}
  </div></div>;
};

// Sidebar
const Sidebar = ({open,onClose,onAddCard,onOpenCard}) => {
  const {cards,computed,updateCard,deleteCard,delCat,addCat,eCats,iCats,resetAll}=useStore();
  const [tab,sTab]=useState('categories');const [ec,sEc]=useState(null);
  const [cn,sCn]=useState('');const [ct,sCt]=useState('expense');const [cc,sCc]=useState('#6366f1');
  const doAdd=()=>{addCat(cn,cc,ct);sCn('');};
  return <>{open&&<div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose}/>}
  <aside className={`fixed lg:sticky top-0 left-0 h-screen z-40 bg-white border-r border-slate-100 shadow-xl lg:shadow-sm transition-transform duration-300 w-[85vw] max-w-xs lg:w-80 flex-shrink-0 flex flex-col ${open?'translate-x-0':'-translate-x-full lg:translate-x-0'}`}>
    <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between"><div className="flex items-center space-x-2"><Settings size={18} className="text-indigo-500"/><h2 className="font-black text-sm">Ayarlar</h2></div><button onClick={onClose} className="lg:hidden p-2 active:bg-slate-100 rounded-lg"><X size={20}/></button></div>
    <div className="flex border-b border-slate-100">{[{k:'categories',l:'Kategoriler',I:Tag},{k:'cards',l:'Kartlar',I:CreditCard},{k:'data',l:'Veri',I:Settings}].map(t=><button key={t.k} onClick={()=>sTab(t.k)} className={`flex-1 py-3 flex flex-col items-center space-y-1 font-black uppercase tracking-tight border-b-2 ${tab===t.k?'border-indigo-500 text-indigo-600 bg-indigo-50/50':'border-transparent text-slate-400'}`} style={{fontSize:10}}><t.I size={16}/><span>{t.l}</span></button>)}</div>
    <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 md:space-y-5">
      {tab==='categories'&&<>
        <div className="p-4 bg-slate-50 rounded-2xl space-y-3"><p className="font-black text-slate-400 uppercase tracking-widest" style={{fontSize:10}}>Yeni Kategori</p><input value={cn} onChange={e=>sCn(e.target.value)} placeholder="Kategori adı..." className="w-full p-3 bg-white rounded-xl text-sm font-bold border-none outline-none"/><div className="flex space-x-2"><select value={ct} onChange={e=>sCt(e.target.value)} className="flex-1 p-2 bg-white rounded-xl text-xs font-bold border-none outline-none"><option value="expense">Gider</option><option value="income">Gelir</option></select><input type="color" value={cc} onChange={e=>sCc(e.target.value)} className="w-10 h-10 rounded-xl cursor-pointer border-none p-0.5 bg-white"/><button onClick={doAdd} disabled={!cn.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black disabled:opacity-30"><Plus size={14}/></button></div></div>
        {[{c:eCats,l:'Gider',cl:'text-rose-400',I:TrendingDown},{c:iCats,l:'Gelir',cl:'text-emerald-500',I:TrendingUp}].map(g=><div key={g.l}><p className={`font-black uppercase tracking-widest mb-3 flex items-center ${g.cl}`} style={{fontSize:10}}><g.I size={12} className="mr-1"/>{g.l}</p><div className="space-y-1.5">{g.c.map(c=><div key={c.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl group hover:bg-slate-100"><div className="flex items-center space-x-2.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor:c.color}}/><span className="text-sm font-bold text-slate-700">{c.name}</span></div><button onClick={()=>delCat(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500"><Trash2 size={13}/></button></div>)}</div></div>)}
      </>}
      {tab==='cards'&&<>
        <div className="space-y-4">{cards.map(card=>{const comp=computed.find(c=>c.id===card.id);return <div key={card.id} onClick={()=>onOpenCard&&onOpenCard(card.id)} className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl text-white relative group overflow-hidden cursor-pointer active:scale-95 transition-transform"><button onClick={e=>{e.stopPropagation();deleteCard(card.id);}} className="absolute top-2 right-2 text-white/40 active:text-rose-400 z-10 p-1.5 bg-white/10 rounded-full"><Trash2 size={13}/></button><div className="p-4 pb-3"><div className="flex items-center space-x-2 mb-3"><CreditCard size={16} className="text-indigo-400"/>{ec===card.id?<input defaultValue={card.bank} onClick={e=>e.stopPropagation()} onBlur={e=>{updateCard(card.id,'bank',e.target.value);sEc(null);}} onKeyDown={e=>e.key==='Enter'&&e.target.blur()} autoFocus className="bg-white/10 text-white text-sm font-black rounded-lg px-2 py-1 outline-none w-full"/>:<span className="font-black text-sm active:text-indigo-300" onClick={e=>{e.stopPropagation();sEc(card.id);}}>{card.bank}</span>}<span className="ml-auto text-indigo-300" style={{fontSize:10}}>Detay →</span></div><div className="flex justify-between items-end mb-1"><div><p className="text-slate-400 font-bold uppercase" style={{fontSize:10}}>Bu Ekstre</p><p className="text-xl font-black">{comp?.calculatedDebt?.toLocaleString('tr-TR')||0} ₺</p></div>{comp?.nextPeriodDebt>0&&<div className="text-right"><p className="text-slate-500 font-bold uppercase" style={{fontSize:10}}>Sonraki</p><p className="text-sm font-bold text-slate-400">{comp.nextPeriodDebt.toLocaleString('tr-TR')} ₺</p></div>}</div></div>
          <div className="bg-black/20 p-3 space-y-2" onClick={e=>e.stopPropagation()}>{[{f:'statementDay',l:'Ekstre Kesim',I:Scissors,c:'text-amber-400'},{f:'paymentDay',l:'Son Ödeme',I:Calendar,c:'text-emerald-400'}].map(x=><div key={x.f} className="flex items-center justify-between"><div className="flex items-center space-x-1.5"><x.I size={11} className={x.c}/><span className="font-bold text-slate-400 uppercase" style={{fontSize:10}}>{x.l}</span></div><div className="flex items-center space-x-1"><span className="text-slate-300" style={{fontSize:11}}>Her ayın</span><input type="number" min="1" max="31" value={card[x.f]||15} onChange={e=>updateCard(card.id,x.f,e.target.value)} onClick={e=>e.stopPropagation()} className={`bg-white/10 ${x.c} font-black rounded-lg w-10 text-center px-1 py-0.5 outline-none border-none`} style={{fontSize:12}}/><span className="text-slate-300" style={{fontSize:11}}>'i</span></div></div>)}
          <p className="text-slate-500 pt-1" style={{fontSize:9}}>{comp?.status==='between'?`⚡ Ekstre kesildi (${fS(comp?.showStmtISO)}) • Ödemeye ${comp?.payDaysLeft||0} gün`:`Kesim: ${fS(comp?.showStmtISO)} (${comp?.stmtDaysLeft||0}g) • Ödeme: ${fS(comp?.showPayISO)} (${comp?.payDaysLeft||0}g)`}</p></div></div>;})}</div>
        {!cards.length&&<p className="text-slate-400 text-sm italic text-center py-4">Henüz kart yok.</p>}
        <button onClick={onAddCard} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 active:border-indigo-300 active:text-indigo-500 font-bold text-xs flex items-center justify-center"><Plus size={14} className="mr-1"/> Yeni Kart</button>
      </>}
      {tab==='data'&&<>
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
          <p className="font-black text-amber-700 uppercase" style={{fontSize:10,letterSpacing:'0.15em'}}>⚠️ Tehlikeli Bölge</p>
          <p className="text-xs text-amber-700/80">Tüm verileri silmek geri alınamaz. Önce yedek almanı öneririz (üst menüdeki indir butonu).</p>
          <button onClick={resetAll} className="w-full mt-2 py-3 bg-rose-600 active:bg-rose-700 text-white rounded-xl font-black text-xs flex items-center justify-center"><Trash2 size={14} className="mr-2"/> TÜM VERİLERİ SİFİRLA</button>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
          <p className="font-black text-slate-500 uppercase" style={{fontSize:10,letterSpacing:'0.15em'}}>ℹ️ Uygulama Bilgisi</p>
          <p className="text-xs text-slate-600">Finans Takip Pro v1.0</p>
          <p className="text-xs text-slate-500">Tüm veriler cihazda saklanır.</p>
        </div>
      </>}
    </div>
  </aside></>;
};

/* ═══════════════════════════════════════════════════════════
   5. MODALS
   ═══════════════════════════════════════════════════════════ */

// Kart Detay Modalı - kart içeriğini ve hareketlerini gösterir
const CardDetailModal = ({cardId,onClose}) => {
  const {computed,tx,subs,cardName,cats,deleteTx,deleteSub}=useStore();
  const [tab,sTab]=useState('current');
  if(!cardId)return null;
  const card=computed.find(c=>c.id===cardId);
  if(!card)return null;
  const sd=card.statementDay||15;

  // Bu döneme yansıyan ve sonraki döneme yansıyacak işlemleri ayır
  const cardTx=tx.filter(t=>t.type==='expense'&&t.cardId===cardId);
  const cardSubs=subs.filter(s=>s.cardId===cardId);
  const ns=getNext(sd),nsi=toISO(ns);
  const ps=getPrev(sd),psi=toISO(ps);

  // Bu dönem: peşin işlemler (psi < tarih <= nsi) + taksitlilerden bu döneme denk gelen
  const currentItems=[];
  const nextItems=[];
  const futureItems=[]; // gelecek dönem taksitleri (henüz başlamamış)
  cardTx.forEach(t=>{
    if(!t.isInstallment){
      // Peşin işlem
      if(t.date&&t.date>psi&&t.date<=nsi)currentItems.push({...t,_kind:'cash',_amount:t.amount});
      else if(t.date&&t.date>nsi)nextItems.push({...t,_kind:'cash',_amount:t.amount});
    }else{
      // Taksitli işlem
      const periodNum=getInstPeriods(t.date,sd); // bu işlem için içinde bulunduğumuz taksit numarası
      const total=t.installmentCount||1;
      const monthly=t.monthlyAmount||(t.amount/total);
      if(periodNum<=total){
        // Hâlâ bu döneme yansıyor
        currentItems.push({...t,_kind:'installment',_amount:monthly,_current:periodNum,_total:total});
      }
      if(periodNum+1<=total){
        nextItems.push({...t,_kind:'installment',_amount:monthly,_current:periodNum+1,_total:total});
      }
    }
  });
  cardSubs.forEach(s=>{
    currentItems.push({...s,_kind:'subscription',_amount:s.amount});
    nextItems.push({...s,_kind:'subscription',_amount:s.amount});
  });

  const currentTotal=currentItems.reduce((a,b)=>a+b._amount,0);
  const nextTotal=nextItems.reduce((a,b)=>a+b._amount,0);
  const items=tab==='current'?currentItems:tab==='next'?nextItems:cardTx.concat(cardSubs.map(s=>({...s,description:s.name,type:'subscription'})));

  return <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
    <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[95vh] md:max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
      {/* HEADER - Kart bilgisi */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-700 text-white p-5 md:p-7 relative flex-shrink-0">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 active:bg-white/20 rounded-full"><X size={20}/></button>
        <div className="flex items-center space-x-2 mb-3"><CreditCard size={18} className="text-indigo-400"/><span className="text-slate-400 font-black uppercase tracking-widest" style={{fontSize:10}}>Kredi Kartı</span></div>
        <h2 className="text-2xl md:text-3xl font-black mb-4">{card.bank}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/10 rounded-2xl p-3"><p className="text-slate-400 font-bold uppercase" style={{fontSize:9}}>Bu Ekstre</p><p className="text-lg md:text-xl font-black break-all">{card.calculatedDebt.toLocaleString('tr-TR')} ₺</p></div>
          <div className="bg-white/10 rounded-2xl p-3"><p className="text-slate-400 font-bold uppercase" style={{fontSize:9}}>Sonraki Dönem</p><p className="text-lg md:text-xl font-black break-all">{card.nextPeriodDebt.toLocaleString('tr-TR')} ₺</p></div>
        </div>
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10 text-xs">
          <div className="flex items-center space-x-1"><Scissors size={11} className="text-amber-400"/><span className="text-slate-400">Kesim:</span><span className="font-bold">{fS(card.showStmtISO)}</span>{card.stmtDaysLeft!==null&&card.stmtDaysLeft>0&&<span className="text-amber-400 font-black">({card.stmtDaysLeft}g)</span>}</div>
          <div className="flex items-center space-x-1"><Calendar size={11} className="text-emerald-400"/><span className="text-slate-400">Ödeme:</span><span className="font-bold">{fS(card.showPayISO)}</span><span className="text-emerald-400 font-black">({card.payDaysLeft}g)</span></div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex bg-slate-50 border-b border-slate-100 flex-shrink-0">
        {[{k:'current',l:'Bu Dönem',c:currentItems.length,t:currentTotal},{k:'next',l:'Sonraki Dönem',c:nextItems.length,t:nextTotal},{k:'all',l:'Tümü',c:cardTx.length+cardSubs.length}].map(x=>
          <button key={x.k} onClick={()=>sTab(x.k)} className={`flex-1 py-3 md:py-4 px-2 font-black border-b-2 ${tab===x.k?'border-indigo-500 text-indigo-600 bg-white':'border-transparent text-slate-400'}`}>
            <p style={{fontSize:10}} className="uppercase tracking-wider">{x.l}</p>
            <p className="text-xs font-bold mt-0.5">{x.c} adet{x.t!==undefined?` • ${x.t.toLocaleString('tr-TR')}₺`:''}</p>
          </button>
        )}
      </div>

      {/* LİSTE */}
      <div className="overflow-y-auto flex-1 p-4 md:p-6 space-y-2 bg-slate-50">
        {items.length>0?items.map((t,i)=>{
          const cat=cats.find(c=>c.name===t.category);
          const isSub=t._kind==='subscription'||t.type==='subscription';
          const isInst=t._kind==='installment'||t.isInstallment;
          const amt=t._amount||t.amount;
          return <div key={`${t.id}_${i}`} className="bg-white p-3 md:p-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className={`p-2 rounded-xl flex-shrink-0 ${isSub?'bg-purple-100 text-purple-600':isInst?'bg-amber-100 text-amber-600':'bg-rose-100 text-rose-600'}`}>
                {isSub?<Clock size={16}/>:isInst?<Calculator size={16}/>:<TrendingDown size={16}/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-sm text-slate-800 truncate">{t.description||t.name}</p>
                <div className="flex items-center flex-wrap gap-1 mt-0.5">
                  {cat&&<div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:cat.color}}/>}
                  <span className="text-slate-400 uppercase font-black truncate" style={{fontSize:9}}>
                    {isSub?'Sabit Ödeme':isInst?`Taksit ${t._current||'?'}/${t._total||t.installmentCount}`:'Tek Çekim'}
                    {t.category&&` • ${t.category}`}
                    {t.date&&!isSub&&` • ${fS(t.date)}`}
                  </span>
                </div>
                {isInst&&t.amount!==amt&&<p className="text-slate-400 font-medium mt-0.5" style={{fontSize:10}}>Toplam: {t.amount.toLocaleString('tr-TR')}₺</p>}
              </div>
            </div>
            <div className="flex items-center space-x-1 flex-shrink-0">
              <span className="font-black text-slate-900 text-sm whitespace-nowrap">{amt.toLocaleString('tr-TR')} ₺</span>
              {tab==='all'&&<button onClick={()=>isSub?deleteSub(t.id):deleteTx(t.id)} className="text-slate-300 active:text-rose-500 p-1.5"><Trash2 size={13}/></button>}
            </div>
          </div>;
        }):<div className="text-center py-10 text-slate-400 text-sm italic">{tab==='current'?'Bu döneme yansıyan işlem yok.':tab==='next'?'Sonraki döneme işlem yok.':'Henüz işlem yok.'}</div>}
      </div>

      {/* FOOTER - Toplam */}
      {tab!=='all'&&<div className="p-4 md:p-5 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
        <span className="font-black uppercase tracking-wider" style={{fontSize:11}}>{tab==='current'?'Bu Dönem Toplamı':'Sonraki Dönem Toplamı'}</span>
        <span className="text-xl md:text-2xl font-black">{(tab==='current'?currentTotal:nextTotal).toLocaleString('tr-TR')} ₺</span>
      </div>}
    </div>
  </div>;
};

const CashModal = ({open,onClose}) => {
  const {cash,sCash}=useStore();if(!open)return null;
  const go=e=>{e.preventDefault();sCash(parseFloat(e.target.cashAmount.value)||0);onClose();};
  return <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}><div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-sm shadow-2xl p-6 md:p-8" onClick={e=>e.stopPropagation()}><h2 className="text-lg md:text-xl font-black mb-4 md:mb-6 flex items-center"><Wallet className="mr-2 text-indigo-500" size={20}/> Nakit Güncelle</h2><form onSubmit={go}><input name="cashAmount" type="number" step="0.01" inputMode="decimal" defaultValue={cash} autoFocus required className="w-full p-4 md:p-5 bg-slate-50 rounded-2xl border-none font-black text-xl md:text-2xl text-indigo-600 mb-4 md:mb-6 outline-none"/><div className="flex space-x-3"><button type="button" onClick={onClose} className="flex-1 py-3 md:py-4 text-slate-400 font-bold rounded-2xl bg-slate-50 active:bg-slate-100">İPTAL</button><button type="submit" className="flex-1 py-3 md:py-4 bg-indigo-600 active:bg-indigo-700 text-white font-black rounded-2xl">GÜNCELLE</button></div></form></div></div>;
};

const RecordModal = ({open,onClose,initTab,initType}) => {
  const S=useStore();const {cards,addTx,addSub,addCard,addDebt,eCats,iCats,cardName,computed}=S;
  const [tab,sTab]=useState('transaction');const [txT,sTxT]=useState('income');const [pm,sPM]=useState('cash');
  const [inst,sInst]=useState(false);const [subC,sSubC]=useState('cash');const [showC,sSC]=useState(false);
  const [sal,sSal]=useState({bs:0,or:0,oh:0,dw:26});const [indef,sIndef]=useState(false);
  const [selC,sSelC]=useState(null);const [cMode,sCMode]=useState('add');const [rec,sRec]=useState(false);
  const cSal=useMemo(()=>Math.round((sal.bs/26)*sal.dw+sal.or*sal.oh),[sal]);

  useEffect(()=>{if(open){sTab(initTab||'transaction');sTxT(initType||'income');sPM('cash');sInst(false);sSubC('cash');sIndef(false);sSelC(null);sCMode(cards.length>0?'manage':'add');sRec(false);}},[open,initTab,initType]);
  if(!open)return null;

  const go=e=>{e.preventDefault();const fd=new FormData(e.target);const data=Object.fromEntries(fd.entries());const amt=parseFloat(data.amount)||0;
    if(tab==='transaction'){const i={type:txT,description:data.description,amount:amt,category:data.category};if(txT==='income'&&rec){i.isRecurring=true;i.recurringDay=parseInt(data.recurringDay)||1;}else{i.date=data.date||todayISO;}if(txT==='expense'){i.cardId=pm!=='cash'?pm:null;i.isInstallment=inst;i.installmentCount=inst?(parseInt(data.installmentCount)||1):1;i.monthlyAmount=inst?(parseFloat(data.monthlyAmount)||amt/i.installmentCount):amt;}addTx(i);}
    if(tab==='subscription'){addSub({name:data.name,amount:amt,cardId:subC!=='cash'?subC:null,payDate:subC==='cash'?(data.payDate||null):null});}
    if(tab==='creditCard'){if(cMode==='add'){addCard({bank:data.bank,amount:parseFloat(data.amount)||0,statementDay:parseInt(data.statementDay)||15,paymentDay:parseInt(data.paymentDay)||5});}else if(selC){S.updateCard(selC,'amount',data.debtAmount);}onClose();e.target.reset();return;}
    if(tab==='debt'){addDebt({person:data.person,type:data.type,amount:amt,paymentDate:indef?null:(data.paymentDate||null),indefinite:indef});}
    onClose();e.target.reset();};

  return <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}><div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[95vh] md:max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
    <div className="p-5 md:p-8 flex justify-between items-center bg-slate-50 border-b border-slate-100 flex-shrink-0"><h2 className="text-xl md:text-2xl font-black italic">Kayıt Oluştur</h2><button onClick={onClose} className="p-2 active:bg-white rounded-full text-slate-400"><X size={22}/></button></div>
    <div className="flex bg-slate-100/50 p-1.5 m-3 md:p-2 md:m-4 rounded-2xl md:rounded-3xl flex-shrink-0">{['transaction','subscription','creditCard','debt'].map(t=><button key={t} onClick={()=>{sTab(t);sSC(false);}} className={`flex-1 py-2.5 md:py-3 font-black uppercase rounded-xl md:rounded-2xl ${tab===t?'bg-white text-indigo-600 shadow-sm':'text-slate-400'}`} style={{fontSize:10}}>{t==='transaction'?'İşlem':t==='subscription'?'Abonelik':t==='creditCard'?'Kart':'Borç'}</button>)}</div>
    <form onSubmit={go} className="p-5 md:p-8 pt-2 md:pt-4 space-y-3 md:space-y-4 overflow-y-auto flex-1">
      {tab==='transaction'&&<>
        <div className="flex space-x-3">{[{v:'income',l:'GELİR',c:'indigo'},{v:'expense',l:'GİDER',c:'rose'}].map(x=><label key={x.v} className={`flex-1 p-4 border-2 rounded-2xl text-center cursor-pointer font-black text-xs ${txT===x.v?`bg-${x.c}-500 border-${x.c}-500 text-white`:'border-slate-200 text-slate-500'}`}><input type="radio" name="type" value={x.v} checked={txT===x.v} onChange={()=>sTxT(x.v)} required className="hidden"/>{x.l}</label>)}</div>
        {txT==='income'&&<div className="border border-slate-100 rounded-3xl overflow-hidden"><button type="button" onClick={()=>sSC(!showC)} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100"><div className="flex items-center text-xs font-black text-indigo-600 uppercase"><Calculator size={16} className="mr-2"/> Maaş Hesaplayıcı</div>{showC?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>{showC&&<div className="p-6 space-y-4 bg-white border-t border-slate-100"><div className="grid grid-cols-2 gap-4">{[{k:'bs',l:'Maaş'},{k:'dw',l:'Gün'},{k:'or',l:'Saat Ücreti'},{k:'oh',l:'Mesai Saati'}].map(x=><div key={x.k}><label style={{fontSize:10}} className="font-black text-slate-400 uppercase ml-1">{x.l}</label><input type="number" value={sal[x.k]||''} onChange={e=>sSal({...sal,[x.k]:parseFloat(e.target.value)||0})} className="w-full p-3 bg-slate-50 rounded-xl font-bold border-none text-sm outline-none"/></div>)}</div><div className="pt-2 border-t flex justify-between items-center"><span style={{fontSize:10}} className="text-slate-400 font-bold">Net: {cSal.toLocaleString('tr-TR')}₺</span><button type="button" onClick={()=>{const el=document.querySelector('input[name="amount"]');if(el){el.value=cSal;el.dispatchEvent(new Event('input',{bubbles:true}));}}} style={{fontSize:10}} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-black">AKTAR</button></div></div>}</div>}
        {txT==='expense'&&cards.length>0&&<div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 space-y-4"><div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Ödeme Yöntemi</label><select value={pm} onChange={e=>sPM(e.target.value)} className="w-full p-3 mt-1 bg-white rounded-xl font-bold border-none text-sm outline-none"><option value="cash">Nakit / Havale</option>{cards.map(c=><option key={c.id} value={c.id}>{c.bank}</option>)}</select></div>{pm!=='cash'&&<div className="pt-2 border-t border-slate-200/60 space-y-3"><label className="flex items-center space-x-3 cursor-pointer p-2"><input type="checkbox" checked={inst} onChange={e=>sInst(e.target.checked)} className="w-5 h-5 rounded"/><span className="font-bold text-sm text-slate-700">Taksitli</span></label>{inst&&<div className="space-y-3 pl-2"><div className="grid grid-cols-2 gap-3"><div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Kaç Ay?</label><input name="installmentCount" type="number" min="2" max="48" placeholder="6" required className="w-full p-3 mt-1 bg-white rounded-xl font-bold border-none text-sm outline-none"/></div><div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Aylık Tutar</label><input name="monthlyAmount" type="number" step="0.01" placeholder="Otomatik" className="w-full p-3 mt-1 bg-white rounded-xl font-bold border-none text-sm outline-none"/></div></div><p className="text-amber-500 font-medium" style={{fontSize:10}}>* Boş bırakılırsa toplam ÷ taksit hesaplanır.</p></div>}</div>}</div>}
        <input name="description" placeholder="Açıklama..." required className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border-none"/>
        <div className="grid grid-cols-2 gap-4"><input name="amount" type="number" step="0.01" placeholder="Tutar (₺)" required className="p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"/><select name="category" required className="p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none text-sm"><option value="">Kategori</option>{(txT==='expense'?eCats:iCats).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
        {txT==='income'&&<div className="space-y-3"><label className="flex items-center space-x-3 cursor-pointer p-3 bg-slate-50 rounded-2xl"><input type="checkbox" checked={rec} onChange={e=>sRec(e.target.checked)} className="w-5 h-5 rounded"/><span className="font-bold text-sm text-slate-700">Devamlı Gelir</span></label>{rec?<div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Her Ayın Kaçında?</label><input name="recurringDay" type="number" min="1" max="31" placeholder="1" required className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold border-none outline-none"/><p style={{fontSize:10}} className="text-slate-400 mt-1 ml-1">* Kısa aylarda ayın son günü kullanılır.</p></div>:<div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Beklenen Tarih</label><input name="date" type="date" defaultValue={todayISO} className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold border-none outline-none"/></div>}</div>}
        {txT==='expense'&&<div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">İşlem Tarihi</label><input name="date" type="date" defaultValue={todayISO} className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold border-none outline-none"/></div>}
      </>}
      {tab==='subscription'&&<><input name="name" placeholder="Servis Adı..." required className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"/><input name="amount" type="number" placeholder="Aylık Tutar (₺)" required className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"/>{cards.length>0&&<div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Ödeme Yöntemi</label><select value={subC} onChange={e=>sSubC(e.target.value)} className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold border-none outline-none"><option value="cash">Nakit</option>{cards.map(c=><option key={c.id} value={c.id}>{c.bank}</option>)}</select></div>}{subC==='cash'&&<div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Ödeme Tarihi</label><input name="payDate" type="date" required className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold border-none outline-none"/></div>}{subC!=='cash'&&<div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100"><p style={{fontSize:10}} className="font-bold text-indigo-500">{cardName(subC)} kartına her ekstre döneminde yansıtılacak.</p></div>}</>}
      {tab==='creditCard'&&<>{cards.length>0&&<div className="flex space-x-2 mb-2"><button type="button" onClick={()=>sCMode('manage')} className={`flex-1 p-3 rounded-2xl font-black text-xs ${cMode==='manage'?'bg-indigo-100 text-indigo-600':'bg-slate-50 text-slate-400'}`}>Mevcut</button><button type="button" onClick={()=>sCMode('add')} className={`flex-1 p-3 rounded-2xl font-black text-xs ${cMode==='add'?'bg-indigo-100 text-indigo-600':'bg-slate-50 text-slate-400'}`}>Yeni Kart</button></div>}
        {cMode==='add'&&<><input name="bank" placeholder="Banka Adı" required className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"/><input name="amount" type="number" placeholder="Devreden Borç" className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none text-sm"/><div className="grid grid-cols-2 gap-4"><div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Ekstre Kesim Günü</label><input name="statementDay" type="number" min="1" max="31" placeholder="15" required className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold border-none outline-none"/></div><div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Son Ödeme Günü</label><input name="paymentDay" type="number" min="1" max="31" placeholder="5" required className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold border-none outline-none"/></div></div><p style={{fontSize:10}} className="text-slate-400 font-bold px-1">* Kısa aylarda ayın son günü kullanılır.</p></>}
        {cMode==='manage'&&<><p style={{fontSize:10}} className="font-black text-slate-400 uppercase">Kart Seçin</p><div className="space-y-2">{cards.map(card=>{const comp=computed.find(c=>c.id===card.id);const sel=selC===card.id;return<div key={card.id} onClick={()=>sSelC(sel?null:card.id)} className={`p-4 rounded-2xl cursor-pointer border-2 ${sel?'border-indigo-500 bg-indigo-50':'border-slate-100 bg-slate-50'}`}><div className="flex items-center justify-between"><div className="flex items-center space-x-3"><div className={`w-8 h-8 rounded-xl flex items-center justify-center ${sel?'bg-indigo-500 text-white':'bg-slate-200 text-slate-400'}`}><CreditCard size={16}/></div><div><p className="font-black text-sm">{card.bank}</p><p style={{fontSize:10}} className="text-slate-400">Ekstre: {comp?.calculatedDebt?.toLocaleString('tr-TR')||0} ₺</p></div></div>{sel&&<Check size={18} className="text-indigo-500"/>}</div></div>;})}</div>{selC&&<div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-3"><p style={{fontSize:10}} className="font-black text-amber-600 uppercase">Devreden Borç Güncelle</p><input name="debtAmount" type="number" step="0.01" placeholder="₺" defaultValue={cards.find(c=>c.id===selC)?.amount||''} className="w-full p-4 bg-white rounded-2xl font-bold border-none outline-none"/></div>}{!selC&&<p className="text-xs text-slate-400 text-center py-2 italic">Bir kart seçin</p>}</>}
      </>}
      {tab==='debt'&&<><input name="person" placeholder="Kişi Adı" required className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"/><div className="grid grid-cols-2 gap-4"><select name="type" className="p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"><option value="payable">Borcum Var</option><option value="receivable">Alacağım Var</option></select><input name="amount" type="number" placeholder="Tutar (₺)" required className="p-4 bg-slate-50 rounded-2xl font-bold border-none outline-none"/></div><label className="flex items-center space-x-3 cursor-pointer p-2 bg-slate-50 rounded-2xl"><input type="checkbox" checked={indef} onChange={e=>sIndef(e.target.checked)} className="w-5 h-5 rounded"/><span className="font-bold text-sm text-slate-700">Süresiz</span></label>{!indef&&<div><label style={{fontSize:10}} className="font-black text-slate-500 uppercase ml-1">Ödeme Tarihi</label><input name="paymentDate" type="date" className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold border-none outline-none"/></div>}</>}
      <button type="submit" disabled={tab==='creditCard'&&cMode==='manage'&&!selC} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-2xl hover:bg-indigo-700 disabled:opacity-30">{tab==='creditCard'?(cMode==='add'?'KART EKLE':'GÜNCELLE'):'KAYDET'}</button>
    </form></div></div>;
};

/* ═══════════════════════════════════════════════════════════
   6. APP — Composition Layer
   ═══════════════════════════════════════════════════════════ */
const App = () => {
  const store = useFinanceStore();
  const [sb,sSb]=useState(false);const [cashM,sCashM]=useState(false);
  const [modal,sModal]=useState({open:false,tab:'transaction',type:'income'});
  const [cardDetailId,sCardDetailId]=useState(null);
  const fileRef=useRef(null);
  const openM=(tab='transaction',type='income')=>sModal({open:true,tab,type});
  const closeM=()=>sModal({open:false,tab:'transaction',type:'income'});
  const openCard=(id)=>sCardDetailId(id);

  if(store.loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"/></div>;

  return <Ctx.Provider value={store}><div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
    <Sidebar open={sb} onClose={()=>sSb(false)} onAddCard={()=>{openM('creditCard');sSb(false);}} onOpenCard={(id)=>{openCard(id);sSb(false);}}/>
    <main className="flex-1 min-w-0 p-3 md:p-8 pb-24 md:pb-8"><div className="max-w-6xl mx-auto">
      <header className="mb-5 md:mb-8 flex items-center justify-between gap-2"><div className="flex items-center space-x-2 md:space-x-3 min-w-0 flex-1"><button onClick={()=>sSb(!sb)} className="lg:hidden p-2 md:p-2.5 bg-white rounded-xl border border-slate-100 shadow-sm text-slate-500 flex-shrink-0"><Menu size={20}/></button><div className="min-w-0"><h1 className="text-xl md:text-3xl font-extrabold text-slate-900 tracking-tight italic truncate">Finans Takip Pro</h1><LiveClock/></div></div>
        <div className="flex items-center space-x-1.5 md:space-x-2 flex-shrink-0"><input ref={fileRef} type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>store.importAll(ev.target.result);r.readAsText(f);e.target.value='';}}} className="hidden"/><button onClick={()=>fileRef.current?.click()} title="Yükle" className="p-2.5 md:p-3 bg-white border border-slate-200 text-slate-500 rounded-xl md:rounded-2xl active:text-emerald-600"><Upload size={16}/></button><button onClick={store.exportAll} title="Yedekle" className="p-2.5 md:p-3 bg-white border border-slate-200 text-slate-500 rounded-xl md:rounded-2xl active:text-indigo-600"><Download size={16}/></button><button onClick={()=>openM()} className="hidden md:flex items-center px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl active:bg-indigo-700"><Plus size={20} className="mr-2"/> Yeni Kayıt</button></div>
      </header>
      <Summary onEditCash={()=>sCashM(true)}/>
      <Projection onOpenCard={openCard}/>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8"><DebtPanel onAdd={()=>openM('debt')}/><SubPanel onAdd={()=>openM('subscription')}/></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100"><div className="flex items-center justify-between mb-4 md:mb-5 gap-2"><h3 className="font-black text-rose-400 uppercase flex items-center" style={{fontSize:10,letterSpacing:'0.15em'}}><BarChart3 size={12} className="mr-1.5"/> Gider Dağılımı</h3><button onClick={()=>openM('transaction','expense')} className="flex items-center space-x-1 px-3 py-2 bg-slate-50 active:bg-rose-100 text-slate-400 active:text-rose-500 rounded-xl flex-shrink-0" style={{fontSize:10}}><Plus size={12}/><span className="font-black">Gider</span></button></div><BarComp data={store.expChart}/></div>
        <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100"><div className="flex items-center justify-between mb-4 gap-2"><h3 className="font-black text-emerald-500 uppercase flex items-center" style={{fontSize:10,letterSpacing:'0.15em'}}><PieChart size={12} className="mr-1.5"/> Gelir Dağılımı</h3><button onClick={()=>openM('transaction','income')} className="flex items-center space-x-1 px-3 py-2 bg-slate-50 active:bg-emerald-100 text-slate-400 active:text-emerald-500 rounded-xl flex-shrink-0" style={{fontSize:10}}><Plus size={12}/><span className="font-black">Gelir</span></button></div><DonutChart data={store.incChart} size={180}/></div>
      </div>
      <TxList/>
    </div></main>
    <button onClick={()=>openM()} className="md:hidden fixed bottom-5 right-5 z-30 p-4 bg-indigo-600 active:bg-indigo-700 text-white rounded-full shadow-2xl"><Plus size={24}/></button>
    <CashModal open={cashM} onClose={()=>sCashM(false)}/>
    <RecordModal open={modal.open} onClose={closeM} initTab={modal.tab} initType={modal.type}/>
    <CardDetailModal cardId={cardDetailId} onClose={()=>sCardDetailId(null)}/>
  </div></Ctx.Provider>;
};

export default App;