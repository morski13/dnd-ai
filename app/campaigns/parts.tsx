"use client";
import { useActionState, useState, useTransition } from "react";
import type { MyCampaign } from "@/lib/campaigns-data";
import { createCampaign, leaveCampaign, newInviteCode, switchCampaign, type ActionState } from "../campaign-actions";

const ROLE: Record<string, string> = { dm: "DM", co_dm: "Co-DM", player: "Player" };
const RULES: Record<string, string> = { "2024": "2024 rules", "2014": "2014 rules", mixed: "2014 + 2024" };

export function CampaignList({ list }: { list: MyCampaign[] }) {
  return <ul className="mt-5 flex flex-col gap-3">{list.map((c, i) => <Item key={c.id} c={c} i={i} />)}</ul>;
}

function Item({ c, i }: { c: MyCampaign; i: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(c.inviteCode);
  const [sure, setSure] = useState(false);
  return (
    <li className={`animate-rise rounded-2xl border p-4 ${c.active ? "border-accent bg-accent-surface" : "border-line bg-surface"}`} style={{ "--i": i } as React.CSSProperties}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-heading text-xl font-bold leading-tight">{c.name}</p>
          <p className="mt-0.5 text-sm text-muted">{ROLE[c.role] ?? c.role} · {RULES[c.rules] ?? c.rules} · {c.party} character{c.party === 1 ? "" : "s"}</p>
        </div>
        {c.active ? <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-text">Open now</span> : (
          <button type="button" disabled={pending} onClick={() => start(async () => { const r = await switchCampaign(c.id); if (r?.error) setError(r.error); })}
            className="h-10 shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text">{pending ? "Opening…" : "Open"}</button>
        )}
      </div>
      {code && (
        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
          <p className="text-xs text-muted">Invite code</p>
          <p className="font-heading text-lg font-bold tracking-[0.2em] text-accent">{code}</p>
          <button type="button" disabled={pending} onClick={() => start(async () => { const r = await newInviteCode(c.id); if ("error" in r) setError(r.error); else setCode(r.code); })}
            className="ml-auto text-xs text-muted underline">New code</button>
        </div>
      )}
      {c.role === "player" && (
        <button type="button" disabled={pending} onClick={() => (sure ? start(async () => { const r = await leaveCampaign(c.id); if (r?.error) setError(r.error); }) : setSure(true))}
          className={`mt-3 text-xs ${sure ? "font-bold text-danger" : "text-muted underline"}`}>{sure ? "Sure? Your characters stay in the campaign, unclaimed. Tap to leave." : "Leave campaign"}</button>
      )}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </li>
  );
}

export function NewCampaignForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCampaign, { error: null });
  const f = "h-12 w-full rounded-xl border border-line bg-bg px-4 text-[15px] outline-none focus:border-accent";
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <label className="text-sm text-soft">Name<input name="name" required maxLength={80} placeholder="The Sunken Throne" className={`${f} mt-1`} /></label>
      <label className="text-sm text-soft">Home base (optional)<input name="home" maxLength={80} placeholder="Port Ashby" className={`${f} mt-1`} /></label>
      <fieldset className="text-sm text-soft">
        <legend>Rules</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {(["2024", "2014", "mixed"] as const).map((r) => (
            <label key={r} className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-line text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-surface has-[:checked]:font-bold has-[:checked]:text-accent">
              <input type="radio" name="rules" value={r} defaultChecked={r === "2024"} className="sr-only" />{r === "mixed" ? "Both" : r}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && <p className="rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="h-12 rounded-xl bg-accent text-[15px] font-bold text-accent-text">{pending ? "Starting…" : "Start campaign"}</button>
    </form>
  );
}
