"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Portal } from "./portal";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  tone?: "default" | "danger";
  disabled?: boolean;
}

export interface DropdownMenuProps {
  /** Renders the trigger. Spread `props` onto a Button/IconButton. */
  trigger: (props: {
    ref: (el: HTMLButtonElement | null) => void;
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
  }) => ReactNode;
  items: MenuItem[];
  label: string;
  align?: "start" | "end";
}

const EDGE = 8;
const GAP = 6;

/**
 * WAI-ARIA menu button. Enter/Space/↓ open on the first item, ↑ opens on the last; ↑/↓, Home/End
 * and type-ahead move between items; Escape and Tab close and restore focus to the trigger. The
 * menu measures itself and clamps inside the viewport so it never renders off-screen on a phone.
 * Never use inside a Modal/Drawer (see frontend/CLAUDE.md).
 */
export function DropdownMenu({ trigger, items, label, align = "end" }: DropdownMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeahead = useRef({ text: "", timer: 0 });

  const enabledIndexes = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const preferredLeft = align === "end" ? anchor.right - menu.width : anchor.left;
    const left = Math.min(Math.max(EDGE, preferredLeft), window.innerWidth - menu.width - EDGE);
    const below = anchor.bottom + GAP;
    const top = below + menu.height > window.innerHeight - EDGE ? Math.max(EDGE, anchor.top - menu.height - GAP) : below;
    setPosition({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (open && position) itemRefs.current[activeIndex]?.focus();
  }, [open, position, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const onViewportChange = () => close(false);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, close]);

  const move = (delta: 1 | -1) => {
    const pos = enabledIndexes.indexOf(activeIndex);
    setActiveIndex(enabledIndexes[(pos + delta + enabledIndexes.length) % enabledIndexes.length]);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(enabledIndexes[0]);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1]);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "Tab":
        close(false);
        return;
    }
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const state = typeahead.current;
      window.clearTimeout(state.timer);
      state.text += event.key.toLowerCase();
      state.timer = window.setTimeout(() => (state.text = ""), 500);
      const match = enabledIndexes.find((i) => items[i].label.toLowerCase().startsWith(state.text));
      if (match !== undefined) setActiveIndex(match);
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAt(enabledIndexes[0]);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(enabledIndexes[enabledIndexes.length - 1]);
    }
  };

  return (
    <>
      {/* Prop-getter pattern: the ref callback only runs once the caller spreads it onto real JSX;
          the rule cannot see through the indirection (same false positive as the reference kit). */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {trigger({
        ref: (el) => {
          triggerRef.current = el;
        },
        onClick: () => (open ? close() : openAt(enabledIndexes[0])),
        onKeyDown: onTriggerKeyDown,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": menuId,
      })}
      {open && (
        <Portal>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
            className="fixed z-(--z-dropdown) min-w-52 max-w-[calc(100vw-1rem)] animate-scale-in rounded-xl border border-border bg-surface-raised p-1.5 shadow-lg"
          >
            {items.map((item, index) => (
              <button
                key={item.label}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                onMouseEnter={() => !item.disabled && setActiveIndex(index)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors duration-(--duration-fast) outline-none",
                  "focus-visible:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
                  index === activeIndex && "bg-secondary",
                  item.tone === "danger" ? "text-danger" : "text-text",
                )}
              >
                {item.icon && <Icon icon={item.icon} size="sm" className="text-text-muted" />}
                {item.label}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </>
  );
}
