/**
 * Score Normalization Compute
 *
 * Pulls all overall_scores from Supabase (candidates with actual evidence) and
 * builds a sorted score array used to convert any raw SCAI score to a percentile
 * rank at display time.
 *
 * Output: public/data/score-normalization.json
 *
 * Usage:
 *   node --env-file=.env.local scripts/jobs/compute-score-normalization.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const OUTPUT_PATH = path.join(__dirname, '../../public/data/score-normalization.json');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('Fetching all overall_scores from Supabase...');
  const { data, error } = await supabase
    .from('overall_scores')
    .select('overall_score, total_evidence_items')
    .gt('total_evidence_items', 0) // only candidates with actual evidence
    .order('overall_score');

  if (error) {
    console.error('Supabase error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.warn('No scored candidates found — normalization file not written.');
    process.exit(0);
  }

  const sortedScores = data.map((row) => row.overall_score);

  const min = sortedScores[0];
  const max = sortedScores[sortedScores.length - 1];
  const mean = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length;

  const p25 = sortedScores[Math.floor(sortedScores.length * 0.25)];
  const p50 = sortedScores[Math.floor(sortedScores.length * 0.50)];
  const p75 = sortedScores[Math.floor(sortedScores.length * 0.75)];

  const output = {
    generated_at: new Date().toISOString(),
    description: 'Percentile normalization for SCAI overall_score. sorted_scores is ascending; use binary search to derive percentile rank.',
    total_scored: sortedScores.length,
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    p25: Math.round(p25 * 10) / 10,
    p50: Math.round(p50 * 10) / 10,
    p75: Math.round(p75 * 10) / 10,
    sorted_scores: sortedScores.map((s) => Math.round(s * 10) / 10),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`\nWrote ${sortedScores.length} scores to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`  Min: ${output.min}  Max: ${output.max}  Mean: ${output.mean}`);
  console.log(`  P25: ${output.p25}  P50: ${output.p50}  P75: ${output.p75}`);
  console.log(`  Raw score range: ${(output.max - output.min).toFixed(1)} points`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
