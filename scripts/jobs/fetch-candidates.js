/**
 * Fetch 2026 PA House Candidates Job
 * Scrapes Ballotpedia's per-district general-election votebox for all 203 PA House
 * districts to capture declared candidates LegiScan can't see (LegiScan only tracks
 * sitting members). Existing incumbent rows are matched by name and left alone;
 * unmatched candidates are inserted as 'challenger' rows.
 * Requires SUPABASE_URL, SUPABASE_SERVICE_KEY env vars.
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');

const TOTAL_DISTRICTS = 203;
const USER_AGENT = 'Mozilla/5.0 (compatible; PA-Chamber-Intelligence/1.0)';

// Optional override for testing/retries, e.g. DISTRICTS=1,8,142,178 node fetch-candidates.js
function districtsToProcess() {
  if (process.env.DISTRICTS) {
    return process.env.DISTRICTS.split(',').map((d) => Number.parseInt(d.trim(), 10));
  }
  return Array.from({ length: TOTAL_DISTRICTS }, (_, i) => i + 1);
}

function rateLimitDelay(ms = 2000) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeParty(letter) {
  if (letter === 'D' || letter === 'R') return letter;
  return 'I';
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Common nickname/full-name pairs seen in PA House candidate filings vs. LegiScan's formal
// roll — e.g. Ballotpedia lists "Joe D'Orsie", LegiScan has "Joseph D'Orsie" for the same seat.
const NICKNAMES = {
  joe: 'joseph', joseph: 'joe',
  greg: 'gregory', gregory: 'greg',
  dave: 'david', david: 'dave',
  rob: 'robert', robert: 'rob', bob: 'robert', robt: 'robert',
  jim: 'james', james: 'jim', jamie: 'james',
  tim: 'timothy', timothy: 'tim',
  steve: 'stephen', stephen: 'steve', steven: 'steve',
  nate: 'nathan', nathan: 'nate',
  russ: 'russell', russell: 'russ',
  rich: 'richard', richard: 'rich', rick: 'richard', dick: 'richard',
  clint: 'clinton', clinton: 'clint',
  dan: 'daniel', daniel: 'dan', danny: 'daniel',
  mike: 'michael', michael: 'mike',
  chris: 'christopher', christopher: 'chris',
  matt: 'matthew', matthew: 'matt',
  will: 'william', william: 'will', bill: 'william',
  ken: 'kenneth', kenneth: 'ken',
  ron: 'ronald', ronald: 'ron',
  ed: 'edward', edward: 'ed',
};

function stripSuffix(tokens) {
  const last = tokens[tokens.length - 1]?.toLowerCase().replace(/\./g, '');
  return ['jr', 'sr', 'ii', 'iii', 'iv'].includes(last) ? tokens.slice(0, -1) : tokens;
}

/**
 * Loose match for "same person, different name format" — catches nicknames
 * (Joe/Joseph), suffixes (James Struzzi II/James Struzzi), and middle-name-as-
 * first-name styling (David H. Zimmerman/David Zimmerman), which exact
 * normalizeName() equality misses and previously caused duplicate inserts.
 */
function namesLikelyMatch(nameA, nameB) {
  const tokensA = stripSuffix(normalizeName(nameA).split(' ')).filter((t) => t.length > 1);
  const tokensB = stripSuffix(normalizeName(nameB).split(' ')).filter((t) => t.length > 1);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const lastA = tokensA[tokensA.length - 1];
  const lastB = tokensB[tokensB.length - 1];
  if (lastA !== lastB) return false;

  const firstTokensA = tokensA.slice(0, -1);
  const firstTokensB = tokensB.slice(0, -1);
  return firstTokensA.some((a) =>
    firstTokensB.some((b) => a === b || NICKNAMES[a] === b || NICKNAMES[b] === a),
  );
}

/**
 * Parse the general-election votebox for one district page.
 * Returns [{ name, party, isIncumbent }] — empty array if no general-election votebox
 * is present yet (e.g. uncontested primary still pending, or a district number that
 * doesn't exist).
 */
function parseGeneralElectionCandidates(html, district) {
  const $ = cheerio.load(html);
  const candidates = [];

  $('.votebox').each((_, box) => {
    const header = $(box).find('.votebox-header-election-type').text().trim();
    if (!header.startsWith(`General election for Pennsylvania House of Representatives District ${district}`)) {
      return;
    }
    // Ballotpedia keeps every past cycle's votebox on the same page (same header text,
    // no year) — scope to the 2026 cycle explicitly or we'd also ingest 2024/2022/2020 results.
    const resultsText = $(box).find('p.results_text').first().text();
    if (!resultsText.includes('November 3, 2026')) return;

    $(box)
      .find('tr.results_row')
      .each((_, row) => {
        const cell = $(row).find('td.votebox-results-cell--text');
        const link = cell.find('a').first();
        const name = link.text().trim();
        if (!name) return;

        const partyMatch = /\(([A-Za-z]+)\)/.exec(cell.text());
        const partyLetter = partyMatch ? partyMatch[1][0].toUpperCase() : 'I';
        const isIncumbent = cell.find('strong u, u strong').length > 0;

        candidates.push({ name, party: normalizeParty(partyLetter), isIncumbent });
      });
  });

  return candidates;
}

async function fetchDistrictCandidates(district) {
  const url = `https://ballotpedia.org/Pennsylvania_House_of_Representatives_District_${district}`;
  const response = await axios.get(url, {
    timeout: 20000,
    headers: { 'User-Agent': USER_AGENT },
  });
  return parseGeneralElectionCandidates(response.data, district);
}

async function fetchCandidates() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  console.log('Loading existing PA House politicians...');
  const { data: existing, error: fetchError } = await supabase
    .from('politicians')
    .select('id, full_name, district')
    .eq('office_type', 'pa_house')
    .eq('is_active', true);
  if (fetchError) throw fetchError;

  const existingByDistrict = new Map();
  for (const p of existing ?? []) {
    if (!p.district) continue;
    const list = existingByDistrict.get(p.district) ?? [];
    list.push(p.full_name);
    existingByDistrict.set(p.district, list);
  }

  const newChallengers = [];
  const incumbentMatches = [];
  const unmatchedIncumbentFlags = []; // Ballotpedia says incumbent but no DB row matched — worth a manual look
  const failures = [];
  let uncontested = 0;
  const districts = districtsToProcess();

  for (const n of districts) {
    const district = String(n).padStart(3, '0');
    try {
      let candidates = await fetchDistrictCandidates(n);
      // A zero-candidate result is sometimes a throttled/degraded response from Ballotpedia
      // rather than a genuine "no race yet" — every district has had a filed 2026 race since
      // the March filing deadline, so retry with backoff before trusting an empty result.
      for (let attempt = 0; candidates.length === 0 && attempt < 2; attempt++) {
        await rateLimitDelay(4000 + attempt * 4000);
        candidates = await fetchDistrictCandidates(n);
      }
      if (candidates.length === 0) {
        console.log(`  HD-${district}: no general-election votebox found yet (after retries)`);
      } else if (candidates.length === 1) {
        uncontested++;
      }

      const existingNames = existingByDistrict.get(district) ?? [];
      const knownNames = new Set(existingNames.map(normalizeName));
      for (const c of candidates) {
        const key = normalizeName(c.name);
        if (knownNames.has(key)) {
          incumbentMatches.push({ district, name: c.name });
          continue;
        }
        const fuzzyMatch = existingNames.find((n) => namesLikelyMatch(n, c.name));
        if (fuzzyMatch) {
          // Same legislator, different name formatting (nickname/suffix/middle-initial) —
          // not a real second person. Insert would create a duplicate row for one seat.
          incumbentMatches.push({ district, name: `${c.name} (matched existing "${fuzzyMatch}")` });
          continue;
        }
        if (c.isIncumbent) {
          // Ballotpedia marks this a sitting officeholder but nothing in the DB matches, even
          // loosely. If the district already has an existing (LegiScan-sourced) row, two
          // people can't both hold one seat — assume it's a formatting mismatch we couldn't
          // catch and skip inserting rather than risk a duplicate; flag for manual review.
          // Only insert when the district has no existing row at all (e.g. a genuine
          // resignation/special-election successor LegiScan hasn't caught up to yet).
          unmatchedIncumbentFlags.push({ district, name: c.name, hadExistingRow: existingNames.length > 0 });
          if (existingNames.length > 0) continue;
        }
        const [first, ...rest] = c.name.split(' ');
        newChallengers.push({
          pa_legislator_id: `cand:${district}:${key.replace(/\s+/g, '-')}`,
          first_name: first,
          last_name: rest.join(' ') || first,
          full_name: c.name,
          party: c.party,
          district,
          office_type: 'pa_house',
          title: 'State Representative',
          candidacy_status: c.isIncumbent ? 'incumbent' : 'challenger',
          data_source: 'candidate_filing',
          is_active: true,
        });
      }
    } catch (err) {
      failures.push({ district, message: err.message || String(err) });
      console.warn(`  HD-${district}: fetch failed — ${err.message || err}`);
    }
    await rateLimitDelay();
    // Longer cool-down periodically — sustained request volume appears to trigger
    // Ballotpedia's throttling/degraded-response behavior past ~40 requests in a burst.
    if (n % 25 === 0) await rateLimitDelay(8000);
  }

  console.log(`\nParsed ${districts.length} districts: ${uncontested} uncontested, ${failures.length} fetch failures.`);
  console.log(`Matched ${incumbentMatches.length} candidates to existing rows.`);
  console.log(`Found ${newChallengers.length} new candidates not already in the database.`);
  if (unmatchedIncumbentFlags.length > 0) {
    console.log(`Note: Ballotpedia flagged ${unmatchedIncumbentFlags.length} as incumbent with no DB match (manual review recommended):`);
    for (const u of unmatchedIncumbentFlags) {
      const note = u.hadExistingRow ? 'skipped insert — district already has a row, likely a name-format mismatch' : 'inserted as new incumbent — no existing row in this district';
      console.log(`  HD-${u.district}: ${u.name} (${note})`);
    }
  }

  if (newChallengers.length > 0) {
    let { error } = await supabase
      .from('politicians')
      .upsert(newChallengers, { onConflict: 'pa_legislator_id' });

    // add_candidacy_status.sql migration may not be applied yet — degrade gracefully
    // rather than blocking the whole run. (candidacy_status is still recoverable later
    // from the 'cand:{district}:{name}' id prefix via getCandidacyStatus().)
    if (error && /column|schema cache/i.test(error.message)) {
      console.warn(`Schema missing candidacy_status/data_source columns (${error.message}) — retrying without them.`);
      const stripped = newChallengers.map(({ candidacy_status, data_source, ...rest }) => rest);
      ({ error } = await supabase.from('politicians').upsert(stripped, { onConflict: 'pa_legislator_id' }));
    }

    if (error) throw error;
    console.log(`Upserted ${newChallengers.length} candidate rows.`);
  }

  if (failures.length > 0) {
    console.log('\nDistricts that failed to fetch (re-run to retry):');
    for (const f of failures) console.log(`  HD-${f.district}: ${f.message}`);
  }
}

fetchCandidates().catch((err) => {
  console.error('Job failed:', err.message || err);
  process.exit(1);
});
