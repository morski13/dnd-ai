// Bottom navigation shown on every main screen.
import { DieIcon, HomeIcon, MapIcon, PersonIcon, StatsIcon } from "./icons";

const items = [
  { key: "home", label: "Home", Icon: HomeIcon },
  { key: "characters", label: "Characters", Icon: PersonIcon },
  { key: "session", label: "Session", Icon: DieIcon },
  { key: "stats", label: "Stats", Icon: StatsIcon },
  { key: "campaign", label: "Campaign", Icon: MapIcon },
] as const;

export function BottomNav({ active }: { active: (typeof items)[number]["key"] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-surface-2">
      <ul className="mx-auto grid max-w-md grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ key, label, Icon }) => (
          <li
            key={key}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${
              key === active ? "font-bold text-accent" : "text-muted"
            }`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </li>
        ))}
      </ul>
    </nav>
  );
}
