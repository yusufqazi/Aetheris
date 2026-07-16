import type { ReactNode } from "react";

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-white/[0.07] pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-sky-400">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-[clamp(2rem,4vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.055em] text-white">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">{description}</p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
