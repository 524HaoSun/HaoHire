import { NextRequest, NextResponse } from "next/server";
import { POST as directPost } from "./legacy";

type JobResult = {
  title: string;
  organisation: string;
  location: string;
  deadline: string;
  employmentType: string;
  requiredDocuments: string[];
  source: string;
  evidence: Record<string, string>;
};

const clean = (value: string) => value.replace(/[*_`#]+/g, " ").replace(/[ \t]+/g, " ").trim();

const normalizeDate = (value: string) => {
  const iso = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const uk = value.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  const named = value.match(/\b(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,\s]+(?:\d{1,2}(?:st|nd|rd|th)?[,]?\s+)?20\d{2}\b/i);
  if (!named) return "";
  const parsed = new Date(named[0].replace(/(\d)(st|nd|rd|th)/i, "$1"));
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const labelValue = (text: string, labels: string[]) => {
  const names = labels.map((label) => label.replace(/\s+/g, "\\s*")).join("|");
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:#{1,5}\\s*)?(?:${names})\\s*[:\\-]?\\s*([^\\n]{2,180})`, "i"));
  return clean(match?.[1] ?? "").replace(/\s+[|•·]\s+.*$/, "");
};

const score = (job: Partial<JobResult>, hostname: string) => {
  const hostLabel = hostname.replace(/^www\./, "").split(".")[0].replace(/\b\w/g, (letter) => letter.toUpperCase());
  return [
    job.organisation && job.organisation !== "Organisation not found" && job.organisation !== hostLabel,
    job.location && job.location !== "Location not found",
    Boolean(job.deadline),
    job.employmentType && job.employmentType !== "Not specified",
    Boolean(job.requiredDocuments?.length),
  ].filter(Boolean).length;
};

const sanitisePublicUrl = (input: string) => {
  const url = new URL(input);
  const tracking = /^(utm_.+|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|ref_|referrer)$/i;
  for (const key of [...url.searchParams.keys()]) if (tracking.test(key)) url.searchParams.delete(key);
  url.hash = "";
  return url;
};

const parseRenderedPage = (text: string, original: Partial<JobResult>, hostname: string, sourceUrl: string): JobResult => {
  const title = labelValue(text, ["Job title", "Position title", "Role title", "Title"])
    || clean(original.title ?? "").replace(/^Title\s*:\s*/i, "")
    || "Job opportunity";
  const namedOrganisation = text.match(/\b(University of [A-Z][A-Za-z&'’ .-]{2,80}|[A-Z][A-Za-z&'’ .-]{2,80} University|[A-Z][A-Za-z&'’ .-]{2,80} College|[A-Z][A-Za-z&'’ .-]{2,80} Institute)\b/)?.[1] ?? "";
  const directOrganisation = original.organisation && !/not found/i.test(original.organisation) ? original.organisation : "";
  const hostLabel = hostname.split(".")[0].replace(/\b\w/g, (letter) => letter.toUpperCase());
  const organisation = labelValue(text, ["Organisation", "Organization", "Employer", "Company", "Hiring organisation", "Hiring organization", "Institution"])
    || clean(namedOrganisation)
    || (directOrganisation === hostLabel ? "" : directOrganisation)
    || "Organisation not found";
  const location = labelValue(text, ["Location", "Work location", "Job location", "Campus", "Based at"])
    || (original.location && original.location !== "Location not found" ? original.location : "")
    || "Location not found";
  const deadlineContext = labelValue(text, ["Application deadline", "Closing date", "Apply by", "Applications close", "Application closing date"])
    || text.match(/(?:closing date|application deadline|apply by|applications close)[^\n]{0,100}/i)?.[0]
    || "";
  const deadline = normalizeDate(deadlineContext) || original.deadline || "";
  const employmentType = labelValue(text, ["Employment type", "Contract type", "Job type", "Working pattern", "Hours"])
    || clean(text.match(/\b(full[- ]time|part[- ]time|fixed[- ]term|permanent|temporary|internship|contract)\b/i)?.[1] ?? "")
    || (original.employmentType && original.employmentType !== "Not specified" ? original.employmentType : "")
    || "Not specified";
  const requiredDocuments = [
    /\b(?:CV|curriculum vitae)\b/i.test(text) ? "CV" : "",
    /\bcover(?:ing)? letter\b/i.test(text) ? "Cover letter" : "",
    /\b(?:references|referees)\b/i.test(text) ? "References" : "",
    /\bportfolio\b/i.test(text) ? "Portfolio" : "",
  ].filter(Boolean);
  return {
    title,
    organisation,
    location,
    deadline,
    employmentType,
    requiredDocuments,
    source: sourceUrl,
    evidence: {
      organisation: organisation === "Organisation not found" ? "Needs review" : "Rendered job page",
      location: location === "Location not found" ? "Needs review" : "Rendered job page",
      deadline: deadline ? "Rendered job page" : "Needs review",
      employmentType: employmentType === "Not specified" ? "Needs review" : "Rendered job page",
      requiredDocuments: requiredDocuments.length ? "Job description" : "Needs review",
    },
  };
};

export async function POST(request: NextRequest) {
  const body = await request.clone().json() as { source?: string };
  const source = body.source?.trim() ?? "";
  if (!/^https?:\/\//i.test(source)) return directPost(request);

  const publicUrl = sanitisePublicUrl(source);
  const hostname = publicUrl.hostname.replace(/^www\./, "");
  let directResponse: Response | null = null;
  let direct: Partial<JobResult> = {};
  try {
    directResponse = await directPost(request.clone() as NextRequest);
    direct = await directResponse.clone().json() as Partial<JobResult>;
    if (directResponse.ok && score(direct, hostname) >= 3) return directResponse;
  } catch {}

  try {
    const readerResponse = await fetch(`https://r.jina.ai/${publicUrl.toString()}`, {
      signal: AbortSignal.timeout(18_000),
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Remove-Selector": "nav, footer, script, style" },
    });
    if (!readerResponse.ok) throw new Error("The rendered page could not be read.");
    const text = (await readerResponse.text()).slice(0, 250_000);
    const rendered = parseRenderedPage(text, direct, hostname, publicUrl.toString());
    return NextResponse.json(score(rendered, hostname) >= score(direct, hostname) ? rendered : direct);
  } catch {
    if (directResponse?.ok) return directResponse;
    return NextResponse.json({ error: "This page blocked automatic reading. Paste the job description instead." }, { status: 422 });
  }
}
