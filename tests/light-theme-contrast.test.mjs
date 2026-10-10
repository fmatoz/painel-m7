import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const luminance = (hex) => {
  const rgb = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
test("light theme accent text has AA contrast on white and tinted panels", () => {
  const blocks = [...css.matchAll(/\.app-light :is\(([^)]+)\)\s*\{\s*color: (#[a-f0-9]{6}) !important;/g)];
  assert.equal(blocks.length, 15);
  for (const [,selectors, ink] of blocks) {
    for (const background of ["ffffff","fafafa","e4e4e7","dbeafe","ffedd5","e0f2fe"]) {
      const ratio = (luminance(background)+.05)/(luminance(ink.slice(1))+.05);
      assert.ok(ratio >= 4.5, selectors+" on "+background+": "+ratio);
    }
  }
});
test("Radar translucent text is covered without overriding white action labels", () => {
  assert.ok(css.includes(".text-orange-200\\/60"));
  assert.ok(css.includes(".text-orange-200\\/75"));
  assert.ok(css.includes(".text-orange-200\\/80"));
  const accents = css.slice(css.indexOf("/* Pastel accents"));
  assert.ok(!accents.includes(".text-white"));
  assert.ok( [...accents.matchAll(/([^{}]+)\{/g)].every(m => m[1].includes(".app-light")));
});
