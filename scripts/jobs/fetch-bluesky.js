/**
 * Fetch Bluesky Posts Job
 * Searches the public Bluesky AT Protocol API for AI-relevant posts
 * by US senators. No authentication required.
 */

const postgres = require('postgres');
const axios = require('axios');
const crypto = require('crypto');
const { isAIRelevant } = require('../shared/constants');

const BSKY_BASE = 'https://public.api.bsky.app/xrpc';

// AI search terms to combine with senator names
const AI_SEARCH_TERMS = [
  'artificial intelligence',
  'AI regulation',
  'AI safety',
  'machine learning',
  'deepfake',
  'data privacy',
  'algorithmic',
  'autonomous',
  'surveillance',
  'semiconductor',
  'chips act',
];

function contentHash(postUri) {
  return crypto.createHash('md5').update(postUri).digest('hex');
}

async function bskyGet(endpoint, params) {
  // Public API: 300 req / 5 min → ~1.5s between requests
  await new Promise((r) => setTimeout(r, 1500));
  const response = await axios.get(`${BSKY_BASE}/${endpoint}`, {
    params,
    timeout: 15000,
  });
  return response.data;
}

async function searchPosts(query) {
  try {
    const data = await bskyGet('app.bsky.feed.searchPosts', {
      q: query,
      limit: 100,
      sort: 'latest',
    });
    return data?.posts || [];
  } catch (error) {
    if (error?.response?.status === 429) {
      console.log('    Rate limited, waiting 60s...');
      await new Promise((r) => setTimeout(r, 60000));
      return [];
    }
    return [];
  }
}

async function searchActors(query) {
  try {
    const data = await bskyGet('app.bsky.actor.searchActors', {
      q: query,
      limit: 5,
    });
    return data?.actors || [];
  } catch {
    return [];
  }
}

async function getAuthorFeed(did) {
  try {
    const data = await bskyGet('app.bsky.feed.getAuthorFeed', {
      actor: did,
      limit: 100,
      filter: 'posts_no_replies',
    });
    return (data?.feed || []).map((item) => item.post);
  } catch {
    return [];
  }
}

function extractPostText(post) {
  const record = post?.record || {};
  return record.text || '';
}

function extractPostDate(post) {
  const record = post?.record || {};
  const created = record.createdAt || post?.indexedAt;
  return created ? new Date(created) : new Date();
}

function postUrl(post) {
  // Build web URL from AT URI: at://did/app.bsky.feed.post/rkey
  const uri = post?.uri || '';
  const handle = post?.author?.handle || '';
  const parts = uri.split('/');
  const rkey = parts[parts.length - 1];
  if (handle && rkey) {
    return `https://bsky.app/profile/${handle}/post/${rkey}`;
  }
  return uri;
}

async function fetchBluesky() {
  console.log('Fetching AI-relevant Bluesky posts from senators...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    const senators = await sql`
      SELECT id, bioguide_id, full_name, first_name, last_name
      FROM politicians
      WHERE is_active = true AND office_type = 'senate'
      ORDER BY full_name
    `;

    console.log(`  Processing ${senators.length} senators...\n`);

    let totalInserted = 0;
    let totalSearched = 0;
    let senatorsWithPosts = 0;
    const seenUris = new Set();

    for (const senator of senators) {
      let senatorInserted = 0;

      // Strategy 1: Search for senator's name + AI terms
      // Use 2-3 high-value search terms to stay within rate limits
      const searchTerms = AI_SEARCH_TERMS.slice(0, 3);
      for (const term of searchTerms) {
        const query = `"${senator.full_name}" ${term}`;
        const posts = await searchPosts(query);
        totalSearched += posts.length;

        for (const post of posts) {
          const uri = post?.uri || '';
          if (!uri || seenUris.has(uri)) continue;
          seenUris.add(uri);

          const text = extractPostText(post);
          if (!isAIRelevant(text)) continue;

          const hash = contentHash(uri);
          const sourceDate = extractPostDate(post);
          const sourceUrl = postUrl(post);

          try {
            await sql`
              INSERT INTO evidence_items (
                politician_id, evidence_type,
                source_text, source_url, source_date, content_hash
              ) VALUES (
                ${senator.id}, 'social_media',
                ${text.substring(0, 5000)}, ${sourceUrl},
                ${sourceDate}, ${hash}
              )
              ON CONFLICT (content_hash) DO NOTHING
            `;
            senatorInserted++;
          } catch {
            // Constraint error — skip
          }
        }
      }

      // Strategy 2: Try to find senator's Bluesky account and scan their feed
      try {
        const actors = await searchActors(`${senator.full_name} senator`);
        for (const actor of actors) {
          const displayName = (actor.displayName || '').toLowerCase();
          const description = (actor.description || '').toLowerCase();
          const lastName = senator.last_name.toLowerCase();

          // Match if display name contains last name and looks official
          const nameMatch = displayName.includes(lastName);
          const officialHint =
            description.includes('senator') ||
            description.includes('senate') ||
            description.includes('congress') ||
            description.includes(senator.state?.toLowerCase() || '---');

          if (!nameMatch || !officialHint) continue;

          console.log(`    Found account: @${actor.handle} (${actor.displayName})`);

          const feedPosts = await getAuthorFeed(actor.did);
          for (const post of feedPosts) {
            const uri = post?.uri || '';
            if (!uri || seenUris.has(uri)) continue;
            seenUris.add(uri);

            const text = extractPostText(post);
            if (!isAIRelevant(text)) continue;

            const hash = contentHash(uri);
            const sourceDate = extractPostDate(post);
            const sourceUrl = postUrl(post);

            try {
              await sql`
                INSERT INTO evidence_items (
                  politician_id, evidence_type,
                  source_text, source_url, source_date, content_hash
                ) VALUES (
                  ${senator.id}, 'social_media',
                  ${text.substring(0, 5000)}, ${sourceUrl},
                  ${sourceDate}, ${hash}
                )
                ON CONFLICT (content_hash) DO NOTHING
              `;
              senatorInserted++;
            } catch {
              // Constraint error — skip
            }
          }
          break; // Only use first matching account
        }
      } catch {
        // Actor search failed — skip
      }

      if (senatorInserted > 0) {
        console.log(`  ${senator.full_name}: +${senatorInserted} posts`);
        senatorsWithPosts++;
      }
      totalInserted += senatorInserted;
    }

    console.log(`\nBluesky complete:`);
    console.log(`  Posts searched: ${totalSearched}`);
    console.log(`  Evidence items inserted: ${totalInserted}`);
    console.log(`  Senators with posts: ${senatorsWithPosts}`);
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fetchBluesky();
