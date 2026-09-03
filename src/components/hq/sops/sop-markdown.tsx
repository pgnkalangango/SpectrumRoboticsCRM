import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Reading typography for SOP bodies. Tailwind utilities only (no typography plugin), display font on headings,
// tables scroll sideways, comfortable measure handled by the parent container.

type Extra = { node?: unknown };
type Props<T extends keyof React.JSX.IntrinsicElements> = React.ComponentPropsWithoutRef<T> & Extra;

// react-markdown passes a `node` prop that must not reach the DOM.
function styled<T extends keyof React.JSX.IntrinsicElements>(Tag: T, base: string) {
  const El = (props: Props<T>) => {
    const { node, className, ...rest } = props as Extra & { className?: string } & Record<string, unknown>;
    void node;
    return React.createElement(Tag, { ...rest, className: cn(base, className) });
  };
  El.displayName = `Md(${Tag})`;
  return El;
}

const components: Components = {
  h1: styled("h1", "font-display text-[26px] font-bold leading-tight text-ink mt-2 mb-4 first:mt-0"),
  h2: styled("h2", "font-display text-[19px] font-bold leading-snug text-ink mt-9 mb-3 pb-1.5 border-b border-line first:mt-0"),
  h3: styled("h3", "font-display text-[16px] font-semibold text-ink mt-6 mb-2"),
  h4: styled("h4", "text-[14px] font-semibold uppercase tracking-wide text-muted mt-5 mb-1.5"),
  p: styled("p", "my-3 text-[15px] leading-[1.7] text-ink-2"),
  ul: styled("ul", "my-3 flex list-disc flex-col gap-1.5 pl-6 text-[15px] leading-[1.65] text-ink-2 marker:text-faint"),
  ol: styled("ol", "my-3 flex list-decimal flex-col gap-2 pl-6 text-[15px] leading-[1.65] text-ink-2 marker:font-semibold marker:text-brand"),
  li: styled("li", "pl-1 [&>p]:my-1"),
  strong: styled("strong", "font-semibold text-ink"),
  em: styled("em", "italic"),
  blockquote: styled("blockquote", "my-4 rounded-r-lg border-l-[3px] border-brand bg-brand-tint/40 px-4 py-2 text-[15px] text-ink-2 [&>p]:my-1"),
  hr: styled("hr", "my-8 border-line"),
  pre: styled("pre", "my-4 overflow-x-auto rounded-lg border border-line bg-surface-2 p-4"),
  thead: styled("thead", "bg-surface-2 text-left"),
  th: styled("th", "border-b border-line px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted"),
  td: styled("td", "border-b border-line px-3 py-2 align-top text-ink-2"),
  tr: styled("tr", "last:[&>td]:border-b-0"),
  a: (props: Props<"a">) => {
    const { node, className, href, ...rest } = props;
    void node;
    return <a className={cn("text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand", className)} href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" {...rest} />;
  },
  code: (props: Props<"code">) => {
    const { node, className, children, ...rest } = props;
    void node;
    const block = /language-/.test(className ?? "");
    return (
      <code className={cn(block ? "block whitespace-pre font-mono text-[13px] leading-relaxed" : "rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-ink", className)} {...rest}>
        {children}
      </code>
    );
  },
  table: (props: Props<"table">) => {
    const { node, className, ...rest } = props;
    void node;
    return (
      <div className="my-4 w-full overflow-x-auto rounded-lg border border-line">
        <table className={cn("w-full min-w-[480px] text-[14px]", className)} {...rest} />
      </div>
    );
  },
  input: (props: Props<"input">) => {
    const { node, className, ...rest } = props;
    void node;
    return <input className={cn("mr-2 size-3.5 accent-brand align-middle", className)} {...rest} disabled readOnly />;
  },
  img: (props: Props<"img">) => {
    const { node, className, alt, ...rest } = props;
    void node;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cn("my-4 max-w-full rounded-lg border border-line", className)} alt={alt ?? ""} {...rest} />;
  },
};

export function SopMarkdown({ body, className }: { body: string; className?: string }) {
  if (!body?.trim()) return <p className="text-sm text-faint">Nothing written yet.</p>;
  return (
    <div className={cn("sop-prose max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
