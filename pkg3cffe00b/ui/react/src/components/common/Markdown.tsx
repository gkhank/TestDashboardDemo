import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  text: string;
  className?: string;
}

/** Renders agent markdown with design-token typography. */
export default function Markdown({ text, className }: MarkdownProps) {
  return (
    <div className={cn('flex flex-col gap-2 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)]', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="text-c3-bold-heading-h6 mt-2">{children}</h3>,
          h2: ({ children }) => <h3 className="text-c3-bold-heading-h6 mt-2">{children}</h3>,
          h3: ({ children }) => <h4 className="text-c3-bold-body-p2 mt-2">{children}</h4>,
          h4: ({ children }) => <h4 className="text-c3-bold-body-p2 mt-2">{children}</h4>,
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 flex flex-col gap-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 flex flex-col gap-1">{children}</ol>,
          a: ({ children, href }) => (
            <a href={href} className="text-[var(--c3-style-basic-fg-accent)] underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-secondary)] p-3 text-c3-regular-code-code">
              {children}
            </pre>
          ),
          code: ({ children, inline }) =>
            inline ? (
              <code className="rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-secondary)] px-1 text-c3-regular-code-code">
                {children}
              </code>
            ) : (
              <code className="text-c3-regular-code-code">{children}</code>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-c3-regular-body-p3">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--c3-style-basic-border-border)] px-2 py-1 text-left">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--c3-style-basic-border-border)] px-2 py-1">{children}</td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
