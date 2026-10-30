// Home screen: your campaign, the session card and the main menu.
import Link from "next/link";
import { Suspense } from "react";
import { getHomeData } from "@/lib/home-data";
import { logOut } from "./auth-actions";
import { BottomNav } from "./components/bottom-nav";
import { CubeIcon, DieIcon, MapIcon, PersonIcon, SparkIcon, StatsIcon, SwordsIcon } from "./components/icons";
import { JoinForm } from "./join-form";
import { Logo } from "./components/logo";
import { StartSessionButton } from "./session/start-button";

export default function HomePage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-10 pb-28">
        <Suspense fallback={<HomeSkeleton />}>
          <Home />
        </Suspense>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function Home() {
  const data = await getHomeData();

  if (!data.campaign) {
    return (
      <>
        <Header label="Welcome" title={data.displayName} subtitle={null} initial={data.displayName} />
        <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <p className="font-semibold">Join your campaign</p>
          <p className="mt-1 text-sm text-muted">Ask your DM for the invite code and enter it here.</p>
          <JoinForm />
        </div>
        <Link href="/campaigns" className="mt-4 flex items-center justify-between rounded-2xl border border-accent-line bg-accent-surface p-5">
          <span><span className="block font-semibold">Or start your own campaign</span><span className="mt-1 block text-sm text-muted">Be the DM: invite your players with a code.</span></span>
          <span className="text-accent">→</span>
        </Link>
      </>
    );
  }

  const { campaign } = data;
  const subtitle = [campaign.homeBase, campaign.partyLevel && `Party level ${campaign.partyLevel}`]
    .filter(Boolean)
    .join(" · ");
  const live = data.activeSessionNumber !== null;

  const tiles: { Icon: typeof PersonIcon; title: string; sub: string; href?: string }[] = [
    {
      href: "/characters",
      Icon: PersonIcon,
      title: "Your characters",
      sub: data.isDm
        ? `${data.partySize} in the party`
        : `${data.myCharacters} character${data.myCharacters === 1 ? "" : "s"}`,
    },
    { href: "/stats", Icon: StatsIcon, title: "Your statistics", sub: data.myRolls ? `${data.myRolls} rolls logged` : "No rolls yet" },
    { href: "/campaign", Icon: MapIcon, title: campaign.name, sub: data.isDm ? "Notes, NPCs, maps, shops" : "Maps, NPCs, handouts" },
    { href: "/roll", Icon: CubeIcon, title: "Dice", sub: "Roll any dice · design your own" },
    data.isDm
      ? { Icon: SwordsIcon, title: "Fight planner", sub: "DM · plan & balance fights", href: "/fights" }
      : { Icon: SwordsIcon, title: "Practice fight", sub: "How would you do? Uses your real dice", href: "/practice" },
    ...(data.isDm ? [{ Icon: MapIcon, title: "Battle maps", sub: "DM · upload maps, fit the squares", href: "/maps" }] : []),
    { Icon: SparkIcon, title: "The Tavern", sub: "Ask the AI: rules, combos, lore", href: "/tavern" },
  ];

  return (
    <>
      <Header label="Your campaign" title={campaign.name} subtitle={subtitle} initial={data.displayName} />
      <Link href="/campaigns" className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm text-accent underline">
        {data.campaignCount > 1 ? `Switch campaign (${data.campaignCount})` : "Your campaigns · start a new one"}
      </Link>

      <div className="mt-7 grid gap-5 lg:grid-cols-3">
      {/* Session card */}
      <section className="rounded-[18px] border border-accent-line bg-accent-surface p-5 lg:col-span-2 lg:p-7">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
            {live ? "Live now" : "Session mode"}
          </p>
          {campaign.schedule && <p className="text-sm text-soft">{campaign.schedule}</p>}
        </div>
        <h2 className="mt-3 font-heading text-2xl font-semibold">
          {live ? `Session ${data.activeSessionNumber} is live` : `Session ${data.nextSessionNumber} is ready`}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-soft">
          All rolls are saved and turned into stats when the session ends.
        </p>
        {live ? (
          <Link href="/session" className="mt-5 inline-flex h-12 items-center rounded-xl bg-accent px-6 text-[15px] font-bold text-accent-text">
            Join the table
          </Link>
        ) : data.isDm ? (
          <StartSessionButton />
        ) : (
          <p className="mt-5 text-sm text-muted">Waiting for the DM to start.</p>
        )}
      </section>

      {data.isDm ? (
        <section className="flex flex-col rounded-2xl border border-line bg-surface-2 p-4 lg:p-6">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Invite your players</p>
          <p className="mt-2 text-sm text-soft">
            Players create an account, then enter this code:
          </p>
          <p className="mt-2 font-heading text-2xl font-bold tracking-[0.2em] text-accent lg:mt-auto lg:text-3xl">
            {campaign.inviteCode}
          </p>
        </section>
      ) : (
        <section className="hidden flex-col justify-center rounded-2xl border border-line bg-surface-2 p-6 lg:flex">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Last session</p>
          <p className="mt-2 font-heading text-2xl font-bold">{data.lastSession ? `Session ${data.lastSession.number}` : "None yet"}</p>
          {data.lastSession?.title && <p className="mt-1 text-soft">{data.lastSession.title}</p>}
        </section>
      )}
      </div>

      {/* Menu grid */}
      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {tiles.map(({ Icon, title, sub, href }, i) => {
          const inner = (
            <>
              <Icon className="h-7 w-7 text-accent" />
              <p className="mt-4 font-bold leading-snug">{title}</p>
              <p className="mt-1.5 text-sm text-muted">{sub}</p>
            </>
          );
          const cls = "animate-rise block min-h-36 rounded-2xl border border-line bg-surface p-4";
          const style = { "--i": i } as React.CSSProperties;
          return href ? (
            <Link key={title} href={href} className={`${cls} transition-colors active:border-accent md:hover:border-accent-line md:hover:bg-surface-2`} style={style}>{inner}</Link>
          ) : (
            <div key={title} className={cls} style={style}>{inner}</div>
          );
        })}
      </section>

      {data.lastSession && (
        <p className="mt-6 text-center text-xs text-muted">
          Last session: {data.lastSession.number}
          {data.lastSession.title ? ` · ${data.lastSession.title}` : ""}
        </p>
      )}
    </>
  );
}

function Header({ label, title, subtitle, initial }: {
  label: string; title: string; subtitle: string | null; initial: string;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted">
          <Logo decorative className="h-6 w-6" />
          {label}
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {/* Tap your initial to log out */}
      <details className="relative shrink-0">
        <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-line bg-surface font-bold [&::-webkit-details-marker]:hidden">
          {initial.charAt(0).toUpperCase()}
        </summary>
        <form action={logOut} className="absolute right-0 z-10 mt-2">
          <button className="h-11 whitespace-nowrap rounded-xl border border-line bg-surface-2 px-4 text-sm">
            Log out
          </button>
        </form>
      </details>
    </header>
  );
}

function HomeSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-28 rounded bg-surface" />
      <div className="mt-3 h-8 w-56 rounded bg-surface" />
      <div className="mt-7 h-52 rounded-[18px] bg-surface" />
      <div className="mt-5 grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
