# HaoHire

Import a job. Track the progress. Never miss a deadline.

HaoHire is a focused job-application tracker. Paste a job URL or the full job description and the app extracts the role, organisation, location, deadline, and source. Each application is shown as one clear table row with a five-stage progress tracker and deadline reminders.

## Features

- Smart import from HTTPS job links or pasted job descriptions
- JSON-LD `JobPosting` extraction with a text-parser fallback
- Applications table with one job per row
- Five stages: Saved, Applied, Interview, Offer, Decision
- Upcoming-deadline and overdue reminders
- Job details, checklist, notes, and next-action tracking
- Local browser persistence with no account required

## Run locally

Requirements: Node.js 22.13 or later and pnpm.

```bash
pnpm install
pnpm exec vinext dev
```

Build for production:

```bash
pnpm exec vinext build
```

## Extraction approach

The current version does not require a paid AI API. It parses structured job-page metadata and uses deterministic heuristics for pasted descriptions. An AI extraction fallback can be added later for less structured job descriptions, but it is intentionally not required for the core workflow.

## Privacy

Applications and settings are stored in the browser's local storage. URL extraction is performed server-side only when the user submits a link.
