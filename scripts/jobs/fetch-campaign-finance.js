/**
 * Fetch PA House Campaign Finance Data
 *
 * Source: FollowTheMoney.org (National Institute on Money in State Politics)
 * API docs: https://followthemoney.org/research/institute/api-overview/
 *
 * What we store:
 *   - All organizational/PAC contributions (no threshold)
 *   - Individual contributions >= $1,000
 *   - Cycles: 2020, 2022, 2024, 2026
 *
 * Setup:
 *   1. Register for a free API key at followthemoney.org/research/institute/api-overview/
 *   2. Add FOLLOWTHEMONEY_API_KEY=your_key to .env.local
 *   3. Run the DB migration: lib/db/migrations/add_campaign_finance.sql
 *   4. node scripts/jobs/fetch-campaign-finance.js
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

const FTM_KEY = process.env.FOLLOWTHEMONEY_API_KEY;
const FTM_BASE = 'https://api.followthemoney.org';

const CYCLES = [2020, 2022, 2024, 2026];
const INDIVIDUAL_THRESHOLD = 1000;

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Donor Lean Classification ──────────────────────────────────────────────

// Keywords that reliably indicate anti-Chamber lean (unions, trial lawyers)
const ANTI_CHAMBER_PATTERNS = [
  /\bunion\b/i,
  /\bAFL[\s-]?CIO\b/i,
  /\bSEIU\b/i,
  /\bUFCW\b/i,
  /\bIBEW\b/i,
  /\bUAW\b/i,
  /\bUSW\b/i,
  /\bteamster/i,
  /\bamalgamated\b/i,
  /\bworkers[\s']?\s*united\b/i,
  /\btrial\s+lawyer/i,
  /\bassociation\s+for\s+justice\b/i,
  /\bAAJ\b/,
  /\bPATLA\b/,
  /\benvironment(?:al)?\s+(?:action|defense|fund|council)\b/i,
  /\bsierra\s+club\b/i,
];

// Keywords that reliably indicate pro-Chamber lean (business, commerce, industry)
const PRO_CHAMBER_PATTERNS = [
  /\bchamber\s+of\s+commerce\b/i,
  /\bNFIB\b/,
  /\bnational\s+fed(?:eration)?\s+of\s+independent\s+business\b/i,
  /\bmanufactur(?:ers|ing)\s+assoc/i,
  /\bPAMFG\b/,
  /\bretail\s+merchants\b/i,
  /\bRestaurant\s+Association\b/i,
  /\bHospitality\b.*\bAssociation\b/i,
  /\bBusiness\s+(?:Council|Roundtable|Association|League)\b/i,
  /\bNAR\b/, // National Association of Realtors
  /\bRealtors?\s+Assoc/i,
  /\binsurance\s+(?:assoc|council|alliance)\b/i,
  /\bBankers?\s+Assoc/i,
  /\bHomebuilders?\b/i,
  /\bNAHB\b/,
];

function classifyLeanByRules(name) {
  for (const re of ANTI_CHAMBER_PATTERNS) {
    if (re.test(name)) return { lean: 'anti_chamber', by: 'rule' };
  }
  for (const re of PRO_CHAMBER_PATTERNS) {
    if (re.test(name)) return { lean: 'pro_chamber', by: 'rule' };
  }
  return null;
}

function normalizeDonorName(name) {
  return name
    .toLowerCase()
    .replace(/[,.'"\-]/g, ' ')
    .replace(/\b(inc|llc|llp|corp|co|ltd|pa|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── FollowTheMoney API Calls ────────────────────────────────────────────────

async function ftmGet(endpoint, params) {
  if (!FTM_KEY) throw new Error('FOLLOWTHEMONEY_API_KEY not set in .env.local');
  const url = `${FTM_BASE}${endpoint}`;
  const { data } = await axios.get(url, {
    params: { ...params, APIKey: FTM_KEY, output: 'json' },
    timeout: 20000,
  });
  return data;
}

// Get all PA House candidates for a given cycle from FTM
async function fetchCandidates(year) {
  const data = await ftmGet('/candidates/', {
    s: 'PA',
    office: 'H',
    y: year,
    p: 1,
    pp: 500,
  });
  return (data?.records ?? data?.results ?? []);
}

// Get all contributions for a specific FTM entity (candidate)
async function fetchContributions(eid, year) {
  const results = [];
  let page = 1;
  while (true) {
    const data = await ftmGet('/candidates/contributions/', {
      eid,
      y: year,
      p: page,
      pp: 500,
    });
    const records = data?.records ?? data?.results ?? [];
    results.push(...records);
    if (records.length < 500) break;
    page++;
    await delay(300);
  }
  return results;
}

// ─── Name Matching ──────────────────────────────────────────────────────────

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildMatchIndex(politicians) {
  const index = new Map();
  for (const p of politicians) {
    // Index by "firstname lastname" and "lastname firstname"
    const full = normalizeName(p.full_name);
    const byLast = normalizeName(`${p.last_name} ${p.first_name}`);
    index.set(full, p);
    index.set(byLast, p);
  }
  return index;
}

function matchCandidate(ftmName, index) {
  const normalized = normalizeName(ftmName);

  // Exact match
  if (index.has(normalized)) return index.get(normalized);

  // Last name match (first try exact last name substring)
  for (const [key, pol] of index.entries()) {
    const lastNorm = normalizeName(pol.last_name);
    if (normalized.includes(lastNorm) && lastNorm.length > 3) {
      return pol;
    }
  }

  return null;
}

// ─── Donor Org Upsert ───────────────────────────────────────────────────────

const donorOrgCache = new Map(); // normalized_name → id

async function getOrCreateDonorOrg(name) {
  const normalized = normalizeDonorName(name);
  if (donorOrgCache.has(normalized)) return donorOrgCache.get(normalized);

  // Check DB
  const { data: existing } = await supabase
    .from('donor_organizations')
    .select('id, lean')
    .eq('normalized_name', normalized)
    .maybeSingle();

  if (existing) {
    donorOrgCache.set(normalized, existing.id);
    return existing.id;
  }

  // Classify lean by rules
  const ruleResult = classifyLeanByRules(name);
  const lean = ruleResult?.lean ?? 'unknown';
  const classifiedBy = ruleResult?.by ?? 'rule';

  const { data: created, error } = await supabase
    .from('donor_organizations')
    .insert({ name, normalized_name: normalized, lean, lean_classified_by: classifiedBy })
    .select('id')
    .single();

  if (error) {
    // Race condition — try fetching again
    const { data: retry } = await supabase
      .from('donor_organizations')
      .select('id')
      .eq('normalized_name', normalized)
      .maybeSingle();
    if (retry) {
      donorOrgCache.set(normalized, retry.id);
      return retry.id;
    }
    return null;
  }

  donorOrgCache.set(normalized, created.id);
  return created.id;
}

// ─── Determine donor type from FTM record ───────────────────────────────────

function parseDonorType(record) {
  const t = (record.contributor_type ?? record.type ?? '').toLowerCase();
  if (t.includes('individual') || t === 'ind') return 'individual';
  if (t.includes('party') || t === 'pty') return 'party';
  if (t.includes('pac') || t.includes('committee') || t === 'com') return 'pac';
  if (t.includes('corp') || t.includes('business') || t.includes('org') || t === 'bus') return 'organization';
  return 'other';
}

function parseAmount(record) {
  const raw = record.amount ?? record.contribution_amount ?? record.total ?? 0;
  return parseFloat(String(raw).replace(/[^0-9.]/g, '')) || 0;
}

function parseDate(record) {
  const raw = record.date ?? record.contribution_date ?? record.transaction_date ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function parseFtmId(record) {
  return String(record.id ?? record.transaction_id ?? record.uid ?? '').trim() || null;
}

// ─── Store Contributions ────────────────────────────────────────────────────

async function storeContributions(politicianId, contributions, cycleYear) {
  let inserted = 0;
  let skipped = 0;

  for (const rec of contributions) {
    const amount = parseAmount(rec);
    const donorType = parseDonorType(rec);
    const donorName = (rec.contributor_name ?? rec.contributor ?? rec.name ?? '').trim();

    if (!donorName || amount <= 0) { skipped++; continue; }

    // Filter: individuals must be >= $1,000
    if (donorType === 'individual' && amount < INDIVIDUAL_THRESHOLD) { skipped++; continue; }

    const ftmId = parseFtmId(rec);
    const contribution_date = parseDate(rec);

    // Get or create donor org for non-individual donors
    let donorOrgId = null;
    if (donorType !== 'individual') {
      donorOrgId = await getOrCreateDonorOrg(donorName);
    }

    const row = {
      politician_id: politicianId,
      donor_org_id: donorOrgId,
      donor_name: donorName,
      donor_type: donorType,
      amount,
      contribution_date,
      cycle_year: cycleYear,
      followthemoney_id: ftmId,
      source: 'followthemoney',
    };

    const { error } = await supabase
      .from('campaign_contributions')
      .upsert(row, { onConflict: 'followthemoney_id', ignoreDuplicates: true });

    if (!error) inserted++;
    else if (!error.message?.includes('duplicate')) skipped++;
  }

  return { inserted, skipped };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function run() {
  if (!FTM_KEY) {
    console.error('ERROR: FOLLOWTHEMONEY_API_KEY not set in .env.local');
    console.error('Register at: https://followthemoney.org/research/institute/api-overview/');
    process.exit(1);
  }

  console.log('=== PA House Campaign Finance Ingestion ===');
  console.log(`Cycles: ${CYCLES.join(', ')}`);
  console.log(`Individual threshold: $${INDIVIDUAL_THRESHOLD.toLocaleString()}\n`);

  // Load our politicians
  const { data: politicians } = await supabase
    .from('politicians')
    .select('id, full_name, first_name, last_name, district, party')
    .eq('is_active', true)
    .eq('office_type', 'pa_house');

  if (!politicians?.length) { console.error('No PA House politicians found'); return; }
  console.log(`${politicians.length} PA House politicians loaded`);
  const matchIndex = buildMatchIndex(politicians);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalNoMatch = 0;

  for (const year of CYCLES) {
    console.log(`\n─── Cycle ${year} ───`);

    let ftmCandidates;
    try {
      ftmCandidates = await fetchCandidates(year);
    } catch (err) {
      console.error(`  Failed to fetch candidates for ${year}:`, err.message);
      continue;
    }
    console.log(`  ${ftmCandidates.length} FTM candidates found`);
    await delay(500);

    for (const ftmCand of ftmCandidates) {
      const ftmName = (
        ftmCand.candidate_name ??
        ftmCand.name ??
        `${ftmCand.first_name ?? ''} ${ftmCand.last_name ?? ''}`
      ).trim();
      const eid = ftmCand.eid ?? ftmCand.id ?? ftmCand.entity_id;

      if (!eid || !ftmName) continue;

      const politician = matchCandidate(ftmName, matchIndex);
      if (!politician) { totalNoMatch++; continue; }

      process.stdout.write(`  ${politician.full_name} (${year})... `);

      let contributions;
      try {
        contributions = await fetchContributions(eid, year);
        await delay(400);
      } catch (err) {
        console.log(`FAIL: ${err.message}`);
        continue;
      }

      const { inserted, skipped } = await storeContributions(politician.id, contributions, year);
      totalInserted += inserted;
      totalSkipped += skipped;
      console.log(`${contributions.length} contributions → ${inserted} stored, ${skipped} skipped`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Contributions inserted:   ${totalInserted}`);
  console.log(`Filtered/skipped:         ${totalSkipped}`);
  console.log(`Candidate no-match:       ${totalNoMatch}`);
}

run().catch(console.error);
