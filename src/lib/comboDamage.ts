export type ComboRewardClass = 'poke' | 'string' | 'launcher' | 'tornado' | 'ki' | 'marathon';

export type ComboDamageContext = {
  baseDamage: number;
  comboHits: number;
  repeatCount?: number;
  variedRoute?: boolean;
};

export function comboDamageScale(comboHits: number) {
  const hit = Math.max(1, Math.round(comboHits));
  if (hit <= 1) return 1;
  if (hit === 2) return 0.88;
  if (hit <= 5) return 0.72;
  if (hit <= 10) return 0.55;
  if (hit <= 20) return 0.36;
  return 0.22;
}

export function scaledComboDamage({ baseDamage, comboHits, repeatCount = 1, variedRoute = true }: ComboDamageContext) {
  const damage = Math.max(0, Math.round(baseDamage));
  if (damage <= 0) return 0;
  const repeats = Math.max(1, Math.round(repeatCount));
  const repeatScale = repeats <= 1 ? 1 : Math.max(0.45, 1 - (repeats - 1) * 0.18);
  const scaled = Math.round(damage * comboDamageScale(comboHits) * repeatScale);
  const minimum = variedRoute ? Math.min(damage, Math.max(1, Math.round(damage * 0.18))) : 1;
  return Math.max(minimum, Math.min(damage, scaled));
}

export type ComboDamageStep = {
  damage: number;
  identity?: string;
  launchHeight?: number;
  tornado?: boolean;
  usesKi?: boolean;
  kiBurst?: boolean;
};

export function estimateComboSequenceDamage(steps: ComboDamageStep[]) {
  const identities: string[] = [];
  let total = 0;
  for (const [index, step] of steps.entries()) {
    const identity = step.identity ?? `step:${index}`;
    const repeatCount = countTrailing([...identities, identity], identity);
    const variedRoute = !identities.includes(identity);
    total += scaledComboDamage({
      baseDamage: step.damage,
      comboHits: index + 1,
      repeatCount,
      variedRoute
    });
    identities.push(identity);
  }
  return total;
}

export function classifyComboReward(steps: ComboDamageStep[], estimatedDamage: number): ComboRewardClass {
  if (steps.length >= 21) return 'marathon';
  if (steps.some((step) => step.usesKi || step.kiBurst)) return 'ki';
  if (steps.some((step) => step.tornado)) return 'tornado';
  if (steps.some((step) => (step.launchHeight ?? 0) > 0)) return 'launcher';
  if (steps.length >= 3 || estimatedDamage >= 20) return 'string';
  return 'poke';
}

function countTrailing(values: string[], value: string) {
  let count = 0;
  for (let index = values.length - 1; index >= 0 && values[index] === value; index -= 1) {
    count += 1;
  }
  return Math.max(1, count);
}
