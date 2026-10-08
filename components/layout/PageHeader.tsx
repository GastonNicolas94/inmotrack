import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? <p className="inmotrack-eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-heading text-[24px] font-bold leading-tight text-foreground sm:text-[30px] sm:font-extrabold">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="w-full shrink-0 [&_[data-slot=button]]:min-h-12 sm:w-auto sm:[&_[data-slot=button]]:min-h-0">{action}</div> : null}
    </header>
  );
}
