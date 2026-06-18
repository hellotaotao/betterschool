// Religious affiliation classifier — Phase 1 school data enrichment.
//
// Pure and deterministic. Core principle: prefer 'Unknown' over a wrong guess.
// A wrong label becomes a durable false "truth"; 'Unknown' costs nothing.
//
// Classification cascade (first hit wins):
//   1. sector         — Catholic → Catholic; Government → Secular (statutorily non-religious)
//   2. governing_body — only RELIGIOUS bodies; secular peak bodies fall through
//   3. school name    — CONSERVATIVE: only words that explicitly name a faith
//   4. otherwise      — Unknown (never infer Secular for a non-government school)

// Step 2: religious governing bodies. Ordered: specific before generic 'Christian'.
// Secular peak bodies ("Independent Schools NSW", "Association of Independent
// Schools of ...") match nothing here and correctly fall through to step 3.
const GOVERNING_BODY_RULES = [
  [/edmund rice|\berea\b/i, 'Catholic'],
  [/mercy education/i, 'Catholic'],
  [/catholic/i, 'Catholic'],
  [/anglican|anglischools/i, 'Anglican'],
  [/lutheran/i, 'Lutheran'],
  [/adventist/i, 'Adventist'],
  [/uniting church/i, 'Uniting'],
  [/presbyterian/i, 'Presbyterian'],
  [/baptist/i, 'Baptist'],
  [/islamic|muslim/i, 'Islamic'],
  [/jewish|hebrew/i, 'Jewish'],
  [/greek orthodox|coptic|\borthodox\b/i, 'Orthodox'],
  [/christian/i, 'Christian'],
];

// Step 3: CONSERVATIVE name whitelist — each token explicitly names the faith.
// Ambiguous markers (St/Saint, Grammar, College, Academy) are intentionally
// absent, so names relying on them fall through to 'Unknown'.
const NAME_RULES = [
  [/\bislamic\b|\bmuslim\b/i, 'Islamic'],
  [/\bcatholic\b/i, 'Catholic'],
  [/\banglican\b/i, 'Anglican'],
  [/\blutheran\b/i, 'Lutheran'],
  [/\badventist\b/i, 'Adventist'],
  [/\bbaptist\b/i, 'Baptist'],
  [/\bpresbyterian\b/i, 'Presbyterian'],
  [/\buniting church\b/i, 'Uniting'],
  [/\bgreek orthodox\b|\bcoptic\b/i, 'Orthodox'],
  [/\bjewish\b|\bhebrew\b|\btorah\b|\byeshiva\b/i, 'Jewish'],
  [/\bchristian\b/i, 'Christian'],
];

/** Derive the boolean rollup from an affiliation label. */
export function deriveIsReligious(affiliation) {
  if (affiliation === 'Secular') return false;
  if (!affiliation || affiliation === 'Unknown') return null;
  return true;
}

function matchRules(rules, value) {
  if (!value) return null;
  for (const [pattern, affiliation] of rules) {
    if (pattern.test(value)) return affiliation;
  }
  return null;
}

function result(affiliation, source) {
  return {
    religious_affiliation: affiliation,
    is_religious: deriveIsReligious(affiliation),
    religion_source: source,
  };
}

/**
 * Classify a school's religious affiliation.
 * @param {{ sector?: string, governingBody?: string|null, schoolName?: string|null }} input
 * @returns {{ religious_affiliation: string, is_religious: boolean|null, religion_source?: string }}
 */
export function classifyReligion({ sector, governingBody, schoolName } = {}) {
  // 1. sector — high confidence
  if (sector === 'Catholic') return result('Catholic', 'sector');
  if (sector === 'Government') return result('Secular', 'sector');

  // 2. religious governing body (secular peak bodies fall through)
  const byBody = matchRules(GOVERNING_BODY_RULES, governingBody);
  if (byBody) return result(byBody, 'governing_body');

  // 3. conservative explicit-name heuristic
  const byName = matchRules(NAME_RULES, schoolName);
  if (byName) return result(byName, 'name_explicit');

  // 4. unknown — never infer Secular for a non-government school
  return { religious_affiliation: 'Unknown', is_religious: null };
}
