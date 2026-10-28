import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownView({ children }: { children: string }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: linkChildren, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener">
              {linkChildren}
            </a>
          ),
          pre: ({ children: preChildren }) => (
            <pre className="markdown-pre">{preChildren}</pre>
          ),
          code: ({ className, children: codeChildren, ...props }) => (
            <code
              className={className ? `${className}` : 'markdown-inline-code'}
              {...props}
            >
              {codeChildren}
            </code>
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
