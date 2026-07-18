/**
 * Fetch Official Press Releases Job
 *
 * Scrapes official press release pages for PA House members from:
 *   - pahouse.com (Democratic caucus) — uses Wayback Machine to get release IDs,
 *     then fetches individual pages via Wayback raw snapshots (id_ mode).
 *     The live site is currently unreachable (connections time out), so both
 *     listing and content come from web.archive.org.
 *   - Republican members are skipped: pahousegop.com has no per-member news
 *     pages in Wayback — fetch-gop-press-releases.js covers the GOP caucus.
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

const DELAY_MS = 1000;
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
    return { ids: [], snapshotTs: null };
  }

  if (!snapshotUrl) return { ids: [], snapshotTs: null };

  const snapshotTs = (snapshotUrl.match(/\/web\/(\d{14})/) || [])[1] || null;

  // Fetch the cached snapshot
  let html;
  try {
    const { data } = await axios.get(snapshotUrl, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
    });
    html = data;
  } catch {
    return { ids: [], snapshotTs: null };
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

  return { ids, snapshotTs };
}

// Fetch the full text of a single press release via Wayback raw snapshot
// (live site is unreachable; id_ mode returns original page bytes, and
// Wayback redirects to the capture nearest to snapshotTs)
async function fetchPressRelease(lastName, id, site, snapshotTs) {
  let url;
  if (site === 'pahouse.com') {
    url = `https://www.pahouse.com/${lastName}/InTheNews/NewsRelease/?id=${id}`;
  } else {
    url = `https://www.pahousegop.com/Members/${lastName}/News/PressReleases/${id}`;
  }

  let html;
  try {
    const { data } = await axios.get(`https://web.archive.org/web/${snapshotTs}id_/${url}`, {
      headers: { 'User-Agent': UA },
      timeout: 20000,
    });
    html = data;
  } catch {
    return null;
  }

  // Extract title from <title> tag (strip site name)
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].replace(/\s*[-|]\s*(Pennsylvania House.*|Rep\..*)/i, '').trim() : '';

  // Extract date — try common formats (full and abbreviated month names)
  const dateMatch = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+20\d{2}/i);
  let releaseDate = null;
  if (dateMatch) {
    const d = new Date(dateMatch[0].replace('.', ''));
    if (!isNaN(d)) releaseDate = d.toISOString().split('T')[0];
  }
  // source_date is NOT NULL in evidence_items — fall back to the capture date
  if (!releaseDate && snapshotTs) {
    releaseDate = `${snapshotTs.slice(0, 4)}-${snapshotTs.slice(4, 6)}-${snapshotTs.slice(6, 8)}`;
  }
  if (!releaseDate) return null;

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
    // GOP members have no per-member news pages in Wayback —
    // fetch-gop-press-releases.js covers them from the caucus newsroom
    if (politician.party === 'R') continue;

    const lastName = (politician.last_name || '')
      .replace(/[^A-Za-z]/g, '') // strip punctuation
      .toLowerCase();
    if (!lastName) continue;

    const site = 'pahouse.com';

    process.stdout.write(`  ${politician.full_name} (${site})... `);

    const { ids, snapshotTs } = await getPressReleaseIds(lastName, site);
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

      const release = await fetchPressRelease(lastName, id, site, snapshotTs);
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
        source_date: release.date,
        // keyword_filter_passed left NULL so the LLM pipeline picks these up
        content_hash: hash,
      };

      const { error } = await supabase
        .from('evidence_items')
        .upsert(item, { onConflict: 'content_hash', ignoreDuplicates: true });

      if (error) {
        console.error(`\n    upsert error (${release.url}): ${error.message}`);
      } else {
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
