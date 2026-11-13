const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const helperPath = path.join(__dirname, "..", "src", "lib", "risk-reward.ts");
const source = fs.readFileSync(helperPath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const calculatorModule = { exports: {} };
vm.runInNewContext(transpiled, {
  exports: calculatorModule.exports,
  module: calculatorModule,
  require: () => ({}),
});
const { calculateRiskReward } = calculatorModule.exports;

test("calculates a long ratio from price distances", () => {
  const result = calculateRiskReward("long", 1.1, 1.095, 1.11);
  assert.ok(Math.abs(result.ratio - 2) < 1e-10);
  assert.equal(result.error, null);
});

test("calculates a short ratio from price distances", () => {
  const result = calculateRiskReward("short", 1.1, 1.105, 1.09);
  assert.ok(Math.abs(result.ratio - 2) < 1e-10);
  assert.equal(result.error, null);
});

test("rejects a stop on the wrong side of entry", () => {
  assert.match(calculateRiskReward("long", 1.1, 1.105, 1.11).error, /stop must be below entry/);
});

test("rejects a target on the wrong side of entry", () => {
  assert.match(calculateRiskReward("short", 1.1, 1.105, 1.11).error, /target must be below entry/);
});

test("rejects non-finite prices", () => {
  assert.match(calculateRiskReward("long", 1.1, 1.095, Number.NaN).error, /valid number/);
});
