"use client";
// Session Wrapped opens for everyone at the table when a session ends (the DM's, or a Track game one),
// wherever they are in the app. Missed it (phone asleep, app closed)? A small card offers it for a day.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Ended = { id: string; number: number; ended_at: string | null };
const OPENED = (id: string) => `wrapped-opened:${id}`;
const seen = (id: string) => { try { return !!localStorage.getItem(OPENED(id)); } catch { return true; } };
const mark = (id: string) => { try { localStorage.setItem(OPENED(id), "1"); } catch { /* private window */ } };
const QUIET = /^\/(login|signup|offline|auth|stats\/wrapped)/; // never jump away from these

export function WrappedWatcher() {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState<Ended | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let gone = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || gone) return;
      const { data: m } = await supabase.from("campaign_members").select("campaign_id").eq("user_id", userId)
        .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
      const campaignId = m?.campaign_id as string | undefined;
      if (!campaignId || gone) return;

      // catch-up: the newest session that ended in the last day and you haven't opened
      const { data: last } = await supabase.from("sessions").select("id, number, ended_at").eq("campaign_id", campaignId)
        .not("ended_at", "is", null).order("ended_at", { ascending: false }).limit(1).maybeSingle();
      const l = last as Ended | null;
      if (!gone && l?.ended_at && Date.now() - Date.parse(l.ended_at) < 24 * 3600_000 && !seen(l.id)) setReady(l);

      // live: the moment it ends
      channel = supabase.channel(`wrapped-watch-${campaignId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `campaign_id=eq.${campaignId}` }, (change) => {
          const s = change.new as Ended;
          if (!s?.ended_at || Date.now() - Date.parse(s.ended_at) > 10 * 60_000 || seen(s.id)) return;
          if (QUIET.test(window.location.pathname)) { setReady(s); return; }
          mark(s.id);
          setReady(null);
          router.push(`/stats/wrapped?s=${s.number}`);
        })
        .subscribe();
    })().catch(() => {});
    return () => { gone = true; if (channel) supabase.removeChannel(channel); };
  }, [router]);

  if (!ready || QUIET.test(path ?? "") || seen(ready.id)) return null;
  return (
    <div role="status" className="animate-rise fixed bottom-[calc(var(--nav-h,0px)+0.75rem)] left-[calc(var(--nav-w,0px)+0.75rem)] right-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-accent-line bg-surface-2 p-3 shadow-xl">
      <span aria-hidden className="text-2xl">🎬</span>
      <p className="min-w-0 flex-1 text-sm"><b>Session {ready.number} Wrapped</b> is ready: your night, the awards and the vote.</p>
      <button type="button" onClick={() => { mark(ready.id); setReady(null); router.push(`/stats/wrapped?s=${ready.number}`); }}
        className="h-10 shrink-0 rounded-xl bg-accent px-3 text-sm font-bold text-accent-text">Open</button>
      <button type="button" aria-label="Not now" onClick={() => { mark(ready.id); setReady(null); }} className="h-10 w-9 shrink-0 rounded-xl text-muted">✕</button>
    </div>
  );
}
