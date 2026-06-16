/**
 * Fetch PA House GOP Press Releases
 *
 * Strategy:
 * 1. CDX API → all Wayback Machine snapshots of pahousegop.com/NewsGroup/Latest-News
 * 2. Each snapshot contains ~10-20 press release URLs (full URLs with slugs)
 * 3. Fetch each live press release page (server-rendered, directly accessible)
 * 4. Extract sponsoring member name, store as press_release evidence
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
const crypto = require('node:crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const delay = ms => new Promise(r => setTimeout(r, ms));

function contentHash(text) {
  return crypto.createHash('sha256').update(text.slice(0, 500)).digest('hex').slice(0, 32);
}

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&rsquo;/gi, '’')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a name index for GOP members: lowercase last name → politician
function buildNameIndex(politicians) {
  const index = new Map();
  for (const p of politicians) {
    const ln = (p.last_name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!index.has(ln)) index.set(ln, []);
    index.get(ln).push(p);
  }
  return index;
}

// Extract primary member's last name from the contact block:
//   "Representative Doyle Heffley 122nd District Pennsylvania House"
//   "Representative Jamie Walsh 117th Legislative District Pennsylvania House"
//   "Representative Thomas L. Mehaffie III Pennsylvania House"
function extractMemberLastName(text) {
  const blockStart = text.indexOf(' Pennsylvania House', text.indexOf('Representative'));
  if (blockStart > 0) {
    // Grab text between "Representative" and " Pennsylvania House"
    const repIdx = text.lastIndexOf('Representative', blockStart);
    const between = text.slice(repIdx + 'Representative'.length, blockStart).trim();
    // Strip trailing district info like "122nd District" or "117th Legislative District"
    const stripped = between.replace(/\s+\d+\w*(?:\s+\w+)?\s+District\s*$/, '').trim();
    const parts = stripped.split(/\s+/);
    const suffixes = new Set(['II', 'III', 'IV', 'Jr.', 'Sr.', 'Jr', 'Sr']);
    const filtered = parts.filter(p => !suffixes.has(p) && !/^\w\.$/.test(p));
    const last = (filtered[filtered.length - 1] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (last.length > 2) return last;
  }

  // Fallback: "Rep. Lastname" in body text
  const bodyMatch = text.match(/\bRep\.\s+([A-Z][a-z]{2,})\b/);
  if (bodyMatch) return bodyMatch[1].toLowerCase();

  return null;
}

// Get all Wayback Machine snapshots of the GOP newsroom listing
async function getAllSnapshots() {
  try {
    const { data } = await axios.get(
      'https://web.archive.org/cdx/search/cdx?url=pahousegop.com/NewsGroup/Latest-News&output=text&fl=timestamp&limit=100&from=20240101&to=20261231',
      { timeout: 30000, headers: { 'User-Agent': UA } }
    );
    return (data || '')
      .split('\n')
      .map(ts => ts.trim())
      .filter(ts => ts.length === 14);
  } catch (err) {
    console.error('CDX error:', err.message);
    return [];
  }
}

// Fetch a Wayback snapshot and extract press release full URLs
async function extractUrlsFromSnapshot(timestamp) {
  const snapshotUrl = `https://web.archive.org/web/${timestamp}/https://www.pahousegop.com/NewsGroup/Latest-News`;
  try {
    const { data } = await axios.get(snapshotUrl, {
      headers: { 'User-Agent': UA },
      timeout: 20000,
    });
    // Extract all /News/{id}/Press-Releases/{slug} paths
    const urls = new Set();
    const re = /\/News\/(\d+)\/Press-Releases\/([A-Za-z0-9-]+)/g;
    let m;
    while ((m = re.exec(data)) !== null) {
      urls.add(`https://www.pahousegop.com/News/${m[1]}/Press-Releases/${m[2]}`);
    }
    return [...urls];
  } catch {
    return [];
  }
}

// Fetch a single press release and extract text + member name
async function fetchPressRelease(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA, Referer: 'https://www.pahousegop.com/NewsGroup/Latest-News' },
      timeout: 12000,
    });

    const text = stripHtml(data);
    if (text.length < 400) return null;

    // Check it's actually a press release page
    if (!text.includes('Pennsylvania House')) return null;

    const titleMatch = data.match(/<h1>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    const dateMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}/i);
    let releaseDate = null;
    if (dateMatch) {
      const d = new Date(dateMatch[0]);
      if (!Number.isNaN(d.getTime())) releaseDate = d.toISOString().split('T')[0];
    }

    return { title, date: releaseDate, text };
  } catch {
    return null;
  }
}

async function collectUrls() {
  console.log('Fetching Wayback Machine snapshots of GOP newsroom...');
  const timestamps = await getAllSnapshots();
  console.log(`Found ${timestamps.length} snapshots\n`);

  const allPrUrls = new Set();
  for (const ts of timestamps) {
    process.stdout.write(`  Snapshot ${ts}... `);
    const urls = await extractUrlsFromSnapshot(ts);
    let newCount = 0;
    for (const u of urls) {
      if (!allPrUrls.has(u)) { allPrUrls.add(u); newCount++; }
    }
    console.log(`${urls.length} URLs (${newCount} new)`);
    await delay(800);
  }
  console.log(`\nTotal unique press release URLs: ${allPrUrls.size}`);
  return allPrUrls;
}

async function storeRelease(url, release, nameIndex, existingUrls) {
  const lastName = extractMemberLastName(release.text);
  const matches = lastName ? (nameIndex.get(lastName) || []) : [];
  if (matches.length === 0) return 'nomatch';

  const politician = matches[0];
  const bodyText = release.text.slice(0, 6000);
  const hash = contentHash(bodyText);

  const item = {
    politician_id: politician.id,
    evidence_type: 'press_release',
    source_url: url,
    source_text: release.title ? `${release.title}\n\n${bodyText}` : bodyText,
    publication_date: release.date,
    keyword_filter_passed: true,
    content_hash: hash,
  };

  const { error } = await supabase
    .from('evidence_items')
    .upsert(item, { onConflict: 'content_hash', ignoreDuplicates: true });

  if (!error) {
    existingUrls.add(url);
    console.log(`\n  + ${politician.full_name}: ${(release.title || '').slice(0, 60)}`);
    return 'inserted';
  }
  return 'error';
}

async function run() {
  console.log('=== PA House GOP Press Release Scraper ===');

  const { data: politicians } = await supabase
    .from('politicians')
    .select('id, full_name, last_name, party')
    .eq('is_active', true)
    .eq('party', 'R');

  if (!politicians?.length) { console.error('No GOP politicians found'); return; }
  console.log(`${politicians.length} GOP members loaded`);

  const nameIndex = buildNameIndex(politicians);

  const { data: existing } = await supabase
    .from('evidence_items')
    .select('source_url')
    .eq('evidence_type', 'press_release')
    .like('source_url', '%pahousegop%');

  const existingUrls = new Set((existing || []).map(e => e.source_url));
  console.log(`${existingUrls.size} GOP press releases already in DB\n`);

  const allPrUrls = await collectUrls();

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  let noMember = 0;

  for (const url of allPrUrls) {
    if (existingUrls.has(url)) { skipped++; continue; }

    const release = await fetchPressRelease(url);
    await delay(400);

    if (!release) { failed++; process.stdout.write('x'); continue; }

    const result = await storeRelease(url, release, nameIndex, existingUrls);
    if (result === 'inserted') inserted++;
    else if (result === 'nomatch') { noMember++; process.stdout.write('?'); }
  }

  console.log('\n\n=== Summary ===');
  console.log(`Press releases found:     ${allPrUrls.size}`);
  console.log(`Inserted:                 ${inserted}`);
  console.log(`Already in DB (skipped):  ${skipped}`);
  console.log(`Fetch failed:             ${failed}`);
  console.log(`No member match:          ${noMember}`);
}

run().catch(console.error);
