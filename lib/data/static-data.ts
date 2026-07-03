import fs from 'node:fs';
import path from 'node:path';
import type { BillStatusFile, BillStatus, CandidateResultsFile, CandidateYearResult, VoterRegistrationFile, DistrictVoterRegistration, PAChamberScorecardFile, PAChamberMemberScore } from '@/lib/utils/types';

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
