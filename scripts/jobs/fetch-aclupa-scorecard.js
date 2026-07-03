/**
 * ACLU of Pennsylvania Legislative Scorecard ETL
 *
 * Fetches the ACLU-PA's interactive legislative scorecard for current PA House
 * members and writes a static JSON file consumed by the app's candidate profiles.
 *
 * Source: https://aclupalegislativescorecard.org/
 * API:    https://aclupalegislativescorecard.org/wp-json/rds-bt50-scorecard/v1/legislators
 *
 * Score interpretation (vote_index field, 0-100 scale):
 *   100 = always voted with ACLU-PA's position (strongly pro-civil-liberties)
 *    50 = voted equally for and against ACLU-PA positions (neutral)
 *     0 = never voted with ACLU-PA's position (strongly opposed)
 *
 * The raw "score" field in the API can be negative (votes against ACLU-PA
 * positions count as -1, votes for count as +1). The vote_index converts this
 * to a 0-100 scale:
 *   vote_index = ((raw_score + possible) / (2 * possible)) * 100
 *
 * For a Chamber of Commerce tool, ACLU-PA scores provide a strong left-right
 * axis counterpoint: high ACLU-PA score = labor/civil-liberties aligned;
 * low score = conservative/business aligned.
 *
 * Output: public/data/pa-house-aclupa-scorecard.json
 *
 * Usage:
 *   node scripts/jobs/fetch-aclupa-scorecard.js
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const SOURCE_URL = 'https://aclupalegislativescorecard.org/';
const API_URL = 'https://aclupalegislativescorecard.org/wp-json/rds-bt50-scorecard/v1/legislators';
const OUTPUT_PATH = path.join(__dirname, '../../public/data/pa-house-aclupa-scorecard.json');
const TARGET_SESSION = '2025-2026';

// Pad district number to 3 digits as used throughout the app (e.g. 1 → "001", 42 → "042")
function padDistrict(n) {
  return String(n).padStart(3, '0');
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SCAI-bot/1.0)',
        'Accept': 'application/json',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parse ACLU-PA legislators API response.
 *
 * Each legislator record includes:
 *   - first_name, last_name
 *   - party: 'D' | 'R' | 'I'
 *   - chamber: 'House' | 'Senate'
 *   - districtCode: e.g. 'PA020' (district 20)
 *   - score_sets: array of { niceTitle, score, possible_score, vote_index }
 *     where score is raw (can be negative), vote_index is 0-100 percentage
 */
function parseLegislators(rawJson) {
  const legislators = JSON.parse(rawJson);
  const members = {};

  for (const leg of legislators) {
    // Only PA House members
    if (leg.chamber !== 'House') continue;

    // Extract district number from districtCode (e.g. 'PA020' → 20 → '020')
    const districtCode = leg.districtCode || '';
    const districtNumStr = districtCode.replace(/^PA/, '');
    const districtNum = parseInt(districtNumStr, 10);
    if (isNaN(districtNum)) {
      console.warn(`  Skipping ${leg.first_name} ${leg.last_name}: unrecognized districtCode "${districtCode}"`);
      continue;
    }
    const district = padDistrict(districtNum);

    // Find the target session score set
    const scoreSets = leg.score_sets || [];
    const sessionScore = scoreSets.find((s) => s.niceTitle === TARGET_SESSION);
    if (!sessionScore) {
      console.warn(`  No ${TARGET_SESSION} score for ${leg.first_name} ${leg.last_name} (HD-${district})`);
      continue;
    }

    // vote_index is the 0-100 percentage score
    // (raw score can be negative; vote_index normalises to [0,100])
    const voteIndex = parseFloat(sessionScore.vote_index);
    if (isNaN(voteIndex)) {
      console.warn(`  Invalid vote_index for ${leg.first_name} ${leg.last_name}: ${sessionScore.vote_index}`);
      continue;
    }

    // Round to nearest integer for display consistency
    const score = Math.round(voteIndex);

    const name = `${leg.first_name} ${leg.last_name}`;
    const party = leg.party || null;

    // Handle duplicate districts (e.g. mid-session member swap):
    // keep the entry with more possible votes (more complete record)
    if (members[name]) {
      // Name collision — shouldn't happen for House but handle it
      const existingDistrict = members[name].district;
      console.warn(`  Duplicate name "${name}" in districts ${existingDistrict} and ${district}; keeping first`);
      continue;
    }

    members[name] = { district, score, party };
  }

  return members;
}

async function main() {
  console.log('=== ACLU-PA Legislative Scorecard ETL ===\n');
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`API:    ${API_URL}`);
  console.log(`Session: ${TARGET_SESSION}\n`);

  console.log('Fetching legislators from API...');
  const rawJson = await download(API_URL);
  console.log(`  Downloaded ${(rawJson.length / 1024).toFixed(1)} KB`);

  const members = parseLegislators(rawJson);
  const memberCount = Object.keys(members).length;
  console.log(`  Parsed ${memberCount} House members`);

  if (memberCount < 150) {
    throw new Error(`Only parsed ${memberCount} members — expected ~200. Aborting.`);
  }

  // Print sample data
  const sample = Object.entries(members).slice(0, 5);
  console.log('\nSample entries (vote_index score, 0-100):');
  for (const [name, data] of sample) {
    console.log(`  HD-${data.district} | ${data.party} | ${name}: ${data.score}%`);
  }

  // Compute stats
  const allScores = Object.values(members).map((m) => m.score);
  const dScores = Object.values(members).filter((m) => m.party === 'D').map((m) => m.score);
  const rScores = Object.values(members).filter((m) => m.party === 'R').map((m) => m.score);

  const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

  const avgScore = avg(allScores);
  const avgD = avg(dScores);
  const avgR = avg(rScores);

  console.log(`\nStats:`);
  console.log(`  Overall avg score:  ${avgScore}%`);
  console.log(`  Avg D score: ${avgD}%  (n=${dScores.length})`);
  console.log(`  Avg R score: ${avgR}%  (n=${rScores.length})`);

  // Build output
  const output = {
    source: 'ACLU of Pennsylvania',
    source_url: SOURCE_URL,
    session: TARGET_SESSION,
    generated_at: new Date().toISOString(),
    notes:
      'Score is the vote_index (0–100 scale) from the ACLU-PA Legislative Scorecard. ' +
      '100 = always voted with ACLU-PA positions (pro-civil-liberties); ' +
      '50 = voted equally for and against; ' +
      '0 = never voted with ACLU-PA positions. ' +
      'Scores are calculated from the raw vote tally: each pro-ACLU-PA vote = +1, each anti-ACLU-PA vote = −1; ' +
      'vote_index = ((raw_score + possible_votes) / (2 × possible_votes)) × 100. ' +
      'For the PA Chamber tool this provides a labor/civil-liberties left-right axis counterpoint to the Chamber score. ' +
      'Data sourced from aclupalegislativescorecard.org WordPress REST API (BillTrack50 plugin).',
    stats: {
      total_members: memberCount,
      dem_members: dScores.length,
      rep_members: rScores.length,
      avg_score: avgScore,
      avg_dem_score: avgD,
      avg_rep_score: avgR,
    },
    members,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
