"use client";

import Image from "next/image";
import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./haohire.module.css";

type Status = "Saved" | "Applied" | "Interview" | "Offer" | "Rejected";
type Screen = "entry" | "today" | "importing" | "review" | "applications" | "details";
type ExtractedJob = { title:string; organisation:string; location:string; deadline:string; employmentType:string; requiredDocuments:string[]; source:string; evidence:Record<string,string> };
type Application = ExtractedJob & { id:number; status:Status; notes:string; reminder:boolean };

const activeStatuses: Exclude<Status,"Rejected">[] = ["Saved","Applied","Interview","Offer"];
const allStatuses: Status[] = [...activeStatuses,"Rejected"];
const storeKey = "haohire-applications-v3";
const entryKey = "haohire-reference-ui-entered";
const emptyJob:ExtractedJob={title:"",organisation:"",location:"",deadline:"",employmentType:"",requiredDocuments:[],source:"",evidence:{}};
const fieldMissing=(value:string)=>!value||/not found|not specified|needs review/i.test(value);
const display=(value:string,fallback="Not found — review")=>fieldMissing(value)?fallback:value;
const dateLabel=(value:string)=>value?new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${value}T12:00:00`)):"Not found — review";

export default function Home(){
  const [screen,setScreen]=useState<Screen>("entry");
  const [apps,setApps]=useState<Application[]>([]);
  const [source,setSource]=useState("");
  const [draft,setDraft]=useState<ExtractedJob>(emptyJob);
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [importStep,setImportStep]=useState(1);
  const [error,setError]=useState("");
  const [openRow,setOpenRow]=useState<number|null>(null);
  const [rejectOpen,setRejectOpen]=useState(false);
  const [undo,setUndo]=useState<{app:Application;index:number}|null>(null);

  useEffect(()=>{try{const saved=localStorage.getItem(storeKey);if(saved)setApps(JSON.parse(saved));if(sessionStorage.getItem(entryKey)==="yes")setScreen("today")}catch{}},[]);
  useEffect(()=>{try{localStorage.setItem(storeKey,JSON.stringify(apps))}catch{}},[apps]);
  const selected=apps.find(app=>app.id===selectedId)??null;
  const counts=useMemo(()=>Object.fromEntries(allStatuses.map(status=>[status,apps.filter(app=>app.status===status).length])) as Record<Status,number>,[apps]);
  const upcoming=useMemo(()=>apps.filter(app=>app.status!=="Rejected").sort((a,b)=>(a.deadline||"9999").localeCompare(b.deadline||"9999")),[apps]);

  const enter=()=>{sessionStorage.setItem(entryKey,"yes");setScreen("today")};
  const go=(next:Screen)=>{setOpenRow(null);setScreen(next);window.scrollTo({top:0,behavior:"smooth"})};
  async function importJob(event:FormEvent){
    event.preventDefault();if(!source.trim())return;setError("");setImportStep(1);go("importing");
    const timer=window.setTimeout(()=>setImportStep(2),450);
    try{const response=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source})});const data=await response.json();if(!response.ok)throw new Error(data.error||"This job could not be read.");setDraft(data);setImportStep(3);window.setTimeout(()=>go("review"),520)}catch(reason){setError(reason instanceof Error?reason.message:"This job could not be read.");go("today")}finally{window.clearTimeout(timer)}}
  const addApplication=()=>{const app:Application={...draft,id:Date.now(),status:"Saved",notes:"",reminder:true};setApps(current=>[app,...current]);setSelectedId(app.id);setSource("");setDraft(emptyJob);go("applications")};
  const openDetails=(id:number)=>{setSelectedId(id);go("details")};
  const setStatus=(id:number,status:Status)=>setApps(current=>current.map(app=>app.id===id?{...app,status}:app));
  const deleteApp=(id:number)=>{setApps(current=>{const index=current.findIndex(app=>app.id===id);if(index<0)return current;setUndo({app:current[index],index});window.setTimeout(()=>setUndo(null),5000);return current.filter(app=>app.id!==id)});setOpenRow(null);if(selectedId===id)go("applications")};
  const restore=()=>{if(!undo)return;setApps(current=>{const next=[...current];next.splice(Math.min(undo.index,next.length),0,undo.app);return next});setUndo(null)};
  const confirmRejected=()=>{if(!selected)return;setStatus(selected.id,"Rejected");setRejectOpen(false)};
  const advance=()=>{if(!selected||selected.status==="Rejected")return;const index=activeStatuses.indexOf(selected.status as Exclude<Status,"Rejected">);setStatus(selected.id,activeStatuses[Math.min(index+1,activeStatuses.length-1)])};

  if(screen==="entry")return <main className={styles.stage}><section className={`${styles.phone} ${styles.entry}`}>
    <header className={styles.wordmark}>HaoHire<span>+</span></header>
    <div className={styles.entryCopy}><p>YOUR JOB SEARCH, LESS CHAOTIC.</p><h1>Find it. Track it.<br/>Get hired.</h1><span>Paste any job link or description.<br/>HaoHire organises the details,<br/>deadlines and progress for you.</span></div>
    <div className={styles.mascot}><Image src="/kekabu-job-search.png" alt="可卡布 organising a job search at a laptop" fill priority sizes="390px"/></div>
    <button className={styles.primary} onClick={enter}>Start tracking</button><small className={styles.privacy}>No account needed · Your applications stay on this device</small>
  </section></main>;

  return <main className={styles.stage}><section className={styles.phone}>
    {screen==="today"&&<Today source={source} setSource={setSource} importJob={importJob} error={error} upcoming={upcoming} openDetails={openDetails} addFocus={()=>document.getElementById("job-source")?.focus()}/>} 
    {screen==="importing"&&<Importing step={importStep} cancel={()=>go("today")}/>} 
    {screen==="review"&&<Review job={draft} edit={()=>go("today")} add={addApplication}/>} 
    {screen==="applications"&&<Applications apps={apps} counts={counts} openRow={openRow} setOpenRow={setOpenRow} openDetails={openDetails} deleteApp={deleteApp} add={()=>go("today")}/>} 
    {screen==="details"&&selected&&<Details app={selected} back={()=>go("applications")} advance={advance} reject={()=>setRejectOpen(true)} update={next=>setApps(current=>current.map(app=>app.id===selected.id?{...app,...next}:app))}/>} 
    {(screen==="today"||screen==="applications")&&<BottomNav screen={screen} today={()=>go("today")} applications={()=>go("applications")}/>} 
    {rejectOpen&&<div className={styles.modalShade}><section className={styles.rejectModal} role="dialog" aria-modal="true" aria-labelledby="reject-title"><span>×</span><h2 id="reject-title">Close this application<br/>as rejected?</h2><p>You can’t undo this action.</p><div><button onClick={()=>setRejectOpen(false)}>Cancel</button><button onClick={confirmRejected}>Mark as rejected</button></div></section></div>}
    {undo&&<div className={styles.toast}><span>Application deleted</span><button onClick={restore}>Undo</button></div>}
  </section></main>;
}

function Today({source,setSource,importJob,error,upcoming,openDetails,addFocus}:{source:string;setSource:(v:string)=>void;importJob:(e:FormEvent)=>void;error:string;upcoming:Application[];openDetails:(id:number)=>void;addFocus:()=>void}){
  return <div className={styles.page}><header className={styles.todayHeader}><div><p>GOOD MORNING</p><h1>Ready for your<br/>next move?</h1></div><button aria-label="Settings">⚙</button></header>
    <form className={styles.addCard} onSubmit={importJob}><div className={styles.addTitle}><span>＋</span><div><strong>Add a job</strong><small>We’ll fill in the details.</small></div></div><textarea id="job-source" value={source} onChange={e=>setSource(e.target.value)} placeholder="Paste a job link or job description…"/><button className={styles.primary} disabled={!source.trim()}>Import automatically</button>{error&&<p className={styles.error}>{error}</p>}</form>
    <section className={styles.deadlines}><header><p>UP NEXT</p><h2>Deadlines</h2></header>{upcoming.length?<div className={styles.deadlineList}>{upcoming.slice(0,3).map(app=><button key={app.id} onClick={()=>openDetails(app.id)}><span>{app.organisation.slice(0,1).toUpperCase()}</span><div><strong>{app.title}</strong><small>{display(app.organisation)}</small></div><time>{dateLabel(app.deadline)}</time></button>)}</div>:<Empty title="No applications yet" copy="Paste your first job and HaoHire will take it from there." action="Add your first job" onClick={addFocus} icon="⌑"/>}</section>
  </div>
}

function Importing({step,cancel}:{step:number;cancel:()=>void}){const fields=["Job title","Company or organisation","Location","Application deadline","Employment type","Source URL","Required documents"];return <div className={`${styles.page} ${styles.flowPage}`}><header className={styles.flowHeader}><button onClick={cancel}>×</button><strong>Importing job</strong><span/></header><div className={styles.steps}>{["Reading the job","Finding the details","Ready to add"].map((label,index)=><div className={step>=index+1?styles.stepOn:""} key={label}><span>{index+1}</span><small>{label}</small></div>)}</div><div className={styles.loadingFields}>{fields.map((field,index)=><div key={field}><span className={styles.fieldIcon}>{["▣","▥","⌖","▦","◉","↗","▤"][index]}</span><strong>{field}</strong><i/></div>)}</div><p className={styles.hang}>✦&nbsp; Hang tight — we’re pulling everything together.</p></div>}

function Review({job,edit,add}:{job:ExtractedJob;edit:()=>void;add:()=>void}){const rows=[{icon:"▣",label:"Job title",value:job.title,evidence:job.evidence?.title},{icon:"▥",label:"Organisation",value:job.organisation,evidence:job.evidence?.organisation},{icon:"⌖",label:"Location",value:job.location,evidence:job.evidence?.location},{icon:"▦",label:"Deadline",value:dateLabel(job.deadline),raw:job.deadline,evidence:job.evidence?.deadline},{icon:"◉",label:"Employment type",value:job.employmentType,evidence:job.evidence?.employmentType},{icon:"↗",label:"Source",value:job.source,evidence:"Found on job page"},{icon:"▤",label:"Required documents",value:job.requiredDocuments.join(", "),evidence:job.evidence?.requiredDocuments}];return <div className={`${styles.page} ${styles.flowPage}`}><header className={styles.flowHeader}><button onClick={edit}>‹</button><strong>Review details</strong><span/></header><div className={styles.reviewList}>{rows.map(row=>{const missing=row.raw!==undefined?!row.raw:fieldMissing(row.value);return <div key={row.label}><span className={styles.fieldIcon}>{row.icon}</span><section><strong>{row.label}</strong><p>{missing?"Not found — review":row.value}</p></section><em className={missing?styles.needs:styles.found}>{missing?"Needs review":row.evidence||"Found on job page"}</em></div>})}</div><div className={styles.reviewActions}><button onClick={edit}>Edit</button><button onClick={add}>Add to applications</button></div></div>}

function Applications({apps,counts,openRow,setOpenRow,openDetails,deleteApp,add}:{apps:Application[];counts:Record<Status,number>;openRow:number|null;setOpenRow:(id:number|null)=>void;openDetails:(id:number)=>void;deleteApp:(id:number)=>void;add:()=>void}){return <div className={`${styles.page} ${styles.appsPage}`}><header className={styles.appsHeader}><h1>Applications</h1><button aria-label="Filter applications">≡</button></header><div className={styles.summary}>{allStatuses.map(status=><div className={status==="Rejected"?styles.red:""} key={status}><span>{status}</span><strong>{counts[status]}</strong></div>)}</div>{apps.length?<div className={styles.applicationList}>{apps.map(app=><SwipeRow key={app.id} app={app} open={openRow===app.id} setOpen={setOpenRow} details={openDetails} remove={deleteApp}/>)}</div>:<Empty title="No applications yet" copy="Import a job to see it here and track your progress with ease." action="Add your first job" onClick={add} icon="▱"/>}</div>}

function SwipeRow({app,open,setOpen,details,remove}:{app:Application;open:boolean;setOpen:(id:number|null)=>void;details:(id:number)=>void;remove:(id:number)=>void}){const start=useRef(0),delta=useRef(0);const down=(e:PointerEvent<HTMLDivElement>)=>{start.current=e.clientX;delta.current=0;e.currentTarget.setPointerCapture(e.pointerId)};const move=(e:PointerEvent<HTMLDivElement>)=>{delta.current=e.clientX-start.current};const up=()=>setOpen(delta.current<-48?app.id:delta.current>25?null:open?app.id:null);return <article className={`${styles.swipe} ${open?styles.swipeOpen:""}`}><button className={styles.delete} onClick={()=>remove(app.id)}>Delete</button><div className={styles.appRow} onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={()=>details(app.id)}><span className={styles.drag}>≡</span><section><strong>{app.title}</strong><p>{display(app.organisation)}</p><small>⌖ {display(app.location)}</small>{app.status==="Rejected"&&<em>This application is closed.</em>}</section><span className={`${styles.status} ${app.status==="Rejected"?styles.statusRejected:""}`}>{app.status}</span><button onClick={()=>details(app.id)} aria-label={`Open ${app.title}`}>›</button></div></article>}

function Details({app,back,advance,reject,update}:{app:Application;back:()=>void;advance:()=>void;reject:()=>void;update:(next:Partial<Application>)=>void}){const index=activeStatuses.indexOf(app.status as Exclude<Status,"Rejected">);return <div className={`${styles.page} ${styles.detailPage}`}><header className={styles.flowHeader}><button onClick={back}>‹</button><strong>Job details</strong><button>•••</button></header><div className={styles.detailTable}>{[["▣","Job title",app.title],["▥","Organisation",display(app.organisation)],["⌖","Location",display(app.location)],["▦","Deadline",dateLabel(app.deadline)],["↗","Source link",app.source||"Not found — review"]].map(([icon,label,value])=><div key={label}><span>{icon}</span><strong>{label}</strong><p>{value}</p>{label==="Source link"&&<i>›</i>}</div>)}<div className={styles.progressRow}><span>♧</span><strong>Current status</strong><em className={app.status==="Rejected"?styles.needs:styles.found}>{app.status}</em><div className={styles.progress}>{activeStatuses.map((status,step)=><button key={status} className={app.status!=="Rejected"&&step<=index?styles.progressOn:""} onClick={()=>update({status})}><i/><small>{status}</small></button>)}</div></div>{[["▤","Required documents",app.requiredDocuments.join(", ")||"Not found — review"],["⌕","Personal notes",app.notes||"Add notes…"],["⌁","Reminder settings",app.reminder?"Active":"Off"]].map(([icon,label,value])=><div key={label}><span>{icon}</span><strong>{label}</strong><p>{value}</p><i>›</i></div>)}</div>{app.status==="Rejected"?<div className={styles.closed}>This application is closed.</div>:<div className={styles.detailActions}><button onClick={advance}>Update status</button><button onClick={reject}>Mark as rejected</button></div>}</div>}

function Empty({title,copy,action,onClick,icon}:{title:string;copy:string;action:string;onClick:()=>void;icon:string}){return <div className={styles.empty}><span>{icon}</span><strong>{title}</strong><p>{copy}</p><button onClick={onClick}>{action}</button></div>}
function BottomNav({screen,today,applications}:{screen:Screen;today:()=>void;applications:()=>void}){return <nav className={styles.bottom}><button className={screen==="today"?styles.navOn:""} onClick={today}><span>☼</span>Today</button><button className={screen==="applications"?styles.navOn:""} onClick={applications}><span>▱</span>Applications</button><button><span>≡</span><i className="sr-only">Menu</i></button></nav>}
