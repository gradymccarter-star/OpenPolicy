/**
 * PA House Candidate-Level Election Results ETL
 *
 * Downloads precinct-level general election results from openelections-data-pa
 * for 2020, 2022, and 2024, aggregates to candidate level per district, and
 * writes a static JSON file at public/data/pa-house-candidate-results.json.
 *
 * 2024 / 2020: single statewide precinct CSV, office = "State House"
 *   Columns: county,precinct,office,district,candidate,party,votes,...
 *
 * 2022: no statewide file — 24 county files under 2022/counties/ on GitHub.
 *   office = "General Assembly"
 *   Columns: county,precinct,office,district,party,candidate,votes,...
 *   (party and candidate are swapped vs 2024/2020)
 *
 * Run: node scripts/jobs/fetch-candidate-results.js
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const axios = require('axios').default;

const OUTPUT_PATH = path.join(__dirname, '../../public/data/pa-house-candidate-results.json');

const STATEWIDE_SOURCES = {
  2024: 'https://raw.githubusercontent.com/openelections/openelections-data-pa/master/2024/20241105__pa__general__precinct.csv',
  2020: 'https://raw.githubusercontent.com/openelections/openelections-data-pa/master/2020/20201103__pa__general__precinct.csv',
};

const GITHUB_2022_COUNTIES_API =
  'https://api.github.com/repos/openelections/openelections-data-pa/contents/2022/counties';
const RAW_2022_BASE =
  'https://raw.githubusercontent.com/openelections/openelections-data-pa/master/2022/counties/';

const RATE_LIMIT_MS = 200;

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Minimal RFC-4180 CSV line splitter — handles quoted fields with embedded commas. */
function splitCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function normalizeParty(raw) {
  const p = (raw || '').trim().toUpperCase();
  if (p.startsWith('DEM') || p === 'D') return 'DEM';
  if (p.startsWith('REP') || p === 'R') return 'REP';
  if (!p || p === 'N/A') return null;
  return p;
}

function normalizeDistrict(raw) {
  if (!raw) return null;
  const m = /^(\d+)/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 203) return null;
  return String(n).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await axios.get(url, {
    responseType: 'text',
    headers: { 'User-Agent': 'scai-etl/1.0 (github.com/openelections)' },
    maxContentLength: 100 * 1024 * 1024,
    timeout: 60_000,
  });
  return res.data;
}

async function fetchJson(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'scai-etl/1.0 (github.com/openelections)' },
    timeout: 30_000,
  });
  return res.data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// CSV aggregation
// ---------------------------------------------------------------------------

/**
 * Parse a statewide CSV (2024 / 2020 format):
 *   county,precinct,office,district,candidate,party,votes,...
 * office filter: "State House"
 *
 * Returns Map: `${district}|${candidate}|${party}` -> votes (number)
 */
function aggregateStatewideCSV(csvText) {
  const lines = csvText.split('\n');
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const officeIdx    = header.indexOf('office');
  const districtIdx  = header.indexOf('district');
  const candidateIdx = header.indexOf('candidate');
  const partyIdx     = header.indexOf('party');
  const votesIdx     = header.indexOf('votes');

  if ([officeIdx, districtIdx, candidateIdx, partyIdx, votesIdx].some((i) => i === -1)) {
    throw new Error(`Missing expected columns. Header: ${header.join(',')}`);
  }

  const tally = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.includes('State House')) continue;

    const fields = splitCsvLine(line);
    if (fields[officeIdx]?.trim() !== 'State House') continue;

    const candidate = (fields[candidateIdx] || '').trim();
    if (!candidate) continue;

    const district = normalizeDistrict(fields[districtIdx]);
    if (!district) continue;

    const party = normalizeParty(fields[partyIdx]);
    const votes = Number.parseInt(fields[votesIdx], 10);
    if (Number.isNaN(votes)) continue;

    const key = `${district}|${candidate}|${party ?? ''}`;
    tally.set(key, (tally.get(key) ?? 0) + votes);
  }

  return tally;
}

/**
 * Parse a 2022 county CSV:
 *   county,precinct,office,district,party,candidate,votes,...
 * office filter: "General Assembly"
 *
 * Accumulates into an existing Map (for multi-county aggregation).
 */
function aggregate2022CSV(csvText, tally) {
  const lines = csvText.split('\n');
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const officeIdx    = header.indexOf('office');
  const districtIdx  = header.indexOf('district');
  const candidateIdx = header.indexOf('candidate');
  const partyIdx     = header.indexOf('party');
  const votesIdx     = header.indexOf('votes');

  if ([officeIdx, districtIdx, candidateIdx, partyIdx, votesIdx].some((i) => i === -1)) {
    // Warn but don't crash — some county files may have irregular headers
    process.stderr.write(`  WARN: Missing expected columns. Header: ${header.join(',')}\n`);
    return tally;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.includes('General Assembly')) continue;

    const fields = splitCsvLine(line);
    if (fields[officeIdx]?.trim() !== 'General Assembly') continue;

    const candidate = (fields[candidateIdx] || '').trim();
    if (!candidate) continue;

    const district = normalizeDistrict(fields[districtIdx]);
    if (!district) continue;

    const party = normalizeParty(fields[partyIdx]);
    const votes = Number.parseInt(fields[votesIdx], 10);
    if (Number.isNaN(votes)) continue;

    const key = `${district}|${candidate}|${party ?? ''}`;
    tally.set(key, (tally.get(key) ?? 0) + votes);
  }

  return tally;
}

// ---------------------------------------------------------------------------
// Tally -> structured output
// ---------------------------------------------------------------------------

/**
 * Convert a `district|candidate|party -> votes` tally into an array of
 * { candidate, party, votes, pct } objects sorted by votes desc.
 */
function tallyToDistricts(tally) {
  // Group by district
  const byDistrict = new Map();
  for (const [key, votes] of tally) {
    const [district, candidate, party] = key.split('|');
    if (!byDistrict.has(district)) byDistrict.set(district, []);
    byDistrict.get(district).push({ candidate, party: party || null, votes });
  }

  const result = {};
  for (const [district, candidates] of byDistrict) {
    candidates.sort((a, b) => b.votes - a.votes);
    const total = candidates.reduce((s, c) => s + c.votes, 0);
    result[district] = candidates.map((c) => ({
      candidate: c.candidate,
      party: c.party,
      votes: c.votes,
      pct: total > 0 ? Math.round((c.votes / total) * 1000) / 10 : null,
    }));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Year-specific fetchers
// ---------------------------------------------------------------------------

async function fetchYear2024or2020(year) {
  const url = STATEWIDE_SOURCES[year];
  console.log(`[${year}] Downloading statewide precinct CSV...`);
  const csvText = await fetchText(url);
  const mb = (csvText.length / 1_048_576).toFixed(1);
  console.log(`[${year}] ${mb} MB downloaded — aggregating State House rows...`);
  const tally = aggregateStatewideCSV(csvText);
  const districts = tallyToDistricts(tally);
  const districtCount = Object.keys(districts).length;
  const candidateCount = Object.values(districts).reduce((s, arr) => s + arr.length, 0);
  console.log(`[${year}] Done — ${districtCount} districts, ${candidateCount} total candidates.`);
  return districts;
}

async function fetchYear2022() {
  console.log('[2022] Fetching county file list from GitHub API...');
  const items = await fetchJson(GITHUB_2022_COUNTIES_API);
  const countyFiles = items
    .filter((f) => f.type === 'file' && f.name.endsWith('.csv') &&
                   f.name.includes('precinct') && f.name.includes('general'))
    .map((f) => f.name);

  console.log(`[2022] Found ${countyFiles.length} county precinct files — downloading...`);

  const tally = new Map();
  let fetched = 0;

  for (const filename of countyFiles) {
    const county = filename.replace(/^.*__general__/, '').replace(/__precinct\.csv$/, '');
    process.stdout.write(`[2022] Fetching ${county} (${++fetched}/${countyFiles.length})...\r`);

    const url = RAW_2022_BASE + filename;
    try {
      const csvText = await fetchText(url);
      aggregate2022CSV(csvText, tally);
    } catch (err) {
      process.stderr.write(`\n[2022] WARN: Failed to fetch ${filename}: ${err.message}\n`);
    }

    if (fetched < countyFiles.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  process.stdout.write('\n'); // clear progress line

  const districts = tallyToDistricts(tally);
  const districtCount = Object.keys(districts).length;
  const candidateCount = Object.values(districts).reduce((s, arr) => s + arr.length, 0);
  console.log(`[2022] Done — ${districtCount} districts, ${candidateCount} total candidates across ${fetched} county files.`);
  return districts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('PA House Candidate Results ETL\n');

  // Fetch all three years (sequentially to avoid hammering GitHub)
  const results2024 = await fetchYear2024or2020(2024);
  const results2022 = await fetchYear2022();
  const results2020 = await fetchYear2024or2020(2020);

  // Merge into unified district map
  const allDistricts = new Set([
    ...Object.keys(results2024),
    ...Object.keys(results2022),
    ...Object.keys(results2020),
  ]);

  const districts = {};
  for (const d of [...allDistricts].sort()) {
    districts[d] = {};
    if (results2024[d]) districts[d]['2024'] = results2024[d];
    if (results2022[d]) districts[d]['2022'] = results2022[d];
    if (results2020[d]) districts[d]['2020'] = results2020[d];
  }

  const output = {
    generated_at: new Date().toISOString(),
    description: 'PA House general election results by district and candidate, aggregated from precinct-level data.',
    sources: {
      2024: 'https://github.com/openelections/openelections-data-pa/blob/master/2024/20241105__pa__general__precinct.csv',
      2022: 'https://github.com/openelections/openelections-data-pa/tree/master/2022/counties',
      2020: 'https://github.com/openelections/openelections-data-pa/blob/master/2020/20201103__pa__general__precinct.csv',
    },
    districts,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log('\n--- Summary ---');
  console.log(`Total districts in output: ${Object.keys(districts).length}`);
  console.log(`  2024: ${Object.keys(results2024).length} districts`);
  console.log(`  2022: ${Object.keys(results2022).length} districts`);
  console.log(`  2020: ${Object.keys(results2020).length} districts`);
  console.log(`Output written to: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('\nETL failed:', err.message || err);
  process.exit(1);
});
