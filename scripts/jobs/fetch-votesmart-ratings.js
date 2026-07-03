/**
 * VoteSmart Interest Group Ratings ETL
 *
 * Fetches third-party interest group ratings (AFL-CIO, NFIB, Chamber of Commerce,
 * etc.) for PA House incumbents from the VoteSmart API and writes a static JSON
 * file consumed by the app's candidate profiles.
 *
 * Flow:
 *   1. Fetch PA House member list (+ votesmart_id) from LegiScan in one call.
 *   2. For each member with a votesmart_id, call VoteSmart Rating.getCandidateRating.
 *   3. Resolve each unique sigId → org name via Rating.getSig (cached).
 *   4. Write public/data/votesmart-ratings.json.
 *
 * Prerequisites:
 *   VOTESMART_API_KEY  — register at https://votesmart.org/share/api
 *   LEGISCAN_API_KEY   — already in .env.local
 *
 * Usage:
 *   node scripts/jobs/fetch-votesmart-ratings.js
 */

const fs = require('node:fs');
const path = require('node:path');

// Load .env.local
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

const axios = require('axios');

const LEGISCAN_BASE = 'https://api.legiscan.com/';
const VOTESMART_BASE = 'https://api.votesmart.org/';
const PA_SESSION_ID = 2192; // 2025-2026 PA Regular Session
const OUTPUT_PATH = path.join(__dirname, '../../public/data/votesmart-ratings.json');

// Rate limiting — VoteSmart requests a max of 1 req/sec; LegiScan is fine at 2/sec
let lastVotesmartReq = 0;
async function vsRateLimit() {
  const elapsed = Date.now() - lastVotesmartReq;
  if (elapsed < 1100) await new Promise((r) => setTimeout(r, 1100 - elapsed));
  lastVotesmartReq = Date.now();
}

let lastLegiscanReq = 0;
async function legiscanRateLimit() {
  const elapsed = Date.now() - lastLegiscanReq;
  if (elapsed < 500) await new Promise((r) => setTimeout(r, 500 - elapsed));
  lastLegiscanReq = Date.now();
}

async function legiscanFetch(op, params = {}) {
  await legiscanRateLimit();
  const response = await axios.get(LEGISCAN_BASE, {
    params: { key: process.env.LEGISCAN_API_KEY, op, ...params },
    timeout: 30000,
  });
  if (response.data.status === 'ERROR') {
    throw new Error(`LegiScan error: ${JSON.stringify(response.data)}`);
  }
  return response.data;
}

async function voteSmartFetch(endpoint, params = {}) {
  await vsRateLimit();
  const response = await axios.get(`${VOTESMART_BASE}${endpoint}`, {
    params: { key: process.env.VOTESMART_API_KEY, o: 'JSON', ...params },
    timeout: 30000,
  });
  const data = response.data;
  if (data && data.error) {
    throw new Error(`VoteSmart error: ${data.error.errorMessage}`);
  }
  return data;
}

/**
 * Fetch all PA House members with their VoteSmart IDs from LegiScan.
 * Returns array of { people_id, name, district, votesmart_id, party }
 */
async function fetchPAHouseMembers() {
  console.log('Fetching PA House member list from LegiScan...');
  const data = await legiscanFetch('getSessionPeople', { id: PA_SESSION_ID });
  const people = data.sessionpeople?.people ?? [];
  const house = people.filter((p) => p.role === 'Rep');
  console.log(`  Found ${house.length} PA House members`);

  const withIds = house.filter((p) => p.votesmart_id && p.votesmart_id !== 0);
  const withoutIds = house.filter((p) => !p.votesmart_id || p.votesmart_id === 0);
  console.log(`  With VoteSmart ID: ${withIds.length}, without: ${withoutIds.length}`);

  return withIds.map((p) => ({
    people_id: p.people_id,
    name: p.name,
    district: p.district.replace('HD-', ''),
    votesmart_id: p.votesmart_id,
    party: p.party,
  }));
}

/**
 * Fetch interest group ratings for a candidate from VoteSmart.
 * Returns raw rating array or empty array if none found.
 */
async function fetchCandidateRatings(votesmartId, name) {
  try {
    const data = await voteSmartFetch('Rating.getCandidateRating', {
      candidateId: votesmartId,
    });
    const ratings = data?.candidateRating?.rating;
    if (!ratings) return [];
    // API returns a single object (not array) when only one rating exists
    return Array.isArray(ratings) ? ratings : [ratings];
  } catch (err) {
    if (err.message?.includes('No records found')) return [];
    console.error(`  Error for ${name} (VS ${votesmartId}): ${err.message}`);
    return [];
  }
}

/**
 * Fetch Special Interest Group info (name, description) from VoteSmart.
 * Cached by sigId to avoid repeat calls.
 */
const sigCache = new Map();
async function fetchSigInfo(sigId) {
  if (sigCache.has(sigId)) return sigCache.get(sigId);
  try {
    const data = await voteSmartFetch('Rating.getSig', { sigId });
    const sig = data?.sig;
    const info = {
      name: sig?.name ?? `SIG-${sigId}`,
      description: sig?.description ?? '',
      address: sig?.address ?? '',
    };
    sigCache.set(sigId, info);
    return info;
  } catch (err) {
    const info = { name: `SIG-${sigId}`, description: '' };
    sigCache.set(sigId, info);
    return info;
  }
}

/**
 * Normalise a rating value to a number (0-100) or null.
 * VoteSmart ratings can be "85%", "85", "B+", "Supports", etc.
 */
function normalizeRating(rawRating) {
  if (rawRating === null || rawRating === undefined) return null;
  const s = String(rawRating).trim().replace('%', '');
  const n = parseFloat(s);
  if (!isNaN(n)) return n;
  // Letter grades → approximate percentages
  const gradeMap = {
    'A+': 100, A: 96, 'A-': 92,
    'B+': 88, B: 85, 'B-': 82,
    'C+': 78, C: 75, 'C-': 72,
    'D+': 68, D: 65, 'D-': 62,
    F: 50,
  };
  const upper = s.toUpperCase();
  if (gradeMap[upper] !== undefined) return gradeMap[upper];
  return null; // Qualitative ratings (e.g. "Supports", "Opposes") kept as null
}

/**
 * Extract category name from a rating's categories object.
 * VoteSmart nests: categories.category (object or array)
 */
function extractCategories(ratingObj) {
  const cats = ratingObj?.categories?.category;
  if (!cats) return [];
  const arr = Array.isArray(cats) ? cats : [cats];
  return arr.map((c) => c.name).filter(Boolean);
}

async function main() {
  console.log('=== VoteSmart Ratings ETL ===\n');

  if (!process.env.VOTESMART_API_KEY) {
    console.error(
      'ERROR: VOTESMART_API_KEY not set.\n' +
      'Register at https://votesmart.org/share/api to get a key,\n' +
      'then add VOTESMART_API_KEY=your_key to .env.local'
    );
    process.exit(1);
  }

  if (!process.env.LEGISCAN_API_KEY) {
    console.error('ERROR: LEGISCAN_API_KEY not set.');
    process.exit(1);
  }

  // 1. Get PA House members + votesmart_ids
  const members = await fetchPAHouseMembers();

  // 2. Fetch ratings for each member
  const candidates = {};
  let totalRatings = 0;
  let membersWithRatings = 0;
  let errors = 0;

  console.log(`\nFetching ratings for ${members.length} members...`);

  for (const [i, member] of members.entries()) {
    process.stdout.write(
      `  [${String(i + 1).padStart(3)}/${members.length}] ${member.name} (HD-${member.district})... `
    );

    const rawRatings = await fetchCandidateRatings(member.votesmart_id, member.name);

    if (rawRatings.length === 0) {
      console.log('no ratings');
      candidates[member.votesmart_id] = {
        name: member.name,
        district: member.district,
        party: member.party,
        legiscan_id: member.people_id,
        ratings: [],
      };
      continue;
    }

    // 3. Resolve org names (fetch SIG info for each unique sigId)
    const sigIds = [...new Set(rawRatings.map((r) => r.sigId).filter(Boolean))];
    await Promise.all(sigIds.map((sid) => fetchSigInfo(sid)));

    const ratings = [];
    for (const r of rawRatings) {
      const sig = r.sigId ? sigCache.get(r.sigId) : null;
      const orgName = sig?.name ?? r.ratingName ?? `SIG-${r.sigId}`;
      const score = normalizeRating(r.rating);
      const categories = extractCategories(r);

      ratings.push({
        org: orgName,
        sig_id: r.sigId ? Number(r.sigId) : null,
        rating_id: r.ratingId ? Number(r.ratingId) : null,
        rating: score,
        rating_text: String(r.rating ?? '').trim() || null,
        rating_name: r.ratingName ?? null,
        categories: categories.length > 0 ? categories : null,
        time_span: r.timeSpan ?? null,
      });
    }

    // Sort by most recent first, then by org name
    ratings.sort((a, b) => {
      const yearA = parseInt((a.time_span ?? '0').split('-').pop(), 10);
      const yearB = parseInt((b.time_span ?? '0').split('-').pop(), 10);
      if (yearB !== yearA) return yearB - yearA;
      return (a.org ?? '').localeCompare(b.org ?? '');
    });

    candidates[member.votesmart_id] = {
      name: member.name,
      district: member.district,
      party: member.party,
      legiscan_id: member.people_id,
      ratings,
    };

    totalRatings += ratings.length;
    membersWithRatings++;
    console.log(`${ratings.length} ratings`);
  }

  console.log(`\nSummary:`);
  console.log(`  Members with ratings: ${membersWithRatings}/${members.length}`);
  console.log(`  Total rating entries: ${totalRatings}`);
  console.log(`  Unique SIGs resolved: ${sigCache.size}`);
  if (errors > 0) console.log(`  Errors: ${errors}`);

  // 4. Write output
  const output = {
    as_of: new Date().toISOString().slice(0, 10),
    generated_at: new Date().toISOString(),
    source: 'https://votesmart.org',
    description:
      'Interest group ratings for PA House incumbents from VoteSmart. ' +
      'Keyed by VoteSmart candidate ID.',
    stats: {
      members_total: members.length,
      members_with_ratings: membersWithRatings,
      total_rating_entries: totalRatings,
      unique_sigs: sigCache.size,
    },
    candidates,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
