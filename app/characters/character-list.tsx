"use client";
// Filter chips + character cards (runs in the browser so the chips switch instantly).
import { useActionState, useState } from "react";
import type { CharacterCard } from "@/lib/characters-data";
import { claimCharacter, type ActionState } from "../campaign-actions";

// Avatar colors, picked by position in the list.
const avatarColors = [
  { bg: "#3A2A18", fg: "#E0913A" },
  { bg: "#1C2E38", fg: "#7FB8D4" },
  { bg: "#22301C", fg: "#9CC97E" },
  { bg: "#2E2036", fg: "#C49AD8" },
];

type Filter = "all" | "mine" | "unclaimed";

export function CharacterList({ characters, userId, isDm }: {
  characters: CharacterCard[];
  userId: string;
  isDm: boolean;
}) {
  const mine = characters.filter((c) => c.ownerId === userId);
  const unclaimed = characters.filter((c) => !c.ownerId);
  const [filter, setFilter] = useState<Filter>(mine.length ? "mine" : "all");

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: characters.length },
    { key: "mine", label: "Mine", count: mine.length },
    { key: "unclaimed", label: "Unclaimed", count: unclaimed.length },
  ];
  const shown = filter === "mine" ? mine : filter === "unclaimed" ? unclaimed : characters;

  return (
    <>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={`h-11 shrink-0 rounded-full border px-5 text-[15px] ${
              filter === chip.key ? "border-text bg-text font-semibold text-bg" : "border-line text-soft"
            }`}
          >
            {chip.label} <span className="opacity-60">{chip.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
            {filter === "mine"
              ? "You haven't claimed a character yet. Look under Unclaimed."
              : "No characters here."}
          </p>
        )}
        {shown.map((c) => (
          <Card
            key={c.id}
            c={c}
            color={avatarColors[characters.indexOf(c) % avatarColors.length]}
            isMine={c.ownerId === userId}
            canClaim={!c.ownerId && !isDm}
          />
        ))}
      </div>
    </>
  );
}

function classLine(c: CharacterCard) {
  const classes = c.classLevels
    .map((cl) =>
      c.classLevels.length === 1 && cl.subclass
        ? `${cl.class} ${cl.level} (${cl.subclass})`
        : `${cl.class} ${cl.level}`
    )
    .join(" / ");
  return [c.species, classes].filter(Boolean).join(" · ");
}

function Card({ c, color, isMine, canClaim }: {
  c: CharacterCard;
  color: { bg: string; fg: string };
  isMine: boolean;
  canClaim: boolean;
}) {
  const level = c.classLevels.reduce((sum, cl) => sum + (cl.level ?? 0), 0);
  const stats = [
    c.hpMax != null && `HP ${c.hpMax}`,
    c.ac != null && `AC ${c.ac}`,
    c.speed != null && `Speed ${c.speed}`,
  ].filter(Boolean) as string[];
  const who = isMine ? "You" : c.ownerName ?? (c.playerName ? `${c.playerName} · not claimed` : "Not claimed");

  return (
    <article className="rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-heading text-3xl font-bold"
          style={{ background: color.bg, color: color.fg }}
        >
          {c.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{c.name}</h2>
          <p className="text-sm text-muted">{classLine(c)}</p>
        </div>
        {level > 0 && <p className="font-heading text-3xl font-bold">{level}</p>}
      </div>

      {stats.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <p key={s} className="flex h-11 items-center justify-center rounded-xl bg-bg text-sm text-soft">
              {s}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className={`text-xs ${isMine ? "font-semibold text-accent" : "text-muted"}`}>Played by {who}</p>
        {canClaim && <ClaimButton id={c.id} />}
      </div>
    </article>
  );
}

function ClaimButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(claimCharacter, { error: null });
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="characterId" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-60"
      >
        {pending ? "Claiming…" : "This is mine"}
      </button>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
