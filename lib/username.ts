// Usernames instead of emails (pure, tested). Supabase still needs an email for each account, so a new
// account gets a placeholder address built from its username; nothing is ever sent to it.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** "  Marko_99 " → "marko_99". Usernames are case-insensitive and stored in lower case. */
export const cleanUsername = (raw: string) => raw.trim().toLowerCase();

/** null when it's fine, otherwise what to fix (in plain words). */
export function usernameProblem(raw: string): string | null {
  const u = cleanUsername(raw);
  if (u.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters for your username.`;
  if (u.length > USERNAME_MAX) return `Keep your username to ${USERNAME_MAX} characters or fewer.`;
  if (!/^[a-z0-9._-]+$/.test(u)) return "Use only letters, numbers, dots, dashes and underscores (no spaces).";
  if (!/[a-z0-9]/.test(u[0])) return "Start your username with a letter or a number.";
  return null;
}

/** The placeholder email behind a username account ("marko@users.example"). */
export function placeholderEmail(username: string, domain = "users.tinyhut.invalid") {
  return `${cleanUsername(username)}@${domain}`;
}

/** Someone typed an email in the username box (an account from before usernames). */
export const looksLikeEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
