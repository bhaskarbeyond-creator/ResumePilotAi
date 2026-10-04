import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SALARY_FILTER_BANDS,
  formatSalaryBandLabel,
  salaryRowMatchesBand,
} from '../src/services/jobs/salaryFilters.js';

test('salary filter labels use the active currency rather than a hard-coded dollar symbol', () => {
  const highest = SALARY_FILTER_BANDS.at(-1);
  assert.match(formatSalaryBandLabel(highest, 'USD'), /^\$120,000\+/);
  assert.match(formatSalaryBandLabel(highest, 'INR'), /^₹1,20,000\+/);
  assert.match(formatSalaryBandLabel(highest, 'EUR'), /120\.000\s*€\+/);
});

test('salary bands use annual amounts and include employer ranges only when they overlap', () => {
  const [low, middle, upper, highest] = SALARY_FILTER_BANDS;
  assert.equal(salaryRowMatchesBand(45_000, 55_000, low), true);
  assert.equal(salaryRowMatchesBand(45_000, 55_000, middle), false);
  assert.equal(salaryRowMatchesBand(50_000, 100_000, low), true);
  assert.equal(salaryRowMatchesBand(50_000, 100_000, middle), true);
  assert.equal(salaryRowMatchesBand(50_000, 100_000, upper), true);
  assert.equal(salaryRowMatchesBand(130_000, null, highest), true);
  assert.equal(salaryRowMatchesBand(null, 55_000, low), true);
  assert.equal(salaryRowMatchesBand(null, null, highest), false);
});

test('salary bands provide stable keys independent of currency symbols', () => {
  assert.deepEqual(SALARY_FILTER_BANDS.map(band => band.key), [
    'salary-40k-60k', 'salary-60k-80k', 'salary-80k-120k', 'salary-120k-plus',
  ]);
  assert.notEqual(formatSalaryBandLabel(SALARY_FILTER_BANDS[0], 'INR'), formatSalaryBandLabel(SALARY_FILTER_BANDS[0], 'USD'));
});
