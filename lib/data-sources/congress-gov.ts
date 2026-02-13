/**
 * Congress.gov API v3 Client
 * Rate limited to 1 request/second per Congress.gov requirements
 */

import axios, { AxiosError } from 'axios';

const BASE_URL = 'https://api.congress.gov/v3';

let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  maxRetries = 3
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await rateLimit();

    try {
      const response = await axios.get(url, {
        params: { api_key: apiKey, format: 'json' },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      lastError = error;
      const status = (error as AxiosError)?.response?.status;

      if (status === 404) {
        return null;
      }

      if (status === 429) {
        console.log('    Rate limited by Congress.gov, waiting 60s...');
        await new Promise((resolve) => setTimeout(resolve, 60000));
        continue;
      }

      if (status && status >= 500) {
        console.error(
          `    Server error ${status}, retry ${attempt}/${maxRetries}`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Failed after ${maxRetries} retries: ${lastError?.message}`
  );
}

export interface CongressVote {
  congress: number;
  chamber: string;
  rollNumber: number;
  date: string;
  question: string;
  result: string;
  description: string;
  bill?: {
    number: string;
    title: string;
    type: string;
    congress: number;
    url: string;
  };
  url: string;
}

export interface CongressLegislation {
  congress: number;
  number: string;
  title: string;
  type: string;
  introducedDate: string;
  latestAction?: {
    actionDate: string;
    text: string;
  };
  policyArea?: {
    name: string;
  };
  url: string;
}

export async function fetchMemberVotes(
  bioguideId: string,
  apiKey: string
): Promise<any[]> {
  const url = `${BASE_URL}/member/${bioguideId}/votes?limit=100`;
  const data = await fetchWithRetry(url, apiKey);
  if (!data) return [];
  return data.votes || [];
}

export async function fetchSponsoredLegislation(
  bioguideId: string,
  apiKey: string
): Promise<any[]> {
  const url = `${BASE_URL}/member/${bioguideId}/sponsored-legislation?limit=250`;
  const data = await fetchWithRetry(url, apiKey);
  if (!data) return [];
  return data.sponsoredLegislation || [];
}

export async function fetchCosponsoredLegislation(
  bioguideId: string,
  apiKey: string
): Promise<any[]> {
  const url = `${BASE_URL}/member/${bioguideId}/cosponsored-legislation?limit=250`;
  const data = await fetchWithRetry(url, apiKey);
  if (!data) return [];
  return data.cosponsoredLegislation || [];
}
