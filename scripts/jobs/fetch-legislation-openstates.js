/**
 * Fetch PA Bills, Sponsorships, and Floor Votes from Open States v3 API
 *
 * Alternative to the LegiScan-based fetch-sponsorships.js / fetch-voting-records.js
 * (Open States free tier: 500 requests/day, instant key at openstates.org).
 *
 * Strategy: page through all 2025-2026 session bills with sponsorships + votes
 * embedded (1 request per 20 bills ≈ ~130 requests for the full session), keyword-
 * filter for PA business relevance, then match sponsor/voter names to politicians
 * rows the same way fetch-candidates.js matches Ballotpedia names. Evidence rows
 * leave keyword_filter_passed NULL so analyze-statements.js runs its normal
 * keyword → LLM relevance → claims pipeline over them.
 *
 * Usage:
 *   node --env-file=.env.local scripts/jobs/fetch-legislation-openstates.js
 *   node ... fetch-legislation-openstates.js --start-page 40   # resume after rate limit
 *
 * Requires OPENSTATES_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY.
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const crypto = require('node:crypto');
const { isPABusinessRelevant } = require('../shared/constants');

const OS_BASE = 'https://v3.openstates.org';
const SESSION = '2025-2026';
// 10/page keeps vote-heavy responses small enough that the API doesn't abort
// the stream mid-response (at 20/page, pages with many roll calls die).
const PER_PAGE = 10;
const REQUEST_DELAY_MS = 1300; // free tier is also per-minute limited
const UPSERT_CHUNK = 100;

const startPageArg = process.argv.indexOf('--start-page');
const START_PAGE = startPageArg > -1 ? Number(process.argv[startPageArg + 1]) : 1;

// --- name matching (same approach as fetch-candidates.js) ---
const NICKNAMES = {
  joe: 'joseph', joseph: 'joe',
  greg: 'gregory', gregory: 'greg',
  dave: 'david', david: 'dave',
  rob: 'robert', robert: 'rob', bob: 'robert', robt: 'robert',
  jim: 'james', james: 'jim', jamie: 'james',
  tim: 'timothy', timothy: 'tim',
  mike: 'michael', michael: 'mike',
  dan: 'daniel', daniel: 'dan', danny: 'daniel',
  tom: 'thomas', thomas: 'tom',
  chris: 'christopher', christopher: 'chris',
  matt: 'matthew', matthew: 'matt',
  tony: 'anthony', anthony: 'tony',
  steve: 'steven', steven: 'steve', stephen: 'steve',
  ben: 'benjamin', benjamin: 'ben',
  ed: 'edward', edward: 'ed', eddie: 'edward',
  bill: 'william', william: 'bill', will: 'william',
  rick: 'richard', richard: 'rick', dick: 'richard',
  kate: 'katherine', katherine: 'kate', kathy: 'katherine',
  liz: 'elizabeth', elizabeth: 'liz', beth: 'elizabeth',
  nick: 'nicholas', nicholas: 'nick',
  pat: 'patrick', patrick: 'pat',
  josh: 'joshua', joshua: 'josh',
  nate: 'nathan', nathan: 'nate', nathaniel: 'nate',
  andy: 'andrew', andrew: 'andy', drew: 'andrew',
  jen: 'jennifer', jennifer: 'jen', jenn: 'jennifer',
  jeff: 'jeffrey', jeffrey: 'jeff',
  ken: 'kenneth', kenneth: 'ken',
  ron: 'ronald', ronald: 'ron',
  don: 'donald', donald: 'don',
  doug: 'douglas', douglas: 'doug',
  sam: 'samuel', samuel: 'sam',
  alex: 'alexander', alexander: 'alex',
  zach: 'zachary', zachary: 'zach',
  brad: 'bradley', bradley: 'brad',
  fred: 'frederick', frederick: 'fred',
  ray: 'raymond', raymond: 'ray',
};

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

function normalizeName(name) {
  const norm = (name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Strip generational suffixes so "John Inglis III" matches "John Inglis"
  const parts = norm.split(' ').filter((p) => !NAME_SUFFIXES.has(p));
  return parts.join(' ');
}

function nameKeys(fullName) {
  const norm = normalizeName(fullName);
  const parts = norm.split(' ');
  if (parts.length < 2) return [norm];
  const first = parts[0];
  const last = parts[parts.length - 1];
  const keys = new Set([`${first} ${last}`]);
  if (NICKNAMES[first]) keys.add(`${NICKNAMES[first]} ${last}`);
  return [...keys];
}

// --- API ---
// Open States (FastAPI) needs repeated `include=` keys — axios's default
// bracket serialization (include[]=) is silently ignored, so build the query
// string with URLSearchParams entries.
let lastRequest = 0;
async function osFetch(path, params = {}) {
  const wait = REQUEST_DELAY_MS - (Date.now() - lastRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  const entries = [];
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const item of v) entries.push([k, String(item)]);
    else entries.push([k, String(v)]);
  }
  const qs = new URLSearchParams(entries).toString();

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(`${OS_BASE}${path}?${qs}`, {
        headers: { 'X-API-KEY': process.env.OPENSTATES_API_KEY },
        timeout: 150000, // vote-heavy pages take the API >60s to build
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      // 4xx (other than 429) won't heal on retry; everything else might —
      // timeouts, aborted streams, resets, 5xx.
      const retryable = status === 429 || !status || status >= 500;
      if (retryable && attempt < 3) {
        console.log(`    ${status || err.code || 'network error'} — waiting ${status === 429 ? 70 : 15}s (attempt ${attempt})...`);
        await new Promise((r) => setTimeout(r, status === 429 ? 70000 : 15000));
        continue;
      }
      throw err;
    }
  }
}

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function normalizeVoteOption(option) {
  const v = (option || '').toLowerCase();
  if (v === 'yes' || v === 'yea') return 'yea';
  if (v === 'no' || v === 'nay') return 'nay';
  if (v === 'absent' || v === 'excused' || v === 'not voting') return 'not_voting';
  return 'abstain';
}

async function main() {
  const { OPENSTATES_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!OPENSTATES_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing OPENSTATES_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  console.log('Loading PA House politicians for name matching...');
  const { data: members, error } = await supabase
    .from('politicians')
    .select('id, full_name, district, candidacy_status')
    .eq('is_active', true)
    .eq('office_type', 'pa_house');
  if (error) throw error;

  // name key -> [politician]; prefer incumbents on ambiguity
  const byName = new Map();
  for (const m of members) {
    for (const key of nameKeys(m.full_name)) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(m);
    }
  }
  function matchMember(name) {
    for (const key of nameKeys(name)) {
      const hits = byName.get(key);
      if (!hits || hits.length === 0) continue;
      if (hits.length === 1) return hits[0];
      const incumbents = hits.filter((h) => h.candidacy_status !== 'challenger');
      if (incumbents.length === 1) return incumbents[0];
    }
    return null;
  }
  console.log(`  ${members.length} members loaded.\n`);

  let page = START_PAGE;
  let maxPage = Infinity;
  let relevantBills = 0;
  let sponsorRows = 0;
  let voteRows = 0;
  let unmatchedNames = new Set();
  const pending = [];

  async function flush() {
    while (pending.length > 0) {
      const chunk = pending.splice(0, UPSERT_CHUNK);
      const { error: upErr } = await supabase
        .from('evidence_items')
        .upsert(chunk, { onConflict: 'content_hash', ignoreDuplicates: true });
      if (upErr) console.error('  upsert error:', upErr.message);
    }
  }

  const skippedPages = [];

  while (page <= maxPage) {
    let data;
    try {
      data = await osFetch('/bills', {
        jurisdiction: 'Pennsylvania',
        session: SESSION,
        include: ['sponsorships', 'votes', 'abstracts'],
        per_page: PER_PAGE,
        page,
      });
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        console.error(`\nAuth/quota failure at page ${page} (${status}) — daily limit likely exhausted.`);
        console.error(`Resume later with: --start-page ${page}`);
        break;
      }
      console.error(`  page ${page} failed after retries (${status || err.code || err.message}) — skipping.`);
      skippedPages.push(page);
      page++;
      continue;
    }

    maxPage = data.pagination?.max_page ?? maxPage;

    for (const bill of data.results || []) {
      const abstract = (bill.abstracts || []).map((a) => a.abstract).join(' ');
      const searchText = `${bill.identifier} ${bill.title || ''} ${abstract}`;
      if (!isPABusinessRelevant(searchText)) continue;
      relevantBills++;

      const sourceUrl = bill.openstates_url || `https://openstates.org/pa/bills/${SESSION}/${bill.identifier}`;
      const billDate = bill.first_action_date || bill.latest_action_date;
      const sourceDate = billDate ? new Date(billDate).toISOString() : new Date().toISOString();

      for (const sp of bill.sponsorships || []) {
        const member = matchMember(sp.name);
        if (!member) {
          unmatchedNames.add(sp.name);
          continue;
        }
        const isPrimary = sp.primary === true || sp.classification === 'primary';
        const sponsorshipType = isPrimary ? 'sponsor' : 'cosponsor';
        pending.push({
          politician_id: member.id,
          evidence_type: isPrimary ? 'bill_sponsorship' : 'bill_cosponsorship',
          bill_id: bill.identifier,
          bill_title: (bill.title || '').substring(0, 500),
          sponsorship_type: sponsorshipType,
          source_url: sourceUrl,
          source_date: sourceDate,
          content_hash: md5(`${member.id}-${bill.id}-${sponsorshipType}`),
        });
        sponsorRows++;
      }

      for (const ve of bill.votes || []) {
        if (ve.organization?.classification !== 'lower') continue;
        const voteDate = ve.start_date ? new Date(ve.start_date).toISOString() : sourceDate;
        for (const v of ve.votes || []) {
          const member = matchMember(v.voter_name);
          if (!member) continue;
          pending.push({
            politician_id: member.id,
            evidence_type: 'floor_vote',
            bill_id: bill.identifier,
            bill_title: (bill.title || '').substring(0, 500),
            vote_position: normalizeVoteOption(v.option),
            source_url: sourceUrl,
            source_date: voteDate,
            content_hash: md5(`vote-${member.id}-${ve.id}`),
          });
          voteRows++;
        }
      }
    }

    if (pending.length >= UPSERT_CHUNK) await flush();
    console.log(`  page ${page}/${maxPage === Infinity ? '?' : maxPage} — relevant bills: ${relevantBills}, sponsorships: ${sponsorRows}, votes: ${voteRows}`);
    page++;
  }

  await flush();

  console.log(`\nDone through page ${page - 1}.`);
  console.log(`  Business-relevant bills: ${relevantBills}`);
  console.log(`  Sponsorship rows: ${sponsorRows}`);
  console.log(`  Floor vote rows: ${voteRows}`);
  if (skippedPages.length > 0) {
    console.log(`  SKIPPED pages (rerun with --start-page each): ${skippedPages.join(', ')}`);
  }
  if (unmatchedNames.size > 0) {
    console.log(`  Unmatched sponsor names (sample): ${[...unmatchedNames].slice(0, 10).join('; ')}`);
  }
}

main().catch((err) => {
  console.error('Job failed:', err.message || err);
  process.exit(1);
});
