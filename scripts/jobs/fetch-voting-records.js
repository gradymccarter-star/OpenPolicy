/**
 * Fetch Voting Records Job
 * Fetches PA House floor votes from LegiScan API.
 *
 * Strategy: for each business-relevant bill already in our DB, call getBill
 * to get its roll call IDs, then getRollCall to get individual member votes.
 * This is efficient because we only query bills we already know are relevant.
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

const LEGISCAN_BASE = 'https://api.legiscan.com/';
const PA_HOUSE_CHAMBER_ID = 3; // LegiScan chamber_id for PA House (verified from API)

let lastRequestTime = 0;
async function rateLimit() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < 500) await new Promise((r) => setTimeout(r, 500 - elapsed));
  lastRequestTime = Date.now();
}

async function legiScanFetch(op, params = {}) {
  await rateLimit();
  const response = await axios.get(LEGISCAN_BASE, {
    params: { key: process.env.LEGISCAN_API_KEY, op, ...params },
    timeout: 30000,
  });
  if (response.data.status === 'ERROR') {
    throw new Error(`LegiScan error: ${JSON.stringify(response.data)}`);
  }
  return response.data;
}

function voteHash(legislatorId, rollCallId) {
  return crypto.createHash('md5').update(`vote-${legislatorId}-${rollCallId}`).digest('hex');
}

function normalizePosition(voteText) {
  const v = (voteText || '').toLowerCase();
  if (v === 'yea' || v === 'yes') return 'yea';
  if (v === 'nay' || v === 'no') return 'nay';
  if (v === 'nv' || v === 'not voting' || v === 'absent') return 'not_voting';
  return 'abstain';
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

async function processRollCall(supabase, rollCallId, billId, billTitle, billPrinciples, membersByLegisId, existingHashes) {
  const data = await legiScanFetch('getRollcall', { id: rollCallId });
  const rc = data.roll_call;
  if (!rc) return 0;

  const sourceUrl = rc.url || `https://legiscan.com/PA/rollcall/id/${rollCallId}`;
  const sourceDate = rc.date ? new Date(rc.date).toISOString() : new Date().toISOString();

  let inserted = 0;
  for (const vote of rc.votes || []) {
    const member = membersByLegisId.get(String(vote.people_id));
    if (!member) continue;

    const hash = voteHash(member.pa_legislator_id, rollCallId);
    if (existingHashes.has(hash)) continue;
    existingHashes.add(hash);

    const { error } = await supabase.from('evidence_items').upsert({
      politician_id: member.id,
      evidence_type: 'floor_vote',
      bill_id: String(billId),
      bill_title: billTitle,
      vote_position: normalizePosition(vote.vote_text),
      source_url: sourceUrl,
      source_date: sourceDate,
      content_hash: hash,
      // Floor votes inherit relevance from their parent bill — no LLM filter needed
      keyword_filter_passed: billPrinciples.length > 0,
      is_relevant: billPrinciples.length > 0,
      tagged_principles: billPrinciples,
    }, { onConflict: 'content_hash', ignoreDuplicates: true });

    if (!error) inserted++;
  }
  return inserted;
}

async function processBill(supabase, billId, billTitle, billPrinciples, membersByLegisId, existingHashes) {
  const data = await legiScanFetch('getBill', { id: billId });
  const bill = data.bill;
  if (!bill) return 0;

  // Only process House chamber roll calls
  const houseVotes = (bill.votes || []).filter(
    (v) => v.chamber_id === PA_HOUSE_CHAMBER_ID
  );

  let inserted = 0;
  for (const rollCallMeta of houseVotes) {
    inserted += await processRollCall(
      supabase,
      rollCallMeta.roll_call_id,
      billId,
      billTitle,
      billPrinciples,
      membersByLegisId,
      existingHashes
    );
  }
  return inserted;
}

async function fetchVotingRecords() {
  console.log('Fetching PA House floor votes from LegiScan...');

  if (!process.env.LEGISCAN_API_KEY) {
    console.error('Missing LEGISCAN_API_KEY');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Build a fast lookup: pa_legislator_id -> { id, pa_legislator_id }
  const members = await fetchAllPages(() =>
    supabase.from('politicians')
      .select('id, pa_legislator_id')
      .eq('is_active', true)
      .eq('office_type', 'pa_house')
  );
  const membersByLegisId = new Map(members.map((m) => [String(m.pa_legislator_id), m]));
  console.log(`  ${members.length} PA House members loaded`);

  // Get all unique relevant bill IDs we already have, along with their classified principles
  const [billRows, billClassRows] = await Promise.all([
    fetchAllPages(() =>
      supabase.from('evidence_items')
        .select('bill_id, bill_title')
        .eq('is_relevant', true)
        .not('bill_id', 'is', null)
    ),
    fetchAllPages(() =>
      supabase.from('bill_classifications')
        .select('bill_id, principle')
    ),
  ]);

  // bill_id -> [principles]
  const billPrinciplesMap = {};
  for (const bc of billClassRows) {
    if (!billPrinciplesMap[bc.bill_id]) billPrinciplesMap[bc.bill_id] = [];
    billPrinciplesMap[bc.bill_id].push(bc.principle);
  }

  // bill_id -> { title, principles }
  const uniqueBills = new Map();
  for (const row of billRows) {
    if (!uniqueBills.has(row.bill_id)) {
      uniqueBills.set(row.bill_id, {
        title: row.bill_title || '',
        principles: billPrinciplesMap[row.bill_id] || [],
      });
    }
  }
  console.log(`  ${uniqueBills.size} unique relevant bills to check for roll calls`);

  // Load existing vote hashes to skip already-inserted votes
  const existingVotes = await fetchAllPages(() =>
    supabase.from('evidence_items')
      .select('content_hash')
      .eq('evidence_type', 'floor_vote')
  );
  const existingHashes = new Set(existingVotes.map((r) => r.content_hash));
  console.log(`  ${existingHashes.size} existing vote records (will skip)\n`);

  let totalInserted = 0;
  let billsWithVotes = 0;
  let errors = 0;
  let i = 0;

  for (const [billId, { title: billTitle, principles: billPrinciples }] of uniqueBills) {
    i++;
    process.stdout.write(`  [${i}/${uniqueBills.size}] Bill ${billId}... `);
    try {
      const inserted = await processBill(supabase, billId, billTitle, billPrinciples, membersByLegisId, existingHashes);
      if (inserted > 0) {
        console.log(`+${inserted} votes`);
        billsWithVotes++;
      } else {
        console.log('no House votes');
      }
      totalInserted += inserted;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nVoting records complete:`);
  console.log(`  Bills with House votes: ${billsWithVotes}`);
  console.log(`  Floor vote evidence items inserted: ${totalInserted}`);
  console.log(`  Errors: ${errors}`);
}

fetchVotingRecords().catch((err) => {
  console.error('Job failed:', err);
  process.exit(1);
});
