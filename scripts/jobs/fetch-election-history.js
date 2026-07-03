/**
 * PA House Historical Election Results ETL
 * Downloads statewide precinct-level general election results from
 * openelections-data-pa (GitHub) for 2024, 2020, and 2018, aggregates "State House"
 * rows up to the district level, and writes a static JSON file consumed by the map's
 * year-toggle feature. Static JSON (not a DB table) on purpose — this is reference
 * data that doesn't change per-request and ships fine as a build asset, same pattern
 * as the district boundary geojson already in public/data/.
 *
 * 2022 is intentionally skipped: openelections-data-pa only has 24 of PA's 67
 * counties for that cycle (no statewide file), which would silently under-report
 * results for most districts — worse than just not showing that year.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const SOURCES = {
  2024: 'https://raw.githubusercontent.com/openelections/openelections-data-pa/master/2024/20241105__pa__general__precinct.csv',
  2020: 'https://raw.githubusercontent.com/openelections/openelections-data-pa/master/2020/20201103__pa__general__precinct.csv',
  2018: 'https://raw.githubusercontent.com/openelections/openelections-data-pa/master/2018/20181106__pa__general__precinct.csv',
};

const SOURCE_HTML_URLS = {
  2024: 'https://github.com/openelections/openelections-data-pa/blob/master/2024/20241105__pa__general__precinct.csv',
  2020: 'https://github.com/openelections/openelections-data-pa/blob/master/2020/20201103__pa__general__precinct.csv',
  2018: 'https://github.com/openelections/openelections-data-pa/blob/master/2018/20181106__pa__general__precinct.csv',
};

const OUTPUT_PATH = path.join(__dirname, '../../public/data/pa-house-election-history.json');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** Minimal RFC4180 CSV line splitter — handles quoted fields with embedded commas. */
function splitCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
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
  const p = (raw || '').trim().toLowerCase();
  if (p.startsWith('dem')) return 'D';
  if (p.startsWith('rep')) return 'R';
  return 'O';
}

/** Aggregate "State House" rows from a raw CSV string up to {district: {dem,rep,other}}. */
function aggregateStateHouse(csvText) {
  const lines = csvText.split('\n');
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const officeIdx = header.indexOf('office');
  const districtIdx = header.indexOf('district');
  const partyIdx = header.indexOf('party');
  const votesIdx = header.indexOf('votes');

  const byDistrict = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.includes('State House')) continue; // cheap pre-filter before full parse
    const fields = splitCsvLine(line);
    if (fields[officeIdx] !== 'State House') continue;

    const districtRaw = fields[districtIdx]?.trim();
    if (!districtRaw) continue;
    // Some county files render this as "9TH"/"13TH" instead of a bare number — extract digits.
    const digitMatch = /^(\d+)/.exec(districtRaw);
    if (!digitMatch) continue;
    const district = digitMatch[1].padStart(3, '0');
    if (Number(district) < 1 || Number(district) > 203) continue;
    const votes = Number.parseInt(fields[votesIdx], 10);
    if (Number.isNaN(votes)) continue;
    const party = normalizeParty(fields[partyIdx]);

    const rec = byDistrict.get(district) ?? { dem_votes: 0, rep_votes: 0, other_votes: 0 };
    if (party === 'D') rec.dem_votes += votes;
    else if (party === 'R') rec.rep_votes += votes;
    else rec.other_votes += votes;
    byDistrict.set(district, rec);
  }

  const result = {};
  for (const [district, rec] of byDistrict) {
    const total = rec.dem_votes + rec.rep_votes + rec.other_votes;
    let winner_party = null;
    if (rec.dem_votes > rec.rep_votes && rec.dem_votes > rec.other_votes) winner_party = 'D';
    else if (rec.rep_votes > rec.dem_votes && rec.rep_votes > rec.other_votes) winner_party = 'R';
    const margin_pct = total > 0 ? Math.round((Math.abs(rec.dem_votes - rec.rep_votes) / total) * 1000) / 10 : null;
    result[district] = { ...rec, total_votes: total, winner_party, margin_pct };
  }
  return result;
}

async function main() {
  const districts = {};
  const sourcesUsed = {};

  for (const [year, url] of Object.entries(SOURCES)) {
    console.log(`Downloading ${year} statewide precinct results...`);
    const csvText = await download(url);
    console.log(`  ${(csvText.length / 1_000_000).toFixed(1)}MB downloaded, aggregating State House rows...`);
    const byDistrict = aggregateStateHouse(csvText);
    const districtCount = Object.keys(byDistrict).length;
    console.log(`  Found State House results for ${districtCount} districts in ${year}.`);

    for (const [district, rec] of Object.entries(byDistrict)) {
      districts[district] = districts[district] || {};
      districts[district][year] = rec;
    }
    sourcesUsed[year] = SOURCE_HTML_URLS[year];
  }

  const output = {
    generated_at: new Date().toISOString(),
    description: 'PA House general election results by district, aggregated from precinct-level data.',
    sources: sourcesUsed,
    districts,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${Object.keys(districts).length} districts' worth of history to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('ETL failed:', err.message || err);
  process.exit(1);
});
