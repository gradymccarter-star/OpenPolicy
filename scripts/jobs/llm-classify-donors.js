/**
 * LLM-powered donor organization classifier using Claude Haiku.
 * Classifies unknown donor orgs by their alignment with PA Chamber priorities.
 *
 * Run (dry-run, shows classifications without saving):
 *   node scripts/jobs/llm-classify-donors.js
 *
 * Run (apply to DB):
 *   node scripts/jobs/llm-classify-donors.js --apply
 *
 * Limit how many orgs to process:
 *   node scripts/jobs/llm-classify-donors.js --apply --limit 100
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
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
  const idx = process.argv.indexOf('--limit');
  return idx >= 0 ? Number.parseInt(process.argv[idx + 1], 10) : 0;
})();
// Only classify orgs that have contributed at least this much total across all cycles
const MIN_TOTAL = (() => {
  const idx = process.argv.indexOf('--min-total');
  return idx >= 0 ? Number.parseInt(process.argv[idx + 1], 10) : 5000;
})();

const BATCH_SIZE = 20;
const DELAY_MS = 1200; // stay well under rate limits

const delay = ms => new Promise(r => setTimeout(r, ms));

// Candidate committee names — these are politician self-PACs, classify as neutral
const CANDIDATE_COMMITTEE_PATTERNS = [
  /\bfor\s+(state\s+)?(?:house|senate|congress|representative|rep\.|governor|gov\.)\b/i,
  /\belecti(?:on|ng)\b.*\bcommittee\b/i,
  /\bcampaign\s+(?:committee|fund|account)\b/i,
  /\bfriends\s+of\b/i,
  /\bcitizens?\s+for\b/i,
  /\bvote\s+for\b/i,
  /\bcommittee\s+to\s+elect\b/i,
  /\bcommittee\s+to\s+re[\s-]?elect\b/i,
];

function isCandidateCommittee(name) {
  return CANDIDATE_COMMITTEE_PATTERNS.some(re => re.test(name));
}

const SYSTEM_PROMPT = `You are a political analyst classifying Pennsylvania donor organizations by their alignment with the PA Chamber of Business and Industry's nine legislative priorities:

P1: Tax competitiveness (lower business taxes)
P2: Permitting & regulatory streamlining
P3: Civil justice reform (caps on damages, opposing trial lawyer interests)
P4: Fiscal responsibility (balanced budgets, limited spending)
P5: Workforce development
P6: Energy & environment (favoring affordable energy, opposing restrictive environmental regulation)
P7: Labor relations (opposing union mandates, prevailing wage, right-to-work friendly)
P8: Infrastructure investment
P9: Healthcare cost reduction

Classifications:
- "pro_chamber": Organizations whose typical lobbying or advocacy SUPPORTS the Chamber's positions (e.g., business associations, industry groups, professional societies, employer-side organizations)
- "anti_chamber": Organizations whose typical lobbying OPPOSES the Chamber's positions (e.g., labor unions, trial lawyer groups, progressive advocacy orgs, environmental groups opposed to energy development)
- "neutral": Organizations that take mixed positions or whose interests don't clearly align/oppose (e.g., municipal governments, bipartisan civic groups, non-partisan nonprofits)
- "unknown": Truly impossible to classify from name alone (very generic names, obscure local groups with no discernible industry)

Respond with a JSON array (no markdown, no explanation outside the array). Each element:
{"name": "<org name>", "lean": "<pro_chamber|anti_chamber|neutral|unknown>", "rationale": "<one sentence>"}`;

async function classifyBatch(orgs) {
  const names = orgs.map((o, i) => `${i + 1}. ${o.name}`).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Classify each of these Pennsylvania political donor organizations:\n\n${names}\n\nReturn a JSON array with ${orgs.length} elements.`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const text = response.content[0].text.trim();

  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length !== orgs.length) {
    throw new Error(`Expected ${orgs.length} results, got ${parsed?.length}`);
  }

  return parsed;
}

async function run() {
  console.log(`=== LLM Donor Classifier (${APPLY ? 'APPLY MODE' : 'DRY RUN'}) ===\n`);

  // Get totals per donor org so we can filter by contribution size
  const { data: totalsRaw, error: totalsError } = await supabase
    .from('campaign_contributions')
    .select('donor_org_id, amount');
  if (totalsError) { console.error('DB error:', totalsError.message); return; }

  const orgTotals = new Map();
  for (const { donor_org_id, amount } of (totalsRaw ?? [])) {
    if (!donor_org_id) continue;
    orgTotals.set(donor_org_id, (orgTotals.get(donor_org_id) ?? 0) + amount);
  }

  const { data: unknownsRaw, error } = await supabase
    .from('donor_organizations')
    .select('id, name')
    .eq('lean', 'unknown')
    .order('name');
  if (error) { console.error('DB error:', error.message); return; }

  // Filter by minimum total contribution amount, sort largest first
  let unknowns = (unknownsRaw ?? [])
    .filter(o => (orgTotals.get(o.id) ?? 0) >= MIN_TOTAL)
    .sort((a, b) => (orgTotals.get(b.id) ?? 0) - (orgTotals.get(a.id) ?? 0));

  if (LIMIT > 0) unknowns = unknowns.slice(0, LIMIT);

  // Filter out candidate committee PACs (they're neutral by definition)
  const toClassify = unknowns.filter(o => !isCandidateCommittee(o.name));
  const candidateCommittees = unknowns.filter(o => isCandidateCommittee(o.name));

  console.log(`Min contribution threshold: $${MIN_TOTAL.toLocaleString()}`);
  console.log(`${unknowns.length} qualifying unknown orgs`);
  console.log(`  ${candidateCommittees.length} candidate committees → auto-neutral`);
  console.log(`  ${toClassify.length} orgs to classify via LLM`);

  if (toClassify.length === 0 && candidateCommittees.length === 0) {
    console.log('\nNothing to classify.'); return;
  }

  const batches = [];
  for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
    batches.push(toClassify.slice(i, i + BATCH_SIZE));
  }

  console.log(`\n${batches.length} batch${batches.length !== 1 ? 'es' : ''} of up to ${BATCH_SIZE}\n`);

  const results = [];
  let batchFails = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`Batch ${i + 1}/${batches.length} (${batch.length} orgs)... `);

    try {
      const classifications = await classifyBatch(batch);
      for (let j = 0; j < batch.length; j++) {
        results.push({ org: batch[j], classification: classifications[j] });
      }
      console.log('✓');
    } catch (err) {
      console.log(`FAIL: ${err.message.slice(0, 80)}`);
      batchFails++;
    }

    if (i < batches.length - 1) await delay(DELAY_MS);
  }

  // Tally
  const tally = { pro_chamber: [], anti_chamber: [], neutral: [], unknown: [] };
  for (const { org, classification } of results) {
    const lean = classification.lean ?? 'unknown';
    (tally[lean] ?? tally.unknown).push({ name: org.name, rationale: classification.rationale });
  }

  console.log('\n─── Results ───────────────────────────────────────────');
  console.log(`Pro-chamber:   ${tally.pro_chamber.length}`);
  for (const r of tally.pro_chamber) console.log(`  + ${r.name}\n    → ${r.rationale}`);
  console.log(`\nAnti-chamber:  ${tally.anti_chamber.length}`);
  for (const r of tally.anti_chamber) console.log(`  - ${r.name}\n    → ${r.rationale}`);
  console.log(`\nNeutral:       ${tally.neutral.length}`);
  console.log(`Still unknown: ${tally.unknown.length}`);
  console.log(`Batch errors:  ${batchFails}`);
  console.log('───────────────────────────────────────────────────────');

  if (!APPLY) {
    console.log('\n[DRY RUN] No changes written. Re-run with --apply to save.');
    return;
  }

  console.log('\nApplying to database...');
  let ok = 0; let fail = 0;

  // Apply LLM classifications
  for (const { org, classification } of results) {
    const lean = classification.lean ?? 'unknown';
    if (lean === 'unknown') continue; // don't bother storing "still unknown"

    const { error: err } = await supabase
      .from('donor_organizations')
      .update({
        lean,
        lean_rationale: classification.rationale?.slice(0, 255),
        lean_classified_by: 'llm',
      })
      .eq('id', org.id);

    if (err) { console.error(`  FAIL ${org.name}: ${err.message}`); fail++; }
    else ok++;
  }

  // Apply candidate committee → neutral
  if (APPLY && candidateCommittees.length > 0) {
    for (const org of candidateCommittees) {
      const { error: err } = await supabase
        .from('donor_organizations')
        .update({ lean: 'neutral', lean_rationale: 'Candidate campaign committee', lean_classified_by: 'rule' })
        .eq('id', org.id);
      if (err) fail++; else ok++;
    }
    console.log(`  ${candidateCommittees.length} candidate committees set to neutral`);
  }

  console.log(`\nDone: ${ok} updated, ${fail} failed`);
}

run().catch(console.error);
