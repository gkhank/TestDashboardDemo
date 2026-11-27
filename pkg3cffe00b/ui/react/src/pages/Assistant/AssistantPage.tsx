import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, RotateCcw, Send, Sparkles, User } from 'lucide-react';
import { askAgent } from '@/api/testEngine';
import { AgentMessage } from '@/Interfaces';
import { DATE_RANGE_LABELS, useFilters } from '@/contexts/FiltersContext';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import FilterBar from '@/components/common/FilterBar';
import Markdown from '@/components/common/Markdown';
import { cn } from '@/lib/utils';

interface ChatTurn extends AgentMessage {
  notice?: string;
  isError?: boolean;
}

const SUGGESTIONS = [
  'Give me an overview of test health and what needs attention first.',
  'Which tests are flaky, and what do their failures have in common?',
  'Which suite is the worst and why?',
  'Did anything start failing recently that used to pass?',
  'Are there failures that look like an environment or infrastructure problem rather than a product bug?',
];

export default function AssistantPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { reportError } = useErrorBoundary();
  const { spec, filters } = useFilters();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const handledPrefill = useRef<string | null>(null);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const history: AgentMessage[] = turns.filter((t) => !t.isError).map(({ role, content }) => ({ role, content }));
      setTurns((prev) => [...prev, { role: 'user', content: q }]);
      setInput('');
      setBusy(true);
      try {
        const reply = await askAgent(q, history, spec);
        setTurns((prev) => [
          ...prev,
          { role: 'assistant', content: reply.answer, notice: reply.usedLlm ? undefined : reply.llmNotice },
        ]);
      } catch (err) {
        reportError(err);
        setTurns((prev) => [...prev, { role: 'assistant', content: `The assistant failed: ${(err as Error).message}`, isError: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, spec, reportError]
  );

  // A question handed over from another page (dashboard error cluster, execution detail).
  useEffect(() => {
    const state = location.state as { question?: string } | null;
    const q = state?.question;
    if (q && handledPrefill.current !== location.key) {
      handledPrefill.current = location.key;
      navigate(location.pathname, { replace: true, state: null });
      send(q);
    }
  }, [location, navigate, send]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const scope = [
    filters.testEnvironment ?? 'All environments',
    filters.testSuite ?? 'All suites',
    DATE_RANGE_LABELS[filters.range],
  ].join(' · ');

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Troubleshooting assistant"
        description="Ask questions about your test results. The agent looks at the results in the current filter scope."
        actions={
          turns.length ? (
            <Button variant="outline" appearance="secondary" leadingIcon={<RotateCcw />} onClick={() => setTurns([])} disabled={busy}>
              New conversation
            </Button>
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <FilterBar />
          <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">Scope: {scope}</span>
        </div>

        <Card className="min-h-0 flex-1">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {turns.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <Sparkles className="size-8 text-[var(--c3-style-basic-fg-accent)]" aria-hidden />
                <div className="flex flex-col gap-1">
                  <h2 className="text-c3-bold-heading-h5">How can I help you troubleshoot?</h2>
                  <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                    Try one of these, or open a failed execution and click Analyze.
                  </p>
                </div>
                <div className="flex max-w-3xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} size="sm" variant="outline" appearance="secondary" onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {turns.map((t, i) => (
              <div key={i} className={cn('flex gap-3', t.role === 'user' && 'flex-row-reverse')}>
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-[var(--c3-style-border-radius-rounded)]',
                    t.role === 'user' ? 'bg-[var(--c3-style-basic-bg-secondary)]' : 'bg-[var(--c3-style-basic-bg-accent)]'
                  )}
                  aria-hidden
                >
                  {t.role === 'user' ? <User className="size-4" /> : <Bot className="size-4 text-[var(--c3-style-basic-fg-accent)]" />}
                </div>
                <div
                  className={cn(
                    'flex max-w-[80%] flex-col gap-2 rounded-[var(--c3-style-border-radius-6)] p-3',
                    t.role === 'user'
                      ? 'bg-[var(--c3-style-basic-bg-accent)] text-c3-regular-body-p2'
                      : 'border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)]',
                    t.isError && 'border-[var(--c3-style-basic-border-danger)] text-[var(--c3-style-basic-fg-danger)]'
                  )}
                >
                  {t.role === 'user' ? <p className="whitespace-pre-wrap">{t.content}</p> : <Markdown text={t.content} />}
                  {t.notice ? (
                    <p className="rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-warning)] p-2 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-warning)]">
                      {t.notice}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}

            {busy ? (
              <div className="flex items-center gap-2 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                <Spinner size="sm" label="Thinking" />
                Looking at your test results...
              </div>
            ) : null}
            <div ref={endRef} />
          </CardContent>
        </Card>

        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <Textarea
            aria-label="Ask the assistant"
            className="min-h-[44px] flex-1"
            rows={2}
            placeholder="Ask about failures, flaky tests, suites, error messages... (Enter to send, Shift+Enter for a new line)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
          />
          <Button type="submit" variant="solid" appearance="accent" leadingIcon={<Send />} disabled={busy || !input.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
