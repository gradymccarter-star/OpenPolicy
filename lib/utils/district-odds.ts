// Deterministic baseline for district win-probability estimates. Pure math, no I/O —
// scripts/jobs/compute-district-odds.js feeds this baseline (plus the raw inputs) to
// Claude, which can nudge it within a capped range and writes the rationale. Keeping
// this function pure/testable is what makes the number reproducible rather than a
// black-box LLM guess.

export type PartyCode = 'D' | 'R' | 'I';

export type DistrictRating = 'Safe D' | 'Likely D' | 'Lean D' | 'Toss-up' | 'Lean R' | 'Likely R' | 'Safe R';

export interface MarginHistoryEntry {
  year: number;
  marginPct: number | null; // magnitude, always >= 0 — direction comes from winnerParty
  winnerParty: PartyCode | null;
}

export interface RegistrationInput {
  republican: number;
  democrat: number;
  other: number;
  total: number;
}

export interface DistrictOddsInputs {
  marginHistory: MarginHistoryEntry[];
  registration: RegistrationInput | null;
  incumbentParty: PartyCode | null;
  contested: boolean;
  soleParty?: PartyCode | null; // when !contested, the only party fielding a candidate
}

export interface SignalBreakdown {
  historicalSignal: number; // recency-weighted signed D margin from past results
  registrationSignal: number; // signed D registration gap
  incumbencyShift: number; // points shifted toward the incumbent's party
  combinedSignal: number; // what's fed into the logistic curve
}

export interface DistrictOddsBaseline {
  demWinProbability: number; // 0-1
  rating: DistrictRating;
  signalBreakdown: SignalBreakdown;
}

// Heavily favors 2024: PA redrew its state house map after the 2020 census, effective
// for the 2022 cycle onward, so 2018/2020 results are under the OLD map and 2024 is the
// only cycle on the CURRENT one. Older cycles still contribute (and still count toward
// the consistency check below), but shouldn't dominate a "trend" that may span a redraw.
const RECENCY_WEIGHTS = [0.7, 0.2, 0.1]; // most-recent cycle first
const HISTORY_WEIGHT = 0.65; // vs. 0.35 for current registration — actual turnout behavior outweighs a static snapshot
const INCUMBENCY_BONUS_PTS = 4; // typical PA state-legislature incumbency advantage
// Calibrated so only the most consistently lopsided districts (multi-cycle margins in
// the 60-80+ point range) land above ~95% — most contested races shouldn't, absent
// genuinely convincing multi-signal evidence.
const LOGISTIC_K = 0.05;
// A district whose winner flipped across the available cycles gets less credit for its
// historical signal — a single volatile/reversed year (often a fluke or effectively
// uncontested year) shouldn't produce the same confidence as a genuinely stable seat.
const INCONSISTENT_HISTORY_DAMPENER = 0.6;
const UNCONTESTED_PROBABILITY = 0.97; // not 1.0 — leaves room for write-in/ballot-access surprises

function signedMargin(entry: MarginHistoryEntry): number {
  if (entry.marginPct == null || !entry.winnerParty) return 0;
  if (entry.winnerParty === 'D') return entry.marginPct;
  if (entry.winnerParty === 'R') return -entry.marginPct;
  return 0;
}

function historicalSignal(marginHistory: MarginHistoryEntry[]): { signal: number; consistent: boolean } {
  const sorted = [...marginHistory].sort((a, b) => b.year - a.year).slice(0, RECENCY_WEIGHTS.length);
  if (sorted.length === 0) return { signal: 0, consistent: true };
  let weightedSum = 0;
  let weightUsed = 0;
  sorted.forEach((entry, i) => {
    const w = RECENCY_WEIGHTS[i];
    weightedSum += w * signedMargin(entry);
    weightUsed += w;
  });
  const winners = sorted.map((e) => e.winnerParty).filter((p): p is PartyCode => p !== null);
  const consistent = winners.length <= 1 || winners.every((w) => w === winners[0]);
  return { signal: weightUsed > 0 ? weightedSum / weightUsed : 0, consistent };
}

function registrationSignal(registration: RegistrationInput | null): number {
  if (!registration || registration.total <= 0) return 0;
  return ((registration.democrat - registration.republican) / registration.total) * 100;
}

function ratingForProbability(prob: number): DistrictRating {
  if (prob >= 0.9) return 'Safe D';
  if (prob >= 0.7) return 'Likely D';
  if (prob >= 0.55) return 'Lean D';
  if (prob > 0.45) return 'Toss-up';
  if (prob > 0.3) return 'Lean R';
  if (prob > 0.1) return 'Likely R';
  return 'Safe R';
}

export function computeDistrictOddsBaseline(inputs: DistrictOddsInputs): DistrictOddsBaseline {
  if (!inputs.contested) {
    const demWinProbability = inputs.soleParty === 'D' ? UNCONTESTED_PROBABILITY : inputs.soleParty === 'R' ? 1 - UNCONTESTED_PROBABILITY : 0.5;
    return {
      demWinProbability,
      rating: ratingForProbability(demWinProbability),
      signalBreakdown: { historicalSignal: 0, registrationSignal: 0, incumbencyShift: 0, combinedSignal: 0 },
    };
  }

  const { signal: rawHistSignal, consistent } = historicalSignal(inputs.marginHistory);
  const histSignal = consistent ? rawHistSignal : rawHistSignal * INCONSISTENT_HISTORY_DAMPENER;
  const regSignal = registrationSignal(inputs.registration);
  const incumbencyShift = inputs.incumbentParty === 'D' ? INCUMBENCY_BONUS_PTS : inputs.incumbentParty === 'R' ? -INCUMBENCY_BONUS_PTS : 0;

  const combinedSignal = HISTORY_WEIGHT * histSignal + (1 - HISTORY_WEIGHT) * regSignal + incumbencyShift;
  const demWinProbability = 1 / (1 + Math.exp(-LOGISTIC_K * combinedSignal));

  return {
    demWinProbability,
    rating: ratingForProbability(demWinProbability),
    signalBreakdown: { historicalSignal: histSignal, registrationSignal: regSignal, incumbencyShift, combinedSignal },
  };
}

export { ratingForProbability };
