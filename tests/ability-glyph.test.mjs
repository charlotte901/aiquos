import test from 'node:test';
import assert from 'node:assert/strict';
import { glyphScore, glyphCoverage, glyphPriorities, glyphCellOrder } from '../src/ability-glyph.js';
const dims = values => values.map((score, i) => ({key: `D${i + 1}`, score}));
test('missing values are not zero scores; finite scores stay in range', () => {
  for (const value of [null, undefined, '', 'oops', NaN, Infinity]) assert.equal(glyphScore(value), null);
  assert.equal(glyphScore(0), 0);
  assert.equal(glyphScore(-1), 0);
  assert.equal(glyphScore(101), 100);
  assert.equal(glyphScore('84.5'), 84.5);
});
test('equal glyph units encode exact coverage at endpoints and fractional scores', () => {
  for (const units of [1, 237, 413]) for (const score of [0, 42.5, 75, 91, 100]) {
    const {full, partial} = glyphCoverage(units, score);
    assert.ok(full >= 0 && full <= units);
    assert.ok(partial >= 0 && partial < 1);
    assert.ok(Math.abs((full + partial) / units * 100 - score) < 1e-10);
  }
  assert.deepEqual(glyphCoverage(237, null), {full: 0, partial: 0});
});
test('priorities select weakest two while preserving ties and avoiding false deficits', () => {
  assert.deepEqual(glyphPriorities(dims([84,91,78,86,80,75])).map(d=>d.key), ['D6','D3']);
  assert.deepEqual(glyphPriorities(dims([40,60,60,80,90,100])).map(d=>d.key), ['D1','D2','D3']);
  for (const values of [[80,80,80,80,80,80], [100,100,100,100,100,100], [null,null,80]]) assert.deepEqual(glyphPriorities(dims(values)), []);
  assert.deepEqual(glyphPriorities(dims([0,100,100,100,100,100])).map(d=>d.key), ['D1']);
  assert.deepEqual(glyphPriorities(dims([null,75,80,90,95,100])).map(d=>d.key), ['D2','D3']);
});
test('cell ranking is deterministic so increasing scores preserves filled units', () => {
  const cells = Array.from({length: 200}, (_,i) => glyphCellOrder(i % 20, Math.floor(i/20)));
  assert.deepEqual(cells, Array.from({length: 200}, (_,i) => glyphCellOrder(i % 20, Math.floor(i/20))));
  assert.equal(new Set(cells).size, cells.length);
});
