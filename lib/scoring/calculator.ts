// ============================================================
// Deterministic Scoring Calculator
// All scoring is deterministic math. No LLM calls in this file.
// ============================================================

import {
  EVIDENCE_WEIGHTS,
  TEMPORAL_DECAY_LAMBDA,
  CLAIM_SCORE_MAP,
  VOTE_POSITION_MAP,
  CONFIDENCE_TAU,
  DIVERSITY_THRESHOLD,
  PRINCIPLE_IDS,
} from '../utils/constants';

import type {
  EnrichedEvidenceItem,
  ScoredItem,
  PrincipleResult,
  OverallResult,
} from '../utils/types';

// ----- INDIVIDUAL ITEM SCORING -----

/**
 * Score a vote item (Section 4.3)
 * Fully deterministic: score = normalized(vote_position * yea_direction)
 */
function scoreVoteItem(item: EnrichedEvidenceItem): number {
  const position = VOTE_POSITION_MAP[item.vote_position ?? ''] ?? 0;
  const direction = item.bill_yea_direction ?? 0;
  const rawScore = position * direction; // -1, 0, or +1
  return (rawScore + 1) / 2; // normalize to [0, 1]
}

/**
 * Score a sponsorship item (Section 4.3 variant)
 * Sponsoring = implicit Yea vote
 */
function scoreSponsorshipItem(item: EnrichedEvidenceItem): number {
  const direction = item.bill_yea_direction ?? 0;
  const rawScore = 1 * direction; // sponsor = yea
  return (rawScore + 1) / 2;
}

/**
 * Score a statement item (Section 5.2 + 5.3)
 * Average of all claim scores from the mapping table
 */
function scoreStatementItem(item: EnrichedEvidenceItem): number {
  if (!item.claims || item.claims.length === 0) return 0.5;

  const claimScores = item.claims.map(claim => {
    const key = `${claim.stance},${claim.strength},${claim.is_hedged}`;
    return CLAIM_SCORE_MAP[key] ?? 0.5;
  });

  return claimScores.reduce((sum, s) => sum + s, 0) / claimScores.length;
}

/**
 * Get item-level confidence (c_i)
 */
function getItemConfidence(item: EnrichedEvidenceItem): number {
  switch (item.evidence_type) {
    case 'floor_vote':
      return item.bill_direction_confidence ?? 1.0;
    case 'bill_sponsorship':
    case 'bill_cosponsorship':
      return item.bill_direction_confidence ?? 0.9;
    case 'committee_statement':
    case 'floor_speech':
    case 'press_release':
    case 'social_media':
      return item.extraction_confidence ?? 0.7;
    default:
      return 0.5;
  }
}

/**
 * Compute temporal decay (Section 6.1)
 * d(Δt) = e^(-λ * Δt) where Δt = days since source_date
 */
function computeDecay(sourceDate: Date, referenceDate: Date = new Date()): number {
  const daysDiff = (referenceDate.getTime() - sourceDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-TEMPORAL_DECAY_LAMBDA * Math.max(0, daysDiff));
}

// ----- SCORE ITEM (ROUTE BY TYPE) -----

function scoreItem(item: EnrichedEvidenceItem): ScoredItem {
  let score: number;

  switch (item.evidence_type) {
    case 'floor_vote':
      score = scoreVoteItem(item);
      break;
    case 'bill_sponsorship':
    case 'bill_cosponsorship':
      score = scoreSponsorshipItem(item);
      break;
    default:
      score = scoreStatementItem(item);
  }

  return {
    score,
    weight: EVIDENCE_WEIGHTS[item.evidence_type] ?? 0.3,
    decay: computeDecay(item.source_date),
    confidence: getItemConfidence(item),
  };
}

// ----- PRINCIPLE SCORE AGGREGATION (Section 6.1) -----

/**
 * P_k(p) = Σ(s_i * w_i * d_i * c_i) / Σ(w_i * d_i * c_i)
 *
 * Weighted average where weights are
 * (evidence_type_weight * temporal_decay * item_confidence).
 */
function computePrincipleScore(items: EnrichedEvidenceItem[]): PrincipleResult {
  if (items.length === 0) {
    return {
      score: 0.5,
      confidence_evidence: 0,
      confidence_diversity: 0,
      confidence_avg_extraction: 0,
      confidence_overall: 0,
      num_items: 0,
      unique_source_types: 0,
      effective_sample_size: 0,
      items: [],
    };
  }

  const scoredItems = items.map(scoreItem);

  // --- Formula 6.1: Weighted aggregation ---
  let numerator = 0;
  let denominator = 0;

  for (const si of scoredItems) {
    const combinedWeight = si.weight * si.decay * si.confidence;
    numerator += si.score * combinedWeight;
    denominator += combinedWeight;
  }

  const principleScore = denominator > 0 ? numerator / denominator : 0.5;

  // --- Formula 6.3: Confidence computation ---
  const effectiveSampleSize = denominator;

  // Component 1: Evidence sufficiency — conf_evidence = 1 - e^(-n_eff / τ)
  const confEvidence = 1 - Math.exp(-effectiveSampleSize / CONFIDENCE_TAU);

  // Component 2: Source diversity — conf_diversity = min(1, unique_types / 3)
  const uniqueTypes = new Set(items.map(i => i.evidence_type)).size;
  const confDiversity = Math.min(1, uniqueTypes / DIVERSITY_THRESHOLD);

  // Component 3: Average extraction confidence
  const avgConfidence = scoredItems.reduce((sum, si) => sum + si.confidence, 0) / scoredItems.length;

  // Final confidence = product of all three
  const confOverall = confEvidence * confDiversity * avgConfidence;

  return {
    score: principleScore,
    confidence_evidence: confEvidence,
    confidence_diversity: confDiversity,
    confidence_avg_extraction: avgConfidence,
    confidence_overall: confOverall,
    num_items: items.length,
    unique_source_types: uniqueTypes,
    effective_sample_size: effectiveSampleSize,
    items: scoredItems,
  };
}

// ----- OVERALL SCORE (Section 6.2) -----

/**
 * A(p) = (1/5) * Σ P_k(p)
 * Simple average of all 5 principle scores.
 */
function computeOverallScore(
  principleResults: Record<string, PrincipleResult>,
): OverallResult {
  let scoreSum = 0;
  let confSum = 0;

  for (const p of PRINCIPLE_IDS) {
    const result = principleResults[p];
    if (result) {
      scoreSum += result.score;
      confSum += result.confidence_overall;
    } else {
      scoreSum += 0.5;
      confSum += 0;
    }
  }

  return {
    overall_score: scoreSum / 5,
    overall_confidence: confSum / 5,
    principles: principleResults,
  };
}

export {
  scoreItem,
  computePrincipleScore,
  computeOverallScore,
  scoreVoteItem,
  scoreSponsorshipItem,
  scoreStatementItem,
  computeDecay,
  getItemConfidence,
};
