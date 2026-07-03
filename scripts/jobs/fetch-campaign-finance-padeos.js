/**
 * PA Campaign Finance — Direct from PA Department of State (2026 cycle)
 *
 * Source: campaignfinanceonline.pa.gov "Full Campaign Finance Export" ZIP
 * Covers the current (2026) cycle in real time, updated as reports are filed.
 * FollowTheMoney only publishes completed cycles; for the active cycle use this.
 *
 * Usage:
 *   node scripts/jobs/fetch-campaign-finance-padeos.js            # full load
 *   node scripts/jobs/fetch-campaign-finance-padeos.js --dry-run  # inspect headers only
 *   node scripts/jobs/fetch-campaign-finance-padeos.js --year 2024 # specific cycle
 *
 * Run: node --env-file=.env.local scripts/jobs/fetch-campaign-finance-padeos.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const AdmZip = require('adm-zip');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const EXPORT_URL = 'https://www.campaignfinanceonline.pa.gov/Files/FullCampaignFinanceExport.zip';
const TARGET_YEAR = process.argv.includes('--year')
  ? Number(process.argv[process.argv.indexOf('--year') + 1])
  : 2026;
const DRY_RUN = process.argv.includes('--dry-run');
const INDIVIDUAL_THRESHOLD = 1000; // same as FTM script

const delay = ms => new Promise(r => setTimeout(r, ms));

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z\s,]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeDonorName(name) {
  return (name || '').toLowerCase()
    .replace(/[,.'"]/g, ' ').replace(/-/g, ' ')
    .replace(/\b(inc|llc|llp|corp|co|ltd|pa|the)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

const ANTI_CHAMBER_PATTERNS = [
  /\bunion\b/i, /\bAFL[\s-]?CIO\b/i, /\bSEIU\b/i, /\bUFCW\b/i, /\bIBEW\b/i,
  /\bUAW\b/i, /\bUSW\b/i, /\bteamster/i, /\bamalgamated\b/i,
  /\btrial\s+lawyer/i, /\bsierra\s+club\b/i, /\bafscme\b/i,
];
const PRO_CHAMBER_PATTERNS = [
  /\bchamber\s+of\s+commerce\b/i, /\bNFIB\b/, /\bmanufactur(?:ers|ing)\s+assoc/i,
  /\bBusiness\s+(?:Council|Roundtable|Association|League)\b/i,
  /\bRealtors?\s+Assoc/i, /\bBankers?\s+Assoc/i, /\bHomebuilders?\b/i,
];
function classifyLean(name) {
  for (const re of ANTI_CHAMBER_PATTERNS) if (re.test(name)) return 'anti_chamber';
  for (const re of PRO_CHAMBER_PATTERNS) if (re.test(name)) return 'pro_chamber';
  return 'unknown';
}

const donorOrgCache = new Map();
async function getOrCreateDonorOrg(name) {
  const normalized = normalizeDonorName(name);
  if (donorOrgCache.has(normalized)) return donorOrgCache.get(normalized);

  const { data: existing } = await supabase
    .from('donor_organizations').select('id').eq('normalized_name', normalized).maybeSingle();
  if (existing) { donorOrgCache.set(normalized, existing.id); return existing.id; }

  const lean = classifyLean(name);
  const { data: created } = await supabase
    .from('donor_organizations')
    .insert({ name, normalized_name: normalized, lean, lean_classified_by: 'rule' })
    .select('id').single();
  const id = created?.id ?? null;
  if (id) donorOrgCache.set(normalized, id);
  return id;
}

/** Parse a simple CSV line respecting quoted fields. */
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

async function downloadZip() {
  console.log(`Downloading PA DOS export: ${EXPORT_URL}`);
  const response = await axios.get(EXPORT_URL, {
    responseType: 'arraybuffer',
    timeout: 120000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (response.headers['content-type']?.includes('text/html')) {
    throw new Error('PA DOS site returned HTML instead of ZIP — site may be unavailable. Try again later.');
  }
  return Buffer.from(response.data);
}

async function run() {
  console.log(`=== PA DOS Campaign Finance — ${TARGET_YEAR} cycle ===`);
  if (DRY_RUN) console.log('[DRY RUN — no DB writes]\n');

  // 1. Download ZIP
  let zipBuffer;
  try {
    zipBuffer = await downloadZip();
    console.log(`Downloaded ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    console.error(`\nFailed to download: ${err.message}`);
    console.error('The PA DOS campaign finance site may be temporarily unavailable.');
    console.error('URL: ' + EXPORT_URL);
    process.exit(1);
  }

  // 2. Extract CSV files
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().map(e => e.entryName);
  console.log('ZIP contents:', entries.join(', '));

  // Find contrib and filer CSVs (name varies slightly between exports)
  const contribEntry = zip.getEntries().find(e => /contrib/i.test(e.entryName));
  const filerEntry = zip.getEntries().find(e => /filer/i.test(e.entryName));

  if (!contribEntry) throw new Error('No contributions CSV found in ZIP. Contents: ' + entries.join(', '));
  if (!filerEntry) throw new Error('No filer CSV found in ZIP. Contents: ' + entries.join(', '));

  const contribCsv = parseCsv(contribEntry.getData().toString('utf-8'));
  const filerCsv = parseCsv(filerEntry.getData().toString('utf-8'));

  if (DRY_RUN) {
    console.log('\nContrib CSV columns:', Object.keys(contribCsv[0] ?? {}).join(', '));
    console.log('Filer CSV columns:', Object.keys(filerCsv[0] ?? {}).join(', '));
    console.log(`\nContrib rows: ${contribCsv.length.toLocaleString()}`);
    console.log(`Filer rows: ${filerCsv.length.toLocaleString()}`);
    console.log('\nSample contrib row:', JSON.stringify(contribCsv[0], null, 2));
    console.log('\nSample filer row:', JSON.stringify(filerCsv[0], null, 2));
    return;
  }

  // 3. Build filer map: filerid → filer row (filter to PA House, target year)
  // PA House office code is 'HL' (House Lower); district is in districtoffice or similar field
  const houseFilersById = new Map();
  for (const row of filerCsv) {
    const officeCode = row.officecode ?? row.office_code ?? row.office ?? '';
    const cycleYear = Number(row.eyear ?? row.cycle ?? row.year ?? 0);
    if (!/HL/i.test(officeCode)) continue;
    if (TARGET_YEAR && cycleYear !== TARGET_YEAR) continue;
    const filerId = row.filerid ?? row.filer_id ?? row.id ?? '';
    if (filerId) houseFilersById.set(filerId, row);
  }
  console.log(`\nPA House filers for ${TARGET_YEAR}: ${houseFilersById.size}`);

  if (houseFilersById.size === 0) {
    console.error('No PA House filers found. Check office code field name and value in filer CSV.');
    console.log('Available filer columns:', Object.keys(filerCsv[0] ?? {}).join(', '));
    console.log('Sample officeCode values:', [...new Set(filerCsv.slice(0, 20).map(r => r.officecode ?? r.office_code ?? r.office))].join(', '));
    process.exit(1);
  }

  // 4. Load our politicians for name matching
  const { data: politicians } = await supabase
    .from('politicians').select('id, full_name, first_name, last_name, district, party')
    .eq('is_active', true).eq('office_type', 'pa_house');
  console.log(`${politicians.length} PA House politicians in DB`);

  // Index by district (3-digit zero-padded) for efficient matching
  const politiciansByDistrict = new Map();
  for (const p of politicians) {
    if (!p.district) continue;
    const dist = p.district.padStart(3, '0');
    (politiciansByDistrict.get(dist) ?? politiciansByDistrict.set(dist, []).get(dist)).push(p);
  }

  function matchPoliticianByDistrictAndName(filerRow) {
    // Try district code first — most reliable match
    const distRaw = filerRow.district ?? filerRow.districtoffice ?? filerRow.district_code ?? '';
    const dist = String(distRaw).padStart(3, '0');
    const reps = politiciansByDistrict.get(dist) ?? [];

    if (reps.length === 1) return reps[0]; // only one rep in district — unambiguous

    // Multiple reps (contested) — try name match
    const filerName = normalizeName(filerRow.filername ?? filerRow.filer_name ?? '');
    for (const p of reps) {
      if (normalizeName(p.full_name) === filerName) return p;
      // Last name match
      if (filerName.includes(normalizeName(p.last_name))) return p;
    }
    return reps[0] ?? null; // fallback to first rep in district
  }

  // 5. Process contributions
  let inserted = 0, skipped = 0, errors = 0;

  const contribsForYear = contribCsv.filter(r => {
    const yr = Number(r.eyear ?? r.cycle ?? r.year ?? 0);
    return yr === TARGET_YEAR;
  });
  console.log(`Contributions for ${TARGET_YEAR}: ${contribsForYear.length.toLocaleString()}`);

  for (const row of contribsForYear) {
    const filerId = row.filerid ?? row.filer_id ?? '';
    if (!houseFilersById.has(filerId)) continue;

    const filerRow = houseFilersById.get(filerId);
    const politician = matchPoliticianByDistrictAndName(filerRow);
    if (!politician) { skipped++; continue; }

    const amtStr = row.contamt1 ?? row.contamt ?? row.amount ?? row.contrib_amt ?? '0';
    const amount = parseFloat(String(amtStr).replace(/[$,]/g, '')) || 0;
    if (amount <= 0) { skipped++; continue; }

    const contribType = (row.conttype ?? row.contrib_type ?? row.section ?? '').toUpperCase();
    const isIndividual = /^IND/.test(contribType) || /^INDIVIDUAL/.test(contribType);
    if (isIndividual && amount < INDIVIDUAL_THRESHOLD) { skipped++; continue; }

    const donorName = (row.contrib ?? row.contribname ?? row.contrib_name ?? row.name ?? '').trim();
    if (!donorName) { skipped++; continue; }

    let donorType = 'organization';
    if (isIndividual) donorType = 'individual';
    else if (/PARTY|PTY/i.test(contribType)) donorType = 'party';
    else if (/COMM|CMTE|PAC|CTR/i.test(contribType)) donorType = 'pac';

    const contribDate = row.contdate1 ?? row.contdate ?? row.contrib_date ?? null;
    const sourceId = `pados-${filerId}-${donorName}-${contribDate ?? ''}-${amount}`.replace(/\s+/g, '_');

    let donorOrgId = null;
    if (!isIndividual) {
      donorOrgId = await getOrCreateDonorOrg(donorName);
      await delay(20); // light throttle on org upserts
    }

    const { error } = await supabase
      .from('campaign_contributions')
      .upsert({
        politician_id: politician.id,
        donor_org_id: donorOrgId,
        donor_name: donorName,
        donor_type: donorType,
        amount,
        contribution_date: contribDate || null,
        cycle_year: TARGET_YEAR,
        followthemoney_id: sourceId,
        source: 'pa_dos',
      }, { onConflict: 'followthemoney_id', ignoreDuplicates: true });

    if (error && !error.message?.includes('duplicate')) { errors++; }
    else inserted++;

    if (inserted % 500 === 0) console.log(`  ${inserted} contributions inserted...`);
  }

  console.log('\n=== Summary ===');
  console.log(`Inserted: ${inserted.toLocaleString()}`);
  console.log(`Skipped:  ${skipped.toLocaleString()}`);
  console.log(`Errors:   ${errors}`);
  console.log(`\nSource: ${EXPORT_URL}`);
}

run().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
