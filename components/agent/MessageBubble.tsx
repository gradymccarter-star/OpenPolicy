'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ActionChip from './ActionChip';
import type { AgentAction, AgentCitation } from '@/lib/ai/agent/types';

export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  actions: AgentAction[];
  citations: AgentCitation[];
  isStreaming?: boolean;
}

const MARKDOWN_COMPONENTS = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li>{children}</li>,
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline" style={{ color: 'var(--brass)' }}>
      {children}
    </a>
  ),
  code: ({ children }: any) => (
    <code className="rounded-sm px-1 py-0.5 text-caption" style={{ background: 'var(--well)' }}>
      {children}
    </code>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-2">
      <table className="w-full text-caption border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead>{children}</thead>,
  th: ({ children }: any) => (
    <th className="text-left font-semibold py-1.5 px-2" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="py-1.5 px-2" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
      {children}
    </td>
  ),
};

export default function MessageBubble({ message }: { readonly message: DisplayMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-md px-4 py-3 text-body-sm leading-relaxed ${isUser ? '' : 'card'}`}
        style={isUser ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.text}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {message.text}
          </ReactMarkdown>
        )}
        {message.isStreaming && <span className="animate-pulse">&#9646;</span>}

        {message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {message.citations.map((c, i) => (
              <a
                key={`${c.url}-${i}`}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-semibold rounded-sm px-1.5 py-0.5 tracking-wide text-caption hover:underline"
                style={{ color: 'var(--verdigris)', background: 'rgba(47,111,82,0.1)', fontSize: '0.68rem' }}
              >
                {c.label}
              </a>
            ))}
          </div>
        )}

        {message.actions.map((a, i) => (
          <ActionChip key={`${a.url}-${i}`} action={a} />
        ))}
      </div>
    </div>
  );
}
