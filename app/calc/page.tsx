"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords, Settings2, RotateCcw, ChevronRight, Dna, Zap } from "lucide-react";
import { useSave } from "@/components/save/save-provider";
import { Sprite } from "@/components/pokemon/sprite";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { MonPanel } from "@/components/calc/mon-panel";
import { FieldControls } from "@/components/calc/field-controls";
import { Combobox, type ComboOption } from "@/components/calc/combobox";
import { resolveMon, loadTrainers, type GameData, type Move, type Trainer } from "@/lib/pokemon/data";
import { buildDemoSave } from "@/lib/pokemon/demo";
import {
  calcMonFromResolved,
  calcMonFromTrainer,
  toCombatant,
  speciesMovepool,
  type CalcMon,
} from "@/lib/calc/mon";
import {
  calc,
  effectiveSpeed,
  applyHit,
  koOutcome,
  DEFAULT_FIELD,
  type Combatant,
  type Field,
} from "@/lib/calc/damage";
import { predictAiMoves, predictSwitchIn, type SwitchCandidate } from "@/lib/calc/ai";
import { cn } from "@/lib/utils";

interface BattleMon {
  mon: CalcMon;
  curHp: number;
}
interface RoundEntry {
  n: number;
  lines: string[];
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
    setPlayerTeam(src.party.map((m) => {
      const mon = calcMonFromResolved(resolveMon(m, data));
      return { mon, curHp: toCombatant(data, mon)?.stats.hp ?? 1 };
    }));
  }, [data, save, playerTeam.length]);

  const itemOptions = useMemo<ComboOption[]>(
    () => data ? [{ value: "", label: "No item" }, ...[...data.itemById.values()].map((i) => ({ value: i.name, label: i.name }))] : [],
    [data]
  );

  if (!data || playerTeam.length === 0) {
    return <div className="py-10 text-center text-muted-foreground">Loading…</div>;
  }

  const maxHp = (mon: CalcMon) => toCombatant(data, mon)?.stats.hp ?? 1;
  const patchPlayer = (i: number, patch: Partial<BattleMon>) =>
    setPlayerTeam((t) => t.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const patchEnemy = (i: number, patch: Partial<BattleMon>) =>
    setEnemyTeam((t) => t.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const loadTrainerTeam = (t: Trainer) => {
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

  const pSpeed = aC ? effectiveSpeed(aC, field) : 0;
  const eSpeed = eC ? effectiveSpeed(eC, field) : 0;

  // enemy AI predictions vs current player mon (likelihood by move id)
  const predictions =
    eB && eC && aC
      ? predictAiMoves(data, eC, aC, pB.curHp, eB.mon.moves.filter((m) => m > 0), eB.mon.level, field, trainer?.ai ?? [])
      : [];
  const likelihoodById = new Map(predictions.map((p) => [p.move.id, p.likelihood]));
  const topEnemyMove = predictions[0]?.move.id ?? 0;
  const effEMove = eMoveOverride ?? topEnemyMove;

  const moveVs = (atk: Combatant | null, def: Combatant | null, moveId: number, level: number) => {
    const mv = data.moveById.get(moveId);
    if (!mv || !atk || !def) return null;
    return { move: mv, normal: calc(atk, def, mv, level, field), crit: calc(atk, def, mv, level, { ...field, crit: true }) };
  };

  // AI switch-in prediction when the enemy active mon is down
  const switchPrediction =
    eB && eB.curHp <= 0 && aC
      ? predictSwitchIn(
          data,
          enemyTeam.map<SwitchCandidate>((b) => ({
            combatant: toCombatant(data, b.mon)!,
            curHp: b.curHp,
            moveIds: b.mon.moves.filter((m) => m > 0),
            level: b.mon.level,
          })),
          eIdx,
          aC,
          pB.curHp,
          field,
          trainer?.ai ?? []
        )
      : null;

  const endRound = () => {
    if (!aC) return;
    const lines: string[] = [];
    interface Action {
      side: "p" | "e";
      atk: Combatant;
      def: Combatant;
      moveId: number;
      level: number;
      speed: number;
      priority: number;
      name: string;
      defName: string;
    }
    const actions: Action[] = [];
    const pName = data.speciesById.get(pB.mon.speciesId)?.name ?? "You";
    const eName = eB ? data.speciesById.get(eB.mon.speciesId)?.name ?? "Enemy" : "Enemy";
    if (pMove && eC) {
      const mv = data.moveById.get(pMove);
      if (mv) actions.push({ side: "p", atk: aC, def: eC, moveId: pMove, level: pB.mon.level, speed: pSpeed, priority: mv.priority, name: pName, defName: eName });
    }
    if (effEMove && eB && eC) {
      const mv = data.moveById.get(effEMove);
      if (mv) actions.push({ side: "e", atk: eC, def: aC, moveId: effEMove, level: eB.mon.level, speed: eSpeed, priority: mv.priority, name: eName, defName: pName });
    }
    if (actions.length === 0) return;

    // turn order: higher priority first, then higher speed
    actions.sort((a, b) => (b.priority - a.priority) || (b.speed - a.speed));
    if (actions.length === 2 && actions[0].priority === actions[1].priority && actions[0].speed === actions[1].speed) {
      lines.push("Speed tie — order assumed as shown.");
    }

    // local HP tracking during resolution
    let pHp = pB.curHp;
    let eHp = eB ? eB.curHp : 0;
    const pMax = maxHp(pB.mon);
    const eMax = eB ? maxHp(eB.mon) : 1;

    for (const a of actions) {
      const actorAlive = a.side === "p" ? pHp > 0 : eHp > 0;
      if (!actorAlive) {
        lines.push(`${a.name} fainted before it could act.`);
        continue;
      }
      const mv = data.moveById.get(a.moveId)!;
      const first = a === actions[0] && actions.length === 2;
      const orderNote = actions.length === 2 ? (first ? " first" + (a.priority !== actions[1].priority ? " (priority)" : " (faster)") : "") : "";
      const r = calc(a.atk, a.def, mv, a.level, field);
      if (!r) {
        lines.push(`${a.name} used ${mv.name}${orderNote} (status move).`);
        continue;
      }
      const dmg = Math.floor((r.min + r.max) / 2);
      if (a.side === "p") {
        const hit = applyHit(a.def, eHp, eMax, dmg);
        const note = hit.hungOn ? ` — ${a.defName} hung on with ${hit.via} (1 HP)!` : hit.hp === 0 ? ` — ${a.defName} fainted!` : "";
        eHp = hit.hp;
        lines.push(`${a.name} used ${mv.name}${orderNote}: ~${dmg} dmg (${r.minPct.toFixed(0)}–${r.maxPct.toFixed(0)}%)${note}`);
      } else {
        const hit = applyHit(a.def, pHp, pMax, dmg);
        const note = hit.hungOn ? ` — ${a.defName} hung on with ${hit.via} (1 HP)!` : hit.hp === 0 ? ` — ${a.defName} fainted!` : "";
        pHp = hit.hp;
        lines.push(`${a.name} used ${mv.name}${orderNote}: ~${dmg} dmg (${r.minPct.toFixed(0)}–${r.maxPct.toFixed(0)}%)${note}`);
      }
    }

    patchPlayer(pIdx, { curHp: pHp });
    if (eB) patchEnemy(eIdx, { curHp: eHp });
    setLog((l) => [{ n: l.length + 1, lines }, ...l]);
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
            onChange={(v) => { const t = trainers.find((x) => x.id === v); if (t) loadTrainerTeam(t); }}
            placeholder={`Load enemy trainer (${trainers.length})`}
            searchPlaceholder="Search trainers…"
          />
          {enemyTeam.length > 0 ? (
            <Roster data={data} title={`${trainer?.trainerClass ?? ""} ${trainer?.name ?? "Enemy"}${trainer?.ai.length ? ` — AI: ${trainer.ai.join(", ")}` : ""}`}
              team={enemyTeam} active={eIdx} maxHp={maxHp} highlight={switchPrediction?.index}
              onSelect={(i) => { setEIdx(i); setEMoveOverride(null); }} />
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Load a trainer to face their team.
            </div>
          )}
        </div>
      </div>

      {/* AI switch-in banner */}
      {switchPrediction != null && eB && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
          <Dna className="size-4 shrink-0 text-primary" />
          <span className="text-sm">
            <span className="font-semibold">{data.speciesById.get(eB.mon.speciesId)?.name} fainted.</span>{" "}
            AI sends next:{" "}
            <span className="font-semibold">{data.speciesById.get(enemyTeam[switchPrediction.index].mon.speciesId)?.name}</span>
            <span className="text-muted-foreground"> — {switchPrediction.reason}</span>
          </span>
          <Sprite speciesId={enemyTeam[switchPrediction.index].mon.speciesId} size={32} />
          <button
            onClick={() => { setEIdx(switchPrediction.index); setEMoveOverride(null); }}
            className="ml-auto rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Send in
          </button>
        </div>
      )}

      {/* active matchup */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* player active */}
        <ActiveCard
          data={data} b={pB} maxHp={maxHp(pB.mon)}
          speed={pSpeed} actsFirst={pSpeed > eSpeed ? true : pSpeed < eSpeed ? false : null}
          itemOptions={itemOptions}
          onChange={(m) => patchPlayer(pIdx, { mon: m, curHp: Math.min(pB.curHp, maxHp(m)) })}
          onHp={(hp) => patchPlayer(pIdx, { curHp: hp })}
          onEdit={() => setEditP((v) => !v)} editing={editP}
        >
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">
              Your moves — pick one, damage vs {eB ? data.speciesById.get(eB.mon.speciesId)?.name : "enemy"}
            </div>
            {[0, 1, 2, 3].map((slot) => (
              <MoveSlot
                key={slot}
                data={data}
                mon={pB.mon}
                slot={slot}
                selected={pMove != null && pB.mon.moves[slot] === pMove}
                onSelect={(id) => setPMove(id)}
                onChangeMove={(moves) => patchPlayer(pIdx, { mon: { ...pB.mon, moves } })}
                result={moveVs(aC, eC, pB.mon.moves[slot] ?? 0, pB.mon.level)}
                outcome={eC && eB ? outcomeFor(moveVs(aC, eC, pB.mon.moves[slot] ?? 0, pB.mon.level), eC, eB.curHp, maxHp(eB.mon)) : null}
              />
            ))}
          </div>
          {editP && <div className="mt-2"><MonPanel data={data} mon={pB.mon} onChange={(m) => patchPlayer(pIdx, { mon: m, curHp: Math.min(pB.curHp, maxHp(m)) })} label="Details (EVs / IVs / status)" accent="var(--color-primary)" /></div>}
        </ActiveCard>

        {/* enemy active */}
        {eB && eC ? (
          <ActiveCard
            data={data} b={eB} maxHp={maxHp(eB.mon)}
            speed={eSpeed} actsFirst={eSpeed > pSpeed ? true : eSpeed < pSpeed ? false : null}
            itemOptions={itemOptions}
            onChange={(m) => patchEnemy(eIdx, { mon: m, curHp: Math.min(eB.curHp, maxHp(m)) })}
            onHp={(hp) => patchEnemy(eIdx, { curHp: hp })}
            onEdit={() => setEditE((v) => !v)} editing={editE}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Dna className="size-3 text-primary" /> AI likely move + damage vs {data.speciesById.get(pB.mon.speciesId)?.name}
              </div>
              {[0, 1, 2, 3].map((slot) => (
                <MoveSlot
                  key={slot}
                  data={data}
                  mon={eB.mon}
                  slot={slot}
                  selected={effEMove != 0 && eB.mon.moves[slot] === effEMove}
                  onSelect={(id) => setEMoveOverride(id)}
                  onChangeMove={(moves) => patchEnemy(eIdx, { mon: { ...eB.mon, moves } })}
                  result={moveVs(eC, aC, eB.mon.moves[slot] ?? 0, eB.mon.level)}
                  outcome={aC ? outcomeFor(moveVs(eC, aC, eB.mon.moves[slot] ?? 0, eB.mon.level), aC, pB.curHp, maxHp(pB.mon)) : null}
                  likelihood={likelihoodById.get(eB.mon.moves[slot] ?? -1)}
                />
              ))}
            </div>
            {editE && <div className="mt-2"><MonPanel data={data} mon={eB.mon} onChange={(m) => patchEnemy(eIdx, { mon: m, curHp: Math.min(eB.curHp, maxHp(m)) })} label="Details (EVs / IVs / status)" accent="var(--color-primary)" /></div>}
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
              {likelihoodById.has(effEMove) && (
                <span className="ml-1 text-xs text-muted-foreground">({((likelihoodById.get(effEMove) ?? 0) * 100).toFixed(0)}% likely)</span>
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
                <div className="space-y-0.5">{e.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

type MoveVsResult = { move: Move; normal: ReturnType<typeof calc>; crit: ReturnType<typeof calc> } | null;

function outcomeFor(v: MoveVsResult, def: Combatant, curHp: number, maxHp: number): "ko" | "hangs-on" | null {
  if (!v?.normal) return null;
  const o = koOutcome(def, curHp, maxHp, v.normal.max);
  return o === "survives" ? null : o;
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
  highlight,
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
  highlight?: number;
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
                i === highlight && "ring-2 ring-primary/70",
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
  speed,
  actsFirst,
  itemOptions,
  onChange,
  onHp,
  onEdit,
  editing,
  children,
}: {
  data: GameData;
  b: BattleMon;
  maxHp: number;
  speed: number;
  actsFirst: boolean | null;
  itemOptions: ComboOption[];
  onChange: (m: CalcMon) => void;
  onHp: (hp: number) => void;
  onEdit: () => void;
  editing: boolean;
  children: React.ReactNode;
}) {
  const s = data.speciesById.get(b.mon.speciesId);
  const pct = Math.max(0, Math.min(100, (b.curHp / maxHp) * 100));
  const abilityOptions: ComboOption[] = (s?.abilityList ?? []).map((a) => ({
    value: a,
    label: a + (s?.hiddenAbility === a ? " ✦" : ""),
  }));
  return (
    <section className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-2">
        <Sprite speciesId={b.mon.speciesId} size={56} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">
              {s?.name} <span className="text-xs font-normal text-muted-foreground">Lv{b.mon.level} · {data.natures[b.mon.natureId]?.name}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className={cn("flex items-center gap-0.5 text-xs tabular-nums", actsFirst === true ? "font-semibold text-emerald-500" : actsFirst === false ? "text-muted-foreground" : "text-yellow-500")}>
                <Zap className="size-3" />{speed}{actsFirst === true ? " · first" : actsFirst === null ? " · tie" : ""}
              </span>
              <button onClick={onEdit} className={cn("grid size-7 place-items-center rounded-md border hover:bg-muted", editing && "bg-primary/10 text-primary")}>
                <Settings2 className="size-4" />
              </button>
            </div>
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

      {/* inline ability + item */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Ability</div>
          <Combobox value={b.mon.ability} options={abilityOptions} onChange={(v) => onChange({ ...b.mon, ability: String(v) })} placeholder="Ability" />
        </div>
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Item</div>
          <Combobox value={b.mon.item} options={itemOptions} onChange={(v) => onChange({ ...b.mon, item: String(v) })} placeholder="No item" searchPlaceholder="Search items…" />
        </div>
      </div>

      <div className="mt-2">{children}</div>
    </section>
  );
}

function MoveSlot({
  data,
  mon,
  slot,
  selected,
  onSelect,
  onChangeMove,
  result,
  outcome,
  likelihood,
}: {
  data: GameData;
  mon: CalcMon;
  slot: number;
  selected: boolean;
  onSelect: (moveId: number) => void;
  onChangeMove: (moves: number[]) => void;
  result: MoveVsResult;
  outcome: "ko" | "hangs-on" | null;
  likelihood?: number;
}) {
  const species = data.speciesById.get(mon.speciesId);
  const moveId = mon.moves[slot] ?? 0;
  const mv = moveId ? data.moveById.get(moveId) : undefined;
  const moveOptions = useMemo<ComboOption[]>(() => {
    if (!species) return [];
    return [
      { value: 0, label: "—" },
      ...speciesMovepool(species)
        .map((id) => data.moveById.get(id))
        .filter((m): m is Move => !!m)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({ value: m.id, label: m.name, sublabel: `${m.type}${m.power ? ` · ${m.power}` : ""}` })),
    ];
  }, [species, data]);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors",
        selected ? "border-primary bg-primary/10" : "hover:bg-muted/50"
      )}
    >
      <input
        type="radio"
        checked={selected}
        onChange={() => moveId && onSelect(moveId)}
        disabled={!moveId}
        className="size-3.5 shrink-0 accent-[var(--color-primary)]"
        aria-label={`Select ${mv?.name ?? "move"} for this round`}
      />
      {mv && <TypeBadge type={mv.type} className="shrink-0 px-1.5 py-0 text-[10px]" />}
      <Combobox
        value={moveId}
        options={moveOptions}
        onChange={(v) => {
          const moves = [...mon.moves];
          while (moves.length < 4) moves.push(0);
          moves[slot] = Number(v);
          onChangeMove(moves);
        }}
        placeholder="—"
        searchPlaceholder="Search moves…"
        className="min-w-0 flex-1"
      />
      <div className="flex shrink-0 items-center gap-1">
        {likelihood != null && <span className="text-xs font-medium text-primary">{(likelihood * 100).toFixed(0)}%</span>}
        {outcome === "ko" && <span className="rounded bg-red-500/15 px-1 text-[10px] font-bold text-red-500">KO</span>}
        {outcome === "hangs-on" && <span className="rounded bg-amber-500/15 px-1 text-[10px] font-bold text-amber-500">1 HP</span>}
        {result?.normal ? (
          <span className="text-right text-xs tabular-nums">
            <span className={cn("font-semibold", result.normal.effectiveness > 1 && "text-emerald-500", result.normal.effectiveness < 1 && result.normal.effectiveness > 0 && "text-orange-500")}>
              {result.normal.minPct.toFixed(0)}–{result.normal.maxPct.toFixed(0)}%
            </span>
            {result.crit && <span className="ml-1 text-muted-foreground">crit {result.crit.minPct.toFixed(0)}–{result.crit.maxPct.toFixed(0)}%</span>}
          </span>
        ) : mv ? (
          <span className="text-xs text-muted-foreground">status</span>
        ) : null}
      </div>
    </div>
  );
}
