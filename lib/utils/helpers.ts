import crypto from 'crypto';
import {
  TEMPORAL_DECAY_LAMBDA,
  SCORE_COLORS,
  PARTY_COLORS,
  CONFIDENCE_COLORS,
} from './constants';
import type { PartyType } from './types';

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Compute temporal decay (Section 6.1)
 * d(Δt) = e^(-λ * Δt) where Δt = days since source_date
 */
export function computeTemporalDecay(date: Date): number {
  const now = new Date();
  const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-TEMPORAL_DECAY_LAMBDA * Math.max(0, daysDiff));
}

/**
 * Format score as percentage
 */
export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get color for score
 */
export function getScoreColor(score: number): string {
  if (score >= SCORE_COLORS.EXCELLENT.min) return SCORE_COLORS.EXCELLENT.color;
  if (score >= SCORE_COLORS.GOOD.min) return SCORE_COLORS.GOOD.color;
  if (score >= SCORE_COLORS.MODERATE.min) return SCORE_COLORS.MODERATE.color;
  return SCORE_COLORS.POOR.color;
}

/**
 * Get color for confidence level
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= CONFIDENCE_COLORS.HIGH.min) return CONFIDENCE_COLORS.HIGH.color;
  if (confidence >= CONFIDENCE_COLORS.MEDIUM.min) return CONFIDENCE_COLORS.MEDIUM.color;
  return CONFIDENCE_COLORS.LOW.color;
}

/**
 * Get party color
 */
export function getPartyColor(party: PartyType): string {
  return PARTY_COLORS[party] || '#gray';
}

/**
 * Get party full name
 */
export function getPartyName(party: PartyType): string {
  const names: Record<string, string> = {
    D: 'Democrat',
    R: 'Republican',
    I: 'Independent',
  };
  return names[party] || 'Unknown';
}

/**
 * Format date
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Calculate estimated cost for Claude API call
 */
export function estimateClaudeCost(
  inputTokens: number,
  outputTokens: number,
  model: 'haiku' | 'sonnet' = 'haiku',
): number {
  const inputCostPer1M = model === 'haiku' ? 0.25 : 3.0;
  const outputCostPer1M = model === 'haiku' ? 1.25 : 15.0;

  const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;

  return inputCost + outputCost;
}

/**
 * Safe JSON parse
 */
export function safeJSONParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}
