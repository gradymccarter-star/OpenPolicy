/**
 * One-time migration: fix source_url and source_date for existing evidence_items.
 * The original fetch-sponsorships.js used an invalid LegiScan URL format (/id/) and
 * fell back to the fetch timestamp when status_date was null. This script calls
 * getBill for each unique bill_id to get the correct URL and introduced_date.
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

const LEGISCAN_BASE = 'https://api.legiscan.com/';
let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 500) await new Promise((r) => setTimeout(r, 500 - elapsed));
  lastRequestTime = Date.now();
}

async function getBill(billId) {
  await rateLimit();
  const response = await axios.get(LEGISCAN_BASE, {
    params: { key: process.env.LEGISCAN_API_KEY, op: 'getBill', id: billId },
    timeout: 30000,
  });
  if (response.data.status === 'ERROR') throw new Error(`LegiScan error for bill ${billId}`);
  return response.data.bill;
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

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const items = await fetchAllPages(() =>
    supabase.from('evidence_items').select('bill_id').not('bill_id', 'is', null)
  );

  const uniqueBillIds = [...new Set(items.map((r) => r.bill_id))];
  console.log(`Fixing ${uniqueBillIds.length} unique bills...`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < uniqueBillIds.length; i++) {
    const billId = uniqueBillIds[i];
    process.stdout.write(`  [${i + 1}/${uniqueBillIds.length}] Bill ${billId}... `);
    try {
      const bill = await getBill(billId);
      const sourceUrl = bill.url || bill.state_link || `https://legiscan.com/PA/bill/id/${billId}`;
      const rawDate = bill.introduced_date || bill.last_action || bill.status_date;
      const sourceDate = rawDate ? new Date(rawDate).toISOString() : null;

      const updateData = { source_url: sourceUrl };
      if (sourceDate) updateData.source_date = sourceDate;

      const { error } = await supabase
        .from('evidence_items')
        .update(updateData)
        .eq('bill_id', billId);

      if (error) throw error;
      console.log(`OK (${bill.bill_number}, introduced: ${bill.introduced_date || 'unknown'})`);
      updated++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
