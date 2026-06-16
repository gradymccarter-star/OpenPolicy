/**
 * Fetch PA House Campaign Finance Data
 *
 * Source: FollowTheMoney.org (no API key required — scrapes public HTML backend)
 * Data current through 2024 election year per FTM's own notice.
 *
 * Strategy:
 *   1. For each cycle (2020, 2022, 2024):
 *      - Fetch all PA House filer candidates and their FTM entity IDs (f-eid)
 *      - Match to our politicians by name
 *   2. For each matched politician:
 *      - Fetch all contributors grouped by donor entity
 *      - Store: all org/PAC contributions, individual contributions >= $1,000
 *
 * Run: node scripts/jobs/fetch-campaign-finance.js
 * No environment variables required beyond the standard SUPABASE_URL + SUPABASE_SERVICE_KEY.
 */

const fs = require('node:fs');
const path = require('node:path');
try {
  const envFile = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1).trim();
  }
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const FTM_BASE = 'https://followthemoney.org/aaengine/aafetch.php';
const CYCLES = [2020, 2022, 2024];
const INDIVIDUAL_THRESHOLD = 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── HTML Table Parser ───────────────────────────────────────────────────────

function stripTags(html) {
  return html
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .trim();
}

function parseTable(html) {
  const rows = [];
  const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  for (const row of rowMatches) {
    const cells = [];
    const cellMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    for (const cell of cellMatches) {
      const inner = cell.replace(/<td[^>]*>/i, '').replace(/<\/td>/i, '');
      cells.push(stripTags(inner));
    }
    if (cells.length >= 3) rows.push(cells);
  }
  return rows;
}

function parsePagination(html) {
  // Extract max page number from pagination links
  const matches = [...html.matchAll(/updateContent\(this,\s*'p',\s*'(\d+)'/g)];
  if (!matches.length) return 1;
  const pages = matches.map(m => Number.parseInt(m[1], 10));
  return Math.max(...pages) + 1; // p is 0-indexed, convert to count
}

function parseAmount(str) {
  const clean = str.replaceAll(/[$,\s]/g, '');
  const val = Number.parseFloat(clean);
  return Number.isNaN(val) ? 0 : val;
}

// ─── Donor Lean Classification (rule-based) ──────────────────────────────────

const ANTI_CHAMBER_PATTERNS = [
  /\bunion\b/i, /\bAFL[\s-]?CIO\b/i, /\bSEIU\b/i, /\bUFCW\b/i, /\bIBEW\b/i,
  /\bUAW\b/i, /\bUSW\b/i, /\bteamster/i, /\bamalgamated\b/i, /\bworkers[\s']?\s*united\b/i,
  /\btrial\s+lawyer/i, /\bassociation\s+for\s+justice\b/i, /\bAAJ\b/, /\bPATLA\b/,
  /\bsierra\s+club\b/i, /\benvironment(?:al)?\s+(?:action|defense|fund|council)\b/i,
  /\blaborers\s+international\b/i, /\boperating\s+engineers\b/i, /\bplumbers\b/i,
  /\bsteamfitters\b/i, /\belectrical\s+workers\b/i, /\bafscme\b/i,
];

const PRO_CHAMBER_PATTERNS = [
  /\bchamber\s+of\s+commerce\b/i, /\bNFIB\b/, /\bnational\s+fed(?:eration)?\s+of\s+independent\s+business\b/i,
  /\bmanufactur(?:ers|ing)\s+assoc/i, /\bPAMFG\b/, /\bretail\s+merchants\b/i,
  /\bRestaurant\s+Association\b/i, /\bHospitality\b.*\bAssociation\b/i,
  /\bBusiness\s+(?:Council|Roundtable|Association|League)\b/i,
  /\bNAR\b/, /\bRealtors?\s+Assoc/i, /\binsurance\s+(?:assoc|council|alliance)\b/i,
  /\bBankers?\s+Assoc/i, /\bHomebuilders?\b/i, /\bNAHB\b/,
];

function classifyLean(name) {
  for (const re of ANTI_CHAMBER_PATTERNS) if (re.test(name)) return 'anti_chamber';
  for (const re of PRO_CHAMBER_PATTERNS) if (re.test(name)) return 'pro_chamber';
  return 'unknown';
}

function normalizeDonorName(name) {
  return name.toLowerCase().replaceAll(/[,.'"]/g, ' ').replaceAll('-', ' ').replaceAll(/\b(inc|llc|llp|corp|co|ltd|pa|the)\b/g, '').replaceAll(/\s+/g, ' ').trim();
}

// ─── Donor Org Cache ────────────────────────────────────────────────────────

const donorOrgCache = new Map();

async function getOrCreateDonorOrg(name) {
  const normalized = normalizeDonorName(name);
  if (donorOrgCache.has(normalized)) return donorOrgCache.get(normalized);

  const { data: existing } = await supabase
    .from('donor_organizations')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle();

  if (existing) { donorOrgCache.set(normalized, existing.id); return existing.id; }

  const lean = classifyLean(name);
  const { data: created, error } = await supabase
    .from('donor_organizations')
    .insert({ name, normalized_name: normalized, lean, lean_classified_by: 'rule' })
    .select('id')
    .single();

  if (error) {
    const { data: retry } = await supabase.from('donor_organizations').select('id').eq('normalized_name', normalized).maybeSingle();
    if (retry) { donorOrgCache.set(normalized, retry.id); return retry.id; }
    return null;
  }

  donorOrgCache.set(normalized, created.id);
  return created.id;
}

// ─── FTM Fetch Helpers ───────────────────────────────────────────────────────

async function ftmFetch(params) {
  const { data } = await axios.get(FTM_BASE, {
    params: { limchk: 1, atag: 1, mode: 'list', dt: 1, ...params },
    headers: { 'User-Agent': UA, Referer: 'https://followthemoney.org/' },
    timeout: 20000,
  });
  return data;
}

// Get all PA House filer candidates for a cycle → Map<normalized_name, f_eid>
async function fetchCandidateFilerIds(year) {
  const candidateMap = new Map();
  let page = 0;

  while (true) {
    const html = await ftmFetch({ s: 'PA', c_r: 'H', c_t: 'L', y: year, gro: 'f-eid', p: page, so: 'u-tot' });

    const pairs = [...html.matchAll(/eid=(\d+)[^>]*>([^<]+)<\/a>/g)];
    for (const [, eid, name] of pairs) {
      const normalized = normalizeName(name);
      if (!candidateMap.has(normalized)) {
        candidateMap.set(normalized, { eid, name });
      }
    }

    const totalPages = parsePagination(html);
    if (page + 1 >= totalPages || pairs.length === 0) break;
    page++;
    await delay(600);
  }

  return candidateMap;
}

// Get all donors to a specific candidate (by filer eid) for a cycle
async function fetchDonors(fEid, year) {
  const donors = [];
  let page = 0;

  while (true) {
    const html = await ftmFetch({ 'f-eid': fEid, y: year, gro: 'd-eid', p: page, so: 'u-tot' });

    const pairs = [...html.matchAll(/eid=(\d+)[^>]*>([^<]+)<\/a>/g)];
    const rows = parseTable(html);

    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i];
      // Row format: [link, name, type, count, amount]
      if (cells.length < 4) continue;
      const name = cells[1];
      const type = cells[2]; // INDIVIDUAL or NON-INDIVIDUAL
      const amountStr = cells[cells.length - 1];
      const amount = parseAmount(amountStr);
      const dEid = pairs.at(i)?.[1] ?? null;

      if (!name || amount <= 0) continue;
      donors.push({ name, type, amount, dEid });
    }

    const totalPages = parsePagination(html);
    if (page + 1 >= totalPages || rows.length === 0) break;
    page++;
    await delay(500);
  }

  return donors;
}

// ─── Name Matching ──────────────────────────────────────────────────────────

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z\s,]/g, '').replace(/\s+/g, ' ').trim();
}

function buildPoliticianIndex(politicians) {
  const index = new Map();
  for (const p of politicians) {
    // FTM stores as "LASTNAME, FIRSTNAME MI (NICKNAME)"
    const ftmStyle = normalizeName(`${p.last_name}, ${p.first_name}`);
    const fullNorm = normalizeName(p.full_name);
    index.set(ftmStyle, p);
    index.set(fullNorm, p);
    // Also index just last name for fallback matching
    const lastOnly = normalizeName(p.last_name);
    if (!index.has(lastOnly)) index.set(lastOnly, p);
  }
  return index;
}

function matchPolitician(ftmName, index, politicians) {
  const normalized = normalizeName(ftmName);

  // Direct match
  if (index.has(normalized)) return index.get(normalized);

  // FTM format "LASTNAME, FIRSTNAME" → try matching
  const commaParts = normalized.split(',').map(s => s.trim());
  if (commaParts.length >= 2) {
    const [last, firstRest] = commaParts;
    const firstWord = firstRest.split(' ')[0];
    for (const p of politicians) {
      if (normalizeName(p.last_name) === last && normalizeName(p.first_name).startsWith(firstWord)) {
        return p;
      }
    }
    // Last name only
    for (const p of politicians) {
      if (normalizeName(p.last_name) === last) return p;
    }
  }

  return null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('=== PA House Campaign Finance Ingestion (FollowTheMoney) ===');
  console.log(`Cycles: ${CYCLES.join(', ')} | Individual threshold: $${INDIVIDUAL_THRESHOLD.toLocaleString()}\n`);

  const { data: politicians } = await supabase
    .from('politicians')
    .select('id, full_name, first_name, last_name, party')
    .eq('is_active', true)
    .eq('office_type', 'pa_house');

  if (!politicians?.length) { console.error('No PA House politicians found'); return; }
  console.log(`${politicians.length} PA House politicians loaded`);
  const politicianIndex = buildPoliticianIndex(politicians);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalNoMatch = 0;
  let totalErrors = 0;

  for (const year of CYCLES) {
    console.log(`\n─── Cycle ${year} ───`);

    let candidateMap;
    try {
      console.log('  Fetching candidate filer IDs...');
      candidateMap = await fetchCandidateFilerIds(year);
      console.log(`  ${candidateMap.size} FTM candidates found`);
    } catch (err) {
      console.error(`  Failed to fetch candidates for ${year}:`, err.message);
      continue;
    }

    for (const [ftmName, { eid: fEid }] of candidateMap) {
      const politician = matchPolitician(ftmName, politicianIndex, politicians);
      if (!politician) { totalNoMatch++; continue; }

      process.stdout.write(`  ${politician.full_name} (${year})... `);

      let donors;
      try {
        donors = await fetchDonors(fEid, year);
        await delay(400);
      } catch (err) {
        console.log(`FAIL: ${err.message}`);
        totalErrors++;
        continue;
      }

      let inserted = 0;
      let skipped = 0;

      for (const { name, type, amount, dEid } of donors) {
        const isIndividual = type.includes('INDIVIDUAL') && !type.includes('NON');
        let donorType;
        if (isIndividual) donorType = 'individual';
        else if (type.includes('PARTY')) donorType = 'party';
        else if (type.includes('COMMITTEE')) donorType = 'pac';
        else donorType = 'organization';

        // Filter individuals below threshold
        if (isIndividual && amount < INDIVIDUAL_THRESHOLD) { skipped++; continue; }
        // Exclude self (candidate's own entity)
        if (dEid === fEid) { skipped++; continue; }

        const ftmId = `ftm-${fEid}-${dEid ?? normalizeName(name)}-${year}`;

        let donorOrgId = null;
        if (!isIndividual) donorOrgId = await getOrCreateDonorOrg(name);

        const row = {
          politician_id: politician.id,
          donor_org_id: donorOrgId,
          donor_name: name,
          donor_type: donorType,
          amount,
          contribution_date: null,
          cycle_year: year,
          followthemoney_id: ftmId,
          source: 'followthemoney',
        };

        const { error } = await supabase
          .from('campaign_contributions')
          .upsert(row, { onConflict: 'followthemoney_id', ignoreDuplicates: true });

        if (!error) inserted++;
        else if (!error.message?.includes('duplicate')) { skipped++; }
      }

      totalInserted += inserted;
      totalSkipped += skipped;
      console.log(`${donors.length} donors → ${inserted} stored`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Contributions inserted:   ${totalInserted}`);
  console.log(`Filtered/skipped:         ${totalSkipped}`);
  console.log(`Candidate no-match:       ${totalNoMatch}`);
  console.log(`Fetch errors:             ${totalErrors}`);
}

run().catch(console.error);
