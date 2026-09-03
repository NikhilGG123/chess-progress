"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export type RealtimeSubscription = {
  table: string;
  /** PostgREST-style filter, e.g. `session_id=eq.<uuid>`. */
  filter?: string;
  handler: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
};

/**
 * Subscribe to database changes, authenticated as the signed-in coach.
 *
 * The token is the whole point. Realtime re-checks every change against the
 * subscriber's own row-level security policies, and a socket carrying only the
 * publishable key fails all of them -- it still reports SUBSCRIBED and simply
 * never receives anything, which is indistinguishable from a quiet database.
 * The browser recovers the session from cookies asynchronously, so the token
 * has to be waited for and handed over before subscribing.
 *
 * Returns whether the channel is currently connected.
 */
export function useRealtime(
  channelName: string,
  subscriptions: RealtimeSubscription[],
): boolean {
  const [live, setLive] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  // Handlers are recreated every render; the channel must not be. Read them
  // through a ref so the subscription survives re-renders untouched, and write
  // it after render rather than during it -- only the channel reads it, and
  // only once a change arrives.
  const subscriptionsRef = useRef(subscriptions);
  useEffect(() => {
    subscriptionsRef.current = subscriptions;
  });

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function connect() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const token = data.session?.access_token;
      if (!token) {
        setLive(false);
        return;
      }

      await supabase.realtime.setAuth(token);
      if (cancelled) return;

      let building = supabase.channel(channelName);

      subscriptionsRef.current.forEach((subscription, index) => {
        building = building.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: subscription.table,
            ...(subscription.filter ? { filter: subscription.filter } : {}),
          },
          (payload) => subscriptionsRef.current[index]?.handler(payload),
        );
      });

      channel = building.subscribe((status) => setLive(status === "SUBSCRIBED"));
    }

    connect();

    // Access tokens last an hour. Without re-arming on refresh, a long class
    // would go quiet part way through with nothing to show it had stopped.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [channelName, supabase]);

  return live;
}

/** The shared "is this screen live?" indicator. */
export function LiveDot({ live }: { live: boolean }) {
  return (
    <span
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title={
        live
          ? "Changes made by the other coach appear here as they happen."
          : "Not connected — you may not see the other coach's changes until you reload."
      }
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          live ? "bg-status-complete-fg" : "bg-border-strong"
        }`}
      />
      {live ? "Live" : "Offline"}
    </span>
  );
}
