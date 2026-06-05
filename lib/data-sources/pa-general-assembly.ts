/**
 * PA General Assembly data client via LegiScan API
 * LegiScan aggregates PA House/Senate bills, votes, sponsorships, and member data.
 * Requires LEGISCAN_API_KEY env var — free tier available at legiscan.com
 */

import axios, { AxiosError } from 'axios';
import type { PartyType } from '../utils/types';

const BASE_URL = 'https://api.legiscan.com/';
const PA_STATE = 'PA';

// Current PA General Assembly session ID (2025-2026 = session 2069 as of 2025)
// Verify at: https://legiscan.com/PA/sessions
const CURRENT_SESSION_ID = 2192;

let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 500) {
    await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
  }
  lastRequestTime = Date.now();
}

async function apiFetch(op: string, params: Record<string, string | number> = {}): Promise<any> {
  const apiKey = process.env.LEGISCAN_API_KEY;
  if (!apiKey) throw new Error('LEGISCAN_API_KEY environment variable is not set');

  await rateLimit();

  try {
    const response = await axios.get(BASE_URL, {
      params: { key: apiKey, op, state: PA_STATE, ...params },
      timeout: 30000,
    });

    const data = response.data;
    if (data.status === 'ERROR') {
      throw new Error(`LegiScan API error: ${data.alert?.message ?? JSON.stringify(data)}`);
    }
    return data;
  } catch (error) {
    const status = (error as AxiosError)?.response?.status;
    if (status === 429) {
      console.log('    Rate limited by LegiScan, waiting 30s...');
      await new Promise((resolve) => setTimeout(resolve, 30000));
      return apiFetch(op, params);
    }
    throw error;
  }
}

// ── Member types ──────────────────────────────────────────────────────────────

export interface PALegislator {
  people_id: number;
  name: string;
  first_name: string;
  last_name: string;
  party: string;
  role: string;           // 'Rep' | 'Sen'
  district: string;
  party_id: number;
  active: boolean;
  ballotpedia?: string;
  twitter?: string;
  official_url?: string;
}

export interface PABill {
  bill_id: number;
  bill_number: string;
  title: string;
  description: string;
  session_id: number;
  body: string;           // 'H' | 'S'
  status: number;
  status_date: string;
  last_action: string;
  last_action_date: string;
  url: string;
  sponsors: PASponsor[];
}

export interface PASponsor {
  people_id: number;
  name: string;
  party: string;
  sponsor_type_id: number; // 1 = primary sponsor, 2 = co-sponsor
}

export interface PAVote {
  roll_call_id: number;
  bill_id: number;
  bill_number: string;
  date: string;
  description: string;
  yea: number;
  nay: number;
  individual_vote?: 'Yea' | 'Nay' | 'NV' | 'Abs';
}

// ── Member fetching ───────────────────────────────────────────────────────────

export async function fetchHouseMembers(): Promise<PALegislator[]> {
  const data = await apiFetch('getSessionPeople', { id: CURRENT_SESSION_ID });
  const people: PALegislator[] = data.sessionpeople?.people ?? [];
  return people.filter((p) => p.role === 'Rep' && p.active);
}

export async function fetchSenateMembers(): Promise<PALegislator[]> {
  const data = await apiFetch('getSessionPeople', { id: CURRENT_SESSION_ID });
  const people: PALegislator[] = data.sessionpeople?.people ?? [];
  return people.filter((p) => p.role === 'Sen' && p.active);
}

export async function fetchMemberById(peopleId: number): Promise<PALegislator | null> {
  const data = await apiFetch('getPerson', { id: peopleId });
  return data.person ?? null;
}

// ── Bill fetching ─────────────────────────────────────────────────────────────

export async function fetchBillsByMember(peopleId: number): Promise<PABill[]> {
  const data = await apiFetch('getPersonBills', { id: peopleId, session_id: CURRENT_SESSION_ID });
  return data.personbills?.bills ?? [];
}

export async function fetchBillDetail(billId: number): Promise<PABill | null> {
  const data = await apiFetch('getBill', { id: billId });
  return data.bill ?? null;
}

export async function searchBills(query: string): Promise<PABill[]> {
  const data = await apiFetch('getSearch', { query, session_id: CURRENT_SESSION_ID });
  return data.searchresult?.results ?? [];
}

// ── Voting records ────────────────────────────────────────────────────────────

export async function fetchMemberVotes(peopleId: number): Promise<PAVote[]> {
  const data = await apiFetch('getPersonVotes', { id: peopleId, session_id: CURRENT_SESSION_ID });
  return data.personvotes?.votes ?? [];
}

export async function fetchRollCall(rollCallId: number): Promise<any> {
  const data = await apiFetch('getRollCall', { id: rollCallId });
  return data.roll_call ?? null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function normalizeParty(party: string): PartyType {
  const p = party.toUpperCase();
  if (p === 'D' || p === 'DEM' || p === 'DEMOCRAT' || p === 'DEMOCRATIC') return 'D';
  if (p === 'R' || p === 'REP' || p === 'REPUBLICAN') return 'R';
  return 'I';
}

export function isPrimarySponsor(sponsor: PASponsor): boolean {
  return sponsor.sponsor_type_id === 1;
}

export function isCosponsor(sponsor: PASponsor): boolean {
  return sponsor.sponsor_type_id === 2;
}

export function getPhotoUrl(peopleId: number): string {
  return `https://legiscan.com/PA/img/people/${peopleId}.jpg`;
}
