/**
 * Fetch Official Press Releases Job
 *
 * Scrapes official press release pages for all 209 PA House members from:
 *   - pahouse.com (Democratic caucus) — uses Wayback Machine to get release IDs
 *     then fetches live individual pages (which ARE server-rendered)
 *   - pahousegop.com (Republican caucus) — same approach
 *
 * No auth required. Stores as evidence_type='press_release'.
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

const DELAY_MS = 400;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function contentHash(text) {
  return crypto.createHash('sha256').update(text.slice(0, 500)).digest('hex').slice(0, 32);
}

// Strip HTML tags and collapse whitespace
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
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get cached press release IDs from the Wayback Machine
async function getPressReleaseIds(lastName, site) {
  const pageUrl = `https://www.${site}/`
    + (site === 'pahouse.com' ? `${lastName}/InTheNews/NewsRelease` : `Members/${lastName}/News/PressReleases`);

  // Ask Wayback Machine for most recent snapshot
  let snapshotUrl;
  try {
    const { data } = await axios.get(
      `https://archive.org/wayback/available?url=${encodeURIComponent(pageUrl)}`,
      { timeout: 8000 }
    );
    snapshotUrl = data?.archived_snapshots?.closest?.url;
  } catch {
    return [];
  }

  if (!snapshotUrl) return [];

  // Fetch the cached snapshot
  let html;
  try {
    const { data } = await axios.get(snapshotUrl, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
    });
    html = data;
  } catch {
    return [];
  }

  // Extract press release IDs from links like /InTheNews/NewsRelease/?id=12345
  const ids = [];
  const re = /InTheNews\/NewsRelease\/\?id=(\d+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }

  // Also handle pahousegop.com links like /Members/Grove/News/PressReleases/12345
  const re2 = /PressReleases\/(\d+)/gi;
  while ((m = re2.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }

  return ids;
}

// Fetch the full text of a single press release
async function fetchPressRelease(lastName, id, site) {
  let url;
  if (site === 'pahouse.com') {
    url = `https://www.pahouse.com/${lastName}/InTheNews/NewsRelease/?id=${id}`;
  } else {
    url = `https://www.pahousegop.com/Members/${lastName}/News/PressReleases/${id}`;
  }

  let html;
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA, Referer: `https://www.${site}/` },
      timeout: 12000,
    });
    html = data;
  } catch {
    return null;
  }

  // Extract title from <title> tag (strip site name)
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].replace(/\s*[-|]\s*(Pennsylvania House.*|Rep\..*)/i, '').trim() : '';

  // Extract date — try common formats
  const dateMatch = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}/i);
  let releaseDate = null;
  if (dateMatch) {
    const d = new Date(dateMatch[0]);
    if (!isNaN(d)) releaseDate = d.toISOString().split('T')[0];
  }

  // Get the meaningful body text — everything after the title/nav area
  const text = stripHtml(html);

  // Find where the actual press release content starts (after nav boilerplate)
  let startIdx = rawTitle ? text.indexOf(rawTitle) : -1;
  if (startIdx === -1) startIdx = 0;
  const bodyText = text.slice(startIdx).slice(0, 6000).trim();

  if (bodyText.length < 100) return null;

  return {
    url,
    title: rawTitle,
    date: releaseDate,
    text: bodyText,
  };
}

async function run() {
  console.log('=== PA House Press Release Scraper ===');

  const { data: politicians } = await supabase
    .from('politicians')
    .select('id, full_name, last_name, party')
    .eq('is_active', true)
    .order('last_name');

  if (!politicians?.length) {
    console.error('No politicians found');
    return;
  }

  console.log(`${politicians.length} members loaded\n`);

  // Get existing press release URLs to skip duplicates
  const { data: existing } = await supabase
    .from('evidence_items')
    .select('source_url')
    .eq('evidence_type', 'press_release')
    .not('source_url', 'is', null);

  const existingUrls = new Set((existing ?? []).map((e) => e.source_url));
  console.log(`${existingUrls.size} press releases already in DB\n`);

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const politician of politicians) {
    const lastName = politician.last_name
      .replace(/[^A-Za-z]/g, '') // strip punctuation
      .toLowerCase();

    const site = politician.party === 'R' ? 'pahousegop.com' : 'pahouse.com';

    process.stdout.write(`  ${politician.full_name} (${site})... `);

    const ids = await getPressReleaseIds(lastName, site);
    await delay(DELAY_MS);

    if (ids.length === 0) {
      console.log('no cached listing found');
      continue;
    }

    let memberInserted = 0;
    for (const id of ids.slice(0, 30)) { // cap at 30 per member per run
      const expectedUrl = site === 'pahouse.com'
        ? `https://www.pahouse.com/${lastName}/InTheNews/NewsRelease/?id=${id}`
        : `https://www.pahousegop.com/Members/${lastName}/News/PressReleases/${id}`;

      if (existingUrls.has(expectedUrl)) {
        totalSkipped++;
        continue;
      }

      const release = await fetchPressRelease(lastName, id, site);
      await delay(DELAY_MS);

      if (!release) continue;

      const hash = contentHash(release.text);
      const item = {
        politician_id: politician.id,
        evidence_type: 'press_release',
        source_url: release.url,
        source_text: release.title
          ? `${release.title}\n\n${release.text}`
          : release.text,
        publication_date: release.date,
        keyword_filter_passed: true,
        content_hash: hash,
      };

      const { error } = await supabase
        .from('evidence_items')
        .upsert(item, { onConflict: 'content_hash', ignoreDuplicates: true });

      if (!error) {
        memberInserted++;
        totalInserted++;
        existingUrls.add(release.url);
      }
    }

    console.log(`${ids.length} releases found, +${memberInserted} inserted`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`New press releases inserted: ${totalInserted}`);
  console.log(`Already in DB (skipped):     ${totalSkipped}`);
  console.log(`\nNext: run analyze-statements.js to score these`);
}

run().catch(console.error);
