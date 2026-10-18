"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STATUSES, STATUS_META, type Status } from "@/lib/status";

/** Roughly the menu's height: four rows plus its padding. */
const MENU_HEIGHT = 152;
const MENU_WIDTH = 176;

/**
 * A cell's status, chosen directly rather than cycled to.
 *
 * Clicking opens the four options with their labels, so setting "checked off"
 * from "not seen" is one decision instead of three clicks in the right
 * direction -- and a mis-click is corrected by picking the right option rather
 * than going all the way round again.
 *
 * The menu is portalled to the body and positioned fixed. Inside the grid it
 * would otherwise be clipped: the table scrolls horizontally, and a container
 * that clips one axis clips both.
 */
export function StatusPicker({
  status,
  onSelect,
  label,
  variant = "cell",
}: {
  status: Status;
  onSelect: (next: Status) => void;
  /** Who and what this cell is, for the accessible name. */
  label: string;
  variant?: "cell" | "wide";
}) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const meta = STATUS_META[status];
  const open = position !== null;

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Flip above the cell when there is not room below, and keep the menu on
    // screen horizontally on a phone.
    const below = rect.bottom + 4;
    const top =
      below + MENU_HEIGHT > window.innerHeight
        ? rect.top - MENU_HEIGHT - 4
        : below;
    const left = Math.max(
      8,
      Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
    );

    setPosition({ top, left });
  }

  // Close on an outside click, Escape, or any scroll -- a fixed menu would
  // otherwise sit still while the grid moves underneath it.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      setPosition(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPosition(null);
        buttonRef.current?.focus();
      }
    }
    function close() {
      setPosition(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setPosition(null) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${label}: ${meta.label}`}
        aria-label={`${label}: ${meta.label}. Change.`}
        className={
          variant === "cell"
            ? `h-10 w-10 cursor-pointer rounded text-sm font-semibold transition-colors
               duration-200 hover:brightness-95 ${meta.cell}`
            : `flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-xs font-medium
               transition-colors duration-200 hover:brightness-95 ${meta.cell}`
        }
      >
        <span aria-hidden>{meta.mark}</span>
        {variant === "wide" && <span aria-hidden>{meta.label}</span>}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              top: position.top,
              left: position.left,
              width: MENU_WIDTH,
            }}
            className="fixed z-50 overflow-hidden rounded-md border border-border-strong
                       bg-surface-raised shadow-lg"
          >
            {STATUSES.map((option) => {
              const optionMeta = STATUS_META[option];
              return (
                <button
                  key={option}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPosition(null);
                    if (option !== status) onSelect(option);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-left
                              text-xs transition-colors duration-200 hover:bg-muted ${
                                option === status ? "bg-muted font-medium" : ""
                              }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded
                                font-semibold ${optionMeta.chip}`}
                  >
                    {optionMeta.mark}
                  </span>
                  <span className="flex-1">{optionMeta.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
