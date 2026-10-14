// The level-up rules for each rule set (server only: about 200 KB each, never sent whole to the browser).
import d14 from "./data-2014.json";
import d24 from "./data-2024.json";
import type { RulesData } from "./types";

export const rulesData = (rules: "2014" | "2024" | null | undefined): RulesData => (rules === "2014" ? d14 : d24) as unknown as RulesData;
