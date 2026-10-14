// The Tavern: the group's own D&D assistant. Rules, combos, your character, the campaign's lore,
// answered in the manner of speaking each player picks.
import Link from "next/link";
import { Suspense } from "react";
import type { Mode } from "@/lib/assistant/prompt";
import { getTavern } from "@/lib/tavern-data";
import { BottomNav } from "../components/bottom-nav";
import { TavernChat } from "./chat";
import { ChatHistory } from "./history";

type SP = Promise<Record<string, string | string[] | undefined>>;
const MODES: Mode[] = ["rules", "character", "lore"];

export default function TavernPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8">
        <Suspense fallback={<div className="animate-pulse space-y-3"><div className="h-9 w-48 rounded bg-surface" /><div className="h-16 rounded-2xl bg-surface" /><div className="h-40 rounded-2xl bg-surface" /></div>}>
          <Tavern searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function Tavern({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const data = await getTavern(one("chat"));
  const askedMode = one("mode") as Mode | null;
  const mode: Mode = data.chat ? (MODES.includes(data.chat.mode as Mode) ? (data.chat.mode as Mode) : "rules") : askedMode && MODES.includes(askedMode) ? askedMode : one("c") ? "character" : "rules";
  const characterId = data.chat?.characterId ?? one("c");
  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">{data.campaign?.name ?? "Your assistant"}</p>
          <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">The Tavern</h1>
        </div>
        {data.chat && <Link href="/tavern" className="mt-1 shrink-0 rounded-xl border border-line px-3 py-2 text-sm text-soft">New chat</Link>}
      </header>
      <p className="mb-4 mt-1 text-sm text-muted">Rules, combos, builds and lore, answered from the real rules text, your sheet and your table&apos;s house rules.</p>
      <ChatHistory chats={data.chats} current={data.chat?.id ?? null} />
      <div className="mt-3">
        <TavernChat key={data.chat?.id ?? `new-${characterId ?? ""}-${mode}`} chatId={data.chat?.id ?? null} messages={data.messages} style={data.style}
          characters={data.characters} isDm={data.isDm} configured={data.configured} mode={mode} characterId={characterId} allowModes={data.campaign ? MODES : ["rules"]} />
      </div>
    </>
  );
}
