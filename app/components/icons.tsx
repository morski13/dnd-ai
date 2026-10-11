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

// Campaign page
export const BookIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5M8 7h7" /></Svg>
);
export const CastleIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12z" /><path d="M10 21v-4a2 2 0 0 1 4 0v4" /></Svg>
);
export const BagIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Svg>
);
export const FlagIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Svg>
);
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" /><path d="M9 12l2 2 4-4" /></Svg>
);
export const ScrollIcon = (p: IconProps) => (
  <Svg {...p}><path d="M7 4h11a2 2 0 0 1 2 2v1h-4" /><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10" /><path d="M7 4a2 2 0 0 0-2 2v11M9 9h4M9 13h4" /></Svg>
);
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4M8 14h3" /></Svg>
);
export const FolderIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
);
export const ImageIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-8 8" /></Svg>
);
export const DocIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></Svg>
);
export const LockIcon = (p: IconProps) => (
  <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
);
export const EyeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
