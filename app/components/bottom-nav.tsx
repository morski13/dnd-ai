// Bottom navigation shown on every main screen.
import Link from "next/link";
import { DieIcon, HomeIcon, MapIcon, PersonIcon, StatsIcon } from "./icons";

// href = the screen exists already. Items without one become links in later steps.
const items = [
  { key: "home", label: "Home", Icon: HomeIcon, href: "/" },
  { key: "characters", label: "Characters", Icon: PersonIcon, href: "/characters" },
  { key: "session", label: "Session", Icon: DieIcon, href: "/session" },
  { key: "stats", label: "Stats", Icon: StatsIcon, href: null },
  { key: "campaign", label: "Campaign", Icon: MapIcon, href: null },
] as const;

export function BottomNav({ active }: { active: (typeof items)[number]["key"] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-surface-2">
      <ul className="mx-auto grid max-w-md grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ key, label, Icon, href }) => {
          const cls = `flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${
            key === active ? "font-bold text-accent" : "text-muted"
          }`;
          const inner = (
            <>
              <Icon className="h-6 w-6" />
              {label}
            </>
          );
          return (
            <li key={key}>
              {href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
