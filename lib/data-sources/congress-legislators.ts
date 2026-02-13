/**
 * Congress Legislators Data Source
 * Fetches all current US senators from the unitedstates.io GitHub dataset
 */

import axios from 'axios';

const LEGISLATORS_URL =
  'https://theunitedstates.io/congress-legislators/legislators-current.json';

interface LegislatorTerm {
  type: string;
  start: string;
  end: string;
  state: string;
  party: string;
  url?: string;
}

interface Legislator {
  id: {
    bioguide: string;
    thomas?: string;
    govtrack?: number;
    opensecrets?: string;
    twitter?: string;
  };
  name: {
    first: string;
    last: string;
    official_full?: string;
  };
  bio: {
    birthday?: string;
    gender?: string;
  };
  terms: LegislatorTerm[];
}

export interface SenatorRecord {
  bioguide_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  party: 'D' | 'R' | 'I';
  state: string;
  office_type: 'senate';
  title: 'Senator';
  twitter_handle: string | null;
  official_website: string | null;
  is_active: boolean;
}

function mapParty(party: string): 'D' | 'R' | 'I' {
  if (party === 'Democrat') return 'D';
  if (party === 'Republican') return 'R';
  return 'I';
}

export async function fetchCurrentSenators(): Promise<SenatorRecord[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.get<Legislator[]>(LEGISLATORS_URL, {
        timeout: 30000,
      });

      const senators = response.data.filter((leg) => {
        const lastTerm = leg.terms[leg.terms.length - 1];
        return lastTerm?.type === 'sen';
      });

      return senators.map((leg) => {
        const lastTerm = leg.terms[leg.terms.length - 1];
        const fullName =
          leg.name.official_full || `${leg.name.first} ${leg.name.last}`;

        return {
          bioguide_id: leg.id.bioguide,
          first_name: leg.name.first,
          last_name: leg.name.last,
          full_name: fullName,
          party: mapParty(lastTerm.party),
          state: lastTerm.state,
          office_type: 'senate' as const,
          title: 'Senator' as const,
          twitter_handle: leg.id.twitter || null,
          official_website: lastTerm.url || null,
          is_active: true,
        };
      });
    } catch (error: any) {
      lastError = error;
      console.error(
        `  Attempt ${attempt}/3 failed: ${error.message}`
      );
      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to fetch legislators after 3 attempts: ${lastError?.message}`
  );
}
