export type LocationCandidate = { value?: string; evidence: string };

const universityCities: Array<[RegExp, string]> = [
  [/\b(?:university of warwick|warwick university)\b/i, "Coventry"],
  [/\buniversity of birmingham\b/i, "Birmingham"],
  [/\buniversity of oxford\b/i, "Oxford"],
  [/\buniversity of cambridge\b/i, "Cambridge"],
  [/\bimperial college london\b/i, "London"],
  [/\b(?:university college london|ucl)\b/i, "London"],
  [/\blondon school of economics\b/i, "London"],
  [/\bking'?s college london\b/i, "London"],
  [/\bqueen mary university of london\b/i, "London"],
  [/\buniversity of bath\b/i, "Bath"],
  [/\buniversity of bristol\b/i, "Bristol"],
  [/\buniversity of sussex\b/i, "Brighton"],
  [/\buniversity of surrey\b/i, "Guildford"],
  [/\buniversity of kent\b/i, "Canterbury"],
  [/\buniversity of east anglia\b/i, "Norwich"],
  [/\buniversity of manchester\b/i, "Manchester"],
  [/\buniversity of leeds\b/i, "Leeds"],
  [/\buniversity of sheffield\b/i, "Sheffield"],
  [/\buniversity of nottingham\b/i, "Nottingham"],
  [/\buniversity of liverpool\b/i, "Liverpool"],
  [/\buniversity of york\b/i, "York"],
  [/\bdurham university\b/i, "Durham"],
  [/\buniversity of exeter\b/i, "Exeter"],
  [/\buniversity of southampton\b/i, "Southampton"],
  [/\blancaster university\b/i, "Lancaster"],
  [/\bloughborough university\b/i, "Loughborough"],
  [/\bcranfield university\b/i, "Cranfield"],
  [/\buniversity of reading\b/i, "Reading"],
  [/\buniversity of leicester\b/i, "Leicester"],
  [/\buniversity of edinburgh\b/i, "Edinburgh"],
  [/\buniversity of glasgow\b/i, "Glasgow"],
  [/\buniversity of st andrews\b/i, "St Andrews"],
  [/\bcardiff university\b/i, "Cardiff"],
  [/\bswansea university\b/i, "Swansea"],
  [/\bqueen'?s university belfast\b/i, "Belfast"],
];

const cityNames = [
  "Aberdeen", "Bath", "Belfast", "Birmingham", "Bradford", "Brighton", "Bristol", "Cambridge",
  "Canterbury", "Cardiff", "Colchester", "Coventry", "Cranfield", "Dundee", "Durham", "Edinburgh",
  "Exeter", "Glasgow", "Gloucester", "Guildford", "Hull", "Lancaster", "Leeds", "Leicester", "Lincoln",
  "Liverpool", "London", "Loughborough", "Manchester", "Milton Keynes", "Newcastle upon Tyne", "Norwich",
  "Nottingham", "Oxford", "Plymouth", "Portsmouth", "Reading", "Sheffield", "Southampton", "St Andrews",
  "Stirling", "Stoke-on-Trent", "Swansea", "Winchester", "Wolverhampton", "York",
];
const cityAliases: Array<[RegExp, string]> = cityNames
  .sort((a, b) => b.length - a.length)
  .map((city) => [new RegExp(`\\b${city.replace(/[ -]/g, "[ -]")}\\b`, "i"), city]);
cityAliases.unshift([/\bnewcastle\b/i, "Newcastle upon Tyne"], [/\bbrighton and hove\b/i, "Brighton"]);

const postcodeCities: Record<string, string> = {
  AB: "Aberdeen", B: "Birmingham", BA: "Bath", BD: "Bradford", BN: "Brighton", BS: "Bristol", BT: "Belfast",
  CB: "Cambridge", CF: "Cardiff", CO: "Colchester", CT: "Canterbury", CV: "Coventry", DD: "Dundee",
  DH: "Durham", E: "London", EC: "London", EH: "Edinburgh", EX: "Exeter", G: "Glasgow", GL: "Gloucester",
  GU: "Guildford", HU: "Hull", L: "Liverpool", LA: "Lancaster", LE: "Leicester", LN: "Lincoln", LS: "Leeds",
  M: "Manchester", MK: "Milton Keynes", N: "London", NE: "Newcastle upon Tyne", NG: "Nottingham", NR: "Norwich",
  NW: "London", OX: "Oxford", PL: "Plymouth", PO: "Portsmouth", RG: "Reading", S: "Sheffield", SA: "Swansea",
  SE: "London", SO: "Southampton", ST: "Stoke-on-Trent", SW: "London", UB: "London", W: "London",
  WC: "London", WV: "Wolverhampton", YO: "York",
};

const clean = (value: string) => value
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/[ \t]+/g, " ")
  .trim();

const universityCity = (value: string) => universityCities.find(([pattern]) => pattern.test(value))?.[1] ?? "";

const parseCandidate = (input: string): { location: string; source: "explicit" | "postcode" | "university" } | null => {
  const value = clean(input).split(/\s*(?:\||•|·)\s*/)[0]?.trim() ?? "";
  if (!value || /not found|not specified|needs review/i.test(value) || value.length > 120) return null;
  if (/\b(?:department|faculty|salary|grade|contract|closing date|deadline|reference|job title|working pattern|hours per week)\b/i.test(value)) return null;

  const city = cityAliases.find(([pattern]) => pattern.test(value))?.[1];
  if (city) return { location: city, source: "explicit" };

  const postcode = value.match(/\b([A-Z]{1,2})\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[1]?.toUpperCase();
  if (postcode && postcodeCities[postcode]) return { location: postcodeCities[postcode], source: "postcode" };

  const inferredUniversity = universityCity(value);
  if (inferredUniversity) return { location: inferredUniversity, source: "university" };
  if (/\bremote\b/i.test(value)) return { location: "Remote", source: "explicit" };
  if (/\b(?:hybrid|campus|university|school|college|institute|office|working|united kingdom|england|scotland|wales)\b/i.test(value)) return null;

  const simplePlace = value.replace(/^based (?:at|in)\s+/i, "").replace(/,\s*(?:UK|United Kingdom)$/i, "").trim();
  if (simplePlace.length <= 55 && /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,4}$/u.test(simplePlace)) {
    return { location: simplePlace, source: "explicit" };
  }
  return null;
};

export function resolveLocation(candidates: LocationCandidate[], organisation = "") {
  for (const candidate of candidates) {
    const parsed = parseCandidate(candidate.value ?? "");
    if (!parsed) continue;
    const evidence = parsed.source === "postcode"
      ? "Derived from postcode"
      : parsed.source === "university"
        ? "Inferred from university"
        : candidate.evidence;
    return { location: parsed.location, evidence };
  }
  const inferred = universityCity(organisation);
  return inferred
    ? { location: inferred, evidence: "Inferred from organisation" }
    : { location: "Location not found", evidence: "Needs review" };
}
