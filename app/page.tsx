"use client";

import Image from "next/image";
import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./haohire.module.css";

type Status = "Saved" | "Applied" | "Interview" | "Offer" | "Rejected";
type Screen = "entry" | "today" | "importing" | "review" | "applications" | "details";
type Overlay = "settings" | "menu" | "filter" | "detailsMenu" | null;
type ExtractedJob = { title:string; organisation:string; location:string; deadline:string; employmentType:string; source:string; evidence:Record<string,string> };
type Application = ExtractedJob & { id:number; status:Status; notes:string; reminder:boolean };

const activeStatuses: Exclude<Status,"Rejected">[] = ["Saved","Applied","Interview","Offer"];
const allStatuses: Status[] = [...activeStatuses,"Rejected"];
const storeKey = "haohire-applications-v3";
const entryKey = "haohire-reference-ui-entered";
const notifiedKey = "haohire-deadline-notifications-v1";
const emptyJob:ExtractedJob={title:"",organisation:"",location:"",deadline:"",employmentType:"",source:"",evidence:{}};
const fieldMissing=(value:string)=>!value||/not found|not specified|needs review/i.test(value);
const display=(value:string,fallback="Not found — review")=>fieldMissing(value)?fallback:value;
const dateLabel=(value:string)=>value?new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${value}T12:00:00`)):"Not found — review";
const daysUntil=(value:string)=>value?Math.ceil((new Date(`${value}T00:00:00`).getTime()-new Date(new Date().toDateString()).getTime())/86_400_000):null;
const deadlineCountdown=(value:string)=>{const days=daysUntil(value);if(days===null)return"No deadline";if(days<0)return`Closed ${Math.abs(days)} day${days===-1?"":"s"} ago`;if(days===0)return"Due today";return`${days} day${days===1?"":"s"} left`};

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
  const [overlay,setOverlay]=useState<Overlay>(null);
  const [filter,setFilter]=useState<Status|"All">("All");
  const hydrated=useRef(false);

  useEffect(()=>{queueMicrotask(()=>{try{const saved=localStorage.getItem(storeKey);if(saved)setApps(JSON.parse(saved));if(sessionStorage.getItem(entryKey)==="yes")setScreen("today")}catch{}finally{hydrated.current=true}})},[]);
  useEffect(()=>{if(!hydrated.current)return;try{localStorage.setItem(storeKey,JSON.stringify(apps))}catch{}},[apps]);
  useEffect(()=>{if(!hydrated.current||typeof Notification==="undefined"||Notification.permission!=="granted")return;try{const sent=JSON.parse(localStorage.getItem(notifiedKey)||"{}") as Record<string,boolean>;const today=new Date().toISOString().slice(0,10);for(const app of apps){const days=daysUntil(app.deadline);const key=`${app.id}:${app.deadline}:${today}`;if(app.reminder&&app.status!=="Rejected"&&days!==null&&days>=0&&days<=7&&!sent[key]){new Notification("HaoHire deadline reminder",{body:`${app.title} — ${deadlineCountdown(app.deadline)}`});sent[key]=true}}localStorage.setItem(notifiedKey,JSON.stringify(sent))}catch{}},[apps]);
  const selected=apps.find(app=>app.id===selectedId)??null;
  const counts=useMemo(()=>Object.fromEntries(allStatuses.map(status=>[status,apps.filter(app=>app.status===status).length])) as Record<Status,number>,[apps]);
  const upcoming=useMemo(()=>apps.filter(app=>app.status!=="Rejected").sort((a,b)=>(a.deadline||"9999").localeCompare(b.deadline||"9999")),[apps]);

  const enter=()=>{sessionStorage.setItem(entryKey,"yes");setScreen("today")};
  const go=(next:Screen)=>{setOpenRow(null);setOverlay(null);setScreen(next);window.scrollTo({top:0,behavior:"smooth"})};
  async function importJob(event:FormEvent){
    event.preventDefault();if(!source.trim())return;if(document.activeElement instanceof HTMLElement)document.activeElement.blur();setError("");setImportStep(1);go("importing");
    const timer=window.setTimeout(()=>setImportStep(2),450);
    try{const response=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source})});const data=await response.json();if(!response.ok)throw new Error(data.error||"This job could not be read.");setDraft(data);setImportStep(3);window.setTimeout(()=>go("review"),520)}catch(reason){setError(reason instanceof Error?reason.message:"This job could not be read.");go("today")}finally{window.clearTimeout(timer)}}
  const addApplication=()=>{const app:Application={...draft,id:Date.now(),status:"Saved",notes:"",reminder:true};setApps(current=>[app,...current]);setSelectedId(app.id);setSource("");setDraft(emptyJob);if(typeof Notification!=="undefined"&&Notification.permission==="default")void Notification.requestPermission();go("applications")};
  const openDetails=(id:number)=>{setSelectedId(id);go("details")};
  const setStatus=(id:number,status:Status)=>setApps(current=>current.map(app=>app.id===id?{...app,status}:app));
  const deleteApp=(id:number)=>{setApps(current=>{const index=current.findIndex(app=>app.id===id);if(index<0)return current;setUndo({app:current[index],index});window.setTimeout(()=>setUndo(null),5000);return current.filter(app=>app.id!==id)});setOpenRow(null);if(selectedId===id)go("applications")};
  const restore=()=>{if(!undo)return;setApps(current=>{const next=[...current];next.splice(Math.min(undo.index,next.length),0,undo.app);return next});setUndo(null)};
  const confirmRejected=()=>{if(!selected)return;setApps(current=>current.map(app=>app.id===selected.id?{...app,status:"Rejected",reminder:false}:app));setRejectOpen(false)};
  const advance=()=>{if(!selected||selected.status==="Rejected")return;const index=activeStatuses.indexOf(selected.status as Exclude<Status,"Rejected">);setStatus(selected.id,activeStatuses[Math.min(index+1,activeStatuses.length-1)])};

  if(screen==="entry")return <main className={styles.stage}><section className={`${styles.phone} ${styles.entryArtwork}`}>
    <Image src="/haohire-entry-v2.webp" alt="HaoHire welcome screen featuring Snoopy preparing job applications" fill priority sizes="(max-width: 599px) 100vw, 430px"/>
    <p className="sr-only">Find it. Track it. Get hired. No account needed. Your applications stay on this device.</p>
    <button className={styles.entryHotspot} onClick={enter} aria-label="Start tracking"><span className="sr-only">Start tracking</span></button>
  </section></main>;

  return <main className={styles.stage}><section className={styles.phone}>
    {screen==="today"&&<Today source={source} setSource={setSource} importJob={importJob} error={error} upcoming={upcoming} openDetails={openDetails} addFocus={()=>document.getElementById("job-source")?.focus()} settings={()=>setOverlay("settings")}/>} 
    {screen==="importing"&&<Importing step={importStep} cancel={()=>go("today")}/>} 
    {screen==="review"&&<Review job={draft} edit={()=>go("today")} add={addApplication}/>} 
    {screen==="applications"&&<Applications apps={apps} counts={counts} filter={filter} setFilter={setFilter} showFilter={()=>setOverlay("filter")} openRow={openRow} setOpenRow={setOpenRow} openDetails={openDetails} deleteApp={deleteApp} add={()=>go("today")}/>} 
    {screen==="details"&&selected&&<Details app={selected} back={()=>go("applications")} menu={()=>setOverlay("detailsMenu")} advance={advance} reject={()=>setRejectOpen(true)} update={next=>setApps(current=>current.map(app=>app.id===selected.id?{...app,...next}:app))}/>} 
    {(screen==="today"||screen==="applications")&&<BottomNav screen={screen} today={()=>go("today")} applications={()=>go("applications")} menu={()=>setOverlay("menu")}/>} 
    {rejectOpen&&<div className={styles.modalShade}><section className={styles.rejectModal} role="dialog" aria-modal="true" aria-labelledby="reject-title"><span>×</span><h2 id="reject-title">Close this application<br/>as rejected?</h2><p>You can’t undo this action.</p><div><button onClick={()=>setRejectOpen(false)}>Cancel</button><button onClick={confirmRejected}>Mark as rejected</button></div></section></div>}
    {undo&&<div className={styles.toast}><span>Application deleted</span><button onClick={restore}>Undo</button></div>}
    {overlay&&<ActionSheet title={overlay==="settings"?"Settings":overlay==="filter"?"Filter applications":overlay==="detailsMenu"?"Application options":"HaoHire menu"} close={()=>setOverlay(null)}>
      {overlay==="settings"&&<><button onClick={()=>{sessionStorage.removeItem(entryKey);setOverlay(null);setScreen("entry")}}>Show welcome screen</button><button onClick={()=>setOverlay(null)}>Keep using HaoHire</button><p>Your applications are stored on this device. No account is required.</p></>}
      {overlay==="menu"&&<><button onClick={()=>go("today")}>＋ Add a job</button><button onClick={()=>go("applications")}>▱ View applications</button><button onClick={()=>setOverlay("settings")}>⚙ Settings</button></>}
      {overlay==="filter"&&<>{(["All",...allStatuses] as const).map(status=><button className={filter===status?styles.sheetSelected:""} key={status} onClick={()=>{setFilter(status);setOverlay(null)}}>{filter===status?"✓ ":""}{status}</button>)}</>}
      {overlay==="detailsMenu"&&selected&&<><button onClick={()=>{if(/^https?:\/\//i.test(selected.source))window.open(selected.source,"_blank","noopener,noreferrer")}} disabled={!/^https?:\/\//i.test(selected.source)}>↗ Open original job page</button><button className={styles.sheetDanger} onClick={()=>{setOverlay(null);setRejectOpen(true)}}>Mark as rejected</button><button className={styles.sheetDanger} onClick={()=>{setOverlay(null);deleteApp(selected.id)}}>Delete application</button></>}
    </ActionSheet>}
  </section></main>;
}

function OrganisationLogo({app}:{app:Application}){const [failed,setFailed]=useState(false);const organisation=fieldMissing(app.organisation)?"":app.organisation;const source=/^https?:\/\//i.test(app.source)?app.source:"";const src=`/api/logo?organisation=${encodeURIComponent(organisation)}&source=${encodeURIComponent(source)}`;const initial=(organisation||app.title||"H").slice(0,1).toUpperCase();return <span className={styles.deadlineLogo}>{failed?initial:<Image src={src} alt="" width={34} height={34} unoptimized onError={()=>setFailed(true)}/>}</span>}

function Today({source,setSource,importJob,error,upcoming,openDetails,addFocus,settings}:{source:string;setSource:(v:string)=>void;importJob:(e:FormEvent)=>void;error:string;upcoming:Application[];openDetails:(id:number)=>void;addFocus:()=>void;settings:()=>void}){
  return <div className={styles.page}><header className={styles.todayHeader}><div><p>GOOD MORNING</p><h1>Ready for your<br/>next move?</h1></div><button type="button" onClick={settings} aria-label="Settings">⚙</button></header>
    <form className={styles.addCard} onSubmit={importJob}><button type="button" className={styles.addTitle} onClick={addFocus}><span>＋</span><div><strong>Add a job</strong><small>We’ll fill in the details.</small></div></button><textarea id="job-source" value={source} onChange={e=>setSource(e.target.value)} placeholder="Paste a job link or job description…"/><button className={styles.primary} disabled={!source.trim()}>Import automatically</button>{error&&<p className={styles.error}>{error}</p>}</form>
    <section className={styles.deadlines}><header><p>UP NEXT</p><h2>Deadlines</h2></header>{upcoming.length?<div className={styles.deadlineList}>{upcoming.map(app=><button key={app.id} onClick={()=>openDetails(app.id)}><OrganisationLogo app={app}/><div><strong>{app.title}</strong><small>{display(app.organisation)}</small></div><time><strong>{deadlineCountdown(app.deadline)}</strong><small>{dateLabel(app.deadline)}</small></time></button>)}</div>:<Empty title="No applications yet" copy="Paste your first job and HaoHire will take it from there." action="Add your first job" onClick={addFocus} icon="⌑"/>}</section>
  </div>
}

function Importing({step,cancel}:{step:number;cancel:()=>void}){const fields=["Job title","Company or organisation","Location","Application deadline","Employment type","Source URL"];return <div className={`${styles.page} ${styles.flowPage}`}><header className={styles.flowHeader}><button onClick={cancel}>×</button><strong>Importing job</strong><span/></header><div className={styles.steps}>{["Reading the job","Finding the details","Ready to add"].map((label,index)=><div className={step>=index+1?styles.stepOn:""} key={label}><span>{index+1}</span><small>{label}</small></div>)}</div><div className={styles.loadingFields}>{fields.map((field,index)=><div key={field}><span className={styles.fieldIcon}>{["▣","▥","⌖","▦","◉","↗","▤"][index]}</span><strong>{field}</strong><i/></div>)}</div><p className={styles.hang}>✦&nbsp; Hang tight — we’re pulling everything together.</p></div>}

function Review({job,edit,add}:{job:ExtractedJob;edit:()=>void;add:()=>void}){const rows=[{icon:"▣",label:"Job title",value:job.title,evidence:job.evidence?.title},{icon:"▥",label:"Organisation",value:job.organisation,evidence:job.evidence?.organisation},{icon:"⌖",label:"Location",value:job.location,evidence:job.evidence?.location},{icon:"▦",label:"Deadline",value:dateLabel(job.deadline),raw:job.deadline,evidence:job.evidence?.deadline},{icon:"◉",label:"Employment type",value:job.employmentType,evidence:job.evidence?.employmentType},{icon:"↗",label:"Source",value:job.source,evidence:"Found on job page"}];return <div className={`${styles.page} ${styles.flowPage}`}><header className={styles.flowHeader}><button onClick={edit}>‹</button><strong>Review details</strong><span/></header><div className={styles.reviewList}>{rows.map(row=>{const optional=row.label==="Location";const missing=!optional&&(row.raw!==undefined?!row.raw:fieldMissing(row.value));return <div key={row.label}><span className={styles.fieldIcon}>{row.icon}</span><section><strong>{row.label}</strong><p>{optional&&fieldMissing(row.value)?"Optional - add later":missing?"Not found - review":row.value}</p></section><em className={missing?styles.needs:styles.found}>{optional&&fieldMissing(row.value)?"Optional":missing?"Needs review":row.evidence||"Found on job page"}</em></div>})}</div><div className={styles.reviewActions}><button onClick={edit}>Edit</button><button onClick={add}>Add to applications</button></div></div>}

function Applications({apps,counts,filter,setFilter,showFilter,openRow,setOpenRow,openDetails,deleteApp,add}:{apps:Application[];counts:Record<Status,number>;filter:Status|"All";setFilter:(value:Status|"All")=>void;showFilter:()=>void;openRow:number|null;setOpenRow:(id:number|null)=>void;openDetails:(id:number)=>void;deleteApp:(id:number)=>void;add:()=>void}){const visible=filter==="All"?apps:apps.filter(app=>app.status===filter);return <div className={`${styles.page} ${styles.appsPage}`}><header className={styles.appsHeader}><h1>Applications</h1><button onClick={showFilter} aria-label="Filter applications">≡</button></header><div className={styles.summary}>{allStatuses.map(status=><button onClick={()=>setFilter(filter===status?"All":status)} className={`${status==="Rejected"?styles.red:""} ${filter===status?styles.summaryOn:""}`} key={status}><span>{status}</span><strong>{counts[status]}</strong></button>)}</div>{visible.length?<div className={styles.applicationList}>{visible.map(app=><SwipeRow key={app.id} app={app} open={openRow===app.id} setOpen={setOpenRow} details={openDetails} remove={deleteApp}/>)}</div>:apps.length?<Empty title={`No ${filter.toLowerCase()} applications`} copy="Choose another status to see your applications." action="Show all" onClick={()=>setFilter("All")} icon="⌕"/>:<Empty title="No applications yet" copy="Import a job to see it here and track your progress with ease." action="Add your first job" onClick={add} icon="▱"/>}</div>}

function SwipeRow({app,open,setOpen,details,remove}:{app:Application;open:boolean;setOpen:(id:number|null)=>void;details:(id:number)=>void;remove:(id:number)=>void}){const start=useRef(0),delta=useRef(0);const down=(e:PointerEvent<HTMLDivElement>)=>{start.current=e.clientX;delta.current=0;e.currentTarget.setPointerCapture(e.pointerId)};const move=(e:PointerEvent<HTMLDivElement>)=>{delta.current=e.clientX-start.current};const up=()=>{if(delta.current<-48)setOpen(app.id);else if(delta.current>25)setOpen(null);else if(Math.abs(delta.current)<8)details(app.id)};return <article className={`${styles.swipe} ${open?styles.swipeOpen:""}`}><button className={styles.delete} onClick={()=>remove(app.id)}>Delete</button><div className={styles.appRow} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")details(app.id)}} onPointerDown={down} onPointerMove={move} onPointerUp={up}><span className={styles.drag}>≡</span><section><strong>{app.title}</strong><p>{display(app.organisation)}</p><small>⌖ {display(app.location,"Location optional")}</small>{app.status==="Rejected"&&<em>This application is closed.</em>}</section><span className={`${styles.status} ${app.status==="Rejected"?styles.statusRejected:""}`}>{app.status}</span><span aria-hidden="true">›</span></div></article>}

function Details({app,back,menu,advance,reject,update}:{app:Application;back:()=>void;menu:()=>void;advance:()=>void;reject:()=>void;update:(next:Partial<Application>)=>void}){
  const index=activeStatuses.indexOf(app.status as Exclude<Status,"Rejected">);
  const promptUpdate=(label:string,current:string,apply:(value:string)=>void)=>{const value=window.prompt(label,current);if(value!==null)apply(value.trim())};
  const editDeadline=()=>{const value=window.prompt("Deadline (YYYY-MM-DD, or leave blank)",app.deadline);if(value===null)return;const next=value.trim();if(next&&!/^\d{4}-\d{2}-\d{2}$/.test(next)){window.alert("Use the date format YYYY-MM-DD.");return}update({deadline:next})};
  const toggleReminder=async()=>{const enabling=!app.reminder;if(enabling&&typeof Notification!=="undefined"&&Notification.permission==="default")await Notification.requestPermission();update({reminder:enabling})};
  const rows=[
    {icon:"T",label:"Job title",value:display(app.title,"Add job title"),edit:()=>promptUpdate("Job title",app.title,value=>update({title:value}))},
    {icon:"O",label:"Organisation",value:display(app.organisation,"Add organisation"),edit:()=>promptUpdate("Organisation",fieldMissing(app.organisation)?"":app.organisation,value=>update({organisation:value}))},
    {icon:"L",label:"Location (optional)",value:display(app.location,"Add location"),edit:()=>promptUpdate("Location (optional)",fieldMissing(app.location)?"":app.location,value=>update({location:value}))},
    {icon:"D",label:"Deadline",value:app.deadline?`${dateLabel(app.deadline)} - ${deadlineCountdown(app.deadline)}`:"Add deadline",edit:editDeadline},
    {icon:"E",label:"Employment type",value:display(app.employmentType,"Add employment type"),edit:()=>promptUpdate("Employment type",fieldMissing(app.employmentType)?"":app.employmentType,value=>update({employmentType:value}))},
    {icon:"S",label:"Source link",value:app.source||"Add source link",edit:()=>promptUpdate("Source link or source note",app.source,value=>update({source:value}))},
    {icon:"N",label:"Personal notes",value:app.notes||"Add notes",edit:()=>promptUpdate("Personal notes",app.notes,value=>update({notes:value}))},
  ];
  return <div className={`${styles.page} ${styles.detailPage}`}><header className={styles.flowHeader}><button onClick={back}>‹</button><strong>Job details</strong><button onClick={menu} aria-label="Application options">•••</button></header><div className={styles.detailTable}>{rows.map(row=><button key={row.label} className={styles.detailRowButton} onClick={row.edit} aria-label={`Edit ${row.label.toLowerCase()}`}><span aria-hidden="true">{row.icon}</span><strong>{row.label}</strong><p>{row.value}</p><i>Edit</i></button>)}<div className={styles.progressRow}><span>♧</span><strong>Current status</strong><em className={app.status==="Rejected"?styles.needs:styles.found}>{app.status}</em><div className={styles.progress}>{activeStatuses.map((status,step)=><button key={status} disabled={app.status==="Rejected"} className={app.status!=="Rejected"&&step<=index?styles.progressOn:""} onClick={()=>update({status})}><i/><small>{status}</small></button>)}</div></div><button className={styles.detailRowButton} onClick={toggleReminder} disabled={app.status==="Rejected"} aria-label="Edit reminder settings"><span aria-hidden="true">R</span><strong>Reminder settings</strong><p>{app.status==="Rejected"?"Off - application closed":app.reminder?"Active - alerts within 7 days":"Off"}</p><i>{app.reminder&&app.status!=="Rejected"?"On":"Off"}</i></button></div>{app.status==="Rejected"?<div className={styles.closed}>This application is closed.</div>:<div className={styles.detailActions}><button onClick={advance}>Update status</button><button onClick={reject}>Mark as rejected</button></div>}</div>
}

function Empty({title,copy,action,onClick,icon}:{title:string;copy:string;action:string;onClick:()=>void;icon:string}){return <div className={styles.empty}><span>{icon}</span><strong>{title}</strong><p>{copy}</p><button onClick={onClick}>{action}</button></div>}
function BottomNav({screen,today,applications,menu}:{screen:Screen;today:()=>void;applications:()=>void;menu:()=>void}){return <nav className={styles.bottom}><button className={screen==="today"?styles.navOn:""} onClick={today}><span>☼</span>Today</button><button className={screen==="applications"?styles.navOn:""} onClick={applications}><span>▱</span>Applications</button><button onClick={menu} aria-label="Open menu"><span>≡</span><i className="sr-only">Menu</i></button></nav>}
function ActionSheet({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className={styles.sheetShade} onClick={close}><section className={styles.actionSheet} role="dialog" aria-modal="true" aria-label={title} onClick={event=>event.stopPropagation()}><header><strong>{title}</strong><button onClick={close} aria-label="Close">×</button></header><div>{children}</div></section></div>}
