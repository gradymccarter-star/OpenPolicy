/**
 * One-time cleanup: removes 25 duplicate `politicians` rows created by the
 * 2026-06-27 run of fetch-candidates.js, before that script's name-matching
 * was fixed to recognize nicknames/suffixes/middle-initial formatting (e.g.
 * Ballotpedia's "Joe D'Orsie" vs LegiScan's "Joseph D'Orsie" — same person,
 * same seat, two rows).
 *
 * Each row below was manually verified: same district, same last name, and
 * either a known nickname pair or a suffix/middle-initial variant of an
 * existing LegiScan-sourced row. None have any dependent campaign_contributions,
 * evidence_items, principle_scores, or overall_scores rows (checked before
 * writing this script), so deleting is safe with no cascade side effects.
 *
 * Run manually after reviewing: node --env-file=.env.local scripts/jobs/cleanup-duplicate-candidates-2026-06-27.js
 */

const { createClient } = require('@supabase/supabase-js');

const DUPLICATES = [
  { id: 'da3026c5-faf5-4d4a-b572-9e6e41fd83c1', name: "Joe D'Orsie", district: '047', realRow: "Joseph D'Orsie" },
  { id: 'e91d92fd-f457-4cfd-97e8-f02dd90c9b34', name: 'Greg Scott', district: '054', realRow: 'Gregory Scott' },
  { id: '3ae67f56-8788-411e-8dc4-8d1d51f9bd38', name: 'Leslie Baum Rossi', district: '059', realRow: 'Leslie Rossi' },
  { id: '88265653-380d-4d9c-8043-fa1f38eb5d5c', name: 'James Struzzi II', district: '062', realRow: 'James Struzzi' },
  { id: '2c5c0d94-59b4-4f60-914b-e8cc82981285', name: 'R. Lee James', district: '064', realRow: 'Robert James' },
  { id: 'b77f5daa-39c6-466a-ada1-d6a84149ed37', name: 'Clint Owlett', district: '068', realRow: 'Clinton Owlett' },
  { id: 'c980fdb2-7d30-4e82-8861-4bbf1ed54763', name: 'Jim Rigby', district: '071', realRow: 'James Rigby' },
  { id: '492434c3-aede-4717-9829-a4baf4669529', name: 'H. Scott Conklin', district: '077', realRow: 'Scott Conklin' },
  { id: '3942d6af-8f97-4f27-9943-d436df69d714', name: 'Richard Irvin', district: '081', realRow: 'Rich Irvin' },
  { id: '16bcc5ad-5a5f-4a67-ab32-57887b63858a', name: 'Rob Kauffman', district: '089', realRow: 'Robert Kauffman' },
  { id: 'a8e7ace6-a369-4212-b63e-d590b3931885', name: 'David H. Zimmerman', district: '099', realRow: 'David Zimmerman' },
  { id: '238bee9b-80ff-4b29-98de-3a9375022c65', name: 'Russell Diamond', district: '102', realRow: 'Russ Diamond' },
  { id: '5a8df3f8-9d48-4a46-bc2d-06e6876dc9ee', name: 'Nate Davidson', district: '103', realRow: 'Nathan Davidson' },
  { id: '733077cb-14c0-4913-a337-7079108c54cd', name: 'Dave Madsen', district: '104', realRow: 'David Madsen' },
  { id: '4bccdd5b-f9ae-4d98-8ea6-ee53c660b47f', name: 'Bridget Malloy Kosierowski', district: '114', realRow: 'Bridget Kosierowski' },
  { id: 'ca62ece1-453b-4e7c-aec6-5c2d1f4623ac', name: 'Dane Watro Jr.', district: '116', realRow: 'Dane Watro' },
  { id: '05fc0c7d-f68f-4e78-a4fe-a2eb1df6151f', name: 'Jamie Barton', district: '124', realRow: 'James Barton' },
  { id: 'cbf7809e-6616-40d7-aa81-dc932f184eef', name: 'Steve Samuelson', district: '135', realRow: 'Stephen Samuelson' },
  { id: '57135c9b-45e3-4945-94ba-9ce4a1e1ddcf', name: 'Joe Emrick', district: '137', realRow: 'Joseph Emrick' },
  { id: '4a4cdb2e-2d6c-48ff-9c84-ec208bbea6e8', name: 'Jim Prokopiak', district: '140', realRow: 'James Prokopiak' },
  { id: '57a84133-37ff-47f6-9e0a-75d4a1120d88', name: 'Tim Briggs', district: '149', realRow: 'Timothy Briggs' },
  { id: '9e1bd105-c625-4ad7-96db-bf1d3ff2a9ef', name: 'Danielle Friel Otten', district: '155', realRow: 'Danielle Otten' },
  { id: 'a5a165b3-5f11-4d21-b935-86cfd0aa9cb6', name: 'Leanne Krueger', district: '161', realRow: 'Leanne Krueger-Braneky' },
  { id: '78511ab7-a216-4f61-8d8d-7b8d25066407', name: 'MaryLouise Isaacson', district: '175', realRow: 'Mary Isaacson' },
  { id: '91e1fc65-263d-4e57-aa1c-03eb171667f2', name: 'G. Roni Green', district: '190', realRow: 'Roni Green' },
];

// Not included: "George Margetas" (HD-196) — Ballotpedia flagged as incumbent but
// no name in HD-196 (Seth Grove, Ron Ruman) resembles it even loosely. Left in the
// database as a 'challenger' (the default for an unrecognized synthetic ID) pending
// manual research rather than guessing whether it's a data entry error or unrelated race.

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  console.log(`About to delete ${DUPLICATES.length} duplicate rows:`);
  for (const d of DUPLICATES) {
    console.log(`  HD-${d.district}: "${d.name}" (duplicate of existing "${d.realRow}")`);
  }

  const ids = DUPLICATES.map((d) => d.id);
  const { error, count } = await supabase.from('politicians').delete({ count: 'exact' }).in('id', ids);
  if (error) throw error;
  console.log(`\nDeleted ${count} rows.`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message || err);
  process.exit(1);
});
