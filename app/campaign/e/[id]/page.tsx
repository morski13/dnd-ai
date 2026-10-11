// One document or picture.
import Link from "next/link";
import { Suspense } from "react";
import { getEntry } from "@/lib/vault-data";
import { hasSecrets } from "@/lib/vault/doc";
import { BottomNav } from "../../../components/bottom-nav";
import { EntryView } from "./entry-view";

type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function EntryPage(props: P) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-4 w-28 rounded bg-surface" /><div className="h-10 w-64 rounded bg-surface" /><div className="h-80 rounded-2xl bg-surface" /></div>}>
          <Entry {...props} />
        </Suspense>
      </main>
      <BottomNav active="campaign" />
    </>
  );
}

async function Entry({ params, searchParams }: P) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await getEntry(id);
  if (!data.entry) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">Not found</p>
        <p className="mt-1 text-sm text-muted">It may have been deleted, or the DM hasn&apos;t shared it.</p>
        <Link href="/campaign" className="mt-2 inline-block text-sm text-accent underline">Back to the campaign</Link>
      </div>
    );
  }
  const asPlayer = sp.view === "player";
  const e = data.entry;
  return (
    <EntryView
      entry={{
        id: e.id, kind: e.kind, title: e.title, shared: e.shared, status: e.status, hasImage: e.hasImage, imageW: e.imageW, imageH: e.imageH,
        updatedAt: e.updatedAt, folder: e.folder,
      }}
      doc={data.isDm && !asPlayer ? e.doc : e.publicDoc}
      secrets={data.isDm && !!e.doc && hasSecrets(e.doc)}
      canEdit={data.isDm && !asPlayer}
      asPlayer={asPlayer}
      folders={data.folders ?? []}
    />
  );
}
