import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("server renders the finished HaoHire entry page", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>HaoHire<\/title>/i);
  assert.match(html, /Start tracking/);
  assert.match(html, /haohire-entry-mobile\.png/);
  assert.match(html, /No account needed/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("ships working interaction and persistence safeguards", async () => {
  const [page, css, legacy, logo] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/haohire.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/extract/legacy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/logo/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.mascot,\.mascot \*\{pointer-events:none!important/);
  assert.match(page, /hydrated\.current=true/);
  assert.match(page, /if\(!hydrated\.current\)return/);
  assert.match(page, /deadlineCountdown/);
  assert.match(page, /remaining\.map/);
  assert.match(page, /days===null\|\|days>=0/);
  assert.match(css, /\.toneSaved/);
  assert.match(css, /\.toneApplied/);
  assert.match(css, /\.toneInterview/);
  assert.match(css, /\.toneOffer/);
  assert.match(css, /\.toneRejected/);
  assert.match(page, /featureDeadline/);
  assert.match(page, /quickAdvance/);
  assert.match(page, /Save changes/);
  assert.match(page, /Close status picker/);
  assert.match(page, /allStatuses\.map/);
  assert.match(css, /\.statusChoices/);
  assert.match(css, /\.editorSheet/);
  assert.match(css, /aspect-ratio:853\/1844/);
  assert.match(css, /\.navApplications/);
  assert.match(css, /Today uses a sunrise/);
  assert.match(css, /\.bottom \.navOn \.navToday/);
  assert.doesNotMatch(page, /Required documents/);
  assert.match(page, /HaoHire deadline reminder/);
  assert.match(page, /disabled=\{app\.status==="Rejected"\}/);
  assert.match(page, /onClick=\{menu\}/);
  assert.match(legacy, /source:\s*url\.toString\(\)/);
  assert.match(legacy, /fromText\(`\$\{metaTitle\}\\n\$\{text\}`,\s*url\.toString\(\)\)/);
  assert.match(page, /GOOD AFTERNOON/);
  assert.match(page, /GOOD EVENING/);
  assert.match(page, /function CalendarPage/);
  assert.match(page, /function Insights/);
  assert.match(page, /Search jobs or universities/);
  assert.match(page, /Application timeline/);
  assert.match(page, /Paste from clipboard/);
  assert.match(page, /normaliseApplication/);
  assert.match(page, /interviewDate/);
  assert.match(page, /followUpDate/);
  assert.match(page, /offerDeadline/);
  assert.match(css, /\.focusCard/);
  assert.match(css, /\.monthGrid/);
  assert.match(page, /Schedule a plan/);
  assert.match(page, /Job dates appear here automatically/);
  assert.match(page, /Saving will replace it/);
  assert.match(page, /aria-pressed=\{filter===type\}/);
  assert.match(css, /\.agendaHero/);
  assert.match(css, /\.calendarLegend/);
  assert.match(css, /\.calendarPlanner/);
  assert.match(css, /\.navAddButton/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(page, /\/api\/logo\?v=3&organisation=/);
  assert.match(page, /<VerifiedLogoImage key=\{src\} src=\{src\}\/>/);
  assert.match(logo, /genericRecruitingHost/);
  assert.match(logo, /exact\.length===1/);
  assert.match(logo, /Cache-Control\":\"no-store/);
  assert.match(logo, /iiurlwidth:\"256\"/);
  assert.match(logo, /upload\.wikimedia\.org/);
  assert.match(logo, /&sz=256/);
});

test("resolves organisation logos conservatively", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  try {
    let brookesCalls = 0;
    globalThis.fetch = async () => {
      brookesCalls += 1;
      if (brookesCalls === 1) return Response.json({ entities: { Q132478: { claims: { P154: [
        { rank: "deprecated", mainsnak: { snaktype: "value", datavalue: { value: "Old low resolution logo.jpg" } } },
        { rank: "preferred", mainsnak: { snaktype: "value", datavalue: { value: "Oxford Brookes University logo.svg" } } },
      ] } } } });
      return Response.json({ query: { pages: { "1": { imageinfo: [{ thumburl: "https://upload.wikimedia.org/oxford-brookes/256px-logo.png", mime: "image/png", width: 574 }] } } } });
    };
    const brookes = await worker.fetch(new Request("http://localhost/api/logo?v=3&organisation=Oxford%20Brookes%20University&sourceHost=jobs.ac.uk"), env, ctx);
    assert.equal(brookes.status, 307);
    assert.equal(brookes.headers.get("location"), "https://upload.wikimedia.org/oxford-brookes/256px-logo.png");
    assert.equal(brookesCalls, 2);

    let knownCalls = 0;
    globalThis.fetch = async () => {
      knownCalls += 1;
      if (knownCalls === 1) return Response.json({ search: [{ id: "Q-uwe", label: "University of the West of England", description: "public university" }] });
      if (knownCalls === 2) return Response.json({ entities: { "Q-uwe": { claims: { P154: [{ rank: "preferred", mainsnak: { snaktype: "value", datavalue: { value: "University of the West of England logo.svg" } } }] } } } });
      return Response.json({ query: { pages: { "2": { imageinfo: [{ thumburl: "https://upload.wikimedia.org/uwe/256px-logo.png", mime: "image/png", width: 512 }] } } } });
    };
    const known = await worker.fetch(new Request("http://localhost/api/logo?v=3&organisation=UWE%2C%20Bristol&sourceHost=jobs.ac.uk"), env, ctx);
    assert.equal(known.status, 307);
    assert.equal(known.headers.get("location"), "https://upload.wikimedia.org/uwe/256px-logo.png");
    assert.equal(knownCalls, 3);

    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) return Response.json({ search: [
        { id: "Q-wrong", label: "Northbridge University Press", description: "publisher" },
        { id: "Q-right", label: "Northbridge Research University", description: "public research university" },
      ] });
      return Response.json({ entities: { "Q-right": { claims: { P856: [{ rank: "preferred", mainsnak: { snaktype: "value", datavalue: { value: "https://northbridge.edu" } } }] } } } });
    };
    const exact = await worker.fetch(new Request("http://localhost/api/logo?v=3&organisation=Northbridge%20Research%20University&sourceHost=jobs.ac.uk"), env, ctx);
    assert.equal(exact.status, 307);
    assert.match(exact.headers.get("location") ?? "", /northbridge\.edu/i);
    assert.equal(calls, 2);

    globalThis.fetch = async () => Response.json({ search: [{ id: "Q-wrong", label: "Unknown Institute Press", description: "publisher" }] });
    const ambiguous = await worker.fetch(new Request("http://localhost/api/logo?v=3&organisation=Unknown%20Institute&sourceHost=jobs.ac.uk"), env, ctx);
    assert.equal(ambiguous.status, 404);
    assert.equal(ambiguous.headers.get("cache-control"), "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("extracts a pasted job description without external network access", async () => {
  const worker = await loadWorker();
  const source = [
    "Job title: Research Assistant",
    "Organisation: Hao Lab",
    "Location: London",
    "Application deadline: 31 December 2026",
    "Employment type: Full-time",
  ].join("\n");
  const response = await worker.fetch(new Request("http://localhost/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source }),
  }), env, ctx);
  assert.equal(response.status, 200);
  const job = await response.json();
  assert.equal(job.title, "Research Assistant");
  assert.equal(job.organisation, "Hao Lab");
  assert.equal(job.location, "London");
  assert.equal(job.deadline, "2026-12-31");
  assert.equal(job.employmentType, "Full-time");
  assert.equal("requiredDocuments" in job, false);
});

test("validates and infers UK university cities", async () => {
  const worker = await loadWorker();
  const extract = async (source) => {
    const response = await worker.fetch(new Request("http://localhost/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source }),
    }), env, ctx);
    assert.equal(response.status, 200);
    return response.json();
  };

  const birmingham = await extract("Job title: Fellow\nOrganisation: University of Birmingham");
  assert.equal(birmingham.location, "Birmingham");
  assert.equal(birmingham.evidence.location, "Inferred from organisation");

  const warwick = await extract("Job title: Fellow\nOrganisation: University of Warwick");
  assert.equal(warwick.location, "Coventry");

  const explicit = await extract("Job title: Fellow\nOrganisation: University of Warwick\nLocation: London");
  assert.equal(explicit.location, "London");
  assert.equal(explicit.evidence.location, "Job description");

  const postcode = await extract("Job title: Fellow\nOrganisation: University of Birmingham\nLocation: Edgbaston campus, B15 2TT");
  assert.equal(postcode.location, "Birmingham");
  assert.equal(postcode.evidence.location, "Derived from postcode");

  const rejectedNoise = await extract("Job title: Fellow\nOrganisation: Unknown Institute\nLocation: Department of Chemistry Salary Grade 7");
  assert.equal(rejectedNoise.location, "Location not found");
  assert.equal(rejectedNoise.evidence.location, "Needs review");
});
