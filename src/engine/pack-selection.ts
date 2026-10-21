import type { Facts, RulePack } from '../types.js';
import { packApplies } from './evaluate.js';

/**
 * Pack selection: which rule packs apply to this project, resolved to a
 * fixed point because a pack may assert facts that make another pack apply.
 */
/**
 * Merges an additional capability set into the loaded packs for a single run.
 * A pack id already present in the base registry wins (the registry is the
 * source of truth); duplicate ids from `extraPacks` are dropped silently so a
 * released capability cannot shadow a shipped one.
 */
export function mergeExtraPacks(packs: RulePack[], extra: RulePack[] | undefined): void {
  if (!extra || extra.length === 0) return;
  const seen = new Set(packs.map((p) => p.id));
  for (const p of extra) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      packs.push(p);
    }
  }
}

export interface PackSelection {
  activePacks: RulePack[];
  packsLoaded: string[];
  packsSkipped: string[];
}

export function selectInitialPacks(
  packs: RulePack[],
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
): PackSelection {
  const selection: PackSelection = { activePacks: [], packsLoaded: [], packsSkipped: [] };
  selection.activePacks = packs.filter((p) => selectPack(p, facts, include, exclude, selection));
  return selection;
}

export function selectPack(
  pack: RulePack,
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
  selection: PackSelection,
): boolean {
  if (exclude.has(pack.id)) {
    selection.packsSkipped.push(pack.id);
    return false;
  }
  if (include.has(pack.id)) {
    selection.packsLoaded.push(pack.id);
    pack.provides?.forEach((f) => facts.flags.add(f));
    return true;
  }
  if (!packApplies(pack, facts)) {
    selection.packsSkipped.push(pack.id);
    return false;
  }
  selection.packsLoaded.push(pack.id);
  pack.provides?.forEach((f) => facts.flags.add(f));
  return true;
}

export function resolvePackFacts(
  packs: RulePack[],
  facts: Facts,
  include: Set<string>,
  exclude: Set<string>,
  selection: PackSelection,
): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const p of packs) {
      if (selection.packsLoaded.includes(p.id) || exclude.has(p.id) || include.has(p.id)) continue;
      if (!packApplies(p, facts)) continue;
      selection.packsLoaded.push(p.id);
      p.provides?.forEach((f) => facts.flags.add(f));
      selection.activePacks.push(p);
      changed = true;
    }
    if (!changed) break;
  }
}
