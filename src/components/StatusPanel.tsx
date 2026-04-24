import type { ReactNode } from "react";

type Props = {
  title: string;
  children?: ReactNode;
  /** Optional subheading or hint (rendered under the title) */
  hint?: ReactNode;
  /** e.g. action button in the top-right, aligned with the title row */
  headerAction?: ReactNode;
};

export function StatusPanel({ title, children, hint, headerAction }: Props) {
  return (
    <div className="w-full min-w-[300px] rounded-lg bg-[#181818] p-6 shadow-md">
      {!!title && (
        headerAction ? (
          <div className="mb-6 flex min-h-[3.5rem] items-center justify-between gap-3">
            <h3 className="text-4xl font-bold uppercase" style={{ color: "var(--theme-accent)" }}>
              {title}
            </h3>
            {headerAction}
          </div>
        ) : (
          <h3
            className="mb-6 text-4xl font-bold uppercase"
            style={{ color: "var(--theme-accent)" }}
          >
            {title}
          </h3>
        )
      )}
      {hint}
      <div>{children}</div>
    </div>
  );
}
