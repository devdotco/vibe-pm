export function positionBetween(before: number | null, after: number | null): number {
  const a = before ?? 0;
  const b = after ?? a + 2000;
  return (a + b) / 2;
}

export function needsRebalance(positions: number[]): boolean {
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] - positions[i - 1] < 0.001) return true;
  }
  return false;
}

export function rebalancePositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * 1000);
}
