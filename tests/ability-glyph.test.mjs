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

test('report entrance motion is gated on panel visibility and never leaves a transform behind', async () => {
  // 2026-10-03 用户反馈「动效不明显」，根因有两个，两处都必须钉住：
  const { readFileSync } = await import('node:fs');
  const [glyph, css, report] = await Promise.all([
    readFileSync(new URL('../src/AbilityGlyph.jsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/awakening-report.css', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/AwakeningReport.jsx', import.meta.url), 'utf8'),
  ]);
  // (1) 报告页在 SiteExperience 里是常驻挂载的（hidden 切换），若入场只看
  // IntersectionObserver，挂载时就播完了，学员切过去看到的是终态。入口必须
  // 接受 active（面板可见性）并在离开时复位，动画才有机会重播。
  assert.match(glyph, /active\s*=\s*true/);
  assert.match(glyph, /if \(!active\) \{ setEntered\(false\); return undefined; \}/);
  assert.match(report, /<AbilityGlyph[^>]*active=\{active\}/);
  assert.match(report, /<AwakeningReportContent[^>]*active=\{active\}/);
  // (2) fill-mode both 会把关键帧终态（被解析为单位矩阵的 transform: none）
  // 永久留在计算样式里，而非 none 的矩阵会成为 fixed 后代的 containing
  // block（项目既有教训）。卡片与轨道必须用 backwards，动画结束后回到基础
  // 样式的真正 none。碎片相反——基础态 opacity:0，必须 both 才能留在终态。
  assert.match(css, /\.awakening-report-card:has\(\.ability-glyph\.glyph-entered\) \{ animation: report-card-in 560ms var\(--report-ease\) backwards; \}/);
  assert.match(css, /\.glyph-entered \.glyph-grid \.glyph-tile \{ animation: glyph-tile-in 620ms var\(--report-ease\) backwards; \}/);
  assert.match(css, /\.glyph-entered \.glyph-fragment \{ animation: glyph-assemble 1100ms var\(--report-ease\) var\(--fragment-delay\) both; \}/);
  // (3) 中等窗口高度必须有紧凑档，否则卡片会顶掉底部绿色呼吸空间
  // （781–920px 曾是死区：1440×848 实测溢出）。
  assert.match(css, /@media \(min-width: 721px\) and \(max-height: 960px\)/);
  assert.match(css, /\.glyph-drawing \{ height: clamp\(104px,/);
});
