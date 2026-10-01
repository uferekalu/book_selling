import type { ReactNode } from "react";

export function AuthHeading({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <h1 className="text-4xl font-medium text-text">{title}</h1>
      {children && <p className="text-base text-text-muted">{children}</p>}
    </div>
  );
}
