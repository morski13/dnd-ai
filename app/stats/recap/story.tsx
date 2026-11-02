"use client";
// The session's story: shows the saved one, or lets anyone at the table have the AI write it (English or Serbian).
import { useState, useTransition } from "react";
import { writeRecapStory, type StoryLang } from "./actions";

export function Story({ sessionId, initial, aiReady }: { sessionId: string; initial: string | null; aiReady: boolean }) {
  const [story, setStory] = useState(initial);
  const [lang, setLang] = useState<StoryLang>("en");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const write = () => start(async () => {
    setError(null);
    const r = await writeRecapStory(sessionId, lang);
    if ("error" in r) setError(r.error); else setStory(r.story);
  });

  if (!aiReady && !story) return <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">The story needs an AI, which isn&apos;t set up in this app yet. The numbers below are all here anyway.</p>;
  return (
    <div className="rounded-[18px] border border-line bg-surface p-4">
      {story ? <p className="whitespace-pre-line text-[15px] leading-relaxed">{story}</p>
        : <p className="text-sm text-muted">No story yet. The AI writes it from the moments and numbers on this page, nothing else.</p>}
      {pending && <p className="mt-3 text-sm text-accent" role="status">Writing the story… (up to a minute)</p>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {aiReady && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Language">
            {(["en", "sr"] as StoryLang[]).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
                className={`h-8 rounded-md px-3 text-sm ${lang === l ? "bg-accent font-bold text-accent-text" : "text-soft"}`}>{l === "en" ? "English" : "Srpski"}</button>
            ))}
          </div>
          <button type="button" onClick={write} disabled={pending} className="h-10 flex-1 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-60">
            {story ? "Write it again" : "Write the story"}
          </button>
        </div>
      )}
    </div>
  );
}
