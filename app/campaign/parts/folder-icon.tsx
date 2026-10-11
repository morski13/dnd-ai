// The icon for each kind of folder.
import { BagIcon, BookIcon, CalendarIcon, CastleIcon, FlagIcon, FolderIcon, MapIcon, PersonIcon, ScrollIcon, ShieldIcon, SparkIcon, SwordsIcon } from "../../components/icons";

const ICONS: Record<string, typeof FolderIcon> = {
  plans: CalendarIcon, npcs: PersonIcon, party: SparkIcon, maps: MapIcon, places: CastleIcon, shops: BagIcon, fights: SwordsIcon,
  goals: FlagIcon, factions: ShieldIcon, lore: BookIcon, handouts: ScrollIcon, custom: FolderIcon,
};

export function FolderGlyph({ kind, className }: { kind: string; className?: string }) {
  const Icon = ICONS[kind] ?? FolderIcon;
  return <Icon className={className ?? "h-6 w-6"} />;
}
