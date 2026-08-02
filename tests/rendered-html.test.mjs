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
  assert.match(html, /haohire-entry-v2\.webp/);
  assert.match(html, /No account needed/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("ships working interaction and persistence safeguards", async () => {
  const [page, css, legacy] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/haohire.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/extract/legacy.ts", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.mascot,\.mascot \*\{pointer-events:none!important/);
  assert.match(page, /hydrated\.current=true/);
  assert.match(page, /if\(!hydrated\.current\)return/);
  assert.match(page, /deadlineCountdown/);
  assert.match(page, /upcoming\.map/);
  assert.match(page, /days===null\|\|days>=0/);
  assert.match(css, /\.toneSaved/);
  assert.match(css, /\.toneApplied/);
  assert.match(css, /\.toneInterview/);
  assert.match(css, /\.toneOffer/);
  assert.match(css, /\.toneRejected/);
  assert.doesNotMatch(page, /Required documents/);
  assert.match(page, /HaoHire deadline reminder/);
  assert.match(page, /disabled=\{app\.status==="Rejected"\}/);
  assert.match(page, /onClick=\{menu\}/);
  assert.match(legacy, /source:url\.toString\(\)/);
  assert.match(legacy, /fromText\(`\$\{metaTitle\}\\n\$\{text\}`,url\.toString\(\)\)/);
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
