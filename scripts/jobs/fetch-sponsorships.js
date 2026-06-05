/**
 * Fetch Sponsorships Job
 * Fetches bill sponsorships and co-sponsorships for all active PA House members
 * from LegiScan API. Filters for PA business-relevant legislation.
 *
 * Bill sponsorship carries the highest evidence weight — this job is the most
 * important data source for the endorsement scoring model.
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const crypto = require('node:crypto');
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

function contentHash(legislatorId, billId, type) {
  return crypto.createHash('md5').update(`${legislatorId}-${billId}-${type}`).digest('hex');
}

async function insertSponsorship(supabase, member, bill, evidenceType, sponsorshipType) {
  const searchText = `${bill.bill_number || ''} ${bill.title || ''} ${bill.description || ''}`;
  if (!isPABusinessRelevant(searchText)) return false;

  const hash = contentHash(member.pa_legislator_id, bill.bill_id, sponsorshipType);
  const sourceDate = bill.status_date ? new Date(bill.status_date).toISOString() : new Date().toISOString();
  const sourceUrl = `https://legiscan.com/PA/bill/id/${bill.bill_id}`;

  const { error } = await supabase.from('evidence_items').upsert({
    politician_id: member.id,
    evidence_type: evidenceType,
    bill_id: String(bill.bill_id),
    bill_title: (bill.title || '').substring(0, 500),
    sponsorship_type: sponsorshipType,
    source_url: sourceUrl,
    source_date: sourceDate,
    content_hash: hash,
  }, { onConflict: 'content_hash', ignoreDuplicates: true });

  return !error;
}

async function processMember(supabase, member) {
  const data = await legiScanFetch('getSponsoredBills', { id: member.pa_legislator_id });

  // Filter to current PA session bills only
  const bills = (data.sponsoredbills?.bills || []).filter(
    (b) => b.summary_link?.includes('/PA/') && b.last_action_date >= '2025-01-01'
  );

  let sponsored = 0;
  let cosponsored = 0;

  for (const bill of bills) {
    // Find this member's sponsor entry to determine primary vs co-sponsor
    const personId = Number(member.pa_legislator_id);
    const sponsorEntry = (bill.sponsors || []).find((s) => s.people_id === personId);
    const isPrimary = sponsorEntry ? sponsorEntry.sponsor_type_id === 1 : false;
    const evidenceType = isPrimary ? 'bill_sponsorship' : 'bill_cosponsorship';
    const sponsorshipType = isPrimary ? 'sponsor' : 'cosponsor';

    const inserted = await insertSponsorship(supabase, member, bill, evidenceType, sponsorshipType);
    if (inserted && isPrimary) sponsored++;
    else if (inserted) cosponsored++;
  }

  return { sponsored, cosponsored };
}

async function fetchSponsorships() {
  console.log('Fetching PA House bill sponsorships from LegiScan...');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey || !process.env.LEGISCAN_API_KEY) {
    console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or LEGISCAN_API_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  try {
    const { data: members, error } = await supabase
      .from('politicians')
      .select('id, pa_legislator_id, full_name')
      .eq('is_active', true)
      .eq('office_type', 'pa_house')
      .order('full_name');

    if (error) throw error;
    console.log(`  Processing ${members.length} PA House members...\n`);

    let totalSponsored = 0;
    let totalCosponsored = 0;
    let errorCount = 0;

    for (const member of members) {
      process.stdout.write(`  ${member.full_name}... `);
      try {
        const { sponsored, cosponsored } = await processMember(supabase, member);
        totalSponsored += sponsored;
        totalCosponsored += cosponsored;
        console.log(`${sponsored} sponsorships, ${cosponsored} co-sponsorships`);
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\nSponsorships complete:`);
    console.log(`  Primary sponsorships: ${totalSponsored}`);
    console.log(`  Co-sponsorships: ${totalCosponsored}`);
    console.log(`  Errors: ${errorCount}`);
  } catch (err) {
    console.error('Job failed:', err.message || err);
    process.exit(1);
  }
}

fetchSponsorships();
