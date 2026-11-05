import { parse as parseYaml } from 'yaml';
import type { Severity, Status } from '../types.js';

export interface TrailerData {
  schema?: string;
  generated_at?: string;
  usa_version?: string;
  overall?: number;
  sections?: Record<string, { score: number; open: number; review: number }>;
  severity_totals?: Record<string, number>;
  rules?: Record<string, { status: string; severity: string; section: string }>;
}

/**
 * An audit you can't compare against the last one is just a number.
 * `usa diff` reads the YAML trailer USA embeds in every Markdown report and
 * reports movement: regressions, fixes, and drift.
 */
export function diffReports(beforeRaw: string, afterRaw: string): string {
  const before = parseYaml(beforeRaw) as TrailerData | null;
  const after = parseYaml(afterRaw) as TrailerData | null;
  if (!before || !after) throw new Error('Could not parse one or both report trailers.');

  const out: string[] = [];
  const p = (s = '') => out.push(s);

  // A report with no score (`overall: null` — nothing resolved) is not a zero.
  // Treating it as 0 once produced a triumphant "+45 points" for a tree that
  // merely gained a resolved check.
  const b = before.overall ?? null;
  const a = after.overall ?? null;
  const delta = a !== null && b !== null ? Math.round((a - b) * 10) / 10 : null;

  renderDiffHeader(p, before, after, b, a, delta);

  const buckets = classifyAllRules(before.rules ?? {}, after.rules ?? {});

  const list = (title: string, items: string[]) => {
    p(`## ${title} (${items.length})`);
    p();
    if (items.length === 0) p('None. ✅');
    else for (const i of items) p(`- ${i}`);
    p();
  };

  list('✅ Fixed', buckets.fixed);
  list('🔺 Regressed', buckets.regressed);
  list('🟡 Changed (still open)', buckets.improved);
  list('🆕 Newly applicable', buckets.newRules);
  if (buckets.goneRules.length > 0) list('➖ No longer applicable', buckets.goneRules);

  p('---');
  p();
  p(renderDiffVerdict(delta));
  p();

  return out.join('\n');
}

function renderDiffHeader(
  p: (s?: string) => void,
  before: TrailerData,
  after: TrailerData,
  b: number | null,
  a: number | null,
  delta: number | null,
): void {
  p('# 🔁 USA Audit Diff');
  p();
  p('| | Before | After | Δ |');
  p('|---|---:|---:|---:|');
  const cell = (v: number | null) => (v === null ? 'no score' : String(v));
  p(`| **Overall score** | ${cell(b)} | ${cell(a)} | ${delta === null ? 'n/a' : sign(delta)} |`);

  const sevKeys: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'FUTURE'];
  for (const k of sevKeys) {
    const bv = before.severity_totals?.[k] ?? 0;
    const av = after.severity_totals?.[k] ?? 0;
    p(`| ${k} | ${bv} | ${av} | ${sign(av - bv)} |`);
  }
  p();
  p(`*Before: ${before.generated_at ?? 'unknown'} · After: ${after.generated_at ?? 'unknown'}*`);
  p();
}

interface DiffBuckets {
  fixed: string[];
  regressed: string[];
  improved: string[];
  newRules: string[];
  goneRules: string[];
}

type TrailerRule = { status: string; severity: string; section: string };

function classifyAllRules(
  bRules: Record<string, TrailerRule>,
  aRules: Record<string, TrailerRule>,
): DiffBuckets {
  const buckets: DiffBuckets = {
    fixed: [],
    regressed: [],
    improved: [],
    newRules: [],
    goneRules: [],
  };
  const ids = [...new Set([...Object.keys(bRules), ...Object.keys(aRules)])].sort();
  for (const id of ids) {
    classifyRuleChange(id, bRules[id], aRules[id], buckets);
  }
  return buckets;
}

const PASSING = new Set(['PASS']);
const OPEN = new Set(['FAIL', 'WRONG', 'MISSING', 'DEPRECATED', 'EXPERIMENTAL']);

/** Whether an after-state counts as "still broken" for gate and diff purposes. */
export function isOpenStatus(status: string): boolean {
  return OPEN.has(status as Status);
}

/**
 * One rule's movement between two report trailers, without display strings.
 *
 * This is the machine-readable twin of the `usa diff` buckets below: the
 * new-code quality gate (`src/engine/gate.ts`) consumes it so the CLI
 * producer (`usa diff` text) and the CI judge (pass/fail) cannot disagree
 * about what counts as new or regressed. UNKNOWN transitions keep diff.ts
 * semantics: resolving the queue reads as fixed, falling back into it (from
 * a decided state) reads as regressed.
 */
export type RuleMovement =
  'newly-applicable' | 'regressed' | 'fixed' | 'changed' | 'gone' | 'unchanged';

const MOVEMENT_OF_UNKNOWN: Record<string, (xs: string, ys: string) => RuleMovement> = {
  resolved: () => 'fixed',
  needsReview: () => 'regressed',
  other: () => 'changed',
};

function unknownMovement(xs: string, ys: string): RuleMovement {
  // One-check-kind-per-line: each UNKNOWN transition has exactly one bucket.
  if (xs === 'UNKNOWN' && ys === 'PASS') return MOVEMENT_OF_UNKNOWN.resolved!(xs, ys);
  if (ys === 'UNKNOWN' && !OPEN.has(xs as Status)) return MOVEMENT_OF_UNKNOWN.needsReview!(xs, ys);
  return MOVEMENT_OF_UNKNOWN.other!(xs, ys);
}

function openMovement(xs: string, ys: string): RuleMovement {
  const wasOpen = OPEN.has(xs as Status);
  const isOpen = OPEN.has(ys as Status);
  if (wasOpen && PASSING.has(ys)) return 'fixed';
  if (!wasOpen && isOpen) return 'regressed';
  if (wasOpen && isOpen) return 'changed';
  return 'unchanged';
}

export function ruleMovement(
  beforeStatus: string | undefined,
  afterStatus: string | undefined,
): RuleMovement {
  if (beforeStatus === undefined) return 'newly-applicable';
  if (afterStatus === undefined) return 'gone';
  if (beforeStatus === afterStatus) return 'unchanged';
  if (beforeStatus === 'UNKNOWN' || afterStatus === 'UNKNOWN') {
    return unknownMovement(beforeStatus, afterStatus);
  }
  return openMovement(beforeStatus, afterStatus);
}

function classifyRuleChange(
  id: string,
  x: TrailerRule | undefined,
  y: TrailerRule | undefined,
  buckets: DiffBuckets,
): void {
  if (!x) {
    buckets.newRules.push(`${id} — now applicable (${y!.status})`);
    return;
  }
  if (!y) {
    buckets.goneRules.push(id);
    return;
  }
  // Dispatch on the shared movement taxonomy so `usa diff` text and the
  // new-code gate classify identically. Strings below are byte-identical to
  // the pre-taxonomy implementation — the diff tests pin them.
  const movement = ruleMovement(x.status, y.status);
  const handlers: Record<RuleMovement, () => void> = {
    'newly-applicable': () => {},
    regressed: () => buckets.regressed.push(regressedDetail(id, x.status, y.status)),
    fixed: () => buckets.fixed.push(fixedDetail(id, x.status, y.status)),
    changed: () => buckets.improved.push(`${id} — ${x.status} → ${y.status}`),
    gone: () => {},
    unchanged: () => {},
  };
  handlers[movement]();
}

/** UNKNOWN → PASS carries the review-resolution suffix; plain fixes do not. */
function fixedDetail(id: string, xs: string, ys: string): string {
  return xs === 'UNKNOWN' ? `${id} — UNKNOWN → PASS (resolved by review)` : `${id} — ${xs} → ${ys}`;
}

/** Falling back into UNKNOWN carries the needs-review suffix. */
function regressedDetail(id: string, xs: string, ys: string): string {
  return ys === 'UNKNOWN' ? `${id} — ${xs} → UNKNOWN (needs review)` : `${id} — ${xs} → ${ys}`;
}

function renderDiffVerdict(delta: number | null): string {
  if (delta === null) {
    return '**Net movement: not comparable.** One of the two reports has no score — nothing could be resolved there.';
  }
  if (delta > 0) {
    return `**Net movement: +${delta} points.** Keep going — the fixed list is the progress report.`;
  }
  if (delta < 0) {
    return `**Net movement: ${delta} points.** New rules became applicable, or something regressed. Start with 🔺 Regressed.`;
  }
  return '**No net movement.** Either nothing changed, or fixes were offset by newly applicable rules.';
}

function sign(n: number): string {
  const v = Math.round(n * 10) / 10;
  if (v === 0) return '0';
  return v > 0 ? `+${v}` : `${v}`;
}
