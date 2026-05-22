import { ShieldCheck } from "lucide-react";
import clsx from "clsx";

type SafetyDisclaimerProps = {
  title?: string;
  body: string;
  className?: string;
};

export function SafetyDisclaimer({
  title = "Research support only",
  body,
  className,
}: SafetyDisclaimerProps) {
  return (
    <div
      className={clsx(
        "rounded-[1.75rem] border border-[var(--border)] bg-[var(--panel-muted)]/88 p-5 shadow-[var(--shadow-sm)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[var(--accent-bright)]">
            {title}
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{body}</p>
        </div>
      </div>
    </div>
  );
}
