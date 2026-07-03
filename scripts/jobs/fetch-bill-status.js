/**
 * Fetch bill status for all bills referenced in evidence_items via LegiScan API.
 * Stores a static JSON at public/data/pa-house-bill-status.json.
 *
 * LegiScan status codes:
 *   1 = Introduced   2 = Engrossed (passed one chamber)
 *   3 = Enrolled     4 = Passed (both chambers)
 *   5 = Vetoed       6 = Failed / Dead
 *
 * Run: node --env-file=.env.local scripts/jobs/fetch-bill-status.js
 */

const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const LEGISCAN_KEY = process.env.LEGISCAN_API_KEY;
const OUT_FILE = path.join(__dirname, '../../public/data/pa-house-bill-status.json');

const STATUS_LABEL = {
  1: 'Introduced',
  2: 'Passed Committee',
  3: 'Enrolled',
  4: 'Signed into Law',
  5: 'Vetoed',
  6: 'Failed / Dead',
};

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('=== LegiScan Bill Status Fetch ===\n');

  // 1. Collect all unique bill IDs from evidence_items
  const { data: evRows, error } = await supabase
    .from('evidence_items')
    .select('bill_id, bill_title, evidence_type, source_url')
    .in('evidence_type', ['bill_sponsorship', 'bill_cosponsorship'])
    .not('bill_id', 'is', null);

  if (error) { console.error('DB error:', error.message); process.exit(1); }

  // Group by bill_id, track which politicians sponsored each bill
  const billMeta = {};
  for (const row of evRows) {
    if (!billMeta[row.bill_id]) {
      billMeta[row.bill_id] = {
        bill_id: row.bill_id,
        title: row.bill_title,
        source_url: row.source_url,
      };
    }
  }

  const billIds = Object.keys(billMeta);
  console.log(`${billIds.length} unique bills to fetch\n`);

  // 2. Load existing cache to skip bills already fetched today
  let existing = {};
  if (fs.existsSync(OUT_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8')).bills ?? {};
    } catch {}
  }
  const today = new Date().toISOString().slice(0, 10);
  const toFetch = billIds.filter(id => existing[id]?.fetched_at?.slice(0, 10) !== today);
  console.log(`${toFetch.length} bills need refreshing (${billIds.length - toFetch.length} cached today)\n`);

  // 3. Fetch each bill from LegiScan
  let fetched = 0;
  let errors = 0;

  for (const billId of toFetch) {
    try {
      const { data } = await axios.get('https://api.legiscan.com/', {
        params: { key: LEGISCAN_KEY, op: 'getBill', id: billId },
        timeout: 15000,
      });

      const bill = data?.bill;
      if (!bill) { errors++; continue; }

      const lastHistory = bill.history?.at(-1);
      existing[billId] = {
        bill_id: billId,
        title: bill.title ?? billMeta[billId].title,
        source_url: billMeta[billId].source_url,
        bill_number: bill.bill_number,
        session: bill.session?.session_name,
        status: bill.status ?? 1,
        status_label: STATUS_LABEL[bill.status] ?? 'Introduced',
        last_action: lastHistory?.action ?? null,
        last_action_date: lastHistory?.date ?? null,
        progress: bill.progress ?? [],
        fetched_at: new Date().toISOString(),
      };

      fetched++;
      if (fetched % 25 === 0) {
        console.log(`  ${fetched}/${toFetch.length} fetched...`);
      }

      await delay(350); // LegiScan rate limit: ~3 req/sec
    } catch (err) {
      console.error(`  Error fetching bill ${billId}:`, err.message);
      errors++;
      await delay(1000);
    }
  }

  // 4. Write output
  const output = {
    generated_at: new Date().toISOString(),
    total_bills: Object.keys(existing).length,
    bills: existing,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

  // 5. Summary
  const statCounts = {};
  for (const b of Object.values(existing)) {
    const lbl = b.status_label ?? 'Unknown';
    statCounts[lbl] = (statCounts[lbl] ?? 0) + 1;
  }

  console.log('\n=== Summary ===');
  console.log(`Fetched: ${fetched}  |  Errors: ${errors}  |  Total cached: ${Object.keys(existing).length}`);
  console.log('\nStatus breakdown:');
  for (const [lbl, count] of Object.entries(statCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lbl}: ${count}`);
  }
  console.log(`\nWrote: ${OUT_FILE}`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
