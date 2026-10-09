// Home screen: your campaign, the session card and the main menu.
import Link from "next/link";
import { Suspense } from "react";
import { getHomeData } from "@/lib/home-data";
import { logOut } from "./auth-actions";
import { BottomNav } from "./components/bottom-nav";
import { DieIcon, MapIcon, PersonIcon, SparkIcon, StatsIcon, SwordsIcon } from "./components/icons";
import { JoinForm } from "./join-form";
import { StartSessionButton } from "./session/start-button";

export default function HomePage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-10 pb-28">
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
    { Icon: MapIcon, title: campaign.name, sub: "Map, NPCs, quests" },
    { href: "/dice", Icon: DieIcon, title: "Your dice", sub: "Design 3D dice & test-throw" },
    { Icon: SwordsIcon, title: "Fight planner", sub: data.isDm ? "DM · plan & balance fights" : "DM only", href: data.isDm ? "/fights" : undefined },
    { Icon: SparkIcon, title: "Ask the AI", sub: "Rules, ideas, builds" },
  ];

  return (
    <>
      <Header label="Your campaign" title={campaign.name} subtitle={subtitle} initial={data.displayName} />

      {/* Session card */}
      <section className="mt-7 rounded-[18px] border border-[#5A4024] bg-accent-surface p-5">
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

      {/* Menu grid */}
      <section className="mt-5 grid grid-cols-2 gap-3">
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
            <Link key={title} href={href} className={`${cls} active:border-accent`} style={style}>{inner}</Link>
          ) : (
            <div key={title} className={cls} style={style}>{inner}</div>
          );
        })}
      </section>

      {data.isDm && (
        <section className="mt-5 rounded-2xl border border-line bg-surface-2 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Invite your players</p>
          <p className="mt-2 text-sm text-soft">
            Players create an account, then enter this code:
          </p>
          <p className="mt-2 font-heading text-2xl font-bold tracking-[0.2em] text-accent">
            {campaign.inviteCode}
          </p>
        </section>
      )}

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
        <p className="text-xs uppercase tracking-[0.12em] text-muted">{label}</p>
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
