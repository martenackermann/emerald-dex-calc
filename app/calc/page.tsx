"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords, Settings2, RotateCcw, ChevronRight, Dna } from "lucide-react";
import { useSave } from "@/components/save/save-provider";
import { Sprite } from "@/components/pokemon/sprite";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { MonPanel } from "@/components/calc/mon-panel";
import { FieldControls } from "@/components/calc/field-controls";
import { Combobox } from "@/components/calc/combobox";
import { resolveMon, loadTrainers, type GameData, type Trainer } from "@/lib/pokemon/data";
import { buildDemoSave } from "@/lib/pokemon/demo";
import { calcMonFromResolved, calcMonFromTrainer, toCombatant, type CalcMon } from "@/lib/calc/mon";
import { calc, effectivenessLabel, DEFAULT_FIELD, type Field } from "@/lib/calc/damage";
import { predictAiMoves } from "@/lib/calc/ai";
import { cn } from "@/lib/utils";

interface BattleMon {
  mon: CalcMon;
  curHp: number;
}
interface RoundEntry {
  n: number;
  text: string;
}

export default function CalcPage() {
  const { data, save } = useSave();

  const [playerTeam, setPlayerTeam] = useState<BattleMon[]>([]);
  const [enemyTeam, setEnemyTeam] = useState<BattleMon[]>([]);
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [pIdx, setPIdx] = useState(0);
  const [eIdx, setEIdx] = useState(0);
  const [field, setField] = useState<Field>(DEFAULT_FIELD);
  const [pMove, setPMove] = useState<number | null>(null);
  const [eMoveOverride, setEMoveOverride] = useState<number | null>(null);
  const [log, setLog] = useState<RoundEntry[]>([]);
  const [editP, setEditP] = useState(false);
  const [editE, setEditE] = useState(false);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [dragI, setDragI] = useState<number | null>(null);

  useEffect(() => { loadTrainers().then(setTrainers).catch(() => {}); }, []);

  // seed player team from save/demo once
  useEffect(() => {
    if (!data || playerTeam.length) return;
    const src = save ?? buildDemoSave(data);
    const team = src.party.map((m) => {
      const mon = calcMonFromResolved(resolveMon(m, data));
      return { mon, curHp: toCombatant(data, mon)?.stats.hp ?? 1 };
    });
    setPlayerTeam(team);
  }, [data, save, playerTeam.length]);

  if (!data || playerTeam.length === 0) {
    return <div className="py-10 text-center text-muted-foreground">Loading…</div>;
  }

  const maxHp = (mon: CalcMon) => toCombatant(data, mon)?.stats.hp ?? 1;
  const patchPlayer = (i: number, patch: Partial<BattleMon>) =>
    setPlayerTeam((t) => t.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const patchEnemy = (i: number, patch: Partial<BattleMon>) =>
    setEnemyTeam((t) => t.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const loadTrainer = (t: Trainer) => {
    setTrainer(t);
    setEnemyTeam(t.party.map((tm) => {
      const mon = calcMonFromTrainer(data, tm);
      return { mon, curHp: toCombatant(data, mon)?.stats.hp ?? 1 };
    }));
    setEIdx(0);
    setEMoveOverride(null);
  };

  const reorderPlayer = (from: number, to: number) => {
    setPlayerTeam((t) => {
      const arr = [...t];
      const [m] = arr.splice(from, 1);
      arr.splice(to, 0, m);
      const active = t[pIdx];
      const ni = arr.indexOf(active);
      if (ni >= 0) setPIdx(ni);
      return arr;
    });
  };

  const pB = playerTeam[pIdx];
  const eB = enemyTeam[eIdx] ?? null;
  const aC = toCombatant(data, pB.mon);
  const eC = eB ? toCombatant(data, eB.mon) : null;

  // enemy AI predictions vs current player mon
  const predictions =
    eB && eC && aC
      ? predictAiMoves(data, eC, aC, pB.curHp, eB.mon.moves.filter((m) => m > 0), eB.mon.level, field, trainer?.ai ?? [])
      : [];
  const topEnemyMove = predictions[0]?.move.id ?? 0;
  const effEMove = eMoveOverride ?? topEnemyMove;

  const moveVs = (atk: typeof aC, def: typeof eC, moveId: number, level: number) => {
    const mv = data.moveById.get(moveId);
    if (!mv || !atk || !def) return null;
    return { move: mv, normal: calc(atk, def, mv, level, field), crit: calc(atk, def, mv, level, { ...field, crit: true }) };
  };

  const endRound = () => {
    if (!eB || !eC || !aC) return;
    let txt = "";
    if (pMove) {
      const r = moveVs(aC, eC, pMove, pB.mon.level)?.normal;
      const dmg = r ? Math.floor((r.min + r.max) / 2) : 0;
      patchEnemy(eIdx, { curHp: Math.max(0, eB.curHp - dmg) });
      txt += `You: ${data.speciesById.get(pB.mon.speciesId)?.name} used ${data.moveById.get(pMove)?.name} (~${dmg} dmg${r ? `, ${r.minPct.toFixed(0)}-${r.maxPct.toFixed(0)}%` : ""}).`;
    }
    if (effEMove) {
      const r = moveVs(eC, aC, effEMove, eB.mon.level)?.normal;
      const dmg = r ? Math.floor((r.min + r.max) / 2) : 0;
      patchPlayer(pIdx, { curHp: Math.max(0, pB.curHp - dmg) });
      txt += `${txt ? " " : ""}Enemy: ${data.speciesById.get(eB.mon.speciesId)?.name} used ${data.moveById.get(effEMove)?.name} (~${dmg} dmg).`;
    }
    if (txt) setLog((l) => [{ n: l.length + 1, text: txt }, ...l]);
    setPMove(null);
    setEMoveOverride(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <Swords className="size-5 text-primary sm:size-6" /> Battle Planner
        </h1>
        <p className="text-sm text-muted-foreground">
          Track HP round by round, pick both moves, and see what the ROM-hack AI is likely to do.
        </p>
      </div>

      {/* rosters */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Roster
          data={data}
          title={save ? "Your team (drag to reorder)" : "Demo team (drag to reorder)"}
          team={playerTeam}
          active={pIdx}
          maxHp={maxHp}
          onSelect={setPIdx}
          draggable
          onDragStart={setDragI}
          onDrop={(i) => { if (dragI != null && dragI !== i) reorderPlayer(dragI, i); setDragI(null); }}
        />
        <div className="space-y-2">
          <Combobox
            value={trainer?.id ?? null}
            options={trainers.map((t) => ({ value: t.id, label: `${t.name || t.id}`, sublabel: `${t.trainerClass}${t.ai.length ? " · AI" : ""}` }))}
            onChange={(v) => { const t = trainers.find((x) => x.id === v); if (t) loadTrainer(t); }}
            placeholder={`Load enemy trainer (${trainers.length})`}
            searchPlaceholder="Search trainers…"
          />
          {enemyTeam.length > 0 ? (
            <Roster data={data} title={`${trainer?.trainerClass ?? ""} ${trainer?.name ?? "Enemy"}${trainer?.ai.length ? ` — AI: ${trainer.ai.join(", ")}` : ""}`}
              team={enemyTeam} active={eIdx} maxHp={maxHp} onSelect={(i) => { setEIdx(i); setEMoveOverride(null); }} />
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Load a trainer to face their team.
            </div>
          )}
        </div>
      </div>

      {/* active matchup */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* player active */}
        <ActiveCard data={data} b={pB} maxHp={maxHp(pB.mon)} accent onHp={(hp) => patchPlayer(pIdx, { curHp: hp })}
          onEdit={() => setEditP((v) => !v)} editing={editP}>
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">Your moves — damage vs {eB ? data.speciesById.get(eB.mon.speciesId)?.name : "enemy"}</div>
            {pB.mon.moves.filter((m) => m > 0).map((id) => {
              const v = moveVs(aC, eC, id, pB.mon.level);
              if (!v) return null;
              const ko = v.normal && eB ? v.normal.max >= eB.curHp : false;
              return (
                <MoveRow key={id} move={v.move} selected={pMove === id} onClick={() => setPMove(id)}
                  normal={v.normal} crit={v.crit} ko={ko} />
              );
            })}
          </div>
          {editP && <div className="mt-2"><MonPanel data={data} mon={pB.mon} onChange={(m) => patchPlayer(pIdx, { mon: m, curHp: Math.min(pB.curHp, maxHp(m)) })} label="Edit attacker" accent="var(--color-primary)" /></div>}
        </ActiveCard>

        {/* enemy active */}
        {eB && eC ? (
          <ActiveCard data={data} b={eB} maxHp={maxHp(eB.mon)} onHp={(hp) => patchEnemy(eIdx, { curHp: hp })}
            onEdit={() => setEditE((v) => !v)} editing={editE}>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Dna className="size-3 text-primary" /> AI likely move + damage vs {data.speciesById.get(pB.mon.speciesId)?.name}
              </div>
              {predictions.map((p) => {
                const v = moveVs(eC, aC, p.move.id, eB.mon.level);
                const ko = v?.normal ? v.normal.max >= pB.curHp : false;
                return (
                  <MoveRow key={p.move.id} move={p.move} selected={effEMove === p.move.id} onClick={() => setEMoveOverride(p.move.id)}
                    normal={v?.normal ?? null} crit={v?.crit ?? null} ko={ko} likelihood={p.likelihood} />
                );
              })}
            </div>
            {editE && <div className="mt-2"><MonPanel data={data} mon={eB.mon} onChange={(m) => patchEnemy(eIdx, { mon: m, curHp: Math.min(eB.curHp, maxHp(m)) })} label="Edit defender" accent="var(--color-primary)" /></div>}
          </ActiveCard>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No enemy selected.</div>
        )}
      </div>

      <FieldControls field={field} onChange={setField} />

      {/* round bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <div className="flex-1 text-sm">
          <span className="font-medium">You:</span>{" "}
          {pMove ? data.moveById.get(pMove)?.name : <span className="text-muted-foreground">pick a move ↑</span>}
          <ChevronRight className="mx-2 inline size-4 text-muted-foreground" />
          <span className="font-medium">Enemy:</span>{" "}
          {effEMove ? (
            <>
              {data.moveById.get(effEMove)?.name}
              {predictions[0] && predictions.find((p) => p.move.id === effEMove) && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({(predictions.find((p) => p.move.id === effEMove)!.likelihood * 100).toFixed(0)}% likely)
                </span>
              )}
            </>
          ) : <span className="text-muted-foreground">—</span>}
        </div>
        <button onClick={() => setLog([])} className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
          <RotateCcw className="size-3.5" /> Clear log
        </button>
        <button onClick={endRound} disabled={!pMove && !effEMove}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          End round
        </button>
      </div>

      {/* log */}
      {log.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-3 py-2 text-sm font-semibold">Round log</div>
          <ol className="divide-y">
            {log.map((e) => (
              <li key={e.n} className="flex gap-2 px-3 py-2 text-sm">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">R{e.n}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function hpColor(pct: number) {
  return pct > 50 ? "#22c55e" : pct > 20 ? "#eab308" : "#ef4444";
}

function Roster({
  data,
  title,
  team,
  active,
  maxHp,
  onSelect,
  draggable,
  onDragStart,
  onDrop,
}: {
  data: GameData;
  title: string;
  team: BattleMon[];
  active: number;
  maxHp: (m: CalcMon) => number;
  onSelect: (i: number) => void;
  draggable?: boolean;
  onDragStart?: (i: number) => void;
  onDrop?: (i: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-2">
      <div className="mb-1.5 truncate px-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <div className="flex gap-1.5 overflow-x-auto">
        {team.map((b, i) => {
          const mx = maxHp(b.mon);
          const pct = Math.max(0, Math.min(100, (b.curHp / mx) * 100));
          return (
            <button
              key={i}
              draggable={draggable}
              onDragStart={() => onDragStart?.(i)}
              onDragOver={(e) => draggable && e.preventDefault()}
              onDrop={() => onDrop?.(i)}
              onClick={() => onSelect(i)}
              className={cn(
                "relative flex w-16 shrink-0 flex-col items-center rounded-lg border p-1 transition-colors",
                i === active ? "border-primary bg-primary/10" : "hover:bg-muted",
                b.curHp <= 0 && "opacity-40"
              )}
            >
              <Sprite speciesId={b.mon.speciesId} size={36} />
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: hpColor(pct) }} />
              </div>
              <span className="mt-0.5 text-[9px] tabular-nums text-muted-foreground">{b.curHp}/{mx}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActiveCard({
  data,
  b,
  maxHp,
  accent,
  onHp,
  onEdit,
  editing,
  children,
}: {
  data: GameData;
  b: BattleMon;
  maxHp: number;
  accent?: boolean;
  onHp: (hp: number) => void;
  onEdit: () => void;
  editing: boolean;
  children: React.ReactNode;
}) {
  const s = data.speciesById.get(b.mon.speciesId);
  const pct = Math.max(0, Math.min(100, (b.curHp / maxHp) * 100));
  return (
    <section className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-2">
        <Sprite speciesId={b.mon.speciesId} size={56} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">{s?.name} <span className="text-xs font-normal text-muted-foreground">Lv{b.mon.level}</span></span>
            <button onClick={onEdit} className={cn("grid size-7 place-items-center rounded-md border hover:bg-muted", editing && "bg-primary/10 text-primary")}>
              <Settings2 className="size-4" />
            </button>
          </div>
          <div className="mt-0.5 flex gap-1">{s?.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: hpColor(pct) }} />
            </div>
            <input type="number" min={0} max={maxHp} value={b.curHp}
              onChange={(e) => onHp(Math.max(0, Math.min(maxHp, Number(e.target.value) || 0)))}
              className="h-7 w-16 rounded border bg-background px-1 text-center text-xs tabular-nums" />
            <span className="text-xs text-muted-foreground">/{maxHp}</span>
          </div>
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function MoveRow({
  move,
  normal,
  crit,
  ko,
  selected,
  likelihood,
  onClick,
}: {
  move: { name: string; type: string; category: string; power: number };
  normal: { minPct: number; maxPct: number; effectiveness: number; stab: boolean } | null;
  crit: { minPct: number; maxPct: number } | null;
  ko: boolean;
  selected: boolean;
  likelihood?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors",
        selected ? "border-primary bg-primary/10" : "hover:bg-muted"
      )}
    >
      <TypeBadge type={move.type} className="px-1.5 py-0 text-[10px]" />
      <span className="min-w-0 flex-1 truncate font-medium">
        {move.name}
        {likelihood != null && <span className="ml-1 text-xs text-primary">{(likelihood * 100).toFixed(0)}%</span>}
      </span>
      {ko && <span className="rounded bg-red-500/15 px-1 text-[10px] font-bold text-red-500">KO</span>}
      {normal ? (
        <span className="shrink-0 text-right text-xs tabular-nums">
          <span className={cn("font-semibold", normal.effectiveness > 1 && "text-emerald-500", normal.effectiveness < 1 && normal.effectiveness > 0 && "text-orange-500")}>
            {normal.minPct.toFixed(0)}–{normal.maxPct.toFixed(0)}%
          </span>
          {crit && <span className="ml-1 text-muted-foreground">crit {crit.minPct.toFixed(0)}–{crit.maxPct.toFixed(0)}%</span>}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">status</span>
      )}
    </button>
  );
}
