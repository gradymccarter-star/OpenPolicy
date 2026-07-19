/**
 * Bill-Level Relevance Classification (deduplicated)
 *
 * analyze-statements.js step 2 classifies relevance PER EVIDENCE ROW — fine for
 * statements, but bill-type evidence (floor votes, sponsorships) has thousands
 * of rows per bill (203 voters × many roll calls). This preprocessor makes ONE
 * relevance call per unique bill and propagates the result to every evidence
 * row for that bill, mirroring the LegiScan votes job's "votes inherit
 * relevance from their parent bill" semantics.
 *
 * Run BEFORE analyze-statements.js. Rows marked here are skipped by its step 2.
 *
 * Usage: node --env-file=.env.local scripts/jobs/classify-bills-dedup.js
 * Env: LLM_MAX_BUDGET (default 0.5 USD)
 */

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const BILL_TYPES = ['floor_vote', 'committee_vote', 'bill_sponsorship', 'bill_cosponsorship'];
const MAX_BUDGET = Number(process.env.LLM_MAX_BUDGET ?? 0.5);

// Claude Haiku 4.5 pricing: $1/MTok input, $5/MTok output
function estimateCost(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
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
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
    console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or ANTHROPIC_API_KEY');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const rows = await fetchAllPages(() =>
    supabase
      .from('evidence_items')
      .select('bill_id, bill_title')
      .in('evidence_type', BILL_TYPES)
      .is('llm_relevance_score', null)
      .not('bill_id', 'is', null)
  );

  const bills = new Map();
  for (const r of rows) {
    if (!bills.has(r.bill_id)) bills.set(r.bill_id, r.bill_title || '');
  }
  console.log(`${rows.length} unclassified bill-evidence rows across ${bills.size} unique bills (budget $${MAX_BUDGET})`);

  let cost = 0;
  let done = 0;
  let relevant = 0;

  for (const [billId, billTitle] of bills) {
    if (cost >= MAX_BUDGET) {
      console.log(`Budget limit reached ($${cost.toFixed(3)}), stopping. Re-run to continue.`);
      break;
    }

    const prompt = `You are classifying whether a Pennsylvania bill is substantively related to PA Chamber of Commerce business priorities.

BILL: ${billId}
TITLE: ${billTitle.substring(0, 1500)}

PA Chamber priorities: taxes & business competitiveness, permitting & regulatory reform, civil justice reform, fiscal responsibility, workforce & education, energy & environment, labor & employment, infrastructure, health care.

Return ONLY valid JSON with no other text:
{
  "relevant": true or false,
  "confidence": 0.0 to 1.0,
  "pa_chamber_principles": ["P1", "P2", etc],
  "rationale": "one sentence explanation"
}

Rules:
- "relevant" means the bill's PRIMARY purpose or a MAJOR provision involves a PA Chamber priority
- "pa_chamber_principles" maps to: P1=Taxes, P2=Permitting, P3=Civil Justice, P4=Fiscal, P5=Workforce, P6=Energy, P7=Labor, P8=Infrastructure, P9=Health Care`;

    try {
      let text;
      if (process.env.USE_TOKENROUTER === '1') {
        // Same model via TokenRouter's OpenAI-compatible API — bills their credits
        const res = await fetch(`${process.env.TOKENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.TOKENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 300,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`TokenRouter ${res.status}`);
        const data = await res.json();
        text = data.choices[0].message.content;
        cost += estimateCost(data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
      } else {
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        });
        text = response.content[0].text;
        cost += estimateCost(response.usage.input_tokens, response.usage.output_tokens);
      }

      const result = parseJSON(text);
      const isRelevant = Boolean(result.relevant) && result.confidence >= 0.6;

      const { error } = await supabase
        .from('evidence_items')
        .update({
          keyword_filter_passed: true,
          is_relevant: isRelevant,
          llm_relevance_score: result.confidence,
          llm_relevance_rationale: `[bill-level] ${result.rationale || ''}`.substring(0, 500),
          tagged_principles: result.pa_chamber_principles || [],
        })
        .eq('bill_id', billId)
        .in('evidence_type', BILL_TYPES);
      if (error) throw error;

      done++;
      if (isRelevant) relevant++;
      if (done % 10 === 0) console.log(`  ${done}/${bills.size} bills classified, ${relevant} relevant, $${cost.toFixed(3)} spent`);
    } catch (err) {
      console.error(`  ${billId} failed: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nDone: ${done}/${bills.size} bills classified, ${relevant} business-relevant, $${cost.toFixed(3)} spent.`);
}

main().catch((err) => {
  console.error('Job failed:', err.message || err);
  process.exit(1);
});
