import type { NextRequest } from 'next/server';
import { getAnthropicClient } from '@/lib/ai/claude-client';
import { AGENT_TOOLS, executeTool } from '@/lib/ai/agent/tools';
import { buildSystemPrompt } from '@/lib/ai/agent/system-prompt';
import { getOrCreateSessionId, checkSessionRateLimit, checkAgentBudget, logAgentUsage } from '@/lib/ai/agent/session-limits';
import { estimateClaudeCost } from '@/lib/utils/helpers';
import type { ChatMessage, AgentStreamFrame } from '@/lib/ai/agent/types';

export const runtime = 'nodejs'; // tool implementations read static JSON via fs
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-5';
const MAX_OUTPUT_TOKENS = 1500;
const MAX_TOOL_ITERATIONS = 6;
// Bounds per-turn input cost/latency on long conversations. The system prompt already
// requires every fact to come from a fresh tool call, so trimming older turns only
// costs conversational continuity (e.g. pronoun references), not factual accuracy.
const MAX_HISTORY_MESSAGES = 10; // last 5 user+assistant exchanges

function frame(f: AgentStreamFrame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(f) + '\n');
}

function frameString(f: AgentStreamFrame): string {
  return JSON.stringify(f) + '\n';
}

/** Surface a tool result's real source links as citation chips, rather than trusting
 * the model to format them correctly inline. */
function citationsFor(toolName: string, result: any): AgentStreamFrame[] {
  const frames: AgentStreamFrame[] = [];
  if (toolName === 'get_funding_breakdown' && Array.isArray(result?.top_donors)) {
    for (const d of result.top_donors) {
      if (d.profile_url) frames.push({ type: 'citation', citation: { label: d.donor_name, url: d.profile_url } });
    }
  }
  if (toolName === 'get_evidence_for_principle' && Array.isArray(result?.evidence)) {
    for (const e of result.evidence) {
      if (e.source_url) frames.push({ type: 'citation', citation: { label: `Evidence — ${e.evidence_type}`, url: e.source_url } });
    }
  }
  return frames.slice(0, 5);
}

export async function POST(req: NextRequest) {
  const sessionId = getOrCreateSessionId();

  const rateCheck = checkSessionRateLimit(sessionId);
  if (!rateCheck.allowed) {
    return new Response(frameString({ type: 'error', code: 'rate_limited', message: 'Too many messages this hour — please try again later.' }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  const { message, history } = (await req.json()) as { message: string; history?: ChatMessage[] };
  if (!message || typeof message !== 'string') {
    return new Response(frameString({ type: 'error', code: 'bad_request', message: 'Missing message.' }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  const trimmedHistory = (history ?? []).slice(-MAX_HISTORY_MESSAGES);
  const messages: any[] = [...trimmedHistory.map((h) => ({ role: h.role, content: h.content })), { role: 'user', content: message }];

  // Conservative pre-flight budget check: worst case is every remaining iteration
  // spending the full per-turn output cap.
  const roughInputTokens = Math.ceil(JSON.stringify(messages).length / 4);
  const worstCaseCost = estimateClaudeCost(roughInputTokens, MAX_OUTPUT_TOKENS * MAX_TOOL_ITERATIONS, 'sonnet');
  if (!(await checkAgentBudget(worstCaseCost))) {
    return new Response(frameString({ type: 'error', code: 'budget_exceeded', message: 'The AI Agent has hit its daily usage budget — please try again tomorrow.' }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  const client = getAnthropicClient();
  const system = buildSystemPrompt();

  const stream = new ReadableStream({
    async start(controller) {
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      try {
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const msgStream = client.messages.stream({
            model: MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            tools: AGENT_TOOLS as any,
            messages,
          });

          msgStream.on('text', (text) => controller.enqueue(frame({ type: 'text_delta', text })));

          const final = await msgStream.finalMessage();
          totalInputTokens += final.usage.input_tokens;
          totalOutputTokens += final.usage.output_tokens;

          if (final.stop_reason !== 'tool_use') {
            controller.enqueue(frame({ type: 'done', usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } }));
            await logAgentUsage(totalInputTokens, totalOutputTokens, 'success');
            controller.close();
            return;
          }

          messages.push({ role: 'assistant', content: final.content });

          const toolUseBlocks = final.content.filter((b: any) => b.type === 'tool_use');
          const toolResultBlocks = [];
          for (const block of toolUseBlocks as any[]) {
            const result = await executeTool(block.name, block.input);

            if (block.name === 'navigate' && (result as any)?.status === 'ok') {
              controller.enqueue(frame({ type: 'action', action: { kind: 'navigate', label: (result as any).label, url: (result as any).url } }));
            } else {
              for (const c of citationsFor(block.name, result)) controller.enqueue(frame(c));
            }

            toolResultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
          }
          messages.push({ role: 'user', content: toolResultBlocks });
        }

        // Exceeded the iteration cap without reaching end_turn
        controller.enqueue(frame({ type: 'error', code: 'tool_loop_exceeded', message: 'This question needed too many lookups — try asking something more specific.' }));
        await logAgentUsage(totalInputTokens, totalOutputTokens, 'error', 'tool_loop_exceeded');
        controller.close();
      } catch (error) {
        controller.enqueue(frame({ type: 'error', code: 'internal_error', message: 'Something went wrong answering that — please try again.' }));
        await logAgentUsage(totalInputTokens, totalOutputTokens, 'error', (error as Error).message);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
}
