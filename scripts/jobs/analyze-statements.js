/**
 * Evidence Evaluation Pipeline
 * ============================
 * Replaces the old single-prompt LLM scoring with the multi-signal evidence framework.
 *
 * Pipeline steps:
 *   1. Keyword pre-filter on all unprocessed evidence items
 *   2. LLM relevance classification on items that pass keyword filter
 *   3. Bill direction classification (once per bill per principle, cached)
 *   4. Claim extraction from relevant statements
 *
 * Score computation is handled separately by calculate-scores.js
 */

const postgres = require('postgres');
const Anthropic = require('@anthropic-ai/sdk').default;
const { AI_RELEVANCE_KEYWORDS } = require('../shared/constants');

// ============================================================
// CONSTANTS (mirrored from lib/utils/constants.ts for Node.js)
// ============================================================

const RELEVANCE_CONFIDENCE_THRESHOLD = 0.6;

const CLAIM_SCORE_MAP = {
  'support,strong,false': 1.0,
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
  'oppose,strong,false': 0.0,
  'oppose,strong,true': 0.05,
};

const OECD_PRINCIPLES = {
  P1: {
    name: 'Inclusive Growth, Sustainable Development & Well-being',
    description: 'AI should benefit all of humanity and promote inclusive growth',
    indicators: [
      'equitable AI benefits across demographics',
      'AI workforce training and transition support',
      'digital divide and rural access',
      'environmental sustainability of AI',
      'small business AI access',
    ],
  },
  P2: {
    name: 'Human-Centered Values & Fairness',
    description: 'AI must respect human rights, democratic values, and diversity',
    indicators: [
      'civil liberties protection from AI systems',
      'anti-discrimination in algorithmic decisions',
      'privacy protections for AI data collection',
      'democratic process integrity',
      'consent and individual autonomy',
    ],
  },
  P3: {
    name: 'Transparency & Explainability',
    description: 'People should understand AI outcomes and be able to challenge them',
    indicators: [
      'disclosure requirements for AI use',
      'algorithm transparency mandates',
      'right to explanation of AI decisions',
      'AI content labeling and watermarking',
      'public reporting on government AI use',
    ],
  },
  P4: {
    name: 'Robustness, Security & Safety',
    description: 'AI systems must be secure, safe, and robust throughout their lifecycle',
    indicators: [
      'AI testing and evaluation requirements',
      'cybersecurity standards for AI',
      'critical infrastructure AI protections',
      'AI incident reporting',
      'safety benchmarks and red-teaming',
    ],
  },
  P5: {
    name: 'Accountability',
    description: 'Organizations developing/deploying AI should be accountable',
    indicators: [
      'AI liability frameworks',
      'oversight body creation',
      'enforcement mechanisms',
      'whistleblower protections for AI harms',
      'redress mechanisms for affected individuals',
    ],
  },
};

const BILL_EVIDENCE_TYPES = ['floor_vote', 'bill_sponsorship', 'bill_cosponsorship'];
const STATEMENT_EVIDENCE_TYPES = ['committee_statement', 'floor_speech', 'press_release', 'social_media'];

// ============================================================
// RATE LIMITING & BUDGET
// ============================================================

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
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestsThisMinute = 0;
    minuteStart = Date.now();
  }
  requestsThisMinute++;
}

function estimateCost(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 1.25;
}

// ============================================================
// LLM CALL HELPER
// ============================================================

async function callClaude(anthropic, prompt, maxTokens) {
  await checkRateLimit();

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = estimateCost(inputTokens, outputTokens);

  return { text, inputTokens, outputTokens, cost };
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

// ============================================================
// MAIN PIPELINE
// ============================================================

async function runEvaluationPipeline() {
  console.log('Starting evidence evaluation pipeline...\n');

  const databaseUrl = process.env.DATABASE_URL;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!databaseUrl || !anthropicKey) {
    console.error('Missing environment variables (DATABASE_URL, ANTHROPIC_API_KEY)');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', prepare: false });
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  let totalCost = 0;
  const MAX_BUDGET = 10;

  try {
    // ========== STEP 1: KEYWORD PRE-FILTER ==========
    console.log('STEP 1: Keyword pre-filter...');

    const unfiltered = await sql`
      SELECT id, bill_title, source_text
      FROM evidence_items
      WHERE keyword_filter_passed IS NULL
         OR (keyword_filter_passed = false AND is_relevant IS NULL)
    `;

    let keywordPassCount = 0;
    for (const item of unfiltered) {
      const textToSearch = `${item.bill_title || ''} ${item.source_text || ''}`.toLowerCase();
      const passed = AI_RELEVANCE_KEYWORDS.some(kw => textToSearch.includes(kw));

      await sql`
        UPDATE evidence_items
        SET keyword_filter_passed = ${passed}
        WHERE id = ${item.id}
      `;

      if (passed) keywordPassCount++;
    }

    console.log(`  ${keywordPassCount}/${unfiltered.length} items passed keyword filter\n`);

    // ========== STEP 2: LLM RELEVANCE CLASSIFICATION ==========
    console.log('STEP 2: LLM relevance classification...');

    const keywordPassed = await sql`
      SELECT id, evidence_type, bill_title, source_text
      FROM evidence_items
      WHERE keyword_filter_passed = true
        AND is_relevant IS NULL
    `;

    console.log(`  ${keywordPassed.length} items need relevance classification`);

    let relevantCount = 0;
    for (const item of keywordPassed) {
      if (totalCost >= MAX_BUDGET) {
        console.log(`  Budget limit reached ($${totalCost.toFixed(2)}), stopping.`);
        break;
      }

      try {
        const prompt = `You are classifying whether a legislative item is substantively related to AI/ML policy.

ITEM TYPE: ${item.evidence_type}
TITLE: ${item.bill_title || 'N/A'}
CONTENT: ${(item.source_text || '').substring(0, 2000)}

Analyze whether this item substantively relates to artificial intelligence, machine learning,
algorithmic decision-making, or closely related technology policy.

Return ONLY valid JSON with no other text:
{
  "relevant": true or false,
  "confidence": 0.0 to 1.0,
  "oecd_principles": ["P1", "P2", etc],
  "rationale": "one sentence explanation"
}

Rules:
- "relevant" means the item's PRIMARY purpose or a MAJOR provision involves AI/ML policy
- Do not mark as relevant if AI is only mentioned in passing
- "oecd_principles" should list which of the 5 principles (P1-P5) this item maps to
- An item can map to multiple principles
- "confidence" reflects how certain you are about the relevance determination`;

        const { text, cost } = await callClaude(anthropic, prompt, 300);
        totalCost += cost;

        const result = parseJSON(text);
        const isRelevant = result.relevant && result.confidence >= RELEVANCE_CONFIDENCE_THRESHOLD;

        await sql`
          UPDATE evidence_items
          SET llm_relevance_score = ${result.confidence},
              llm_relevance_rationale = ${result.rationale},
              is_relevant = ${isRelevant},
              tagged_principles = ${result.oecd_principles || []}
          WHERE id = ${item.id}
        `;

        if (isRelevant) relevantCount++;
      } catch (error) {
        console.error(`    Error classifying item ${item.id}:`, error.message);
        await sql`
          INSERT INTO api_usage_log (api_name, status, error_message)
          VALUES ('claude', 'error', ${error.message})
        `;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`  ${relevantCount} items classified as relevant\n`);

    // ========== STEP 3: BILL DIRECTION CLASSIFICATION ==========
    console.log('STEP 3: Bill direction classification...');

    const relevantBillItems = await sql`
      SELECT DISTINCT bill_id, bill_title, tagged_principles
      FROM evidence_items
      WHERE is_relevant = true
        AND bill_id IS NOT NULL
        AND evidence_type IN ('floor_vote', 'bill_sponsorship', 'bill_cosponsorship')
    `;

    let billClassCount = 0;
    for (const item of relevantBillItems) {
      if (totalCost >= MAX_BUDGET) break;

      const principles = item.tagged_principles || [];

      for (const principle of principles) {
        // Check cache
        const cached = await sql`
          SELECT id FROM bill_classifications
          WHERE bill_id = ${item.bill_id} AND principle = ${principle}
        `;
        if (cached.length > 0) continue;

        try {
          const p = OECD_PRINCIPLES[principle];
          if (!p) continue;

          const prompt = `You are classifying the direction of a legislative bill relative to a specific OECD AI principle.

BILL ID: ${item.bill_id}
BILL TITLE: ${item.bill_title || 'N/A'}

OECD PRINCIPLE: ${p.name}
PRINCIPLE DESCRIPTION: ${p.description}
KEY INDICATORS: ${p.indicators.join(', ')}

Question: If a senator votes YEA (in favor) on this bill, does that SUPPORT (+1) or OPPOSE (-1) this OECD principle?

Return ONLY valid JSON with no other text:
{
  "yea_direction": 1 or -1,
  "confidence": 0.0 to 1.0,
  "rationale": "explanation of why a Yea vote supports or opposes this principle"
}

Rules:
- +1 means voting Yea SUPPORTS the principle
- -1 means voting Yea OPPOSES the principle
- Consider the bill's primary thrust, not minor provisions
- Lower your confidence if the bill's relationship to the principle is ambiguous`;

          const { text, cost } = await callClaude(anthropic, prompt, 300);
          totalCost += cost;

          const result = parseJSON(text);

          await sql`
            INSERT INTO bill_classifications (
              bill_id, bill_title, principle,
              yea_direction, classification_confidence, classification_rationale,
              llm_model, prompt_version
            ) VALUES (
              ${item.bill_id}, ${item.bill_title}, ${principle},
              ${result.yea_direction}, ${result.confidence}, ${result.rationale},
              'claude-haiku-4-5-20251001', 'v2.0'
            )
          `;

          billClassCount++;
        } catch (error) {
          console.error(`    Error classifying bill ${item.bill_id}/${principle}:`, error.message);
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`  ${billClassCount} bill direction classifications created\n`);

    // ========== STEP 4: CLAIM EXTRACTION FROM STATEMENTS ==========
    console.log('STEP 4: Claim extraction from statements...');

    const relevantStatements = await sql`
      SELECT ei.id, ei.evidence_type, ei.source_text, ei.source_date,
             ei.politician_id, p.full_name, p.party, p.state
      FROM evidence_items ei
      JOIN politicians p ON ei.politician_id = p.id
      WHERE ei.is_relevant = true
        AND ei.evidence_type IN ('committee_statement', 'floor_speech', 'press_release', 'social_media')
        AND ei.id NOT IN (SELECT DISTINCT evidence_item_id FROM extracted_claims)
    `;

    console.log(`  ${relevantStatements.length} statements need claim extraction`);

    let claimCount = 0;
    for (const stmt of relevantStatements) {
      if (totalCost >= MAX_BUDGET) break;

      try {
        const partyName = stmt.party === 'D' ? 'Democrat' : stmt.party === 'R' ? 'Republican' : 'Independent';

        const prompt = `You are extracting policy position claims from a political statement about AI policy.

POLITICIAN: ${stmt.full_name} (${partyName}, ${stmt.state})
STATEMENT TYPE: ${stmt.evidence_type}
DATE: ${new Date(stmt.source_date).toISOString().split('T')[0]}
CONTENT:
${(stmt.source_text || '').substring(0, 3000)}

Extract every distinct policy claim related to AI/ML from this statement.

Return ONLY valid JSON with no other text:
{
  "claims": [
    {
      "claim_text": "exact quote or close paraphrase from the statement",
      "stance": "support" | "oppose" | "neutral" | "conditional",
      "strength": "strong" | "moderate" | "weak",
      "is_hedged": true or false,
      "target_policy": "specific policy, bill, or concept being referenced",
      "oecd_principles": ["P1", "P3", etc]
    }
  ],
  "extraction_confidence": 0.0 to 1.0
}

CLASSIFICATION RULES:
stance:
- "support" = explicitly in favor of a policy/regulation/measure
- "oppose" = explicitly against a policy/regulation/measure
- "neutral" = acknowledges topic without taking a clear side
- "conditional" = supports/opposes only under specific conditions

strength:
- "strong" = definitive language ("I will fight for", "absolutely must")
- "moderate" = clear but not emphatic ("I support", "I believe we should")
- "weak" = tentative ("it seems reasonable", "worth considering")

is_hedged:
- true if qualifying language: "generally", "in principle", "could see", "worth exploring"
- false if stated directly without qualification

CRITICAL RULES:
- Extract ONLY claims actually present in the text. Do not infer or assume positions.
- Each claim must be traceable to specific language in the statement.
- If no AI-relevant policy claims, return an empty claims array.`;

        const { text, cost } = await callClaude(anthropic, prompt, 1000);
        totalCost += cost;

        const result = parseJSON(text);

        for (const claim of (result.claims || [])) {
          const key = `${claim.stance},${claim.strength},${claim.is_hedged}`;
          const claimScore = CLAIM_SCORE_MAP[key] ?? 0.5;

          await sql`
            INSERT INTO extracted_claims (
              evidence_item_id, claim_text, stance, strength, is_hedged,
              target_policy, tagged_principles, claim_score,
              extraction_confidence, llm_model, prompt_version
            ) VALUES (
              ${stmt.id}, ${claim.claim_text}, ${claim.stance}, ${claim.strength}, ${claim.is_hedged},
              ${claim.target_policy || null}, ${claim.oecd_principles || []}, ${claimScore},
              ${result.extraction_confidence}, 'claude-haiku-4-5-20251001', 'v2.0'
            )
          `;
          claimCount++;
        }
      } catch (error) {
        console.error(`    Error extracting claims for ${stmt.id}:`, error.message);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`  ${claimCount} claims extracted\n`);

    // ========== SUMMARY ==========
    console.log('Pipeline complete!');
    console.log(`Total LLM cost: $${totalCost.toFixed(4)}`);

    // Log final cost
    await sql`
      INSERT INTO api_usage_log (api_name, tokens_used, estimated_cost, status)
      VALUES ('claude', 0, ${totalCost}, 'success')
    `;

  } catch (error) {
    console.error('Pipeline failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runEvaluationPipeline();
