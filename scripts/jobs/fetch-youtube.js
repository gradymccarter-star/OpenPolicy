/**
 * Fetch YouTube Videos Job
 * Searches YouTube Data API v3 for AI-relevant senate videos.
 * Requires YOUTUBE_API_KEY env var (free from Google Cloud Console).
 * Daily quota: 10,000 units (each search = 100 units → ~100 searches/day).
 */

const postgres = require('postgres');
const axios = require('axios');
const crypto = require('crypto');
const { isAIRelevant } = require('../shared/constants');

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

// AI search queries to pair with senator names
const AI_QUERIES = [
  'artificial intelligence',
  'AI regulation',
  'AI safety',
  'data privacy',
  'deepfake',
];

// Senate committee channels that often post AI hearings
const COMMITTEE_SEARCHES = [
  'senate commerce committee artificial intelligence',
  'senate judiciary committee AI',
  'senate armed services committee artificial intelligence',
  'senate AI hearing',
  'senate artificial intelligence hearing 2024',
  'senate artificial intelligence hearing 2025',
];

function contentHash(videoId) {
  return crypto.createHash('md5').update(`yt-${videoId}`).digest('hex');
}

async function ytSearch(query, apiKey, publishedAfter) {
  try {
    const response = await axios.get(`${YT_BASE}/search`, {
      params: {
        q: query,
        type: 'video',
        part: 'snippet',
        maxResults: 25,
        order: 'relevance',
        publishedAfter,
        key: apiKey,
      },
      timeout: 15000,
    });
    return response.data?.items || [];
  } catch (error) {
    if (error?.response?.status === 403) {
      console.log('    YouTube quota exceeded, stopping...');
      return null; // Signal to stop
    }
    if (error?.response?.status === 400) {
      console.log(`    Bad request: ${error.response?.data?.error?.message || 'unknown'}`);
      return [];
    }
    console.log(`    Search error: ${error.message}`);
    return [];
  }
}

async function fetchYouTube() {
  console.log('Fetching AI-relevant YouTube videos about senators...');

  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('Missing YOUTUBE_API_KEY — get one free at https://console.cloud.google.com/apis/credentials');
    console.error('Enable "YouTube Data API v3" in your Google Cloud project.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    const senators = await sql`
      SELECT id, bioguide_id, full_name, last_name
      FROM politicians
      WHERE is_active = true AND office_type = 'senate'
      ORDER BY full_name
    `;

    console.log(`  ${senators.length} senators loaded\n`);

    // Build senator lookup by last name for committee hearing matching
    const senatorsByLastName = {};
    for (const s of senators) {
      const key = s.last_name.toLowerCase().replace(/['-]/g, '');
      senatorsByLastName[key] = s;
    }

    let totalInserted = 0;
    let searchCount = 0;
    let quotaExceeded = false;
    const seenVideoIds = new Set();

    // Two years ago
    const publishedAfter = new Date();
    publishedAfter.setFullYear(publishedAfter.getFullYear() - 2);
    const afterISO = publishedAfter.toISOString();

    // Phase 1: Search for individual senators + AI terms
    // Limit to 2 queries per senator to conserve quota (100 senators × 2 = 200 searches = 20K units)
    // Actually that's too many — pick top 30 senators with lowest evidence coverage
    const senatorCoverage = await sql`
      SELECT politician_id, COUNT(*) as cnt
      FROM evidence_items
      WHERE is_relevant = true
      GROUP BY politician_id
    `;
    const coverageMap = {};
    for (const row of senatorCoverage) {
      coverageMap[row.politician_id] = parseInt(row.cnt);
    }

    // Sort senators by evidence count (ascending) — prioritize low-coverage senators
    const sortedSenators = [...senators].sort(
      (a, b) => (coverageMap[a.id] || 0) - (coverageMap[b.id] || 0)
    );

    // Take top 40 lowest-coverage senators, 1 query each = 40 searches = 4K quota units
    const targetSenators = sortedSenators.slice(0, 40);
    console.log(`  Phase 1: Searching ${targetSenators.length} lowest-coverage senators...`);

    for (const senator of targetSenators) {
      if (quotaExceeded) break;

      const query = `"${senator.full_name}" senator artificial intelligence`;
      const results = await ytSearch(query, apiKey, afterISO);

      if (results === null) {
        quotaExceeded = true;
        break;
      }

      searchCount++;

      for (const item of results) {
        const videoId = item?.id?.videoId;
        if (!videoId || seenVideoIds.has(videoId)) continue;
        seenVideoIds.add(videoId);

        const snippet = item.snippet || {};
        const title = snippet.title || '';
        const description = snippet.description || '';
        const combinedText = `${title} ${description}`;

        if (!isAIRelevant(combinedText)) continue;

        // Try to match to a senator — first check the searched senator
        const hash = contentHash(videoId);
        const sourceDate = snippet.publishedAt
          ? new Date(snippet.publishedAt)
          : new Date();
        const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const sourceText = `${title}\n\n${description}`.substring(0, 5000);

        try {
          await sql`
            INSERT INTO evidence_items (
              politician_id, evidence_type,
              source_text, source_url, source_date, content_hash
            ) VALUES (
              ${senator.id}, 'social_media',
              ${sourceText}, ${sourceUrl},
              ${sourceDate}, ${hash}
            )
            ON CONFLICT (content_hash) DO NOTHING
          `;
          totalInserted++;
        } catch {
          // Constraint error — skip
        }
      }
    }

    // Phase 2: Search committee hearings (6 queries = 600 quota units)
    if (!quotaExceeded) {
      console.log(`  Phase 2: Searching committee hearings...`);

      for (const query of COMMITTEE_SEARCHES) {
        if (quotaExceeded) break;

        const results = await ytSearch(query, apiKey, afterISO);
        if (results === null) {
          quotaExceeded = true;
          break;
        }

        searchCount++;

        for (const item of results) {
          const videoId = item?.id?.videoId;
          if (!videoId || seenVideoIds.has(videoId)) continue;
          seenVideoIds.add(videoId);

          const snippet = item.snippet || {};
          const title = snippet.title || '';
          const description = snippet.description || '';
          const combinedText = `${title} ${description}`.toLowerCase();

          if (!isAIRelevant(`${title} ${description}`)) continue;

          // Try to match senators mentioned in title/description
          let matched = false;
          for (const [lastName, senator] of Object.entries(senatorsByLastName)) {
            if (
              combinedText.includes(lastName) ||
              combinedText.includes(senator.full_name.toLowerCase())
            ) {
              const hash = contentHash(`${videoId}-${senator.bioguide_id}`);
              const sourceDate = snippet.publishedAt
                ? new Date(snippet.publishedAt)
                : new Date();
              const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
              const sourceText = `${title}\n\n${description}`.substring(0, 5000);

              try {
                await sql`
                  INSERT INTO evidence_items (
                    politician_id, evidence_type,
                    source_text, source_url, source_date, content_hash
                  ) VALUES (
                    ${senator.id}, 'social_media',
                    ${sourceText}, ${sourceUrl},
                    ${sourceDate}, ${hash}
                  )
                  ON CONFLICT (content_hash) DO NOTHING
                `;
                totalInserted++;
                matched = true;
              } catch {
                // Constraint error — skip
              }
            }
          }

          if (matched) {
            console.log(`    + ${title.substring(0, 60)}...`);
          }
        }
      }
    }

    console.log(`\nYouTube complete:`);
    console.log(`  Searches performed: ${searchCount} (~${searchCount * 100} quota units)`);
    console.log(`  Evidence items inserted: ${totalInserted}`);
    if (quotaExceeded) {
      console.log(`  Note: Quota exceeded — run again tomorrow for remaining senators`);
    }
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fetchYouTube();
