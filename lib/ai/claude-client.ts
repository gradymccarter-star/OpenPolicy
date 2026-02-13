import Anthropic from '@anthropic-ai/sdk';
import { getDB } from '../db/client';
import { estimateClaudeCost } from '../utils/helpers';
import { OECD_PRINCIPLES, RELEVANCE_CONFIDENCE_THRESHOLD } from '../utils/constants';
import type {
  RelevanceClassificationResult,
  BillDirectionResult,
  ClaimExtractionResult,
  PrincipleId,
} from '../utils/types';

// Singleton Anthropic client
let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

// Rate limiting tracker
const rateLimiter = {
  requestsThisMinute: 0,
  minuteStart: Date.now(),
  maxRequestsPerMinute: 50,
};

async function checkRateLimit(): Promise<void> {
  const now = Date.now();
  const minuteElapsed = now - rateLimiter.minuteStart;

  if (minuteElapsed >= 60000) {
    rateLimiter.requestsThisMinute = 0;
    rateLimiter.minuteStart = now;
  }

  if (rateLimiter.requestsThisMinute >= rateLimiter.maxRequestsPerMinute) {
    const waitTime = 60000 - minuteElapsed;
    console.log(`Rate limit reached. Waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    rateLimiter.requestsThisMinute = 0;
    rateLimiter.minuteStart = Date.now();
  }

  rateLimiter.requestsThisMinute++;
}

// Budget tracking
let totalCostToday = 0;
const MAX_DAILY_BUDGET = 10;

export function checkBudget(estimatedCost: number): boolean {
  if (totalCostToday + estimatedCost > MAX_DAILY_BUDGET) {
    console.error(`Budget exceeded! Total today: $${totalCostToday.toFixed(2)}`);
    return false;
  }
  return true;
}

export function addToBudget(cost: number): void {
  totalCostToday += cost;
}

/**
 * Internal: call Claude with a prompt, return raw text response.
 * Handles rate limiting, budget, cost tracking, and logging.
 */
async function callClaude(prompt: string, maxTokens: number): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getAnthropicClient();
  await checkRateLimit();

  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  const estimatedCost = estimateClaudeCost(estimatedInputTokens, maxTokens, 'haiku');

  if (!checkBudget(estimatedCost)) {
    throw new Error('Daily budget exceeded');
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const actualCost = estimateClaudeCost(inputTokens, outputTokens, 'haiku');

    await logAPIUsage('claude', inputTokens, outputTokens, actualCost, 'success');
    addToBudget(actualCost);

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    return { text: content.text, inputTokens, outputTokens };
  } catch (error) {
    await logAPIUsage('claude', 0, 0, 0, 'error', (error as Error).message);
    throw error;
  }
}

/**
 * Parse JSON from Claude's response text
 */
function parseJSON<T>(text: string): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }
  return JSON.parse(jsonMatch[0]);
}

// ============================================================
// PROMPT 1: Relevance Classification (Section 4.2, Stage 2)
// ============================================================

export async function classifyRelevance(
  itemType: string,
  itemTitle: string,
  itemContent: string,
): Promise<RelevanceClassificationResult> {
  const prompt = `You are classifying whether a legislative item is substantively related to AI/ML policy.

ITEM TYPE: ${itemType}
TITLE: ${itemTitle}
CONTENT: ${itemContent}

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
- "oecd_principles" should list which of the 5 principles (P1-P5) this item maps to:
  P1 = Inclusive Growth & Well-being
  P2 = Human-Centered Values & Fairness
  P3 = Transparency & Explainability
  P4 = Robustness, Security & Safety
  P5 = Accountability
- An item can map to multiple principles
- "confidence" reflects how certain you are about the relevance determination`;

  const { text } = await callClaude(prompt, 300);
  return parseJSON<RelevanceClassificationResult>(text);
}

// ============================================================
// PROMPT 2: Bill Direction Classification (Section 4.3)
// ============================================================

export async function classifyBillDirection(
  billId: string,
  billTitle: string,
  billSummary: string,
  billTextExcerpt: string,
  principle: PrincipleId,
): Promise<BillDirectionResult> {
  const p = OECD_PRINCIPLES[principle];

  const prompt = `You are classifying the direction of a legislative bill relative to a specific OECD AI principle.

BILL ID: ${billId}
BILL TITLE: ${billTitle}
BILL SUMMARY: ${billSummary}
BILL TEXT (excerpt): ${billTextExcerpt}

OECD PRINCIPLE: ${p.name}
PRINCIPLE DESCRIPTION: ${p.description}
KEY INDICATORS: ${p.indicators.join(', ')}

Question: If a senator votes YEA (in favor) on this bill, does that SUPPORT (+1) or OPPOSE (-1)
this OECD principle?

Return ONLY valid JSON with no other text:
{
  "yea_direction": 1 or -1,
  "confidence": 0.0 to 1.0,
  "rationale": "explanation of why a Yea vote supports or opposes this principle"
}

Rules:
- +1 means voting Yea SUPPORTS the principle (e.g., a transparency bill supports P3)
- -1 means voting Yea OPPOSES the principle (e.g., an AI exemption bill opposes P3)
- Consider the bill's primary thrust, not minor provisions
- If the bill has mixed effects on the principle, classify based on the dominant effect
- Lower your confidence if the bill's relationship to the principle is ambiguous`;

  const { text } = await callClaude(prompt, 300);
  return parseJSON<BillDirectionResult>(text);
}

// ============================================================
// PROMPT 3: Statement Claim Extraction (Section 5.1)
// ============================================================

export async function extractClaims(
  politicianName: string,
  party: string,
  state: string,
  statementType: string,
  statementDate: string,
  statementContent: string,
): Promise<ClaimExtractionResult> {
  const prompt = `You are extracting policy position claims from a political statement about AI policy.

POLITICIAN: ${politicianName} (${party}, ${state})
STATEMENT TYPE: ${statementType}
DATE: ${statementDate}
CONTENT:
${statementContent}

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
- "conditional" = supports/opposes only under specific conditions ("I'd support X if Y")

strength:
- "strong" = definitive language ("I will fight for", "absolutely must", "I introduced this bill")
- "moderate" = clear but not emphatic ("I support", "I believe we should", "I voted for")
- "weak" = tentative ("it seems reasonable", "worth considering", "has some merit")

is_hedged:
- true if the claim includes qualifying language: "generally", "in principle", "could see",
  "worth exploring", "under certain circumstances", "to some extent", "perhaps"
- false if the position is stated directly without qualification

CRITICAL RULES:
- Extract ONLY claims actually present in the text. Do not infer or assume positions.
- Each claim must be traceable to specific language in the statement.
- "claim_text" should be a direct quote or very close paraphrase.
- A single statement can contain multiple claims, even contradictory ones.
- If the statement contains no AI-relevant policy claims, return an empty claims array.
- extraction_confidence reflects how clearly the statement expresses classifiable positions.`;

  const { text } = await callClaude(prompt, 1000);
  return parseJSON<ClaimExtractionResult>(text);
}

// ============================================================
// Utility: API Usage Logging
// ============================================================

async function logAPIUsage(
  apiName: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCost: number,
  status: 'success' | 'error',
  errorMessage?: string,
): Promise<void> {
  try {
    const db = getDB();
    await db`
      INSERT INTO api_usage_log (
        api_name, tokens_used, estimated_cost, status, error_message
      ) VALUES (
        ${apiName},
        ${inputTokens + outputTokens},
        ${estimatedCost},
        ${status},
        ${errorMessage || null}
      )
    `;
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
}

export async function getTodaysCost(): Promise<number> {
  try {
    const db = getDB();
    const today = new Date().toISOString().split('T')[0];
    const result = await db`
      SELECT COALESCE(SUM(estimated_cost), 0) as total
      FROM api_usage_log
      WHERE api_name = 'claude'
        AND created_at >= ${today}::date
        AND status = 'success'
    `;
    return parseFloat(result[0].total) || 0;
  } catch (error) {
    console.error('Failed to get today\'s cost:', error);
    return 0;
  }
}
