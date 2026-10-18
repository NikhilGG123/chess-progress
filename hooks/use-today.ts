"use client";

import { useSyncExternalStore } from "react";
import { todayIso } from "@/lib/format";

/** Re-check on the minute, so a tab left open overnight rolls over. */
function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

/**
 * Today in the coach's own calendar — `null` on the server and for the first
 * paint, so callers render a placeholder rather than guessing.
 *
 * "Is there a class today?" has to be answered where the coach is, not where
 * the server is. On a UTC host a 4:30pm Pacific class falls on the *next* UTC
 * day: the app would offer to start a second session for a class already in
 * progress, and would file this evening's lesson as one still to come.
 *
 * useSyncExternalStore rather than an effect because that is exactly what it is
 * for — a value that legitimately differs between server and client. The
 * snapshot returns a plain string, so an unchanged date is compared equal and
 * nothing re-renders.
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, todayIso, () => null);
}

/** Minutes since midnight, in the coach's own clock. `null` until mounted. */
function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function useMinutesNow(): number | null {
  return useSyncExternalStore(subscribe, nowMinutes, () => null);
}
