export type PositionDirection = "long" | "short";

export function calculateRiskReward(
  direction: PositionDirection,
  entry: number,
  stop: number,
  target: number,
) {
  const risk = direction === "long" ? entry - stop : stop - entry;
  const reward = direction === "long" ? target - entry : entry - target;

  if (![entry, stop, target].every(Number.isFinite)) {
    return { ratio: null, error: "Enter a valid number for each price." };
  }
  if (risk <= 0) {
    return {
      ratio: null,
      error:
        direction === "long"
          ? "For a long position, the stop must be below entry."
          : "For a short position, the stop must be above entry.",
    };
  }
  if (reward <= 0) {
    return {
      ratio: null,
      error:
        direction === "long"
          ? "For a long position, the target must be above entry."
          : "For a short position, the target must be below entry.",
    };
  }

  return { ratio: reward / risk, error: null };
}
