/**
 * PA General Assembly website scraper
 * Used for committee votes and member data not available via LegiScan.
 * Source: https://www.legis.state.pa.us
 *
 * Committee votes are a high-priority gap — the Chamber currently can't track these.
 */

import axios from 'axios';

const PA_LEGIS_BASE = 'https://www.legis.state.pa.us';

export interface PACommitteeVote {
  bill_number: string;
  bill_title?: string;
  committee: string;
  chamber: 'H' | 'S';
  vote_date: string;
  vote_result: 'Passed' | 'Failed' | 'Tabled';
  votes: PACommitteeMemberVote[];
  source_url: string;
}

export interface PACommitteeMemberVote {
  legislator_name: string;
  position: 'Yea' | 'Nay' | 'Abstain' | 'NV';
}

export interface PAMemberInfo {
  name: string;
  district: string;
  county: string;
  party: string;
  committee_assignments: string[];
  official_url: string;
}

/**
 * Fetch the member directory from the PA House roster page.
 * Returns raw HTML rows — caller should parse what they need.
 */
export async function fetchHouseMemberDirectory(): Promise<string> {
  const url = `${PA_LEGIS_BASE}/cfdocs/legis/home/member_information/house_bio_list.cfm`;
  const response = await axios.get(url, {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PA-Chamber-Intelligence/1.0)' },
  });
  return response.data;
}

/**
 * Fetch a specific member's bio page for contact info, committees, and district.
 */
export async function fetchMemberBioPage(memberId: string): Promise<string> {
  const url = `${PA_LEGIS_BASE}/cfdocs/legis/home/member_information/house_bio.cfm?id=${memberId}`;
  const response = await axios.get(url, {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PA-Chamber-Intelligence/1.0)' },
  });
  return response.data;
}

/**
 * Fetch the committee vote page for a given bill.
 * Bill format: 'HB1234' or 'SB5678'
 */
export async function fetchBillCommitteeActions(
  billNumber: string,
  sessionYear = 2025
): Promise<string> {
  const body = billNumber.startsWith('H') ? 'H' : 'S';
  const type = billNumber.includes('B') ? 'B' : 'R';
  const num = billNumber.replace(/[A-Z]/g, '');
  const url = `${PA_LEGIS_BASE}/cfdocs/billinfo/BillInfo.cfm?syear=${sessionYear}&sInd=0&body=${body}&type=${type}&bn=${num}`;
  const response = await axios.get(url, {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PA-Chamber-Intelligence/1.0)' },
  });
  return response.data;
}

/**
 * Fetch floor roll call vote detail page.
 * rollCallId comes from the PA legis roll call viewer.
 */
export async function fetchRollCallDetail(
  chamber: 'H' | 'S',
  sessionYear: number,
  rollCallId: number
): Promise<string> {
  const url = `${PA_LEGIS_BASE}/cfdocs/legis/RC/Public/rc_view_action2.cfm?sess_yr=${sessionYear}&sess_ind=0&rc_body=${chamber}&rc_nbr=${rollCallId}`;
  const response = await axios.get(url, {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PA-Chamber-Intelligence/1.0)' },
  });
  return response.data;
}
