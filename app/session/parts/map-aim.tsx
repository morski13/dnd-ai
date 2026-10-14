"use client";
// Lets the turn card hand an area spell to the battle map: the map shows the area, the player places it,
// sees who is inside, then casts (or cancels). The result comes back to the turn card.
import { createContext, useContext, useState, type ReactNode } from "react";
import type { AreaSpec } from "@/lib/maps/area";
import type { Advantage } from "@/lib/dice";
import type { RollResponse } from "../../characters/[id]/actions";

export type AimRequest = {
  characterId: string; optionKey: string; name: string; spec: AreaSpec; heal: boolean; advantage: Advantage;
  onDone: (res: RollResponse) => void;
};
type Ctx = { aim: AimRequest | null; setAim: (a: AimRequest | null) => void; onMap: (characterId: string) => boolean };
const AimContext = createContext<Ctx | null>(null);

export function MapAimProvider({ tokenCharacterIds, children }: { tokenCharacterIds: string[]; children: ReactNode }) {
  const [aim, setAim] = useState<AimRequest | null>(null);
  return <AimContext.Provider value={{ aim, setAim, onMap: (id) => tokenCharacterIds.includes(id) }}>{children}</AimContext.Provider>;
}
export const useMapAim = () => useContext(AimContext);
