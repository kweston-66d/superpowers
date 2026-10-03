#!/usr/bin/env bash
# Tests for executing-plans' bookkeeping helpers: scripts/task-start extracts
# the brief and records BASE in one call; scripts/task-done runs the task's
# test command, records the result in the ledger, and refuses to record a
# failing task.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EP_SCRIPTS="$REPO_ROOT/skills/executing-plans/scripts"

FAILURES=0
TEST_ROOT=""

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1"
  FAILURES=$((FAILURES + 1))
}

cleanup() {
  if [[ -n "$TEST_ROOT" && -d "$TEST_ROOT" ]]; then
    rm -rf "$TEST_ROOT"
  fi
}

main() {
  echo "=== Test: executing-plans scripts ==="

  TEST_ROOT="$(mktemp -d)"
  trap cleanup EXIT

  git init -q -b main "$TEST_ROOT/repo"
  local repo
  repo="$(cd "$TEST_ROOT/repo" && git rev-parse --show-toplevel)"
  local git_id=(-c user.email=t@example.com -c user.name=t -c commit.gpgsign=false)

  cat >"$repo/plan.md" <<'PLAN'
# Plan

## Task 1: First thing

Do the first thing.

## Task 2: Second thing

Do the second thing.
PLAN
  (cd "$repo" && git add plan.md && git "${git_id[@]}" commit -qm fixture)
  local base
  base="$(cd "$repo" && git rev-parse HEAD)"

  # --- task-start: argument validation ---
  local rc=0
  (cd "$repo" && "$EP_SCRIPTS/task-start" plan.md >/dev/null 2>&1) || rc=$?
  if [[ "$rc" -eq 2 ]]; then
    pass "task-start without a task number errors with exit 2"
  else
    fail "task-start without a task number errors with exit 2 (got $rc)"
  fi

  # --- task-start: brief path + BASE in one call ---
  local out
  out="$(cd "$repo" && "$EP_SCRIPTS/task-start" plan.md 1)"
  if [[ "$out" == *"brief: $repo/.superpowers/sdd/plan/task-1-brief.md"* ]]; then
    pass "task-start prints the brief path under the plan's workspace"
  else
    fail "task-start prints the brief path under the plan's workspace"
    echo "    got: $out"
  fi
  if [[ "$out" == *"base: $base"* ]]; then
    pass "task-start prints BASE as the current HEAD"
  else
    fail "task-start prints BASE as the current HEAD"
    echo "    got: $out"
  fi
  if [[ -s "$repo/.superpowers/sdd/plan/task-1-brief.md" ]]; then
    pass "task-start writes the brief file"
  else
    fail "task-start writes the brief file"
  fi

  # --- task-done: records a passing task ---
  (cd "$repo" && echo x >work.txt && git add work.txt && git "${git_id[@]}" commit -qm "task 1")
  local head
  head="$(cd "$repo" && git rev-parse HEAD)"
  out="$(cd "$repo" && "$EP_SCRIPTS/task-done" plan.md 1 "$base" -- sh -c 'echo "Ran 3 tests"; echo OK')"
  rc=$?
  local ledger="$repo/.superpowers/sdd/plan/progress.md"
  local expected="Task 1: complete (commits ${base:0:7}..${head:0:7}, tests: sh -c 'echo \"Ran 3 tests\"; echo OK' → OK)"
  if [[ -f "$ledger" ]] && grep -qF "$expected" "$ledger"; then
    pass "task-done appends the completion line with commit range and test result"
  else
    fail "task-done appends the completion line with commit range and test result"
    echo "    expected: $expected"
    echo "    ledger:"
    sed 's/^/      /' "$ledger" 2>/dev/null || echo "      (missing)"
  fi
  if [[ "$out" == *"OK"* ]]; then
    pass "task-done prints the tail of the test output"
  else
    fail "task-done prints the tail of the test output"
    echo "    got: $out"
  fi
  if [[ -s "$repo/.superpowers/sdd/plan/task-1-tests.log" ]]; then
    pass "task-done keeps the full test output in the workspace"
  else
    fail "task-done keeps the full test output in the workspace"
  fi

  # --- task-done: refuses to record a failing task ---
  rc=0
  out="$(cd "$repo" && "$EP_SCRIPTS/task-done" plan.md 2 "$head" -- sh -c 'echo "FAILED (errors=1)"; exit 1' 2>&1)" || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    pass "task-done exits non-zero when the test command fails"
  else
    fail "task-done exits non-zero when the test command fails"
  fi
  if ! grep -q "Task 2: complete" "$ledger"; then
    pass "task-done does not record a failing task as complete"
  else
    fail "task-done does not record a failing task as complete"
  fi
  if [[ "$out" == *"FAILED"* ]]; then
    pass "task-done shows the failing output"
  else
    fail "task-done shows the failing output"
    echo "    got: $out"
  fi

  # --- task-done: Node TAP pass summary, not the duration trailer ---
  cat >"$repo/tap-pass.txt" <<'EOF'
TAP version 13
ok 1 - ok
  ---
  duration_ms: 0.258167
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 52.464833
EOF
  rc=0
  out="$(cd "$repo" && "$EP_SCRIPTS/task-done" plan.md 3 "$head" -- cat tap-pass.txt)" || rc=$?
  if [[ "$rc" -eq 0 ]] && grep -qF "→ # pass 1" "$ledger" && ! grep -qF "→ # duration_ms" "$ledger" && ! grep -qF "→ # fail 0" "$ledger"; then
    pass "task-done records the TAP pass summary rather than duration_ms"
  else
    fail "task-done records the TAP pass summary rather than duration_ms"
    echo "    rc: $rc"
    echo "    got: $out"
    echo "    ledger:"
    sed 's/^/      /' "$ledger" 2>/dev/null || echo "      (missing)"
  fi

  # A pass/fail summary that is only a fail line still beats the duration trailer.
  cat >"$repo/tap-fail-only.txt" <<'EOF'
# cancelled 0
# fail 0
# duration_ms 9.5
EOF
  rc=0
  out="$(cd "$repo" && "$EP_SCRIPTS/task-done" plan.md 4 "$head" -- cat tap-fail-only.txt)" || rc=$?
  if [[ "$rc" -eq 0 ]] && grep -qF "→ # fail 0" "$ledger" && ! grep -qF "→ # duration_ms" "$ledger"; then
    pass "task-done records a TAP fail summary when no pass summary is present"
  else
    fail "task-done records a TAP fail summary when no pass summary is present"
    echo "    rc: $rc"
    echo "    got: $out"
    echo "    ledger:"
    sed 's/^/      /' "$ledger" 2>/dev/null || echo "      (missing)"
  fi

  # --- task-done: non-TAP output keeps the last-nonblank fallback ---
  cat >"$repo/non-tap.txt" <<'EOF'
Running checks
7 checks passed

EOF
  rc=0
  out="$(cd "$repo" && "$EP_SCRIPTS/task-done" plan.md 5 "$head" -- cat non-tap.txt)" || rc=$?
  if [[ "$rc" -eq 0 ]] && grep -qF "→ 7 checks passed" "$ledger"; then
    pass "task-done records the last nonblank line for non-TAP output"
  else
    fail "task-done records the last nonblank line for non-TAP output"
    echo "    rc: $rc"
    echo "    got: $out"
    echo "    ledger:"
    sed 's/^/      /' "$ledger" 2>/dev/null || echo "      (missing)"
  fi

  echo
  if [[ "$FAILURES" -eq 0 ]]; then
    echo "PASS"
  else
    echo "FAIL ($FAILURES)"
    exit 1
  fi
}

main "$@"
