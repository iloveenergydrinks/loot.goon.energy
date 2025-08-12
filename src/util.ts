export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pickRandom<T>(array: T[], count: number): T[] {
  const copy = array.slice();
  const picked: T[] = [];
  while (picked.length < count && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

export function weightedValuePerKg(value: number, massKg: number, isPreferred: boolean): number {
  if (massKg <= 0) return isPreferred ? value * 2 : value;
  const base = value / massKg;
  return isPreferred ? base * 2 : base;
}

export function hasAnyTag(tags: string[], target: string[]): boolean {
  return tags.some((t) => target.includes(t));
}


