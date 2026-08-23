import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, BarChart3, Bell, Bot, CheckCircle2, ChevronRight, FileText, Menu, Search, ShieldCheck, Upload } from 'lucide-react';
import './index.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://v-shiroya-policy.onrender.com').trim().replace(/\/$/, '');

type Policy = { id:number; policyNumber:string; ownerName:string; providerCompany:string; policyType:string; premiumAmount:number; policyStatus:string; endDate:string };
const demoPolicies: Policy[] = [
 {id:1,policyNumber:'VS-2026-001',ownerName:'Rajesh Patel',providerCompany:'HDFC ERGO',policyType:'Health Insurance',premiumAmount:24500,policyStatus:'ACTIVE',endDate:'2027-06-30'},
 {id:2,policyNumber:'VS-2026-002',ownerName:'Meera Shah',providerCompany:'ICICI Lombard',policyType:'Motor Insurance',premiumAmount:18200,policyStatus:'ACTIVE',endDate:'2026-12-14'},
 {id:3,policyNumber:'VS-2026-003',ownerName:'Amit Joshi',providerCompany:'LIC',policyType:'Life Insurance',premiumAmount:52000,policyStatus:'EXPIRING SOON',endDate:'2026-09-03'},
];

async function analyze(file: File, instruction='Analyze this insurance policy document and return structured JSON.') {
 const base64 = await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split('base64,')[1]||'');r.onerror=()=>reject(new Error('Could not read the selected file.'));r.readAsDataURL(file)});
 const res = await fetch(`${API_BASE}/api/analyze-policy`, {
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({fileData:base64,fileName:file.name,mimeType:file.type||'application/pdf',instruction})
 });
 const text=await res.text();
 let payload:any={};
 try{payload=text?JSON.parse(text):{};}catch{payload={details:text};}
 if(!res.ok) throw new Error(payload?.details||payload?.error||`Request failed (${res.status})`);
 if(!payload?.extraction) throw new Error('The AI completed the request but returned no extraction result.');
 return payload;
}

function Sidebar({tab,setTab,collapsed,setCollapsed}:{tab:string;setTab:(s:string)=>void;collapsed:boolean;setCollapsed:(b:boolean)=>void}){
 const items=[['dashboard','▦','Dashboard'],['scan','✦','Scan & Extract Policy'],['policies','⌕','Policy Database'],['clients','♙','Clients CRM'],['renewals','⚠','Renewals & Expiry'],['commissions','◉','Commissions'],['claims','➤','Claim Intimation'],['security','▣','IRDAI & Security'],['reports','▤','Reports & Analytics'],['settings','⚙','Settings']];
 return <aside className={`sidebar ${collapsed?'collapsed':''}`}><div className="brand"><div className="brandMark">VS</div>{!collapsed&&<><b>V SHIROYA</b><button onClick={()=>setCollapsed(true)}>‹</button></>}</div><nav>{items.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><span>{icon}</span>{!collapsed&&<>{label}{id==='scan'&&<small>AI</small>}{id==='renewals'&&<small className="warn">3</small>}</>}</button>)}</nav><div className="sidebarUser"><div className="avatar">VS</div>{!collapsed&&<div><b>VIJAY SHIROYA</b><span>Insurance & Financials</span></div>}</div></aside>
}

function App(){
 const [tab,setTab]=useState('dashboard'); const [collapsed,setCollapsed]=useState(false); const [search,setSearch]=useState(''); const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false); const [result,setResult]=useState<any|null>(null); const [error,setError]=useState('');
 const filtered=demoPolicies.filter(p=>Object.values(p).join(' ').toLowerCase().includes(search.toLowerCase()));
 const runAnalysis=async()=>{if(!file)return;setBusy(true);setError('');setResult(null);try{setResult(await analyze(file));}catch(e:any){setError(e?.message||'Policy analysis failed');}finally{setBusy(false)}};
 return <div className="app"><Sidebar tab={tab} setTab={setTab} collapsed={collapsed} setCollapsed={setCollapsed}/><main className="main"><header className="topbar"><button className="mobileMenu"><Menu/></button><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search policy number, client, provider..."/></div><div className="topActions"><button><Bot size={16}/> AI Assistant</button><button><Bell size={16}/> Alerts</button><span className="profile">VS&nbsp; VIJAY SHIROYA</span></div></header><section className="content"><div className="eyebrow">CHARTERED ACCOUNTANT WORKSPACE</div><div className="titleRow"><div><h1>Policy Portfolio Overview</h1><p>Real-time analytics for client insurance policies and premium schedules.</p></div><button className="primary" onClick={()=>setTab('scan')}><Activity size={16}/> Analyze New Policy</button></div><div className="alert"><div><b>3 policies expire within 30 days</b><span>Automated 30-Day Email Notification Service ready to dispatch renewal notices.</span></div><ChevronRight/></div>{tab==='dashboard'&&<Dashboard policies={filtered}/>} {tab==='policies'&&<PolicyTable policies={filtered}/>} {tab==='scan'&&<Scanner file={file} setFile={setFile} busy={busy} run={runAnalysis} result={result} error={error}/>} {['clients','renewals','commissions','claims','security','reports','settings'].includes(tab)&&<Placeholder tab={tab}/>}</section></main></div>
}

function Dashboard({policies}:{policies:Policy[]}){return <><div className="cards">{[['TOTAL POLICIES','248','+12 this month','green'],['ACTIVE POLICIES','219','88.3% active','green'],['PREMIUM VALUE','₹18.4L','+7.2% YoY','green'],['EXPIRING SOON','3','Action required','orange']].map(([a,b,c,d])=><div className="card" key={a}><span>{a}</span><strong>{b}</strong><em className={d}>{c}</em></div>)}</div><div className="grid"><div className="panel chart"><div className="panelHead"><b>Premium Portfolio</b><span>Last 12 months</span></div><div className="bars">{[36,55,48,72,64,86,67,78,58,91,74,83].map((h,i)=><div key={i} style={{height:`${h}%`}}><small>{i+1}</small></div>)}</div></div><div className="panel"><div className="panelHead"><b>Quick Actions</b></div><div className="quick"><button><Upload/><b>Scan & Extract</b><span>Upload a policy PDF</span></button><button><FileText/><b>Policy Database</b><span>Search all policies</span></button><button><AlertTriangle/><b>Renewals</b><span>Review expiring policies</span></button><button><BarChart3/><b>Reports</b><span>Open analytics</span></button></div></div></div><div className="panel recent"><div className="panelHead"><b>Recent Policies</b></div><PolicyTable policies={policies}/></div></>}
function PolicyTable({policies}:{policies:Policy[]}){return <div className="tableWrap"><table><thead><tr><th>Policy</th><th>Client</th><th>Provider</th><th>Type</th><th>Premium</th><th>Status</th></tr></thead><tbody>{policies.map(p=><tr key={p.id}><td><b>{p.policyNumber}</b></td><td>{p.ownerName}</td><td>{p.providerCompany}</td><td>{p.policyType}</td><td>₹{p.premiumAmount.toLocaleString('en-IN')}</td><td><span className={`status ${p.policyStatus.replaceAll(' ','-').toLowerCase()}`}>{p.policyStatus}</span></td></tr>)}</tbody></table></div>}
function Scanner({file,setFile,busy,run,result,error}:{file:File|null;setFile:(f:File|null)=>void;busy:boolean;run:()=>void;result:any;error:string}){const extraction=result?.extraction||result;return <div className="scanLayout"><div className="panel uploadPanel"><div className="panelHead"><b>Scan & Extract Policy</b><span>Powered by OpenRouter via Render</span></div><label className="drop"><Upload size={34}/><b>{file?file.name:'Drop policy PDF here'}</b><span>PDF or image files</span><input type="file" accept="application/pdf,image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="primary full" disabled={!file||busy} onClick={run}>{busy?'Analyzing policy…':'Analyze Policy'}</button>{error&&<div className="error">{error}</div>}</div><div className="panel resultPanel"><div className="panelHead"><b>Extraction Result</b>{result&&<CheckCircle2 className="ok"/>}</div>{busy?<div className="loading"><Activity/><b>AI is processing your policy</b><span>Securely sending the document to your Render backend.</span></div>:result?<pre>{JSON.stringify(extraction,null,2)}</pre>:<div className="empty"><FileText size={40}/><span>Upload a policy to view extracted fields.</span></div>}</div></div>}
function Placeholder({tab}:{tab:string}){return <div className="panel placeholder"><ShieldCheck size={44}/><h2>{tab.replace(/^./,c=>c.toUpperCase())}</h2><p>This workspace remains connected to the Render backend. Existing navigation is preserved.</p></div>}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
