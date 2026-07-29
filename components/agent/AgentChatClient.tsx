'use client';

import { useEffect, useRef, useState } from 'react';
import MessageBubble, { type DisplayMessage } from './MessageBubble';
import type { AgentStreamFrame, ChatMessage } from '@/lib/ai/agent/types';

// Keep in sync with MAX_HISTORY_MESSAGES in app/api/agent/chat/route.ts — the server
// trims defensively regardless, but there's no reason to keep growing the request body.
const MAX_HISTORY_MESSAGES = 10;

const SUGGESTED_PROMPTS = [
  'Which representatives have the highest Chamber alignment score?',
  'Compare the candidates in district 42',
  "Who funds Rep. X's campaign?",
  'What is district 18’s voter registration breakdown?',
];

export default function AgentChatClient() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming) return;
    setErrorMessage(null);
    setInput('');

    const userMessage: DisplayMessage = { role: 'user', text, actions: [], citations: [] };
    const assistantMessage: DisplayMessage = { role: 'assistant', text: '', actions: [], citations: [], isStreaming: true };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: historyRef.current }),
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const frame: AgentStreamFrame = JSON.parse(line);

          if (frame.type === 'text_delta') {
            assistantText += frame.text;
            setMessages((prev) => updateLastAssistant(prev, (m) => ({ ...m, text: assistantText })));
          } else if (frame.type === 'action') {
            setMessages((prev) => updateLastAssistant(prev, (m) => ({ ...m, actions: [...m.actions, frame.action] })));
          } else if (frame.type === 'citation') {
            setMessages((prev) => updateLastAssistant(prev, (m) => ({ ...m, citations: [...m.citations, frame.citation] })));
          } else if (frame.type === 'error') {
            setErrorMessage(frame.message);
          }
        }
      }

      const updatedHistory: ChatMessage[] = [...historyRef.current, { role: 'user', content: text }, { role: 'assistant', content: assistantText }];
      historyRef.current = updatedHistory.slice(-MAX_HISTORY_MESSAGES);
      setMessages((prev) => updateLastAssistant(prev, (m) => ({ ...m, isStreaming: false })));
    } catch {
      setErrorMessage('Something went wrong reaching the AI Agent — please try again.');
      setMessages((prev) => updateLastAssistant(prev, (m) => ({ ...m, isStreaming: false })));
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-[75vh]">
      <div
        className="rounded-md px-4 py-2.5 mb-4 text-caption"
        style={{ background: 'var(--well)', color: 'var(--ink-secondary)', border: '1px solid var(--rule)' }}
      >
        AI-generated alignment analysis based on public records &mdash; not an official PA Chamber of Commerce endorsement.
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-caption text-primary-400 mb-3">Try asking:</p>
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="card-hover block w-full text-left p-3 text-body-sm text-primary-700"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {errorMessage && (
        <div
          className="rounded-md px-4 py-2.5 mt-3 text-caption"
          style={{ background: 'rgba(158,59,49,0.1)', color: 'var(--oxblood)', border: '1px solid rgba(158,59,49,0.25)' }}
        >
          {errorMessage}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="flex gap-2 mt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
          placeholder="Ask about a candidate, district, or funding source&hellip;"
          className="flex-1 rounded-md px-4 py-2.5 text-body-sm"
          style={{ border: '1px solid var(--rule-strong)', background: 'var(--card)' }}
        />
        <button type="submit" disabled={isStreaming || !input.trim()} className="btn-primary text-caption py-2.5 px-5 disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}

function updateLastAssistant(messages: DisplayMessage[], update: (m: DisplayMessage) => DisplayMessage): DisplayMessage[] {
  const next = [...messages];
  const lastIndex = next.length - 1;
  if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
    next[lastIndex] = update(next[lastIndex]);
  }
  return next;
}
