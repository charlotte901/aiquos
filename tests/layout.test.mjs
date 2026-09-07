import test from "node:test";
import assert from "node:assert/strict";
import { getViewportLayout } from "../src/layout.js";

const viewports = [
  [320, 568],
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1366, 768],
  [1440, 900],
  [1536, 1024],
  [1920, 1080],
  [2560, 1080],
  [3440, 1440],
  [844, 390],
];
for (const [width, height] of viewports) {
  test(`viewport layout ${width} × ${height} fills canvas and keeps artwork in bounds`, () => {
    const layout = getViewportLayout(width, height);
    assert.equal(layout.width, width);
    assert.equal(layout.height, Math.max(height, layout.compact ? 760 : 680));
    assert.ok(layout.cubeScale > 0);
    assert.ok(layout.cubeX + 493 * layout.cubeScale >= 0, "cube left");
    assert.ok(layout.cubeX + 1133 * layout.cubeScale <= width, "cube right");
    assert.ok(layout.cubeY + 282 * layout.cubeScale >= 100, "cube top");
    assert.ok(
      layout.cubeBottom < layout.height - 90,
      "cube bottom leaves room for carousel",
    );
    assert.ok(
      Number.parseFloat(layout.variables["--stats-width"]) <= width - 20,
      "footer width",
    );
    if (layout.compact) {
      assert.ok(layout.introTop >= layout.cubeBottom + 88, "copy below carousel");
      assert.ok(
        layout.introTop + 210 <= layout.height - 20,
        "copy and action remain inside page",
      );
    }
  });
}
test("reference viewport keeps the calibrated asset and copy coordinates", () => {
  const layout = getViewportLayout(1536, 1024);
  assert.equal(layout.cubeScale, 1);
  assert.equal(layout.brandScale, 1);
  assert.equal(layout.cubeX, 0);
  assert.equal(layout.cubeY, 0);
  assert.equal(layout.introLeft, 72);
  assert.equal(layout.introRight, 72);
  assert.equal(layout.introTop, 621);
});
