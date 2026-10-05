/**
 * Inserted screen HTML must round-trip through wrapInFrame with its dollar sequences intact.
 */

const assert = require('assert');
const path = require('path');

const SERVER = path.join(__dirname, '../../skills/brainstorming/scripts/server.cjs');
const { wrapInFrame } = require(SERVER);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
  return count;
}

console.log('\n--- wrapInFrame screen HTML ---');

test('screen html with replacement dollar sequences round-trips through wrapInFrame', () => {
  const screen = "<p>costs $' today</p><p>$$</p><p>$&</p><p>$`</p><p>$1</p><p>$<name></p>";
  const framed = wrapInFrame(screen);
  const open = '<div id="frame-content">';
  const openAt = framed.indexOf(open);

  assert.notStrictEqual(openAt, -1, 'framed screen keeps the content container');
  assert.strictEqual(
    countOccurrences(framed, screen),
    1,
    'screen html must appear once, with dollar sequences left literal'
  );
  assert.ok(
    framed.indexOf(screen) > openAt,
    'screen html is inserted inside the frame content container'
  );
  assert.strictEqual(
    framed.includes('<!-- CONTENT -->'),
    false,
    'content placeholder is consumed by the inserted screen'
  );
});

if (failed > 0) process.exit(1);
