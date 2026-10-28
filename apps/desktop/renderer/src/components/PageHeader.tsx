import type { ReactNode } from 'react';

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}): React.JSX.Element {
  return (
    <header className="flex items-start justify-between gap-8">
      <div>
        <div className="page-kicker">{kicker}</div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="shrink-0 pt-2">{actions}</div> : null}
    </header>
  );
}
