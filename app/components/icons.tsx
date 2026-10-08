// Simple line icons (stroke 1.8), as in the design guide.
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-7 w-7"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></Svg>
);
export const PersonIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></Svg>
);
export const StatsIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h16M7 20V12M12 20V5M17 20v-6" /></Svg>
);
export const MapIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20" /></Svg>
);
export const DieIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9z" /><path d="M12 7.5 16 15H8z" /></Svg>
);
export const SwordsIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 4 9 15M20 4h-4M20 4v4M5 14l5 5M4 20l3-3" /></Svg>
);
export const SparkIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" /></Svg>
);
