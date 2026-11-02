// Shown by the installed app when a page can't load without internet (the service worker keeps a copy).
import { APP_NAME } from "@/lib/brand";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
      <p className="text-5xl" aria-hidden>📴</p>
      <h1 className="mt-4 font-heading text-3xl font-bold">No internet</h1>
      <p className="mt-3 text-soft">This page needs a connection. A character sheet that&apos;s already open keeps rolling: the rolls wait on your phone and are sent when you&apos;re back online.</p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload is the point: try the network again */}
      <a href="/" className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-accent px-6 font-bold text-accent-text">Try again</a>
      <p className="mt-8 text-xs text-muted">{APP_NAME}</p>
    </main>
  );
}
