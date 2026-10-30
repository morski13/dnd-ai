// The app's main navigation, shaped for the device:
// phones: a bar along the bottom; tablets (md, 768px+): a rail down the left with icons;
// laptops (lg, 1024px+): a wider side bar with the logo and the names written out.
// The page makes room for it in globals.css (body:has([data-app-nav])).
import Link from "next/link";
import { APP_SHORT_NAME } from "@/lib/brand";
import { CubeIcon, DieIcon, HomeIcon, MapIcon, PersonIcon, StatsIcon } from "./icons";
import { Logo } from "./logo";

const items = [
  { key: "home", label: "Home", Icon: HomeIcon, href: "/" },
  { key: "characters", label: "Characters", Icon: PersonIcon, href: "/characters" },
  { key: "session", label: "Session", Icon: DieIcon, href: "/session" },
  { key: "dice", label: "Dice", Icon: CubeIcon, href: "/roll" },
  { key: "stats", label: "Stats", Icon: StatsIcon, href: "/stats" },
  { key: "campaign", label: "Campaign", Icon: MapIcon, href: "/campaign" },
] as const;

export type NavKey = (typeof items)[number]["key"];

export function BottomNav({ active }: { active: NavKey }) {
  return (
    <nav data-app-nav aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-2 md:inset-x-auto md:top-0 md:left-0 md:w-[5.5rem] md:overflow-y-auto md:border-t-0 md:border-r lg:w-60">
      <Link href="/" className="hidden h-24 items-center justify-center gap-3 px-3 md:flex lg:justify-start lg:px-6" aria-label="Home">
        <Logo decorative className="h-11 w-11 shrink-0" />
        <span className="hidden font-heading text-xl font-bold leading-tight lg:block">{APP_SHORT_NAME}</span>
      </Link>
      <ul className="mx-auto grid max-w-md grid-cols-6 pb-[env(safe-area-inset-bottom)] md:max-w-none md:grid-cols-1 md:gap-1 md:px-2 md:pb-4 lg:px-3">
        {items.map(({ key, label, Icon, href }) => {
          const on = key === active;
          return (
            <li key={key}>
              <Link href={href} aria-current={on ? "page" : undefined}
                className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[10px] leading-none min-[375px]:text-[11px] min-[400px]:text-xs md:h-[4.5rem] md:rounded-2xl md:text-[11px] lg:h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-[15px] ${
                  on ? "font-bold text-accent md:bg-accent-surface" : "text-muted md:hover:bg-surface"
                }`}>
                <Icon className={`h-6 w-6 shrink-0 ${on ? "animate-pop" : ""}`} />
                <span className="block max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
