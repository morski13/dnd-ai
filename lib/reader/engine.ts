// Which reader reads the campaign. Today: the free smart reader (rules, no AI, no cost).
// Later an AI engine (a free model in the browser, a free API tier, or a paid one) can be added here:
// it only has to return the same Analysis shape (see ./types.ts), so nothing else in the app changes.
import { smartReader } from "./smart";
import type { CampaignReader } from "./types";

const ENGINES: Record<string, CampaignReader> = {
  smart: smartReader,
  // ai: aiReader,   ← plug a model in here, then set CAMPAIGN_READER=ai in .env.local
};

export function getReader(): CampaignReader {
  return ENGINES[process.env.CAMPAIGN_READER ?? "smart"] ?? smartReader;
}
