export function selectPick<T extends { rank: number; decision: string }>(
  candidates: T[],
): T | null {
  const allowed = candidates.filter(({ decision }) => decision === "ALLOW");
  return allowed.reduce<T | null>(
    (pick, candidate) =>
      pick === null || candidate.rank < pick.rank ? candidate : pick,
    null,
  );
}
