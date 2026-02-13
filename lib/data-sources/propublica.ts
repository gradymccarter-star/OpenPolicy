import axios from 'axios';
import type { PartyType } from '../utils/types';

const PROPUBLICA_API_BASE = 'https://api.propublica.org/congress/v1';

// Types for ProPublica API responses
interface ProPublicaMember {
  id: string;
  first_name: string;
  last_name: string;
  party: string;
  state: string;
  district?: string;
  title: string;
  twitter_account?: string;
  url?: string;
  in_office: boolean;
}

interface ProPublicaVote {
  roll_call: string;
  bill: {
    bill_id: string;
    number: string;
    title: string;
  };
  position: string;
  date: string;
}

/**
 * Get ProPublica API client
 */
function getClient() {
  const apiKey = process.env.PROPUBLICA_API_KEY;
  if (!apiKey) {
    throw new Error('PROPUBLICA_API_KEY environment variable is not set');
  }

  return axios.create({
    baseURL: PROPUBLICA_API_BASE,
    headers: {
      'X-API-Key': apiKey,
    },
    timeout: 30000,
  });
}

/**
 * Fetch all senators for current session (119th Congress = 2025-2026)
 */
export async function fetchSenators(): Promise<ProPublicaMember[]> {
  const client = getClient();
  const congress = 119; // Current congress session
  const chamber = 'senate';

  try {
    const response = await client.get(`/${congress}/${chamber}/members.json`);
    const members = response.data.results[0].members;
    return members.filter((m: ProPublicaMember) => m.in_office);
  } catch (error) {
    console.error('Failed to fetch senators:', error);
    throw error;
  }
}

/**
 * Fetch a specific senator by bioguide ID
 */
export async function fetchSenatorById(bioguideId: string): Promise<ProPublicaMember> {
  const client = getClient();

  try {
    const response = await client.get(`/members/${bioguideId}.json`);
    return response.data.results[0];
  } catch (error) {
    console.error(`Failed to fetch senator ${bioguideId}:`, error);
    throw error;
  }
}

/**
 * Fetch voting records for a senator
 */
export async function fetchVotingRecords(
  bioguideId: string,
  limit: number = 100
): Promise<ProPublicaVote[]> {
  const client = getClient();

  try {
    const response = await client.get(`/members/${bioguideId}/votes.json`);
    const votes = response.data.results[0].votes || [];

    // Filter for AI/tech-related bills (keywords)
    const techKeywords = [
      'artificial intelligence',
      'ai',
      'algorithm',
      'data privacy',
      'privacy',
      'surveillance',
      'technology',
      'cyber',
      'internet',
      'digital',
      'machine learning',
      'automation',
    ];

    const techVotes = votes.filter((vote: any) => {
      const title = (vote.bill?.title || '').toLowerCase();
      return techKeywords.some(keyword => title.includes(keyword));
    });

    return techVotes.slice(0, limit);
  } catch (error) {
    console.error(`Failed to fetch voting records for ${bioguideId}:`, error);
    throw error;
  }
}

/**
 * Fetch recent bills related to AI/tech
 */
export async function fetchRecentAIBills(limit: number = 50): Promise<any[]> {
  const client = getClient();
  const congress = 119;

  try {
    // Search for AI-related bills
    const response = await client.get(`/${congress}/bills/search.json`, {
      params: {
        query: 'artificial intelligence OR AI OR algorithm OR data privacy',
      },
    });

    const bills = response.data.results[0]?.bills || [];
    return bills.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch AI bills:', error);
    return []; // Return empty array on error (API might not support search)
  }
}

/**
 * Convert ProPublica party code to our PartyType
 */
export function normalizeParty(party: string): PartyType {
  const p = party.toUpperCase();
  if (p === 'D' || p === 'DEM' || p === 'DEMOCRAT') return 'D';
  if (p === 'R' || p === 'REP' || p === 'REPUBLICAN') return 'R';
  return 'I'; // Independent or other
}

/**
 * Get photo URL for a politician
 */
export function getPhotoUrl(bioguideId: string, chamber: 'senate' | 'house' = 'senate'): string {
  if (chamber === 'house') {
    return `https://clerk.house.gov/content/assets/img/member-photos/${bioguideId}.jpg`;
  }
  // Senate photos from Bioguide
  return `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0]}/${bioguideId}.jpg`;
}
