"use client";
// Charts for the Statistics screen (Recharts). Each character keeps its own color everywhere.
import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/stats-data";

const INK = { text: "#efe7da", soft: "#cbbfad", muted: "#a89c8a", line: "#3a332a", surface: "#211d18" };

type Series = { key: string; name: string; color: string };

function Tip({ active, payload, label, unit }: { active?: boolean; payload?: { name?: string; value?: number | null; color?: string; payload?: { name?: string } }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-semibold text-text">{label}</p>}
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-soft">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name ?? p.payload?.name}: <span className="font-semibold text-text">{p.value}{unit ?? ""}</span>
        </p>
      ))}
    </div>
  );
}

/** Horizontal bars, one per character, with the value written at the end of each bar. */
export function CharacterBars({ data, unit = "" }: { data: { name: string; value: number; color: string }[]; unit?: string }) {
  if (!data.some((d) => d.value > 0)) return <p className="py-6 text-center text-sm text-muted">Nothing yet.</p>;
  return (
    <div style={{ height: data.length * 44 + 8 }} role="img" aria-label={data.map((d) => `${d.name} ${d.value}${unit}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="name" width={64} tickLine={false} axisLine={false} tick={{ fill: INK.soft, fontSize: 13 }} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<Tip unit={unit} />} />
          <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]} animationDuration={700} animationEasing="ease-out">
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            <LabelList dataKey="value" position="right" fill={INK.text} fontSize={13} fontWeight={700} formatter={(v) => `${v}${unit}`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const METRICS = [
  { id: "damage", label: "Damage", unit: "" },
  { id: "healing", label: "Healing", unit: "" },
  { id: "damageTaken", label: "HP lost", unit: "" },
  { id: "d20Avg", label: "Avg d20", unit: "" },
  { id: "hitRate", label: "Hit rate", unit: "%" },
] as const;
type MetricId = (typeof METRICS)[number]["id"];

/** One line per character across the sessions, with a metric switcher. */
export function TrendChart({ trends, series }: { trends: Record<MetricId, TrendPoint[]>; series: Series[] }) {
  const [metric, setMetric] = useState<MetricId>("damage");
  const m = METRICS.find((x) => x.id === metric)!;
  const data = trends[metric];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Trend">
        {METRICS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === metric}
            onClick={() => setMetric(x.id)}
            className={`h-9 rounded-full border px-3 text-xs font-semibold ${x.id === metric ? "border-accent bg-accent-surface text-accent" : "border-line text-muted"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {series.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />{s.name}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={INK.line} strokeDasharray="0" />
            <XAxis dataKey="session" tickLine={false} axisLine={{ stroke: INK.line }} tick={{ fill: INK.muted, fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: INK.muted, fontSize: 12 }} allowDecimals={metric === "d20Avg"} domain={metric === "d20Avg" ? [1, 20] : metric === "hitRate" ? [0, 100] : [0, "auto"]} />
            <Tooltip cursor={{ stroke: INK.muted, strokeWidth: 1 }} content={<Tip unit={m.unit} />} />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 4, fill: s.color, stroke: INK.surface, strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: INK.surface, strokeWidth: 2 }}
                connectNulls
                animationDuration={900}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
