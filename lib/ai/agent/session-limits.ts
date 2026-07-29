import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { getSupabase } from '@/lib/db/client';
import { estimateClaudeCost } from '@/lib/utils/helpers';

const SESSION_COOKIE_NAME = 'agent_session_id';
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

/** Reads the visitor's agent session cookie, creating one if absent. Scoped to this
 * feature only — the app has no other session/identity concept to piggyback on. */
export function getOrCreateSessionId(): string {
  const store = cookies();
  const existing = store.get(SESSION_COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(SESSION_COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  });
  return id;
}

// Per-session rolling-window message cap — bounds a single visitor's spend even
// across IP rotation, layered on top of middleware.ts's existing per-IP limiter.
// In-memory (same pattern as middleware.ts's ipRequests), env-overridable starting
// point tuned after real usage: adjust AGENT_SESSION_MESSAGE_LIMIT once traffic exists.
const SESSION_MESSAGE_LIMIT = Number(process.env.AGENT_SESSION_MESSAGE_LIMIT ?? 20);
const SESSION_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const sessionRequests = new Map<string, { count: number; resetTime: number }>();

export function checkSessionRateLimit(sessionId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = sessionRequests.get(sessionId);

  if (!entry || now > entry.resetTime) {
    sessionRequests.set(sessionId, { count: 1, resetTime: now + SESSION_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= SESSION_MESSAGE_LIMIT) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

// Agent-specific daily budget, DB-backed via api_usage_log with a distinct api_name
// so chat volume never competes with the classification-job budget in claude-client.ts.
const AGENT_MAX_DAILY_BUDGET = Number(process.env.AGENT_MAX_DAILY_BUDGET ?? 15);
const AGENT_API_NAME = 'claude_agent';

export async function getAgentSpendToday(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await getSupabase()
      .from('api_usage_log')
      .select('estimated_cost')
      .eq('api_name', AGENT_API_NAME)
      .eq('status', 'success')
      .gte('created_at', today);
    return (data ?? []).reduce((sum, row) => sum + (row.estimated_cost ?? 0), 0);
  } catch (error) {
    console.error('Failed to get agent spend today:', error);
    return 0;
  }
}

export async function checkAgentBudget(estimatedCost: number): Promise<boolean> {
  const spentToday = await getAgentSpendToday();
  return spentToday + estimatedCost <= AGENT_MAX_DAILY_BUDGET;
}

export async function logAgentUsage(
  inputTokens: number,
  outputTokens: number,
  status: 'success' | 'error',
  errorMessage?: string,
): Promise<void> {
  try {
    const estimatedCost = estimateClaudeCost(inputTokens, outputTokens, 'sonnet');
    await getSupabase().from('api_usage_log').insert({
      api_name: AGENT_API_NAME,
      tokens_used: inputTokens + outputTokens,
      estimated_cost: estimatedCost,
      status,
      error_message: errorMessage ?? null,
    });
  } catch (error) {
    console.error('Failed to log agent API usage:', error);
  }
}
