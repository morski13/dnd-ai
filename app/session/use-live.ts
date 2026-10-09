"use client";
// Keeps the Session screen up to date: Supabase Realtime pushes changes instantly,
// and a gentle refresh every few seconds catches anything Realtime can't send
// (for example secret DM rolls, which players aren't allowed to receive).
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export function useLive(campaignId: string, sessionId: string | null, everyMs = 8000) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250); // bundle bursts of changes
    };

    const supabase = createClient();
    const channel = supabase.channel(`table-${campaignId}`);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `campaign_id=eq.${campaignId}` }, refresh);
    if (sessionId) {
      channel.on("postgres_changes", { event: "*", schema: "public", table: "roll_events", filter: `session_id=eq.${sessionId}` }, refresh);
      channel.on("postgres_changes", { event: "*", schema: "public", table: "combats", filter: `session_id=eq.${sessionId}` }, refresh);
    }
    channel.subscribe();

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);

    return () => {
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [campaignId, sessionId, everyMs, router]);
}
