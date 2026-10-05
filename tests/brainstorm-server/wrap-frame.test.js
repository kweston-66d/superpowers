/**
 * Keep author screen HTML literal when wrapInFrame inserts it into the frame.
 *
 * String.replace replacement patterns ($', $&, $`, $$, $n) must not rewrite
 * screen markup. Prefer split/join (or a function replacer) over a string
 * replacement so those tokens stay literal for the user.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '../../skills/brainstorming/scripts/server.cjs');
const FRAME_TEMPLATE = path.join(__dirname, '../../skills/brainstorming/scripts/frame-template.html');
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

function placeholderLineWith(screen) {
  const template = fs.readFileSync(FRAME_TEMPLATE, 'utf8');
  const placeholder = '<!-- CONTENT -->';
  const at = template.indexOf(placeholder);
  assert.strictEqual(
    countOccurrences(template, placeholder),
    1,
    'frame template has one content placeholder'
  );
  const lineStart = template.lastIndexOf('\n', at) + 1;
  const lineEnd = template.indexOf('\n', at);
  const line = template.slice(lineStart, lineEnd === -1 ? template.length : lineEnd);
  const slot = line.indexOf(placeholder);
  assert.notStrictEqual(slot, -1, 'content placeholder sits on its own template line');
  return line.slice(0, slot) + screen + line.slice(slot + placeholder.length);
}

function assertScreenInsertedLiterally(screen) {
  const framed = wrapInFrame(screen);
  const expectedLine = placeholderLineWith(screen);
  const open = '<div id="frame-content">';
  const openAt = framed.indexOf(open);

  assert.notStrictEqual(openAt, -1, 'framed screen keeps the content container');
  assert.strictEqual(
    countOccurrences(framed, expectedLine),
    1,
    'screen html occupies the content placeholder exactly once'
  );
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

test('combined dollar tokens in screen html stay literal together', () => {
  const screen = "<p>price $'99' and $& match $` back $$ dollar $1 group</p>";
  assertScreenInsertedLiterally(screen);
});

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (passed === 0 || failed > 0) process.exit(1);
