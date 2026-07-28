import fs from 'node:fs';
import path from 'node:path';
import type { BillStatusFile, BillStatus, CandidateResultsFile, CandidateYearResult, VoterRegistrationFile, DistrictVoterRegistration, PAChamberScorecardFile, PAChamberMemberScore, ScoreNormalizationFile } from '@/lib/utils/types';

function loadJson<T>(filename: string): T | null {
  const p = path.join(process.cwd(), 'public', 'data', filename);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as T; } catch { return null; }
}

let _billStatus: BillStatusFile | null | undefined;
export function getBillStatus(billId: string): BillStatus | null {
  if (_billStatus === undefined) _billStatus = loadJson<BillStatusFile>('pa-house-bill-status.json');
  return _billStatus?.bills[billId] ?? null;
}

export function getBillStatusMap(): Record<string, BillStatus> {
  if (_billStatus === undefined) _billStatus = loadJson<BillStatusFile>('pa-house-bill-status.json');
  return _billStatus?.bills ?? {};
}

let _candidateResults: CandidateResultsFile | null | undefined;
export function getCandidateResults(district: string): Record<string, CandidateYearResult[]> | null {
  if (_candidateResults === undefined) _candidateResults = loadJson<CandidateResultsFile>('pa-house-candidate-results.json');
  return _candidateResults?.districts[district] ?? null;
}

let _voterReg: VoterRegistrationFile | null | undefined;
export function getVoterRegistration(district: string): DistrictVoterRegistration | null {
  if (_voterReg === undefined) _voterReg = loadJson<VoterRegistrationFile>('pa-house-voter-registration.json');
  return _voterReg?.districts[district] ?? null;
}
export function getVoterRegistrationAsOf(): string | null {
  if (_voterReg === undefined) _voterReg = loadJson<VoterRegistrationFile>('pa-house-voter-registration.json');
  return _voterReg?.as_of ?? null;
}

let _pachamber: PAChamberScorecardFile | null | undefined;
let _pachamberByDistrict: Record<string, PAChamberMemberScore> | null;

export function getPAChamberScore(district: string): PAChamberMemberScore | null {
  if (_pachamber === undefined) {
    _pachamber = loadJson<PAChamberScorecardFile>('pa-house-pachamber-scorecard.json');
    _pachamberByDistrict = _pachamber
      ? Object.fromEntries(Object.values(_pachamber.members).map((m) => [m.district, m]))
      : null;
  }
  return _pachamberByDistrict?.[district] ?? null;
}

export function getPAChamberStats(): PAChamberScorecardFile['stats'] | null {
  if (_pachamber === undefined) getPAChamberScore('000');
  return _pachamber?.stats ?? null;
}

export function getPAChamberSession(): string | null {
  if (_pachamber === undefined) getPAChamberScore('000');
  return _pachamber?.session ?? null;
}

let _aclupa: PAChamberScorecardFile | null | undefined;
let _aclupaByDistrict: Record<string, PAChamberMemberScore> | null;

export function getACLUPAScore(district: string): PAChamberMemberScore | null {
  if (_aclupa === undefined) {
    _aclupa = loadJson<PAChamberScorecardFile>('pa-house-aclupa-scorecard.json');
    _aclupaByDistrict = _aclupa
      ? Object.fromEntries(Object.values(_aclupa.members).map((m) => [m.district, m]))
      : null;
  }
  return _aclupaByDistrict?.[district] ?? null;
}

export function getACLUPAStats(): PAChamberScorecardFile['stats'] | null {
  if (_aclupa === undefined) getACLUPAScore('000');
  return _aclupa?.stats ?? null;
}

export function getACLUPASession(): string | null {
  if (_aclupa === undefined) getACLUPAScore('000');
  return _aclupa?.session ?? null;
}

let _normalization: ScoreNormalizationFile | null | undefined;

function loadNormalization(): ScoreNormalizationFile | null {
  if (_normalization !== undefined) return _normalization;
  _normalization = loadJson<ScoreNormalizationFile>('score-normalization.json');
  return _normalization;
}

// Returns the percentile rank (0–100) of rawScore among all scored candidates.
// 80 means "outscores 80% of scored candidates". Returns null if no normalization data.
export function getNormalizedScore(rawScore: number): number | null {
  const norm = loadNormalization();
  if (!norm || norm.sorted_scores.length === 0) return null;
  const scores = norm.sorted_scores;
  let lo = 0;
  let hi = scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (scores[mid] < rawScore) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / scores.length) * 100);
}

export function getScoreNormalizationMeta(): { total_scored: number; generated_at: string } | null {
  const norm = loadNormalization();
  return norm ? { total_scored: norm.total_scored, generated_at: norm.generated_at } : null;
}
