"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Each editor section saves on its own. This tracks which ones hold unsaved edits, so the page can
 * warn before the tab is closed and the sidebar can show where the edits are.
 */
interface DirtyContextValue {
  dirty: ReadonlySet<string>;
  setDirty: (section: string, isDirty: boolean) => void;
}

const DirtyContext = createContext<DirtyContextValue | null>(null);

export function DirtyProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirtySet] = useState<ReadonlySet<string>>(new Set());

  const setDirty = useCallback((section: string, isDirty: boolean) => {
    setDirtySet((current) => {
      if (current.has(section) === isDirty) return current;
      const next = new Set(current);
      if (isDirty) next.add(section);
      else next.delete(section);
      return next;
    });
  }, []);

  useEffect(() => {
    if (dirty.size === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const value = useMemo(() => ({ dirty, setDirty }), [dirty, setDirty]);
  return <DirtyContext.Provider value={value}>{children}</DirtyContext.Provider>;
}

export function useDirtyRegistry(): DirtyContextValue {
  const context = useContext(DirtyContext);
  if (!context) throw new Error("useDirtyRegistry must be used inside DirtyProvider");
  return context;
}

/** Report this section's unsaved state; cleared when the section unmounts. */
export function useReportDirty(section: string, isDirty: boolean) {
  const { setDirty } = useDirtyRegistry();
  useEffect(() => {
    setDirty(section, isDirty);
  }, [section, isDirty, setDirty]);
  useEffect(() => () => setDirty(section, false), [section, setDirty]);
}
