"use client";

import { useMemo, useState } from "react";
import { calculateRiskReward, type PositionDirection } from "@/lib/risk-reward";

export function Calculator() {
  const [direction, setDirection] = useState<PositionDirection>("long");
  const [entryValue, setEntryValue] = useState("1.1000");
  const [stopValue, setStopValue] = useState("1.0950");
  const [targetValue, setTargetValue] = useState("1.1100");
  const result = useMemo(
    () =>
      calculateRiskReward(
        direction,
        parsePrice(entryValue),
        parsePrice(stopValue),
        parsePrice(targetValue),
      ),
    [direction, entryValue, stopValue, targetValue],
  );

  return (
    <div className="calculator">
      <div className="calculator-fields">
        <div className="calculator-field">
          <label htmlFor="direction">Position direction</label>
          <select
            id="direction"
            onChange={(event) =>
              setDirection(event.target.value === "short" ? "short" : "long")
            }
            value={direction}
          >
            <option value="long">Long (buy)</option>
            <option value="short">Short (sell)</option>
          </select>
        </div>
        <PriceField id="entry" label="Entry price" value={entryValue} onChange={setEntryValue} />
        <PriceField id="stop" label="Stop-loss price" value={stopValue} onChange={setStopValue} />
        <PriceField id="target" label="Take-profit price" value={targetValue} onChange={setTargetValue} />
      </div>
      <div aria-live="polite" className="calculator-result">
        <span>Potential reward : risk</span>
        {result.ratio === null ? (
          <p className="calculator-error" role="alert">{result.error}</p>
        ) : (
          <>
            <output aria-label={`Risk-to-reward ratio ${result.ratio.toFixed(2)} to 1`}>
              {result.ratio.toFixed(2)}:1
            </output>
            <p>
              Potential reward is {result.ratio.toFixed(2)} times the price
              distance to the stop.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function parsePrice(value: string) {
  if (value.trim() === "") return Number.NaN;
  return Number(value);
}

function PriceField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="calculator-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.0000"
        step="any"
        type="number"
        value={value}
      />
    </div>
  );
}
