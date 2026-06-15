/**
 * Fetch YouTube Videos Job
 * Searches YouTube Data API v3 for PA House member interviews, floor speeches,
 * and PA Chamber business-relevant coverage.
 * Requires YOUTUBE_API_KEY env var (free from Google Cloud Console).
 * Daily quota: 10,000 units (each search = 100 units → ~100 searches/day).
 *
 * Get a free key: https://console.cloud.google.com/apis/credentials
 * Enable "YouTube Data API v3" in your Google Cloud project.
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

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

// Business topics to pair with member names
const BUSINESS_TOPICS = [
  'tax business Pennsylvania',
  'energy Pennsylvania House',
  'workforce Pennsylvania',
  'healthcare Pennsylvania House',
  'budget Pennsylvania House',
];

// PA legislative channels/searches to sweep regardless of individual members
const CHANNEL_SEARCHES = [
  'Pennsylvania House Representatives floor session 2025',
  'Pennsylvania House Representatives floor session 2026',
  'Pennsylvania Chamber Business industry interview',
  'Pennsylvania House committee hearing business 2025',
  'Pennsylvania House committee hearing business 2026',
];

function contentHash(id) {
  return crypto.createHash('md5').update(`yt-pa-${id}`).digest('hex');
}

let quotaExceeded = false;

async function ytSearch(query, apiKey) {
  if (quotaExceeded) return [];
  try {
    const publishedAfter = new Date();
    publishedAfter.setFullYear(publishedAfter.getFullYear() - 2);

    const response = await axios.get(`${YT_BASE}/search`, {
      params: {
        q: query,
        type: 'video',
        part: 'snippet',
        maxResults: 25,
        order: 'relevance',
        publishedAfter: publishedAfter.toISOString(),
        key: apiKey,
      },
      timeout: 15000,
    });
    return response.data?.items || [];
  } catch (err) {
    if (err?.response?.status === 403) {
      console.log('    YouTube quota exceeded — run again tomorrow');
      quotaExceeded = true;
      return [];
    }
    console.log(`    Search error: ${err.message}`);
    return [];
  }
}

function extractText(item) {
  const s = item.snippet || {};
  return `${s.title || ''} ${s.description || ''}`;
}

async function upsertVideo(supabase, politicianId, item) {
  const videoId = item?.id?.videoId;
  if (!videoId) return false;

  const s = item.snippet || {};
  const title = s.title || '';
  const desc = s.description || '';
  const text = `${title}\n\n${desc}`.substring(0, 5000);

  if (!isPABusinessRelevant(text)) return false;

  const hash = contentHash(politicianId ? `${videoId}-${politicianId}` : videoId);
  const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const sourceDate = s.publishedAt ? new Date(s.publishedAt).toISOString() : new Date().toISOString();

  const { error } = await supabase.from('evidence_items').upsert({
    politician_id: politicianId,
    evidence_type: 'social_media',
    source_text: text,
    source_url: sourceUrl,
    source_date: sourceDate,
    content_hash: hash,
    keyword_filter_passed: true,
  }, { onConflict: 'content_hash', ignoreDuplicates: true });

  return !error;
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

async function fetchYouTube() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('Missing YOUTUBE_API_KEY');
    console.error('Get a free key: https://console.cloud.google.com/apis/credentials');
    console.error('Enable "YouTube Data API v3" in your Google Cloud project, then add:');
    console.error('  YOUTUBE_API_KEY=your_key_here  to .env.local');
    process.exit(1);
  }

  console.log('Fetching PA Chamber-relevant YouTube coverage of PA House members...');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const members = await fetchAllPages(() =>
    supabase.from('politicians')
      .select('id, full_name, first_name, last_name')
      .eq('is_active', true)
      .eq('office_type', 'pa_house')
      .order('full_name')
  );

  // Prioritize members with least existing evidence
  const { data: coverage } = await supabase
    .from('evidence_items')
    .select('politician_id')
    .eq('is_relevant', true);

  const coverageCount = {};
  for (const r of (coverage || [])) {
    coverageCount[r.politician_id] = (coverageCount[r.politician_id] || 0) + 1;
  }

  const sorted = [...members].sort(
    (a, b) => (coverageCount[a.id] || 0) - (coverageCount[b.id] || 0)
  );

  // 50 members × 1 search each = 50 searches = 5k quota units
  const offsetArg = process.argv.find(a => a.startsWith('--offset='));
  const offset = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 0;
  const targetMembers = sorted.slice(offset, offset + 50);

  console.log(`  ${members.length} members loaded, searching ${targetMembers.length} with lowest coverage\n`);

  let totalInserted = 0;
  let searches = 0;
  const seenIds = new Set();

  // Phase 1: Individual member searches
  for (const member of targetMembers) {
    if (quotaExceeded) break;
    const query = `"${member.full_name}" Pennsylvania House`;
    const results = await ytSearch(query, apiKey);
    searches++;

    for (const item of results) {
      const vid = item?.id?.videoId;
      if (!vid || seenIds.has(vid)) continue;
      seenIds.add(vid);
      if (await upsertVideo(supabase, member.id, item)) {
        totalInserted++;
        process.stdout.write('.');
      }
    }
  }

  // Phase 2: Channel sweeps — match mentions back to members
  if (!quotaExceeded) {
    console.log(`\n  Phase 2: PA legislative channel sweeps...`);
    const membersByLastName = {};
    for (const m of members) {
      const key = m.last_name.toLowerCase();
      if (!membersByLastName[key]) membersByLastName[key] = [];
      membersByLastName[key].push(m);
    }

    for (const query of CHANNEL_SEARCHES) {
      if (quotaExceeded) break;
      const results = await ytSearch(query, apiKey);
      searches++;

      for (const item of results) {
        const vid = item?.id?.videoId;
        if (!vid) continue;
        const text = extractText(item).toLowerCase();

        for (const [lastName, mems] of Object.entries(membersByLastName)) {
          if (!text.includes(lastName)) continue;
          for (const m of mems) {
            const key = `${vid}-${m.id}`;
            if (seenIds.has(key)) continue;
            seenIds.add(key);
            if (await upsertVideo(supabase, m.id, item)) {
              totalInserted++;
              process.stdout.write('+');
            }
          }
        }
      }
    }
  }

  console.log(`\n\nYouTube complete:`);
  console.log(`  Searches: ${searches} (~${searches * 100} quota units used of 10,000/day)`);
  console.log(`  Evidence items inserted: ${totalInserted}`);
}

fetchYouTube().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
