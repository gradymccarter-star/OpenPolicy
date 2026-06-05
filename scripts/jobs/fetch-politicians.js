/**
 * Fetch PA House Candidates Job
 * Fetches all active PA House members from LegiScan API.
 * Requires LEGISCAN_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY env vars.
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const LEGISCAN_BASE = 'https://api.legiscan.com/';
const CURRENT_SESSION_ID = 2192; // PA 2025-2026 General Assembly session

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
  if (!apiKey) throw new Error('LEGISCAN_API_KEY not set');

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

function normalizeParty(party) {
  const p = (party || '').toUpperCase();
  if (p === 'D' || p === 'DEM' || p === 'DEMOCRAT') return 'D';
  if (p === 'R' || p === 'REP' || p === 'REPUBLICAN') return 'R';
  return 'I';
}

async function fetchPAHouseMembers() {
  console.log('Fetching PA House members from LegiScan...');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  if (!process.env.LEGISCAN_API_KEY) {
    console.error('Missing LEGISCAN_API_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  try {
    const data = await legiScanFetch('getSessionPeople', { id: CURRENT_SESSION_ID });
    const allPeople = data.sessionpeople?.people || [];

    // PA House members only (role === 'Rep')
    const houseMembers = allPeople.filter((p) => p.role === 'Rep');
    console.log(`  Found ${houseMembers.length} PA House members`);

    // Build records for batch upsert
    const records = houseMembers.map((member) => {
      // District from LegiScan is "HD-171" — store just the number
      const districtRaw = member.district || '';
      const district = districtRaw.replace(/^HD-/i, '') || null;

      const officialLink = member.bio?.social?.biography || member.bio?.links?.official?.website || null;
      const twitterLink = member.bio?.links?.official?.twitter || null;

      return {
        pa_legislator_id: String(member.people_id),
        first_name: member.first_name || member.name.split(' ')[0],
        last_name: member.last_name || member.name.split(' ').pop(),
        full_name: member.name,
        party: normalizeParty(member.party),
        district,
        office_type: 'pa_house',
        title: 'State Representative',
        official_website: officialLink,
        twitter_handle: twitterLink ? twitterLink.replace(/.*twitter\.com\//i, '@') : null,
        is_active: true,
      };
    });

    const { error } = await supabase
      .from('politicians')
      .upsert(records, { onConflict: 'pa_legislator_id' });

    if (error) throw error;
    console.log(`  Upserted ${records.length} members`);

    // Mark anyone not in this session as inactive
    const activeLegislatorIds = houseMembers.map((m) => String(m.people_id));
    const { error: deactivateError } = await supabase
      .from('politicians')
      .update({ is_active: false })
      .eq('office_type', 'pa_house')
      .eq('is_active', true)
      .not('pa_legislator_id', 'in', `(${activeLegislatorIds.join(',')})`);

    if (deactivateError) console.warn('  Warning deactivating old members:', deactivateError.message);

    const { count } = await supabase
      .from('politicians')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('office_type', 'pa_house');

    console.log(`\nFetch complete. Active PA House members in database: ${count}`);
  } catch (error) {
    console.error('Job failed:', error.message || error);
    process.exit(1);
  }
}

fetchPAHouseMembers();
