/**
 * District Win-Probability Estimates
 *
 * For every PA House district, computes a transparent deterministic baseline
 * (recency-weighted historical margins + voter registration + incumbency —
 * see lib/utils/district-odds.js) and passes it, along with the raw inputs, to
 * Claude for review. Claude may nudge the probability within a capped range
 * (enforced here, not just requested in the prompt) and writes a short
 * analyst-style rationale grounded in the given data.
 *
 * These are OUR estimates, not a real prediction-market or professional
 * forecaster's numbers — every consumer of this file must disclose that.
 *
 * Output: public/data/pa-house-district-odds.json
 *
 * Usage:
 *   node --env-file=.env.local scripts/jobs/compute-district-odds.js
 * Env:
 *   ODDS_MAX_BUDGET (default 5 USD)
 */

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-5';
const MAX_BUDGET = Number(process.env.ODDS_MAX_BUDGET ?? 5);
const ADJUSTMENT_CAP = 0.1; // Claude may move the baseline by at most +/- 10 points
const OUTPUT_PATH = path.join(__dirname, '../../public/data/pa-house-district-odds.json');
const ELECTION_HISTORY_PATH = path.join(__dirname, '../../public/data/pa-house-election-history.json');
const VOTER_REG_PATH = path.join(__dirname, '../../public/data/pa-house-voter-registration.json');

// Sonnet pricing: $3/MTok input, $15/MTok output
function estimateCost(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

function loadJsonFile(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : null;
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

function isIncumbent(politician) {
  return !politician.pa_legislator_id?.startsWith('cand:');
}

function buildPrompt({ district, marginHistory, registration, incumbent, contested, soleParty, fundingByParty, baseline }) {
  const historyLines = marginHistory.length
    ? marginHistory
        .sort((a, b) => b.year - a.year)
        .map((h) => `  ${h.year}: ${h.winnerParty ? `${h.winnerParty}+${h.marginPct?.toFixed(1)}` : 'no data'}`)
        .join('\n')
    : '  No historical general election data on file.';

  const regLine = registration
    ? `R ${registration.republican.toLocaleString()} / D ${registration.democrat.toLocaleString()} / Other ${registration.other.toLocaleString()} (total ${registration.total.toLocaleString()})`
    : 'No registration data on file.';

  const incumbentDesc = incumbent ? `${incumbent.full_name} (${incumbent.party})` : 'none on file (open seat)';
  const raceLine = contested ? `Contested. Incumbent: ${incumbentDesc}.` : `Uncontested — only ${soleParty} has filed a candidate.`;

  const fundingLine = fundingByParty
    ? `D candidates raised $${fundingByParty.D.toLocaleString()}, R candidates raised $${fundingByParty.R.toLocaleString()}.`
    : 'No campaign finance data on file.';

  return `You are a nonpartisan legislative race analyst estimating the probability the Democratic candidate wins a Pennsylvania House district in the 2026 general election. Reason ONLY from the structured data below — do not use outside knowledge about specific candidates, recent news, or events not listed here.

DISTRICT: ${district}

HISTORICAL GENERAL ELECTION RESULTS (most recent first):
${historyLines}

VOTER REGISTRATION: ${regLine}

CURRENT RACE: ${raceLine}

CAMPAIGN FINANCE: ${fundingLine}

A deterministic baseline model (recency-weighted historical margin + registration gap + incumbency) puts this district's Democratic win probability at ${(baseline.demWinProbability * 100).toFixed(1)}%.

Task: Review the baseline against the data above. You may adjust it by at most 10 percentage points in either direction if the data clearly warrants it (e.g. a strong multi-cycle trend the baseline may be underweighting, or a stale incumbency assumption) — otherwise keep it close to the baseline. Write a 2-3 sentence rationale that cites specific numbers from the data above (not generic commentary).

Return ONLY valid JSON with no other text:
{
  "dem_win_probability": 0.0 to 1.0,
  "rationale": "2-3 sentences citing specific data points above"
}`;
}

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
    console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const { computeDistrictOddsBaseline, ratingForProbability } = await import('../../lib/utils/district-odds.ts');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  console.log('Fetching politicians and campaign finance...');
  const politicians = await fetchAllPages(() =>
    supabase.from('politicians').select('id, district, party, full_name, pa_legislator_id').eq('is_active', true).eq('office_type', 'pa_house')
  );
  const contributions = await fetchAllPages(() => supabase.from('campaign_contributions').select('politician_id, amount'));

  const contribByPolitician = new Map();
  for (const c of contributions) {
    contribByPolitician.set(c.politician_id, (contribByPolitician.get(c.politician_id) ?? 0) + (Number(c.amount) || 0));
  }

  const byDistrict = new Map();
  for (const p of politicians) {
    if (!p.district) continue;
    if (!byDistrict.has(p.district)) byDistrict.set(p.district, []);
    byDistrict.get(p.district).push(p);
  }

  const electionHistory = loadJsonFile(ELECTION_HISTORY_PATH);
  const voterReg = loadJsonFile(VOTER_REG_PATH);

  const districts = [...byDistrict.keys()].sort((a, b) => a.localeCompare(b));
  console.log(`${districts.length} districts, budget $${MAX_BUDGET}\n`);

  const output = {};
  let cost = 0;
  let done = 0;

  for (const district of districts) {
    if (cost >= MAX_BUDGET) {
      console.log(`Budget limit reached ($${cost.toFixed(3)}), stopping. Re-run to continue with remaining districts.`);
      break;
    }

    const reps = byDistrict.get(district);
    const parties = new Set(reps.map((r) => r.party));
    const contested = parties.size > 1;
    const soleParty = !contested ? [...parties][0] : null;
    const incumbent = reps.find(isIncumbent) ?? null;

    const rawHistory = electionHistory?.districts[district] ?? {};
    const marginHistory = Object.entries(rawHistory).map(([year, h]) => ({
      year: Number(year),
      marginPct: h.margin_pct,
      winnerParty: h.winner_party,
    }));
    const registration = voterReg?.districts[district] ?? null;

    const fundingByParty = { D: 0, R: 0 };
    let hasFunding = false;
    for (const r of reps) {
      const amount = contribByPolitician.get(r.id);
      if (amount) {
        hasFunding = true;
        if (r.party === 'D' || r.party === 'R') fundingByParty[r.party] += amount;
      }
    }

    const baseline = computeDistrictOddsBaseline({
      marginHistory,
      registration,
      incumbentParty: incumbent?.party ?? null,
      contested,
      soleParty,
    });

    let finalProbability = baseline.demWinProbability;
    let rationale = contested ? '' : `Uncontested — only ${soleParty} has a candidate on file.`;

    if (contested) {
      const prompt = buildPrompt({ district, marginHistory, registration, incumbent, contested, soleParty, fundingByParty: hasFunding ? fundingByParty : null, baseline });
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024, // leaves room for the model's thinking block before the JSON output
          messages: [{ role: 'user', content: prompt }],
        });
        cost += estimateCost(response.usage.input_tokens, response.usage.output_tokens);
        const text = response.content.find((b) => b.type === 'text')?.text ?? '';
        const result = parseJSON(text);

        const claudeProb = Number(result.dem_win_probability);
        const lo = Math.max(0, baseline.demWinProbability - ADJUSTMENT_CAP);
        const hi = Math.min(1, baseline.demWinProbability + ADJUSTMENT_CAP);
        finalProbability = Number.isFinite(claudeProb) ? Math.min(hi, Math.max(lo, claudeProb)) : baseline.demWinProbability;
        rationale = String(result.rationale || '').slice(0, 800);
      } catch (err) {
        console.error(`  ${district} failed, using baseline only: ${err.message}`);
        rationale = 'Estimate based on the deterministic baseline model only — AI review unavailable for this district.';
      }
    }

    output[district] = {
      dem_win_probability: Math.round(finalProbability * 1000) / 1000,
      baseline_probability: Math.round(baseline.demWinProbability * 1000) / 1000,
      rating: ratingForProbability(finalProbability),
      rationale,
      computed_at: new Date().toISOString(),
    };

    done++;
    if (done % 20 === 0) console.log(`  ${done}/${districts.length} districts, $${cost.toFixed(3)} spent`);
    if (contested) await new Promise((r) => setTimeout(r, 150));
  }

  const finalOutput = {
    generated_at: new Date().toISOString(),
    description: 'SCAI-generated district win-probability estimates: deterministic baseline (historical margin + registration + incumbency) reviewed and explained by Claude. Not a real prediction-market or professional forecast.',
    model: MODEL,
    districts: output,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalOutput, null, 2));
  console.log(`\nWrote ${Object.keys(output).length}/${districts.length} districts to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`Total spend: $${cost.toFixed(3)}`);
}

main().catch((err) => {
  console.error('Job failed:', err.message || err);
  process.exit(1);
});
