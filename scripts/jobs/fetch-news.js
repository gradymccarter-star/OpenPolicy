/**
 * Fetch News Job
 * Searches Google News RSS for PA Chamber business-relevant news articles
 * mentioning PA House members. No API key required.
 *
 * Inserts found articles as 'press_release' evidence items so they flow
 * through the same LLM relevance + scoring pipeline.
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
const { isPABusinessRelevant } = require('../shared/constants');

const NEWS_BASE = 'https://news.google.com/rss/search';
const SEARCH_DELAY_MS = 1500;

// General business topics to search alongside each member's name
const SEARCH_TOPICS = [
  'business',
  'economy',
  'tax',
  'energy',
  'healthcare',
];

// PA Chamber-specific issue searches (quoted phrases for precision)
const ISSUE_SEARCHES = [
  '"tax reform"',
  '"regulatory reform"',
  '"minimum wage"',
  '"workers compensation"',
  '"natural gas"',
  '"state budget"',
  '"workforce development"',
];

function contentHash(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

let lastSearchTime = 0;
async function searchRateLimit() {
  const elapsed = Date.now() - lastSearchTime;
  if (elapsed < SEARCH_DELAY_MS) await new Promise((r) => setTimeout(r, SEARCH_DELAY_MS - elapsed));
  lastSearchTime = Date.now();
}

async function searchGoogleNews(query) {
  await searchRateLimit();
  try {
    const response = await axios.get(NEWS_BASE, {
      params: { q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenPolicyAI/1.0)' },
    });
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(response.data);
    return [parsed?.rss?.channel?.item ?? []].flat();
  } catch {
    return [];
  }
}

function parseArticleDate(item) {
  const raw = item.pubDate || item['dc:date'];
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function resolveArticleUrl(item) {
  // Google News RSS wraps the real URL — try link field first, then guid
  const link = item.link || item.guid?.['#text'] || item.guid || '';
  return typeof link === 'string' ? link : '';
}

async function fetchAllPages(buildQuery, pageSize = 1000) {
  const results = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

async function checkExists(supabase, hash) {
  const { data } = await supabase
    .from('evidence_items')
    .select('id')
    .eq('content_hash', hash)
    .maybeSingle();
  return !!data;
}

function isHeadlineRelevant(title, lastName) {
  return isPABusinessRelevant(title) || title.toLowerCase().includes(lastName.toLowerCase());
}

async function processArticle(supabase, politicianId, item, seenUrls) {
  const title = typeof item.title === 'string' ? item.title : '';
  if (!title || !isPABusinessRelevant(title)) return false;

  const url = resolveArticleUrl(item);
  if (!url || seenUrls.has(url)) return false;
  seenUrls.add(url);

  const hash = contentHash(url);
  if (await checkExists(supabase, hash)) return false;

  // Google News redirect URLs don't resolve to article content, so we store
  // the headline as source_text — sufficient for LLM classification
  const publisher = item.source?.['#text'] || '';
  const sourceText = publisher ? `${title} — ${publisher}` : title;

  const { error } = await supabase.from('evidence_items').upsert({
    politician_id: politicianId,
    evidence_type: 'press_release',
    bill_title: title.substring(0, 500),
    source_text: sourceText,
    source_url: url,
    source_date: parseArticleDate(item).toISOString(),
    content_hash: hash,
    // Title already passed isPABusinessRelevant — mark filter done so LLM step picks it up
    keyword_filter_passed: true,
  }, { onConflict: 'content_hash', ignoreDuplicates: true });

  return !error;
}

async function processTopic(supabase, member, topic, seenUrls) {
  const items = await searchGoogleNews(`"${member.full_name}" Pennsylvania ${topic}`);
  let inserted = 0;
  for (const item of items.slice(0, 10)) {
    if (await processArticle(supabase, member.id, item, seenUrls)) inserted++;
  }
  return inserted;
}

async function processMember(supabase, member) {
  const seenUrls = new Set();
  let inserted = 0;

  // All 8 general topic searches
  for (const topic of SEARCH_TOPICS) {
    inserted += await processTopic(supabase, member, topic, seenUrls);
  }

  // PA Chamber-specific issue searches using quoted phrases
  for (const issue of ISSUE_SEARCHES) {
    inserted += await processTopic(supabase, member, issue, seenUrls);
  }

  return inserted;
}

async function fetchNews() {
  console.log('Fetching PA Chamber-relevant news for PA House members...');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const members = await fetchAllPages(() =>
    supabase.from('politicians')
      .select('id, full_name, last_name')
      .eq('is_active', true)
      .eq('office_type', 'pa_house')
      .order('full_name')
  );

  console.log(`  Processing ${members.length} PA House members...\n`);

  let totalInserted = 0;
  let errors = 0;

  for (const member of members) {
    try {
      const inserted = await processMember(supabase, member);
      if (inserted > 0) console.log(`  ${member.full_name}: +${inserted} articles`);
      totalInserted += inserted;
    } catch (err) {
      console.log(`  ${member.full_name}: ERROR - ${err.message}`);
      errors++;
    }
  }

  console.log(`\nNews complete:`);
  console.log(`  Articles inserted: ${totalInserted}`);
  console.log(`  Errors: ${errors}`);
}

fetchNews().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
