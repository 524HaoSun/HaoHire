import { NextRequest, NextResponse } from "next/server";
import { resolveLocation } from "./location";

type JobResult = { title: string; organisation: string; location: string; deadline: string; employmentType: string; source: string; evidence: Record<string, string> };
type JsonRecord = Record<string, unknown>;

const textValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    return textValue(record.name ?? record.addressLocality ?? record.addressCountry ?? "");
  }
  return "";
};
const normalizeDate = (value: string) => {
  if (!value) return "";
  const exact = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (exact) return exact[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const stripHtml = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();
const pick = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().split(/\s*(?:\||•|·)\s*/)[0].trim();
  }
  return "";
};

const structuredLocation = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(structuredLocation).find(Boolean) ?? "";
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as JsonRecord;
  const address = record.address;
  if (typeof address === "string") return address;
  if (address && typeof address === "object") {
    const detail = address as JsonRecord;
    const locality = textValue(detail.addressLocality);
    const postcode = textValue(detail.postalCode);
    if (locality || postcode) return [locality, postcode].filter(Boolean).join(", ");
  }
  const locality = textValue(record.addressLocality);
  const postcode = textValue(record.postalCode);
  return [locality, postcode].filter(Boolean).join(", ") || textValue(record.name);
};

function fromText(text: string, source: string): JobResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = pick(text, [/job\s*title\s*[:\-]\s*([^\n]+)/i, /position\s*[:\-]\s*([^\n]+)/i]) || lines[0]?.slice(0, 100) || "Job opportunity";
  const organisation = pick(text, [/(?:company|organisation|organization|employer|institution)\s*[:\-]\s*([^\n]+)/i])
    || text.match(/\bUniversity of [A-Z][A-Za-z &'’.-]{2,70}/)?.[0]?.trim()
    || "Organisation not found";
  const rawLocation = pick(text, [/(?:work\s*location|job\s*location|location|campus|based\s+(?:at|in))\s*[:\-]\s*([^\n]+)/i]);
  const resolved = resolveLocation([{ value: rawLocation, evidence: "Job description" }], organisation);
  const deadline = normalizeDate(pick(text, [/(?:closing date|deadline|apply by)\s*[:\-]\s*([^\n.]+)/i]));
  const employmentType = pick(text, [/employment type\s*[:\-]\s*([^\n]+)/i, /\b(full[- ]time|part[- ]time|fixed[- ]term|internship)\b/i]) || "Not specified";
  return {
    title,
    organisation,
    location: resolved.location,
    deadline,
    employmentType,
    source,
    evidence: {
      organisation: organisation === "Organisation not found" ? "Needs review" : "Job description",
      location: resolved.evidence,
      deadline: deadline ? "Job description" : "Needs review",
      employmentType: employmentType === "Not specified" ? "Needs review" : "Job description",
    },
  };
}

function privateHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { source?: string };
    const source = body.source?.trim();
    if (!source || source.length > 120_000) return NextResponse.json({ error: "Paste a job URL or job description." }, { status: 400 });
    if (!/^https?:\/\//i.test(source)) return NextResponse.json(fromText(source, "Pasted job description"));
    const url = new URL(source);
    if (url.protocol !== "https:" || privateHost(url.hostname)) return NextResponse.json({ error: "Only public HTTPS job pages can be imported." }, { status: 400 });
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "HaoHire Job Importer/1.0" } });
    if (!response.ok) throw new Error("This page could not be opened. Paste the job description instead.");
    if (Number(response.headers.get("content-length") ?? 0) > 2_000_000) throw new Error("This page is too large. Paste the job description instead.");
    const html = (await response.text()).slice(0, 2_000_000);
    const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block[1]);
        const candidates = Array.isArray(parsed) ? parsed : parsed["@graph"] ?? [parsed];
        const posting = candidates.find((item: JsonRecord) => item?.["@type"] === "JobPosting");
        if (posting) {
          const organisation = textValue(posting.hiringOrganization) || url.hostname.replace(/^www\./, "");
          const resolved = resolveLocation([
            { value: structuredLocation(posting.jobLocation), evidence: "Page metadata" },
            { value: structuredLocation(posting.applicantLocationRequirements), evidence: "Page metadata" },
          ], organisation);
          return NextResponse.json({
            title: textValue(posting.title) || "Job opportunity",
            organisation,
            location: resolved.location,
            deadline: normalizeDate(textValue(posting.validThrough)),
            employmentType: textValue(posting.employmentType) || "Not specified",
            source: url.toString(),
            evidence: { organisation: "Page metadata", location: resolved.evidence, deadline: "Page metadata", employmentType: "Page metadata" },
          } satisfies JobResult);
        }
      } catch {}
    }
    const text = stripHtml(html);
    const metaTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
      || html.match(/<title[^>]*>([^<]+)/i)?.[1] || "";
    const result = fromText(`${metaTitle}\n${text}`, url.toString());
    if (result.organisation === "Organisation not found") result.organisation = url.hostname.replace(/^www\./, "").split(".")[0].replace(/\b\w/g, (letter) => letter.toUpperCase());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "This job could not be imported." }, { status: 422 });
  }
}
