// One folder: its documents and pictures.
import Link from "next/link";
import { Suspense } from "react";
import { getFolder } from "@/lib/vault-data";
import { BottomNav } from "../../../components/bottom-nav";
import { FolderView } from "./folder-view";

type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function FolderPage(props: P) {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-48 rounded bg-surface" /><div className="h-24 rounded-2xl bg-surface" /><div className="h-24 rounded-2xl bg-surface" /></div>}>
          <Folder {...props} />
        </Suspense>
      </main>
      <BottomNav active="campaign" />
    </>
  );
}

async function Folder({ params, searchParams }: P) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await getFolder(id);
  if (!data.folder) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">Folder not found</p>
        <Link href="/campaign" className="mt-2 inline-block text-sm text-accent underline">Back to the campaign</Link>
      </div>
    );
  }
  const asPlayer = sp.view === "player";
  const canEdit = data.isDm && !asPlayer;
  const entries = data.isDm && asPlayer ? data.entries.filter((e) => e.shared) : data.entries;
  return (
    <FolderView
      folder={{ id: data.folder.id, kind: data.folder.kind, name: data.folder.name }}
      def={{ blurb: data.folder.def.blurb, first: data.folder.def.first, newDocLabel: data.folder.def.newDocLabel }}
      entries={entries}
      canEdit={canEdit}
      asPlayer={asPlayer}
      fights={canEdit ? data.fights : []}
      shops={asPlayer ? data.shops.filter((x) => x.isOpen) : data.shops}
    />
  );
}
