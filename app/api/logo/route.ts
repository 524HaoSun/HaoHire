import { NextRequest, NextResponse } from "next/server";

type SearchResult = { id?: string; label?: string };
type ClaimValue = { mainsnak?: { datavalue?: { value?: unknown } } };
type Entity = { claims?: Record<string, ClaimValue[]> };

const cacheControl = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const wikidataHeaders = { "User-Agent": "HaoHire/1.0 (job application tracker)" };

function redirectTo(url: string) {
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", cacheControl);
  return response;
}

function faviconFor(hostname: string) {
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${hostname}`)}&sz=128`;
}

export async function GET(request: NextRequest) {
  const organisation = (request.nextUrl.searchParams.get("organisation") ?? "").trim().slice(0, 160);
  const source = (request.nextUrl.searchParams.get("source") ?? "").trim();
  let sourceHost = "";
  try {
    const sourceUrl = new URL(source);
    if (sourceUrl.protocol === "https:" || sourceUrl.protocol === "http:") sourceHost = sourceUrl.hostname;
  } catch {}

  if (organisation) {
    try {
      const searchUrl = new URL("https://www.wikidata.org/w/api.php");
      searchUrl.search = new URLSearchParams({
        action: "wbsearchentities",
        search: organisation,
        language: "en",
        uselang: "en",
        format: "json",
        limit: "4",
      }).toString();
      const searchResponse = await fetch(searchUrl, { headers: wikidataHeaders, next: { revalidate: 604800 } });
      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { search?: SearchResult[] };
        const results = searchData.search ?? [];
        const exact = results.find(item => item.label?.localeCompare(organisation, undefined, { sensitivity: "accent" }) === 0);
        const ordered = exact ? [exact, ...results.filter(item => item.id !== exact.id)] : results;
        const ids = ordered.map(item => item.id).filter((id): id is string => Boolean(id));
        if (ids.length) {
          const entityUrl = new URL("https://www.wikidata.org/w/api.php");
          entityUrl.search = new URLSearchParams({ action: "wbgetentities", ids: ids.join("|"), props: "claims", format: "json" }).toString();
          const entityResponse = await fetch(entityUrl, { headers: wikidataHeaders, next: { revalidate: 604800 } });
          if (entityResponse.ok) {
            const entityData = await entityResponse.json() as { entities?: Record<string, Entity> };
            for (const id of ids) {
              const claims = entityData.entities?.[id]?.claims;
              const logo = claims?.P154?.[0]?.mainsnak?.datavalue?.value;
              if (typeof logo === "string" && logo) {
                return redirectTo(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logo)}?width=128`);
              }
              const website = claims?.P856?.[0]?.mainsnak?.datavalue?.value;
              if (typeof website === "string") {
                try { return redirectTo(faviconFor(new URL(website).hostname)); } catch {}
              }
            }
          }
        }
      }
    } catch {}
  }

  if (sourceHost) return redirectTo(faviconFor(sourceHost));
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": cacheControl } });
}