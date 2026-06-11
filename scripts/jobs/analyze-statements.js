/**
 * Evidence Evaluation Pipeline
 * ============================
 * Classifies evidence items against 9 PA Chamber of Commerce business priorities.
 *
 * Pipeline steps:
 *   1. Keyword pre-filter on all unprocessed evidence items
 *   2. LLM relevance classification on items that pass keyword filter
 *   3. Bill direction classification (once per bill per principle, cached)
 *   4. Claim extraction from relevant statements
 *
 * Score computation is handled separately by calculate-scores.js
 */

const fs = require('node:fs');
const path = require('node:path');

// Load .env.local when running scripts directly (not via Next.js)
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
const Anthropic = require('@anthropic-ai/sdk').default;
const { isPABusinessRelevant } = require('../shared/constants');

// ============================================================
// PA CHAMBER PRINCIPLES (mirrored from lib/utils/constants.ts)
// ============================================================

const PA_CHAMBER_PRINCIPLES = {
  P1: {
    name: 'Taxes & Business Competitiveness',
    description: 'Supports reducing the tax burden on businesses and making Pennsylvania competitive',
    indicators: [
      'Corporate net income tax phase-down acceleration',
      'Net operating loss treatment improvements',
      'Local tax administration reform',
      'Small business tax relief',
      'Alignment with federal tax code',
    ],
  },
  P2: {
    name: 'Permitting & Regulatory Reform',
    description: 'Supports streamlining permits and reducing unnecessary regulatory burdens',
    indicators: [
      'SPEED program and permitting modernization',
      'Permit delay reduction',
      'Regulatory burden reduction for businesses',
      'Science-based rather than politically motivated regulation',
      'Economic impact review of new regulations',
    ],
  },
  P3: {
    name: 'Civil Justice Reform',
    description: 'Supports a fair legal system that prevents lawsuit abuse and venue-shopping',
    indicators: [
      'Lawsuit abuse reform',
      'Venue-shopping prevention',
      'Judicial efficiency improvements',
      'Predictable liability rules for employers',
      'Balance between plaintiff access and business certainty',
    ],
  },
  P4: {
    name: 'Fiscal Responsibility',
    description: 'Supports responsible state spending, pension reform, and efficient government',
    indicators: [
      'On-time, responsible state budgets',
      'Public pension system reform',
      'Government privatization and efficiency',
      'Public-private partnerships',
      'Reducing state debt and unfunded liabilities',
    ],
  },
  P5: {
    name: 'Workforce & Education',
    description: 'Supports career readiness, job training, and educational options that serve employers',
    indicators: [
      'Career and technical education investment',
      'Workforce re-entry and upskilling programs',
      'Childcare access and affordability',
      'Educational choice and accountability',
      'Higher education alignment with employer needs',
    ],
  },
  P6: {
    name: 'Energy & Environment',
    description: 'Supports an all-of-the-above energy policy and science-based environmental regulation',
    indicators: [
      'All-of-the-above energy development',
      'Opposing anti-competitive energy mandates',
      'Hydrogen and advanced nuclear support',
      'Flexible, science-based environmental standards',
      'Energy cost competitiveness for businesses',
    ],
  },
  P7: {
    name: 'Labor & Employment',
    description: 'Supports balanced labor laws that protect workers without burdening employers',
    indicators: [
      'Workers compensation system reform',
      'Unemployment compensation integrity',
      'Opposition to compulsory union dues',
      'Opposing excessive wage mandates',
      'Fair and balanced labor relations policy',
    ],
  },
  P8: {
    name: 'Infrastructure',
    description: 'Supports reliable transportation, broadband, and utility infrastructure investment',
    indicators: [
      'Transportation and road funding',
      'Rural broadband expansion',
      'Utility and telecom infrastructure',
      'Permitting streamlining for infrastructure projects',
      'Public-private infrastructure partnerships',
    ],
  },
  P9: {
    name: 'Health Care',
    description: 'Supports employer flexibility, market competition, and affordability in health care',
    indicators: [
      'Employer flexibility in health care decisions',
      'Health care market competition',
      'Certificate of need reform',
      'Prescription drug pricing transparency',
      'Medicaid efficiency and sustainability',
    ],
  },
};

const CLAIM_SCORE_MAP = {
  'support,strong,false': 1,
  'support,strong,true': 0.85,
  'support,moderate,false': 0.8,
  'support,moderate,true': 0.7,
  'support,weak,false': 0.6,
  'support,weak,true': 0.6,
  'conditional,strong,false': 0.55,
  'conditional,strong,true': 0.55,
  'conditional,moderate,false': 0.55,
  'conditional,moderate,true': 0.55,
  'conditional,weak,false': 0.55,
  'conditional,weak,true': 0.55,
  'neutral,strong,false': 0.5,
  'neutral,strong,true': 0.5,
  'neutral,moderate,false': 0.5,
  'neutral,moderate,true': 0.5,
  'neutral,weak,false': 0.5,
  'neutral,weak,true': 0.5,
  'oppose,weak,false': 0.4,
  'oppose,weak,true': 0.4,
  'oppose,moderate,false': 0.25,
  'oppose,moderate,true': 0.25,
  'oppose,strong,false': 0,
  'oppose,strong,true': 0.05,
};

const BILL_EVIDENCE_TYPES = ['floor_vote', 'bill_sponsorship', 'bill_cosponsorship'];
const STATEMENT_EVIDENCE_TYPES = ['committee_statement', 'floor_speech', 'press_release', 'social_media'];
const CHUNK = 200;

// ============================================================
// HELPERS
// ============================================================

function partyLabel(party) {
  if (party === 'D') return 'Democrat';
  if (party === 'R') return 'Republican';
  return 'Independent';
}

let requestsThisMinute = 0;
let minuteStart = Date.now();
const MAX_RPM = 50;

async function checkRateLimit() {
  const now = Date.now();
  const elapsed = now - minuteStart;
  if (elapsed >= 60000) {
    requestsThisMinute = 0;
    minuteStart = now;
  }
  if (requestsThisMinute >= MAX_RPM) {
    const waitTime = 60000 - elapsed;
    console.log(`  Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    requestsThisMinute = 0;
    minuteStart = Date.now();
  }
  requestsThisMinute++;
}

function estimateCost(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 1.25;
}

async function callClaude(anthropic, prompt, maxTokens) {
  await checkRateLimit();
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content[0].text;
  const cost = estimateCost(response.usage.input_tokens, response.usage.output_tokens);
  return { text, cost };
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

// Supabase enforces a server-side row cap of 1000. Paginate to get all rows.
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

// ============================================================
// STEP 1: KEYWORD PRE-FILTER
// ============================================================

async function runStep1(supabase) {
  const [newItems, reprocessItems] = await Promise.all([
    fetchAllPages(() => supabase.from('evidence_items').select('id, bill_title, source_text').is('keyword_filter_passed', null)),
    fetchAllPages(() => supabase.from('evidence_items').select('id, bill_title, source_text').eq('keyword_filter_passed', false).is('is_relevant', null)),
  ]);

  const unfiltered = [...newItems, ...reprocessItems];
  const passedIds = [];
  const failedIds = [];

  for (const item of unfiltered) {
    const text = `${item.bill_title || ''} ${item.source_text || ''}`;
    if (isPABusinessRelevant(text)) {
      passedIds.push(item.id);
    } else {
      failedIds.push(item.id);
    }
  }

  for (let i = 0; i < passedIds.length; i += CHUNK) {
    await supabase.from('evidence_items').update({ keyword_filter_passed: true }).in('id', passedIds.slice(i, i + CHUNK));
  }
  for (let i = 0; i < failedIds.length; i += CHUNK) {
    await supabase.from('evidence_items').update({ keyword_filter_passed: false }).in('id', failedIds.slice(i, i + CHUNK));
  }

  return { passedCount: passedIds.length, totalCount: unfiltered.length };
}

// ============================================================
// STEP 2: LLM RELEVANCE CLASSIFICATION
// ============================================================

async function runStep2(supabase, anthropic, maxBudget) {
  // Fetch items that passed keyword filter but haven't been LLM-classified yet.
  // is_relevant defaults to false in the DB, so we check for both null and false
  // (null = never set, false = default or explicitly failed — either needs LLM).
  const [nullItems, falseItems] = await Promise.all([
    fetchAllPages(() =>
      supabase.from('evidence_items')
        .select('id, evidence_type, bill_title, source_text')
        .eq('keyword_filter_passed', true)
        .is('is_relevant', null)
    ),
    fetchAllPages(() =>
      supabase.from('evidence_items')
        .select('id, evidence_type, bill_title, source_text')
        .eq('keyword_filter_passed', true)
        .eq('is_relevant', false)
        .is('llm_relevance_score', null)
    ),
  ]);
  const items = [...nullItems, ...falseItems];
  console.log(`  ${items.length} items need relevance classification`);

  let cost = 0;
  let relevantCount = 0;

  for (const item of items) {
    if (cost >= maxBudget) {
      console.log(`  Budget limit reached ($${cost.toFixed(2)}), stopping.`);
      break;
    }

    try {
      const prompt = `You are classifying whether a Pennsylvania legislative item is substantively related to PA Chamber of Commerce business priorities.

ITEM TYPE: ${item.evidence_type}
TITLE: ${item.bill_title || 'N/A'}
CONTENT: ${(item.source_text || '').substring(0, 2000)}

PA Chamber priorities: taxes & business competitiveness, permitting & regulatory reform, civil justice reform, fiscal responsibility, workforce & education, energy & environment, labor & employment, infrastructure, health care.

Analyze whether this item substantively relates to any PA Chamber business priority.

Return ONLY valid JSON with no other text:
{
  "relevant": true or false,
  "confidence": 0.0 to 1.0,
  "pa_chamber_principles": ["P1", "P2", etc],
  "rationale": "one sentence explanation"
}

Rules:
- "relevant" means the item's PRIMARY purpose or a MAJOR provision involves a PA Chamber priority
- Do not mark as relevant if only mentioned in passing
- "pa_chamber_principles" lists which principles this maps to: P1=Taxes, P2=Permitting, P3=Civil Justice, P4=Fiscal, P5=Workforce, P6=Energy, P7=Labor, P8=Infrastructure, P9=Health Care
- "confidence" reflects how certain you are about the relevance determination`;

      const result_llm = await callClaude(anthropic, prompt, 300);
      cost += result_llm.cost;

      const result = parseJSON(result_llm.text);
      const isRelevant = result.relevant && result.confidence >= 0.6;

      await supabase
        .from('evidence_items')
        .update({
          llm_relevance_score: result.confidence,
          llm_relevance_rationale: result.rationale,
          is_relevant: isRelevant,
          tagged_principles: result.pa_chamber_principles || [],
        })
        .eq('id', item.id);

      if (isRelevant) relevantCount++;
    } catch (error) {
      console.error(`    Error classifying item ${item.id}:`, error.message);
      await supabase.from('api_usage_log').insert({ api_name: 'claude', status: 'error', error_message: error.message });
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { relevantCount, cost };
}

// ============================================================
// STEP 3: BILL DIRECTION CLASSIFICATION
// ============================================================

function buildBillPrinciplePairs(items) {
  const pairs = new Map();
  for (const item of items) {
    for (const principle of item.tagged_principles || []) {
      const key = `${item.bill_id}:${principle}`;
      if (!pairs.has(key)) {
        pairs.set(key, { bill_id: item.bill_id, bill_title: item.bill_title, principle });
      }
    }
  }
  return pairs;
}

async function loadExistingClassKeys(supabase, pairs) {
  const uniqueBillIds = [...new Set([...pairs.values()].map((p) => p.bill_id))];
  const existingKeys = new Set();
  for (let i = 0; i < uniqueBillIds.length; i += CHUNK) {
    const { data: existing } = await supabase
      .from('bill_classifications')
      .select('bill_id, principle')
      .in('bill_id', uniqueBillIds.slice(i, i + CHUNK))
      .limit(CHUNK * 20);
    for (const bc of existing || []) {
      existingKeys.add(`${bc.bill_id}:${bc.principle}`);
    }
  }
  return existingKeys;
}

async function runStep3(supabase, anthropic, maxBudget) {
  const relevantBillItems = await fetchAllPages(() =>
    supabase.from('evidence_items')
      .select('bill_id, bill_title, tagged_principles')
      .eq('is_relevant', true)
      .not('bill_id', 'is', null)
      .in('evidence_type', BILL_EVIDENCE_TYPES)
  );

  const billPrinciplePairs = buildBillPrinciplePairs(relevantBillItems || []);
  const existingClassKeys = await loadExistingClassKeys(supabase, billPrinciplePairs);

  let cost = 0;
  let billClassCount = 0;

  for (const [key, pair] of billPrinciplePairs) {
    if (cost >= maxBudget) break;
    if (existingClassKeys.has(key)) continue;

    const p = PA_CHAMBER_PRINCIPLES[pair.principle];
    if (!p) continue;

    try {
      const prompt = `You are classifying the direction of a Pennsylvania legislative bill relative to a PA Chamber of Commerce business priority.

BILL ID: ${pair.bill_id}
BILL TITLE: ${pair.bill_title || 'N/A'}

PA CHAMBER PRIORITY: ${p.name}
PRIORITY DESCRIPTION: ${p.description}
KEY INDICATORS: ${p.indicators.join(', ')}

Question: If a Pennsylvania House representative sponsors or votes YEA (in favor) on this bill, does that SUPPORT (+1) or OPPOSE (-1) this PA Chamber priority?

Return ONLY valid JSON with no other text:
{
  "yea_direction": 1 or -1,
  "confidence": 0.0 to 1.0,
  "rationale": "explanation of why sponsoring/voting Yea supports or opposes this priority"
}

Rules:
- +1 means sponsoring/voting Yea SUPPORTS the PA Chamber priority
- -1 means sponsoring/voting Yea OPPOSES the PA Chamber priority
- Consider the bill's primary thrust, not minor provisions
- Lower confidence if the bill's relationship to the priority is ambiguous`;

      const result_llm = await callClaude(anthropic, prompt, 300);
      cost += result_llm.cost;

      const result = parseJSON(result_llm.text);

      await supabase.from('bill_classifications').insert({
        bill_id: pair.bill_id,
        bill_title: pair.bill_title,
        principle: pair.principle,
        yea_direction: result.yea_direction,
        classification_confidence: result.confidence,
        classification_rationale: result.rationale,
        llm_model: 'claude-haiku-4-5-20251001',
        prompt_version: 'v3.0',
      });

      billClassCount++;
    } catch (error) {
      console.error(`    Error classifying bill ${pair.bill_id}/${pair.principle}:`, error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { billClassCount, cost };
}

// ============================================================
// STEP 4: CLAIM EXTRACTION FROM STATEMENTS
// ============================================================

async function runStep4(supabase, anthropic, maxBudget) {
  const [relevantStatements, allPoliticians, alreadyClaimed] = await Promise.all([
    fetchAllPages(() => supabase.from('evidence_items').select('id, evidence_type, source_text, source_date, politician_id').eq('is_relevant', true).in('evidence_type', STATEMENT_EVIDENCE_TYPES)),
    fetchAllPages(() => supabase.from('politicians').select('id, full_name, party, county')),
    fetchAllPages(() => supabase.from('extracted_claims').select('evidence_item_id')),
  ]);

  const politicianMap = new Map(allPoliticians.map((p) => [p.id, p]));
  const claimedIds = new Set(alreadyClaimed.map((c) => c.evidence_item_id));
  const unprocessed = relevantStatements.filter((s) => !claimedIds.has(s.id));

  console.log(`  ${unprocessed.length} statements need claim extraction`);

  let cost = 0;
  let claimCount = 0;

  for (const stmt of unprocessed) {
    if (cost >= maxBudget) break;

    const politician = politicianMap.get(stmt.politician_id);
    if (!politician) continue;

    try {
      const prompt = `You are extracting policy position claims from a Pennsylvania legislative statement about business and economic policy.

REPRESENTATIVE: ${politician.full_name} (${partyLabel(politician.party)}, ${politician.county || 'PA'} County)
STATEMENT TYPE: ${stmt.evidence_type}
DATE: ${new Date(stmt.source_date).toISOString().split('T')[0]}
CONTENT:
${(stmt.source_text || '').substring(0, 3000)}

Extract every distinct policy claim related to PA Chamber priorities (taxes, permitting, civil justice, fiscal policy, workforce, energy, labor, infrastructure, health care).

Return ONLY valid JSON with no other text:
{
  "claims": [
    {
      "claim_text": "exact quote or close paraphrase from the statement",
      "stance": "support" | "oppose" | "neutral" | "conditional",
      "strength": "strong" | "moderate" | "weak",
      "is_hedged": true or false,
      "target_policy": "specific policy, bill, or concept being referenced",
      "pa_chamber_principles": ["P1", "P3", etc]
    }
  ],
  "extraction_confidence": 0.0 to 1.0
}

stance: support=explicitly in favor, oppose=explicitly against, neutral=no clear side, conditional=supports/opposes only under specific conditions
strength: strong=definitive language, moderate=clear but not emphatic, weak=tentative
is_hedged: true if qualifying language like "generally", "in principle", "could see"

Extract ONLY claims actually present in the text. If no relevant policy claims, return an empty claims array.`;

      const result_llm = await callClaude(anthropic, prompt, 1000);
      cost += result_llm.cost;

      const result = parseJSON(result_llm.text);

      const claimsToInsert = (result.claims || []).map((claim) => {
        const scoreKey = `${claim.stance},${claim.strength},${claim.is_hedged}`;
        return {
          evidence_item_id: stmt.id,
          claim_text: claim.claim_text,
          stance: claim.stance,
          strength: claim.strength,
          is_hedged: claim.is_hedged,
          target_policy: claim.target_policy || null,
          tagged_principles: claim.pa_chamber_principles || [],
          claim_score: CLAIM_SCORE_MAP[scoreKey] ?? 0.5,
          extraction_confidence: result.extraction_confidence,
          llm_model: 'claude-haiku-4-5-20251001',
          prompt_version: 'v3.0',
        };
      });

      if (claimsToInsert.length > 0) {
        await supabase.from('extracted_claims').insert(claimsToInsert);
        claimCount += claimsToInsert.length;
      }
    } catch (error) {
      console.error(`    Error extracting claims for ${stmt.id}:`, error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { claimCount, cost };
}

// ============================================================
// MAIN
// ============================================================

async function runEvaluationPipeline() {
  console.log('Starting PA Chamber evidence evaluation pipeline...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !supabaseKey || !anthropicKey) {
    console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const MAX_BUDGET = 10;

  try {
    console.log('STEP 1: Keyword pre-filter...');
    const { passedCount, totalCount } = await runStep1(supabase);
    console.log(`  ${passedCount}/${totalCount} items passed keyword filter\n`);

    console.log('STEP 2: LLM relevance classification...');
    const step2 = await runStep2(supabase, anthropic, MAX_BUDGET);
    console.log(`  ${step2.relevantCount} items classified as relevant\n`);

    const budgetAfter2 = MAX_BUDGET - step2.cost;

    console.log('STEP 3: Bill direction classification...');
    const step3 = await runStep3(supabase, anthropic, budgetAfter2);
    console.log(`  ${step3.billClassCount} bill direction classifications created\n`);

    const budgetAfter3 = budgetAfter2 - step3.cost;

    console.log('STEP 4: Claim extraction from statements...');
    const step4 = await runStep4(supabase, anthropic, budgetAfter3);
    console.log(`  ${step4.claimCount} claims extracted\n`);

    const totalCost = step2.cost + step3.cost + step4.cost;
    console.log('Pipeline complete!');
    console.log(`Total LLM cost: $${totalCost.toFixed(4)}`);

    await supabase.from('api_usage_log').insert({
      api_name: 'claude',
      tokens_used: 0,
      estimated_cost: totalCost,
      status: 'success',
    });
  } catch (error) {
    console.error('Pipeline failed:', error);
    process.exit(1);
  }
}

runEvaluationPipeline();
