// What a campaign reader takes in and gives back. Any engine (the free smart reader today,
// an AI model later) has to produce exactly this, so the screens don't care which one ran.
import type { DocNode } from "../vault/doc";

export type ReaderDoc = {
  id: string; title: string; folder: string; status: string | null; shared: boolean; doc: DocNode; updatedAt?: string;
  folderName?: string;            // shown for "other" pages (a custom folder's name, Maps, Shops…)
};
export type ReaderInput = { docs: ReaderDoc[]; party: { id: string; name: string }[] };

export type NodeType = "npc" | "place" | "faction" | "party" | "lore" | "quest" | "plan" | "event" | "note";
export type Fact = { text: string; secret: boolean };
export type Evidence = Fact & { docId: string; docTitle: string };

export type MapNode = {
  id: string; label: string; type: NodeType; docId: string | null; aliases: string[];
  summary: string; facts: Fact[]; status: string | null; degree: number;
  secret: boolean;                // the DM hasn't shared this page yet
  noPage?: boolean;               // named in the notes, but nobody wrote a page for it yet
  planId?: string | null;         // events: the session plan they belong to
  folder?: string;                // which folder the page is in (for "other" pages)
  aiSummary?: Fact;               // the AI reader's short summary (when the DM ran it)
};
export type MapEdge = {
  id: string; a: string; b: string; label: string; weight: number; secret: boolean; evidence: Evidence[];
  ai?: boolean;                   // found by the AI reader, not written as a mention
};
export type StoryPoint = { text: string; secret: boolean; why: string; docId: string; nodes: string[]; score: number };
export type Milestone = {
  id: string; docId: string; title: string; status: string | null; when: string | null; rank: number;
  steps: Fact[]; secret: boolean; kind: "milestone" | "quest"; givenBy: string | null; reward: string | null;
};
export type Analysis = {
  engine: string; nodes: MapNode[]; edges: MapEdge[]; mustHappen: StoryPoint[]; milestones: Milestone[];
  stats: { docs: number; words: number; secretFacts: number };
};

export interface CampaignReader {
  name: string;
  analyze(input: ReaderInput): Promise<Analysis>;
}
