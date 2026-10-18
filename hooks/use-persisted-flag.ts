"use client";

import { useSyncExternalStore } from "react";

/**
 * A true/false preference that survives a reload, per browser.
 *
 * For things a coach adjusts about their own view -- is this section open --
 * where getting it wrong costs nothing and where asking the database would be
 * absurd. Never for anything another person needs to see.
 *
 * Storage can throw outright (private windows, site data blocked), so every
 * read and write is guarded and simply falls back to the default.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changing the same preference.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

export function setPersistedFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Preference simply will not stick. Not worth telling anyone about.
  }
  listeners.forEach((notify) => notify());
}

export function usePersistedFlag(key: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
}
