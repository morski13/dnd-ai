"use client";
// Keeps the Session screen up to date: Supabase Realtime pushes changes instantly,
// and a gentle refresh every few seconds catches anything Realtime can't send
// (for example secret DM rolls, which players aren't allowed to receive).
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// userId: your own new rolls are skipped here, because the screen you rolled from already refreshes
// once the dice land (a second refresh straight after it only made the server render the page twice).
export function useLive(campaignId: string, sessionId: string | null, userId: string | null = null, everyMs = 8000) {
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
    channel.on("postgres_changes", { event: "*", schema: "public", table: "shops", filter: `campaign_id=eq.${campaignId}` }, refresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "map_tokens", filter: `campaign_id=eq.${campaignId}` }, refresh);
    if (sessionId) {
      channel.on("postgres_changes", { event: "*", schema: "public", table: "roll_events", filter: `session_id=eq.${sessionId}` }, (change) => {
        const row = change.new as { rolled_by?: string } | null;
        if (change.eventType === "INSERT" && userId && row?.rolled_by === userId) return;
        refresh();
      });
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
  }, [campaignId, sessionId, userId, everyMs, router]);
}
