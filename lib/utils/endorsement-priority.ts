// Combines a candidate's Chamber alignment score with their district's win-odds
// estimate into an endorsement priority tier. Pure math over data that's already
// computed elsewhere (overall_scores, pa-house-district-odds.json) — no new AI calls.
//
// Core logic: a 90%+ safe seat doesn't need an endorsement (nothing left to influence);
// a <15% longshot won't be saved by one. The highest-leverage endorsements are
// strong-alignment candidates in genuinely competitive races.

export type PartyCode = 'D' | 'R' | 'I';
export type AlignmentBand = 'high' | 'moderate' | 'low';
export type CompetitivenessBand = 'safe' | 'likely' | 'competitive' | 'longshot' | 'unknown';
export type EndorsementTier = 'priority' | 'strong_ally' | 'safe_ally' | 'promising_limited_evidence' | 'longshot_ally' | 'not_recommended';

// Matches CONFIDENCE_COLORS.MEDIUM.min in lib/utils/constants.ts — the same bar the rest
// of the site already uses to call a score "at least medium confidence" — rather than a
// new arbitrary number. A single evidence item (e.g. one candidate survey response)
// typically lands well below this, since confidence is partly a function of sample size.
const MIN_CONFIDENCE_FOR_POSITIVE_TIER = 0.4;

export interface EndorsementInput {
  party: PartyCode;
  percentile: number; // 0-100, from getNormalizedScore() — alignment bands are relative,
  // not absolute, because SCAI scores cluster tightly (p25/p50/p75 are nearly identical),
  // so a fixed score cutoff only ever caught the extreme top few percent of candidates.
  overallConfidence: number; // 0-1, overall_scores.overall_confidence — a high score built
  // on one data point (e.g. a single survey response) shouldn't rank the same as one built
  // on a real evidence record, regardless of how competitive the race is.
  demWinProbability: number | null; // from getDistrictOdds(district).dem_win_probability, null if unavailable
}

export interface EndorsementResult {
  tier: EndorsementTier;
  alignmentBand: AlignmentBand;
  competitivenessBand: CompetitivenessBand;
  ownWinProbability: number | null; // the candidate's own chance, not the district's D-centric probability
}

export const TIER_LABELS: Record<EndorsementTier, string> = {
  priority: 'Priority Endorsement',
  strong_ally: 'Strong Ally',
  safe_ally: 'Safe Ally',
  promising_limited_evidence: 'Promising — Limited Evidence',
  longshot_ally: 'Long-shot Ally',
  not_recommended: 'Not Recommended',
};

export const TIER_DESCRIPTIONS: Record<EndorsementTier, string> = {
  priority: 'Strong Chamber alignment in a genuinely competitive race — where an endorsement has the most potential to affect the outcome.',
  strong_ally: 'Strong Chamber alignment, favored but not locked in — worth backing.',
  safe_ally: 'Strong Chamber alignment in a seat that’s already effectively decided — low urgency, but a natural ally.',
  promising_limited_evidence: 'Scores as high-alignment, but on very little evidence (often a single candidate survey) — worth watching, not yet worth ranking with confidence. More evidence could move these up or down.',
  longshot_ally: 'Strong Chamber alignment, but currently unlikely to win — a values-driven endorsement, not a strategic one.',
  not_recommended: 'Alignment with Chamber priorities is moderate or low, regardless of the race’s competitiveness.',
};

/** A district's odds entry is D-centric (dem_win_probability); this converts it to the
 * given candidate's own chance, regardless of which party they run as. Exported so pages
 * that need a candidate's odds without needing the full tier (e.g. an unscored-candidate
 * list) don't have to duplicate this. */
export function deriveOwnWinProbability(party: PartyCode, demWinProbability: number | null): number | null {
  if (demWinProbability == null) return null;
  if (party === 'D') return demWinProbability;
  if (party === 'R') return 1 - demWinProbability;
  return null; // Independent candidates aren't modeled by the D-vs-R odds estimate
}

function alignmentBandFor(percentile: number): AlignmentBand {
  if (percentile >= 75) return 'high'; // top quartile of scored candidates
  if (percentile >= 50) return 'moderate';
  return 'low';
}

function competitivenessBandFor(ownWinProbability: number | null): CompetitivenessBand {
  if (ownWinProbability == null) return 'unknown';
  if (ownWinProbability >= 0.9) return 'safe';
  if (ownWinProbability >= 0.7) return 'likely';
  if (ownWinProbability >= 0.15) return 'competitive';
  return 'longshot';
}

export function computeEndorsementTier(input: EndorsementInput): EndorsementResult {
  const ownWinProbability = deriveOwnWinProbability(input.party, input.demWinProbability);

  const alignmentBand = alignmentBandFor(input.percentile);
  const competitivenessBand = competitivenessBandFor(ownWinProbability);

  if (alignmentBand !== 'high') {
    return { tier: 'not_recommended', alignmentBand, competitivenessBand, ownWinProbability };
  }

  // A high score is only as trustworthy as the evidence behind it. This check runs before
  // (and overrides) the competitiveness-based tiers below — a thin-evidence score shouldn't
  // confidently claim ANY positive tier, not just Priority.
  if (input.overallConfidence < MIN_CONFIDENCE_FOR_POSITIVE_TIER) {
    return { tier: 'promising_limited_evidence', alignmentBand, competitivenessBand, ownWinProbability };
  }

  let tier: EndorsementTier;
  switch (competitivenessBand) {
    case 'competitive':
      tier = 'priority';
      break;
    case 'likely':
      tier = 'strong_ally';
      break;
    case 'safe':
      tier = 'safe_ally';
      break;
    default:
      tier = 'longshot_ally'; // covers 'longshot' and 'unknown'
  }

  return { tier, alignmentBand, competitivenessBand, ownWinProbability };
}
