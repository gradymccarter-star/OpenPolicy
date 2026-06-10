/**
 * Fetch Bluesky Posts Job
 * Searches the public Bluesky AT Protocol API for PA Chamber business-relevant
 * posts by PA House members. No authentication required.
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

const BSKY_BASE = 'https://public.api.bsky.app/xrpc';

// Business topics to combine with legislator names in search
const BUSINESS_SEARCH_TERMS = [
  'tax Pennsylvania',
  'jobs Pennsylvania',
  'business Pennsylvania',
  'energy Pennsylvania',
  'healthcare Pennsylvania',
  'infrastructure Pennsylvania',
  'workforce Pennsylvania',
  'budget Pennsylvania',
];

let lastBskyRequest = 0;
async function rateLimit() {
  const elapsed = Date.now() - lastBskyRequest;
  if (elapsed < 1500) await new Promise((r) => setTimeout(r, 1500 - elapsed));
  lastBskyRequest = Date.now();
}

async function bskyGet(endpoint, params) {
  await rateLimit();
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
      limit: 50,
      sort: 'latest',
    });
    return data?.posts || [];
  } catch (err) {
    if (err?.response?.status === 429) {
      await new Promise((r) => setTimeout(r, 60000));
    }
    return [];
  }
}

async function searchActors(query) {
  try {
    const data = await bskyGet('app.bsky.actor.searchActors', { q: query, limit: 5 });
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

function postText(post) {
  return post?.record?.text || '';
}

function postDate(post) {
  const created = post?.record?.createdAt || post?.indexedAt;
  return created ? new Date(created) : new Date();
}

function postUrl(post) {
  const uri = post?.uri || '';
  const handle = post?.author?.handle || '';
  const rkey = uri.split('/').at(-1);
  return handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : uri;
}

function contentHash(uri) {
  return crypto.createHash('md5').update(uri).digest('hex');
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

async function upsertPost(supabase, politicianId, post) {
  const text = postText(post);
  if (!text || !isPABusinessRelevant(text)) return false;

  const uri = post?.uri || '';
  if (!uri) return false;

  const hash = contentHash(uri);
  const { error } = await supabase.from('evidence_items').upsert({
    politician_id: politicianId,
    evidence_type: 'social_media',
    source_text: text.substring(0, 5000),
    source_url: postUrl(post),
    source_date: postDate(post).toISOString(),
    content_hash: hash,
  }, { onConflict: 'content_hash', ignoreDuplicates: true });

  return !error;
}

async function processPosts(supabase, politicianId, posts, seenUris) {
  let inserted = 0;
  for (const post of posts) {
    const uri = post?.uri || '';
    if (!uri || seenUris.has(uri)) continue;
    seenUris.add(uri);
    if (await upsertPost(supabase, politicianId, post)) inserted++;
  }
  return inserted;
}

async function searchMemberPosts(supabase, member, seenUris) {
  let inserted = 0;
  for (const term of BUSINESS_SEARCH_TERMS.slice(0, 4)) {
    const posts = await searchPosts(`"${member.full_name}" ${term}`);
    inserted += await processPosts(supabase, member.id, posts, seenUris);
  }
  return inserted;
}

function isOfficialAccount(actor, member, handleHint) {
  const displayName = (actor.displayName || '').toLowerCase();
  const description = (actor.description || '').toLowerCase();
  const handleLower = (actor.handle || '').toLowerCase();
  const nameMatch = displayName.includes(member.last_name.toLowerCase()) || handleLower.includes(handleHint.toLowerCase());
  const officialHint =
    description.includes('representative') ||
    description.includes('rep.') ||
    description.includes('pennsylvania') ||
    description.includes('pa house');
  return nameMatch && officialHint;
}

async function scanMemberFeed(supabase, member, seenUris) {
  const handleHint = member.twitter_handle
    ? member.twitter_handle.replace('@', '').replace(/^Rep/i, '')
    : member.last_name;

  const actors = await searchActors(`${member.full_name} Pennsylvania representative`);
  for (const actor of actors) {
    if (!isOfficialAccount(actor, member, handleHint)) continue;
    console.log(`    Found account: @${actor.handle} (${actor.displayName})`);
    const feedPosts = await getAuthorFeed(actor.did);
    return processPosts(supabase, member.id, feedPosts, seenUris);
  }
  return 0;
}

async function processMember(supabase, member, seenUris) {
  const fromSearch = await searchMemberPosts(supabase, member, seenUris);
  const fromFeed = await scanMemberFeed(supabase, member, seenUris);
  return fromSearch + fromFeed;
}

async function fetchBluesky() {
  console.log('Fetching PA Chamber-relevant Bluesky posts from PA House members...');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const members = await fetchAllPages(() =>
    supabase.from('politicians')
      .select('id, full_name, first_name, last_name, twitter_handle')
      .eq('is_active', true)
      .eq('office_type', 'pa_house')
      .order('full_name')
  );

  console.log(`  Processing ${members.length} PA House members...\n`);

  let totalInserted = 0;
  const seenUris = new Set();

  for (const member of members) {
    const inserted = await processMember(supabase, member, seenUris);
    if (inserted > 0) console.log(`  ${member.full_name}: +${inserted} posts`);
    totalInserted += inserted;
  }

  console.log(`\nBluesky complete:`);
  console.log(`  Evidence items inserted: ${totalInserted}`);
}

fetchBluesky().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
