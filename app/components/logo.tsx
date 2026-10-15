// The app's mark: a hut under a glowing amber dome. Size it with className (h-/w-).
import { APP_NAME } from "@/lib/brand";

/* eslint-disable @next/next/no-img-element -- a small static SVG, nothing to optimise */
export function Logo({ className = "h-10 w-10", decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <img
      src="/icons/logo-mark.svg"
      alt={decorative ? "" : APP_NAME}
      aria-hidden={decorative || undefined}
      width={512}
      height={512}
      className={className}
    />
  );
}
