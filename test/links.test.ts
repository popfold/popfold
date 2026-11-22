import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { linkKind } from '../src/links.ts';

const B = String.fromCharCode(92); // a backslash
const CASES: [string, ReturnType<typeof linkKind>][] = [
  ['https://a.b', 'outside'], ['mailto:x@y.z', 'outside'], ['HTTP://A', 'outside'],
  ['docs/guide', 'inside'], ['./tour/', 'inside'], ['/docs/', 'inside'], ['#contact', 'inside'], ['../docs/x#y', 'inside'],
  ['javascript:alert(1)', null], ['  JavaScript:x', null], ['data:text/html,x', null], ['//evil.com', null],
  [`${B}${B}evil${B}x`, null], [`/${B}evil.com`, null], ['', null], ['ftp://x', null], ['vbscript:x', null],
];

test('linkKind() sorts story links into outside, inside and dropped', () => {
  for (const [href, want] of CASES) assert.equal(linkKind(href), want, JSON.stringify(href));
});

// The Vite plugin cannot import links.ts (Node loads the plugin as it is), so it carries a copy of the rule.
test('the copy of the rule in vite-plugin.ts agrees with links.ts', () => {
  const plugin = readFileSync(new URL('../src/vite-plugin.ts', import.meta.url), 'utf8');
  const body = /function linkKind\(href: string\)[^{]*\{([\s\S]*?)\n\}/.exec(plugin);
  assert.ok(body, 'vite-plugin.ts has a linkKind()');
  const copy = new Function('href', body[1]) as typeof linkKind;
  for (const [href, want] of CASES) assert.equal(copy(href), want, JSON.stringify(href));
});
