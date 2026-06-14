/**
 * Fetch PA News Job
 * Scrapes RSS feeds from Pennsylvania news outlets directly.
 * Unlike Google News, these return real article URLs we can read.
 * No API key required.
 *
 * Sources:
 *   - Spotlight PA (investigative, capitol coverage)
 *   - PA Capital-Star (policy/politics)
 *   - PennLive (general PA news)
 *   - Pittsburgh Post-Gazette
 *   - WITF (public radio, central PA)
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
const { isPABusinessRelevant } = require('../shared/constants');

// PA news RSS feeds — real articles, not Google News redirects
const PA_NEWS_FEEDS = [
  {
    name: 'Spotlight PA',
    url: 'https://www.spotlightpa.org/news/feed.xml',
  },
  {
    name: 'PA Capital-Star',
    url: 'https://www.penncapitalstar.com/feed/',
  },
  {
    name: 'PennLive Politics',
    url: 'https://www.pennlive.com/arc/outboundfeeds/rss/category/news/politics/',
  },
  {
    name: 'PennLive Business',
    url: 'https://www.pennlive.com/arc/outboundfeeds/rss/category/business/',
  },
  {
    name: 'Pittsburgh Post-Gazette Politics',
    url: 'https://www.post-gazette.com/rss/feeds/politics',
  },
  {
    name: 'WITF News',
    url: 'https://www.witf.org/feed/',
  },
  {
    name: 'Lancaster Online',
    url: 'https://lancasteronline.com/search/?f=rss&t=article&c=news/politics&l=50&s=start_time&sd=desc',
  },
];

const DELAY_MS = 2000;
let lastRequest = 0;

async function rateLimit() {
  const elapsed = Date.now() - lastRequest;
  if (elapsed < DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS - elapsed));
  lastRequest = Date.now();
}

function contentHash(url) {
  return crypto.createHash('md5').update(`pa-news-${url}`).digest('hex');
}

function parseDate(str) {
  if (!str) return new Date().toISOString();
  try {
    return new Date(str).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// Parse RSS XML — returns array of { title, link, description, pubDate }
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const get = (tag) => {
      const m = content.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'))
        || content.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    items.push({
      title: get('title'),
      link: get('link') || get('guid'),
      description: get('description'),
      pubDate: get('pubDate') || get('dc:date') || get('updated'),
    });
  }
  return items;
}

async function fetchFeed(feed) {
  await rateLimit();
  try {
    const { data } = await axios.get(feed.url, {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
      responseType: 'text',
    });
    return parseRSS(typeof data === 'string' ? data : JSON.stringify(data));
  } catch (err) {
    console.log(`  [${feed.name}] Error: ${err.message}`);
    return [];
  }
}

async function scrapeArticle(url) {
  await rateLimit();
  try {
    const { data } = await axios.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      responseType: 'text',
      maxRedirects: 5,
    });

    if (typeof data !== 'string') return null;

    // Strip script/style/nav then extract visible text
    const clean = data
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{3,}/g, '\n\n')
      .trim();

    return clean.substring(0, 8000);
  } catch {
    return null;
  }
}

function nameMentionedIn(text, member) {
  const lower = text.toLowerCase();
  return (
    lower.includes(member.full_name.toLowerCase()) ||
    lower.includes(member.last_name.toLowerCase())
  );
}

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

async function fetchPANews() {
  console.log('Fetching PA news from direct RSS feeds...');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const members = await fetchAllPages(() =>
    supabase.from('politicians')
      .select('id, full_name, first_name, last_name')
      .eq('is_active', true)
      .eq('office_type', 'pa_house')
      .order('full_name')
  );

  console.log(`  ${members.length} PA House members loaded\n`);

  // Get existing URLs to avoid re-scraping
  const { data: existing } = await supabase
    .from('evidence_items')
    .select('source_url')
    .eq('evidence_type', 'news_article');
  const existingUrls = new Set((existing || []).map((r) => r.source_url));

  let totalArticles = 0;
  let totalInserted = 0;

  for (const feed of PA_NEWS_FEEDS) {
    console.log(`  [${feed.name}] fetching RSS...`);
    const items = await fetchFeed(feed);
    console.log(`    ${items.length} articles found`);

    for (const item of items) {
      const url = item.link;
      if (!url || existingUrls.has(url)) continue;

      // Quick relevance check on title + description before scraping full article
      const quickText = `${item.title} ${item.description}`;
      if (!isPABusinessRelevant(quickText)) continue;

      totalArticles++;
      existingUrls.add(url);

      // Find which members are mentioned in title/description first
      const titleMentions = members.filter((m) => nameMentionedIn(quickText, m));

      // Scrape full article only if we have a title match or it's business-relevant
      let fullText = quickText;
      if (titleMentions.length > 0 || isPABusinessRelevant(item.title)) {
        const scraped = await scrapeArticle(url);
        if (scraped && scraped.length > 200) fullText = scraped;
      }

      // Now find all mentioned members in the full text
      const mentioned = members.filter((m) => nameMentionedIn(fullText, m));
      if (mentioned.length === 0) continue;

      const sourceDate = parseDate(item.pubDate);
      const sourceText = `${item.title}\n\n${item.description}`.substring(0, 5000);

      for (const member of mentioned) {
        const hash = contentHash(`${url}-${member.id}`);
        const { error } = await supabase.from('evidence_items').upsert({
          politician_id: member.id,
          evidence_type: 'news_article',
          source_text: sourceText,
          source_url: url,
          source_date: sourceDate,
          content_hash: hash,
          keyword_filter_passed: true,
        }, { onConflict: 'content_hash', ignoreDuplicates: true });

        if (!error) {
          totalInserted++;
          console.log(`    + [${member.last_name}] ${item.title.substring(0, 60)}`);
        }
      }
    }
  }

  console.log(`\nPA News complete:`);
  console.log(`  Business-relevant articles found: ${totalArticles}`);
  console.log(`  Evidence items inserted: ${totalInserted}`);
}

fetchPANews().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
