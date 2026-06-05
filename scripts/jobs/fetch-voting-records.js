/**
 * Fetch Voting Records Job
 * Fetches PA House floor votes from LegiScan API.
 * Filters for PA business-relevant bills using keyword matching.
 */

const postgres = require('postgres');
const axios = require('axios');
const crypto = require('crypto');
const { isPABusinessRelevant } = require('../shared/constants');

const LEGISCAN_BASE = 'https://api.legiscan.com/';
const CURRENT_SESSION_ID = 2192;

let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 500) {
    await new Promise((r) => setTimeout(r, 500 - elapsed));
  }
  lastRequestTime = Date.now();
}

async function legiScanFetch(op, params = {}) {
  const apiKey = process.env.LEGISCAN_API_KEY;
  await rateLimit();

  const response = await axios.get(LEGISCAN_BASE, {
    params: { key: apiKey, op, state: 'PA', ...params },
    timeout: 30000,
  });

  if (response.data.status === 'ERROR') {
    throw new Error(`LegiScan error: ${JSON.stringify(response.data)}`);
  }
  return response.data;
}

function contentHash(legislatorId, rollCallId) {
  return crypto.createHash('md5').update(`${legislatorId}-${rollCallId}`).digest('hex');
}

function normalizePosition(vote) {
  const v = (vote || '').toLowerCase();
  if (v === 'yea' || v === 'yes') return 'yea';
  if (v === 'nay' || v === 'no') return 'nay';
  if (v === 'nv' || v === 'not voting' || v === 'absent') return 'not_voting';
  return 'abstain';
}

async function insertVote(sql, memberId, legislatorId, vote) {
  const searchText = `${vote.bill_number || ''} ${vote.description || ''}`;
  if (!isPABusinessRelevant(searchText)) return false;

  const hash = contentHash(legislatorId, vote.roll_call_id);
  const position = normalizePosition(vote.vote_text);
  const sourceUrl = `https://legiscan.com/PA/rollcall/id/${vote.roll_call_id}`;
  const sourceDate = vote.date ? new Date(vote.date) : new Date();

  try {
    await sql`
      INSERT INTO evidence_items (
        politician_id, evidence_type, bill_id, bill_title,
        vote_position, source_url, source_date, content_hash
      ) VALUES (
        ${memberId}, 'floor_vote',
        ${vote.bill_id ? String(vote.bill_id) : null},
        ${(vote.description || '').substring(0, 500)},
        ${position}, ${sourceUrl}, ${sourceDate}, ${hash}
      )
      ON CONFLICT (content_hash) DO NOTHING
    `;
    return true;
  } catch {
    return false;
  }
}

async function processMember(sql, member) {
  const data = await legiScanFetch('getPersonVotes', {
    id: member.pa_legislator_id,
    session_id: CURRENT_SESSION_ID,
  });

  const votes = data.personvotes?.votes || [];
  console.log(`    ${votes.length} votes found`);

  let inserted = 0;
  for (const vote of votes) {
    if (await insertVote(sql, member.id, member.pa_legislator_id, vote)) inserted++;
  }
  return inserted;
}

async function fetchVotingRecords() {
  console.log('Fetching PA House voting records from LegiScan...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !process.env.LEGISCAN_API_KEY) {
    console.error('Missing DATABASE_URL or LEGISCAN_API_KEY');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });

  try {
    const members = await sql`
      SELECT id, pa_legislator_id, full_name
      FROM politicians
      WHERE is_active = true AND office_type = 'pa_house'
    `;

    console.log(`  ${members.length} active PA House members in DB`);

    let totalInserted = 0;

    for (const member of members) {
      console.log(`\n  Processing ${member.full_name}...`);
      try {
        const count = await processMember(sql, member);
        totalInserted += count;
        console.log(`    + ${count} relevant floor votes recorded`);
      } catch (error) {
        console.error(`    x Error for ${member.full_name}: ${error.message}`);
      }
    }

    console.log(`\nVoting records complete: ${totalInserted} evidence items inserted`);
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fetchVotingRecords();
