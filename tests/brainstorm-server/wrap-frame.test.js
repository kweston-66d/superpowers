/**
 * Keep author screen HTML literal when wrapInFrame inserts it into the frame.
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
  if (needle.length === 0) {
    throw new Error('needle must not be empty');
  }
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

function assertScreenInsertedLiterally(screen) {
  const framed = wrapInFrame(screen);
  const open = '<div id="frame-content">';
  const openAt = framed.indexOf(open);

  assert.notStrictEqual(openAt, -1, 'framed screen keeps the content container');
  assert.strictEqual(
    countOccurrences(framed, screen),
    1,
    'screen html must appear once, with dollar sequences left literal'
  );
  const screenAt = framed.indexOf(screen);
  assert.ok(
    screenAt > openAt,
    'screen html is inserted inside the frame content container'
  );
  const closeAt = framed.indexOf('</div>', screenAt);
  assert.ok(
    closeAt > screenAt,
    'screen html sits before the content container closes'
  );
  assert.strictEqual(
    framed.includes('<!-- CONTENT -->'),
    false,
    'content placeholder is consumed and not written back into the screen'
  );
  return framed;
}

console.log('\n--- wrapInFrame screen HTML ---');

test('dollar-quote in screen html round-trips through wrapInFrame', () => {
  const screen = "<p>costs $' today</p>";
  const framed = assertScreenInsertedLiterally(screen);
  assert.strictEqual(
    countOccurrences(framed, '</html>'),
    1,
    'dollar-quote must not splice the frame tail into the screen'
  );
});

test('doubled dollar in screen html stays two dollar signs', () => {
  const screen = '<p>price $$ today</p>';
  assertScreenInsertedLiterally(screen);
});

test('dollar-ampersand in screen html is not replaced by the content placeholder', () => {
  const screen = '<p>match $& here</p>';
  assertScreenInsertedLiterally(screen);
});

test('dollar-backtick in screen html is not replaced by the frame head', () => {
  const screen = '<p>prefix $` here</p>';
  const framed = assertScreenInsertedLiterally(screen);
  assert.strictEqual(
    countOccurrences(framed, '<!DOCTYPE html>'),
    1,
    'dollar-backtick must not splice the frame head into the screen'
  );
});

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (passed === 0 || failed > 0) process.exit(1);
