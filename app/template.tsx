// Wraps every screen so it fades in when you move between screens.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex min-h-full flex-1 flex-col">{children}</div>;
}
