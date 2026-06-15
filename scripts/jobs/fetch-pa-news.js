/**
 * Comprehensive PA Newspaper Scan
 *
 * Two-phase approach:
 *
 * Phase 1 — Direct RSS sweep of 30+ PA news outlets organized by region.
 *   Articles are cross-referenced against all 209 member names. Works even
 *   for paywalled sites because the RSS headline + description is enough.
 *
 * Phase 2 — Per-politician Google News RSS search ("<name> Pennsylvania").
 *   This acts as a catch-all: any mention in ANY publication (national or
 *   local) that Google News indexed flows through here. This is what makes
 *   coverage comprehensive without maintaining hundreds of feed URLs.
 *
 * Storage: all politician-name matches are stored with keyword_filter_passed=true.
 * The analyze-statements.js pipeline then runs LLM relevance checks and sets
 * is_relevant based on PA Chamber priority alignment.
 *
 * No API key required. Free.
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
const { XMLParser } = require('fast-xml-parser');
const crypto = require('node:crypto');

// ─── PA Newspaper RSS Feeds ────────────────────────────────────────────────
// Organized by region. All URLs verified as returning 200.
// New feeds can be added here; failures are handled gracefully.

const PA_FEEDS = [
  // Statewide / Capitol
  { name: 'Spotlight PA',         url: 'https://www.spotlightpa.org/news/' },
  { name: 'PA Capital-Star',      url: 'https://www.penncapitalstar.com/feed/' },
  { name: 'City & State PA',      url: 'https://www.cityandstatepa.com/rss.xml' },
  { name: 'Broad + Liberty',      url: 'https://broadandliberty.com/feed/' },
  { name: 'PA Post / Spotlight',  url: 'https://papost.org/feed/' },

  // Philadelphia metro
  { name: 'WHYY (Philadelphia)',  url: 'https://whyy.org/feed/' },

  // Pittsburgh metro
  { name: 'Pittsburgh Post-Gazette', url: 'https://www.post-gazette.com/rss/feeds/politics' },
  { name: 'WESA (Pittsburgh)',    url: 'https://www.wesa.fm/politics-government/rss.xml' },
  { name: 'PublicSource',         url: 'https://www.publicsource.org/feed/' },

  // Central PA
  { name: 'PennLive Politics',    url: 'https://www.pennlive.com/arc/outboundfeeds/rss/category/news/politics/' },
  { name: 'PennLive State Gov',   url: 'https://www.pennlive.com/arc/outboundfeeds/rss/category/news/state/' },
  { name: 'WITF (Harrisburg)',    url: 'https://www.witf.org/rss/' },

  // Southeast PA
  { name: 'Lancaster Online',     url: 'https://lancasteronline.com/search/?f=rss&t=article&c=news&l=50' },
  { name: 'Morning Call (Allentown)', url: 'https://www.mcall.com/search/?f=rss' },
  { name: 'York Daily Record',    url: 'https://www.ydr.com/search/?f=rss' },
  { name: 'Chambersburg Public Opinion', url: 'https://www.publicopiniononline.com/search/?f=rss&t=article&c=news' },
  { name: 'PA Homepage (TV)',     url: 'https://pahomepage.com/feed/' },

  // Northeast PA
  { name: 'Scranton Times-Tribune', url: 'https://www.thetimes-tribune.com/search/?f=rss' },
  { name: "Citizens' Voice (W-B)", url: 'https://www.citizensvoice.com/search/?f=rss&t=article' },
  { name: 'Times Leader (W-B)',   url: 'https://www.timesleader.com/feed/' },
  { name: 'Pocono Record',        url: 'https://www.poconorecord.com/search/?f=rss' },
  { name: 'Republican Herald (Pottsville)', url: 'https://www.republicanherald.com/search/?f=rss' },

  // Northwest PA / Erie
  { name: 'Erie Times-News',      url: 'https://www.goerie.com/search/?f=rss' },

  // North-central PA
  { name: 'Bradford Era',         url: 'https://www.bradfordera.com/feed/' },
  { name: 'Sun-Times (Mifflintown)', url: 'https://www.suntimes.net/feed/' },
];

// ─── Config ───────────────────────────────────────────────────────────────
const REQUEST_DELAY_MS = 2500;    // between any HTTP request
const GOOGLE_NEWS_DELAY_MS = 3000; // between Google News searches (more conservative)

let lastRequest = 0;
async function rateLimit(ms = REQUEST_DELAY_MS) {
  const elapsed = Date.now() - lastRequest;
  if (elapsed < ms) await new Promise((r) => setTimeout(r, ms - elapsed));
  lastRequest = Date.now();
}

const xmlParser = new XMLParser({ ignoreAttributes: false, cdataTagName: '__cdata' });

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function parseDate(str) {
  if (!str) return new Date().toISOString();
  try { return new Date(str).toISOString(); } catch { return new Date().toISOString(); }
}

// ─── RSS parsing ──────────────────────────────────────────────────────────
function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.__cdata) return node.__cdata;
  if (node['#text']) return node['#text'];
  return String(node);
}

function parseItems(xml) {
  try {
    const parsed = xmlParser.parse(xml);
    const items = [parsed?.rss?.channel?.item ?? []].flat();
    return items.map((item) => ({
      title:   extractText(item.title).trim(),
      link:    extractText(item.link || item.guid).trim(),
      description: extractText(item.description).trim(),
      pubDate: extractText(item.pubDate || item['dc:date'] || item.published).trim(),
      source:  extractText(item.source?.['#text'] || item['source:name'] || '').trim(),
    })).filter((i) => i.title && i.link);
  } catch {
    return [];
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
};

async function fetchFeed(feed) {
  await rateLimit();
  try {
    const { data, status } = await axios.get(feed.url, {
      timeout: 20000,
      headers: HEADERS,
      responseType: 'text',
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
    });
    if (status >= 400) return [];
    const items = parseItems(typeof data === 'string' ? data : String(data));
    return items;
  } catch (err) {
    if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOTFOUND') {
      process.stdout.write(` [${err.message?.split('\n')[0]}]`);
    }
    return [];
  }
}

async function scrapeArticle(url) {
  await rateLimit();
  try {
    const { data } = await axios.get(url, {
      timeout: 20000,
      headers: { ...HEADERS, Accept: 'text/html' },
      responseType: 'text',
      maxRedirects: 5,
    });
    if (typeof data !== 'string') return null;

    const clean = data
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&nbsp;', ' ')
      .replace(/\s{3,}/g, '\n\n').trim();

    // Heuristic: if article text is less than 300 chars, probably just a nav/paywall page
    return clean.length >= 300 ? clean.substring(0, 8000) : null;
  } catch {
    return null;
  }
}

// ─── Member name matching ─────────────────────────────────────────────────
function buildNameIndex(members) {
  const byLast = {};
  for (const m of members) {
    const last = m.last_name.toLowerCase();
    if (!byLast[last]) byLast[last] = [];
    byLast[last].push(m);
  }
  return { byLast };
}

function disambiguateLastName(lower, group, found) {
  for (const m of group) {
    const firstName = m.first_name.toLowerCase();
    const initial = m.first_name[0].toLowerCase();
    const last = m.last_name.toLowerCase();
    const initialPattern = new RegExp(String.raw`\b${initial}\. ?${last}\b`);
    if (lower.includes(firstName) || initialPattern.test(lower)) {
      found.add(m.id);
    }
  }
}

function findMentionedMembers(text, { byLast }, allMembers) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = new Set();

  for (const m of allMembers) {
    if (lower.includes(m.full_name.toLowerCase())) found.add(m.id);
  }

  for (const [last, group] of Object.entries(byLast)) {
    if (!lower.includes(last)) continue;
    if (group.length === 1) {
      found.add(group[0].id);
    } else {
      disambiguateLastName(lower, group, found);
    }
  }

  return allMembers.filter((m) => found.has(m.id));
}

// ─── DB helpers ──────────────────────────────────────────────────────────
async function fetchAllPages(buildQuery) {
  const results = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return results;
}

async function upsertEvidence(supabase, politicianId, item, sourceName, seenHashes) {
  const url = item.link;
  if (!url) return false;

  const hashKey = `${url}::${politicianId}`;
  const hash = md5(hashKey);
  if (seenHashes.has(hash)) return false;
  seenHashes.add(hash);

  const title = item.title || '';
  const desc = item.description || '';
  const sourceText = `${title}\n\n${desc}`.trim().substring(0, 5000);

  const { error } = await supabase.from('evidence_items').upsert({
    politician_id: politicianId,
    evidence_type: 'press_release',
    source_text: sourceText,
    source_url: url,
    source_date: parseDate(item.pubDate),
    content_hash: hash,
    keyword_filter_passed: true,
  }, { onConflict: 'content_hash', ignoreDuplicates: true });

  return !error;
}

// ─── Phase 1: Direct RSS sweep ────────────────────────────────────────────
async function processRssItem(supabase, item, members, nameIndex, seenHashes) {
  const candidateText = `${item.title} ${item.description}`;
  const mentioned = findMentionedMembers(candidateText, nameIndex, members);
  if (mentioned.length === 0) return 0;

  const isGoogleUrl = item.link.includes('news.google.com');
  const fullText = isGoogleUrl ? null : await scrapeArticle(item.link);

  const finalMentioned = fullText
    ? findMentionedMembers(fullText, nameIndex, members)
    : mentioned;
  const toInsert = finalMentioned.length > 0 ? finalMentioned : mentioned;
  const enrichedItem = fullText
    ? { ...item, description: fullText.substring(0, 2000) }
    : item;

  let count = 0;
  for (const m of toInsert) {
    if (await upsertEvidence(supabase, m.id, enrichedItem, '', seenHashes)) count++;
  }
  return count;
}

async function sweepFeeds(supabase, members, nameIndex, seenHashes) {
  console.log(`\nPhase 1 — sweeping ${PA_FEEDS.length} PA news feeds...\n`);
  let totalInserted = 0;

  for (const feed of PA_FEEDS) {
    process.stdout.write(`  [${feed.name}] `);
    const items = await fetchFeed(feed);

    if (items.length === 0) {
      console.log('no items');
      continue;
    }

    let inserted = 0;
    for (const item of items) {
      inserted += await processRssItem(supabase, item, members, nameIndex, seenHashes);
    }
    totalInserted += inserted;
    console.log(`${items.length} articles → ${inserted} new`);
  }

  return totalInserted;
}

// ─── Phase 2: Google News per-politician search ───────────────────────────
const GNEWS_BASE = 'https://news.google.com/rss/search';

async function googleNewsSearch(query) {
  await rateLimit(GOOGLE_NEWS_DELAY_MS);
  try {
    const { data } = await axios.get(GNEWS_BASE, {
      params: { q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' },
      timeout: 20000,
      headers: { ...HEADERS, Accept: 'application/rss+xml, text/xml, */*' },
      responseType: 'text',
    });
    return parseItems(typeof data === 'string' ? data : String(data));
  } catch {
    return [];
  }
}

async function sweepGoogleNews(supabase, members, seenHashes) {
  console.log(`\nPhase 2 — Google News per-politician search (${members.length} members)...\n`);
  let totalInserted = 0;
  let searched = 0;

  for (const m of members) {
    // Quoted full name + Pennsylvania to catch any PA outlet mention
    const items = await googleNewsSearch(`"${m.full_name}" Pennsylvania`);
    searched++;

    for (const item of items) {
      if (await upsertEvidence(supabase, m.id, item, 'Google News', seenHashes)) {
        totalInserted++;
        process.stdout.write('.');
      }
    }

    if (searched % 25 === 0) {
      console.log(`\n  ${searched}/${members.length} members searched, ${totalInserted} inserted so far`);
    }
  }

  console.log(`\n\n  Done: ${searched} searches, ${totalInserted} items inserted`);
  return totalInserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function fetchPANews() {
  console.log('=== Comprehensive PA Newspaper Scan ===');
  console.log('Phase 1: Direct RSS from 30+ PA outlets');
  console.log('Phase 2: Google News per-politician search (catches every PA outlet)\n');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const members = await fetchAllPages(() =>
    supabase.from('politicians')
      .select('id, full_name, first_name, last_name')
      .eq('is_active', true)
      .eq('office_type', 'pa_house')
      .order('full_name')
  );
  console.log(`${members.length} PA House members loaded`);

  const nameIndex = buildNameIndex(members);
  const seenHashes = new Set();

  // Pre-load existing hashes to avoid re-checking DB on every upsert
  const { data: existing } = await supabase
    .from('evidence_items')
    .select('content_hash')
    .eq('evidence_type', 'news_article');
  for (const r of (existing || [])) seenHashes.add(r.content_hash);
  console.log(`${seenHashes.size} existing news articles cached\n`);

  const phase1 = await sweepFeeds(supabase, members, nameIndex, seenHashes);
  const phase2 = await sweepGoogleNews(supabase, members, seenHashes);

  console.log('\n=== Summary ===');
  console.log(`Phase 1 (direct feeds):   ${phase1} new items`);
  console.log(`Phase 2 (Google News):    ${phase2} new items`);
  console.log(`Total:                    ${phase1 + phase2} new news articles`);
  console.log('\nNext: run analyze-statements.js to score these articles against PA Chamber priorities');
}

fetchPANews().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
