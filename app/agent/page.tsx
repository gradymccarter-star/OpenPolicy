import AgentChatClient from '@/components/agent/AgentChatClient';

export default function AgentPage() {
  return (
    <main className="container-page py-10">
      <div className="mb-6">
        <p className="overline">Open Policy AI</p>
        <h1 className="text-heading-1 mt-3 mb-1">AI Agent</h1>
        <p className="text-body-sm text-primary-500">
          Ask about any PA House candidate, district, or funding source. Answers pull live from this site&apos;s own data.
        </p>
      </div>

      <AgentChatClient />
    </main>
  );
}
