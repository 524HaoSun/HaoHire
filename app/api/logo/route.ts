import { NextRequest, NextResponse } from "next/server";

type SearchResult = { id?: string; label?: string; description?: string };
type ClaimValue = { rank?: string; mainsnak?: { snaktype?: string; datavalue?: { value?: unknown } } };
type Entity = { claims?: Record<string, ClaimValue[]> };
type KnownInstitution = { canonical:string; domain:string; aliases:string[]; qid?:string; assetUrl?:string };

const successCache = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const wikidataHeaders = { "User-Agent": "HaoHire/2.0 (job application tracker; deterministic organisation logo resolver)" };
const knownInstitutions:KnownInstitution[] = [
  {canonical:"University of Oxford",domain:"ox.ac.uk",aliases:["Oxford University"]},
  {canonical:"University of Cambridge",domain:"cam.ac.uk",aliases:["Cambridge University"]},
  {canonical:"King's College London",domain:"kcl.ac.uk",aliases:["Kings College London","KCL"]},
  {canonical:"University College London",domain:"ucl.ac.uk",aliases:["UCL"],assetUrl:"https://www.ucl.ac.uk/brand-and-experience/sites/brand_and_experience/files/styles/all_size_mobile_16_9/public/2026-01/brand-VI-logo-horizontal-fullcolour.png.jpg?itok=fYM0Bm3E"},
  {canonical:"Imperial College London",domain:"imperial.ac.uk",aliases:["Imperial College","Imperial"]},
  {canonical:"London School of Economics and Political Science",domain:"lse.ac.uk",aliases:["London School of Economics","LSE"]},
  {canonical:"Queen Mary University of London",domain:"qmul.ac.uk",aliases:["Queen Mary London","QMUL"]},
  {canonical:"SOAS University of London",domain:"soas.ac.uk",aliases:["SOAS"]},
  {canonical:"University of Birmingham",domain:"bham.ac.uk",aliases:["Birmingham University"]},
  {canonical:"Birmingham City University",domain:"bcu.ac.uk",aliases:["BCU"]},
  {canonical:"University of Warwick",domain:"warwick.ac.uk",aliases:["Warwick University"]},
  {canonical:"Oxford Brookes University",domain:"brookes.ac.uk",aliases:["Oxford Brookes","Brookes University"],qid:"Q132478"},
  {canonical:"University of Plymouth",domain:"plymouth.ac.uk",aliases:["Plymouth University"]},
  {canonical:"University of the West of England",domain:"uwe.ac.uk",aliases:["UWE Bristol","UWE, Bristol","University of West of England"]},
  {canonical:"University of Greenwich",domain:"greenwich.ac.uk",aliases:["Greenwich University"]},
  {canonical:"University of Bristol",domain:"bristol.ac.uk",aliases:["Bristol University"]},
  {canonical:"University of Bath",domain:"bath.ac.uk",aliases:["Bath University"]},
  {canonical:"University of Manchester",domain:"manchester.ac.uk",aliases:["Manchester University"]},
  {canonical:"University of Leeds",domain:"leeds.ac.uk",aliases:["Leeds University"]},
  {canonical:"University of Sheffield",domain:"sheffield.ac.uk",aliases:["Sheffield University"]},
  {canonical:"University of Liverpool",domain:"liverpool.ac.uk",aliases:["Liverpool University"]},
  {canonical:"University of Nottingham",domain:"nottingham.ac.uk",aliases:["Nottingham University"]},
  {canonical:"University of Southampton",domain:"southampton.ac.uk",aliases:["Southampton University"]},
  {canonical:"University of Exeter",domain:"exeter.ac.uk",aliases:["Exeter University"]},
  {canonical:"University of York",domain:"york.ac.uk",aliases:["York University UK"]},
  {canonical:"Newcastle University",domain:"ncl.ac.uk",aliases:["University of Newcastle UK"]},
  {canonical:"Durham University",domain:"durham.ac.uk",aliases:["University of Durham"]},
  {canonical:"Loughborough University",domain:"lboro.ac.uk",aliases:["University of Loughborough"]},
  {canonical:"Lancaster University",domain:"lancaster.ac.uk",aliases:["University of Lancaster"]},
  {canonical:"University of Edinburgh",domain:"ed.ac.uk",aliases:["Edinburgh University"]},
  {canonical:"University of Glasgow",domain:"gla.ac.uk",aliases:["Glasgow University"]},
  {canonical:"University of St Andrews",domain:"st-andrews.ac.uk",aliases:["St Andrews University"]},
  {canonical:"University of Strathclyde",domain:"strath.ac.uk",aliases:["Strathclyde University"]},
  {canonical:"Heriot-Watt University",domain:"hw.ac.uk",aliases:["Heriot Watt University"]},
  {canonical:"University of Aberdeen",domain:"abdn.ac.uk",aliases:["Aberdeen University"]},
  {canonical:"Cardiff University",domain:"cardiff.ac.uk",aliases:["University of Cardiff"]},
  {canonical:"University of Sussex",domain:"sussex.ac.uk",aliases:["Sussex University"]},
  {canonical:"University of Surrey",domain:"surrey.ac.uk",aliases:["Surrey University"]},
  {canonical:"University of Reading",domain:"reading.ac.uk",aliases:["Reading University"]},
  {canonical:"Coventry University",domain:"coventry.ac.uk",aliases:["University of Coventry"]},
  {canonical:"University of Portsmouth",domain:"port.ac.uk",aliases:["Portsmouth University"]},
  {canonical:"University of Westminster",domain:"westminster.ac.uk",aliases:["Westminster University"]},
  {canonical:"Northumbria University",domain:"northumbria.ac.uk",aliases:["University of Northumbria"]},
  {canonical:"The Open University",domain:"open.ac.uk",aliases:["Open University"]},
];

const normalise = (value:string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const knownByName = new Map(knownInstitutions.flatMap(item=>[item.canonical,...item.aliases].map(name=>[normalise(name),item] as const)));
const genericRecruitingHost = (host:string) => /(^|\.)(jobs\.ac\.uk|linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|academicpositions\.(com|co\.uk)|timeshighereducation\.com|myworkdayjobs\.com|workdayjobs\.com|taleo\.net|oraclecloud\.com|successfactors\.(com|eu)|jobvite\.com|greenhouse\.io|lever\.co)$/i.test(host);
const unsafeHost = (host:string) => !host||host==="localhost"||host.endsWith(".localhost")||/^\d+(\.\d+){3}$/.test(host)||host.includes(":");
const organisationMatchesHost = (organisation:string,host:string) => {const ignored=new Set(["the","of","and","university","college","school","institute","trust","limited","ltd"]);const words=normalise(organisation).split(" ").filter(word=>word.length>=4&&!ignored.has(word));const acronym=normalise(organisation).split(" ").filter(word=>!ignored.has(word)).map(word=>word[0]).join("");return words.some(word=>host.includes(word))||(acronym.length>=2&&host.split(".").some(part=>part===acronym));};
const claimString = (claims:Record<string,ClaimValue[]>|undefined,property:string) => {const values=(claims?.[property]??[]).filter(claim=>claim.rank!=="deprecated");const ordered=[...values].sort((a,b)=>(a.rank==="preferred"?-1:0)-(b.rank==="preferred"?-1:0));for(const claim of ordered){if(claim.mainsnak?.snaktype&&claim.mainsnak.snaktype!=="value")continue;const value=claim.mainsnak?.datavalue?.value;if(typeof value==="string"&&value)return value}return""};
async function commonsThumbnail(filename:string){
  if(!filename||/[\r\n]/.test(filename))return"";
  const url=new URL("https://commons.wikimedia.org/w/api.php");
  url.search=new URLSearchParams({action:"query",format:"json",prop:"imageinfo",titles:`File:${filename}`,iiprop:"url|size|mime",iiurlwidth:"256"}).toString();
  try{const response=await fetch(url,{headers:wikidataHeaders,next:{revalidate:604800}});if(!response.ok)return"";const data=await response.json() as {query?:{pages?:Record<string,{imageinfo?:Array<{thumburl?:string;url?:string;width?:number;mime?:string}>}>}};const info=Object.values(data.query?.pages??{})[0]?.imageinfo?.[0];if(!info?.mime?.startsWith("image/"))return"";const candidate=info.thumburl||(info.mime==="image/svg+xml"||(info.width??0)>=128?info.url:"");if(!candidate)return"";const parsed=new URL(candidate);return parsed.protocol==="https:"&&parsed.hostname==="upload.wikimedia.org"?parsed.toString():""}catch{return""}
}

function redirectTo(url:string){const response=NextResponse.redirect(url,307);response.headers.set("Cache-Control",successCache);return response}
function faviconFor(hostname:string){return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${hostname}`)}&sz=256`}
function notFound(){return new NextResponse(null,{status:404,headers:{"Cache-Control":"no-store"}})}

export async function GET(request:NextRequest){
  const organisation=(request.nextUrl.searchParams.get("organisation")??"").trim().slice(0,160);
  const sourceHostParam=(request.nextUrl.searchParams.get("sourceHost")??"").trim().toLowerCase();
  let sourceHost=sourceHostParam;
  if(!sourceHost){try{sourceHost=new URL(request.nextUrl.searchParams.get("source")??"").hostname.toLowerCase()}catch{}}
  if(unsafeHost(sourceHost)||genericRecruitingHost(sourceHost))sourceHost="";
  if(!organisation)return notFound();

  const known=knownByName.get(normalise(organisation));
  if(known?.assetUrl)return redirectTo(known.assetUrl);
  const trustedSourceHost=sourceHost&&organisationMatchesHost(organisation,sourceHost)?sourceHost:"";
  const queryName=known?.canonical??organisation;

  try{
    let candidateId=known?.qid??"";
    if(!candidateId){
      const searchUrl=new URL("https://www.wikidata.org/w/api.php");
      searchUrl.search=new URLSearchParams({action:"wbsearchentities",search:queryName,language:"en",uselang:"en",format:"json",limit:"8"}).toString();
      const searchResponse=await fetch(searchUrl,{headers:wikidataHeaders,next:{revalidate:604800}});
      if(!searchResponse.ok)throw new Error("Wikidata search failed");
      const searchData=await searchResponse.json() as {search?:SearchResult[]};
      const exact=(searchData.search??[]).filter(item=>item.id&&normalise(item.label??"")===normalise(queryName));
      const academic=exact.filter(item=>/university|college|higher education|research institute|academic/i.test(item.description??""));
      const candidate=academic.length===1?academic[0]:exact.length===1?exact[0]:null;
      candidateId=candidate?.id??"";
    }
    if(candidateId){
      const entityUrl=new URL("https://www.wikidata.org/w/api.php");
      entityUrl.search=new URLSearchParams({action:"wbgetentities",ids:candidateId,props:"claims",format:"json"}).toString();
      const entityResponse=await fetch(entityUrl,{headers:wikidataHeaders,next:{revalidate:604800}});
      if(!entityResponse.ok)throw new Error("Wikidata entity lookup failed");
      const entityData=await entityResponse.json() as {entities?:Record<string,Entity>};
      const claims=entityData.entities?.[candidateId]?.claims;
      const logo=claimString(claims,"P154");
      if(logo){const thumbnail=await commonsThumbnail(logo);if(thumbnail)return redirectTo(thumbnail)}
      const website=claimString(claims,"P856");
      if(website){try{const host=new URL(website).hostname.toLowerCase();if(!unsafeHost(host)&&!genericRecruitingHost(host))return redirectTo(faviconFor(host))}catch{}}
    }
  }catch{}
  if(known)return redirectTo(faviconFor(known.domain));
  if(trustedSourceHost)return redirectTo(faviconFor(trustedSourceHost));
  return notFound();
}