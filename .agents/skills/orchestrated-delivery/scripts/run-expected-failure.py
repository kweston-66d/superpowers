#!/usr/bin/env python3
"""Run an expected-failing command with bounded output and runtime."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time


EXPECTED_FAILURE = 0
UNEXPECTED_SUCCESS = 1
HARNESS_FAILURE = 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a mutation probe whose nonzero exit is the expected result."
    )
    parser.add_argument("--timeout", type=float, required=True, help="Maximum runtime in seconds")
    parser.add_argument(
        "--max-output-bytes", type=int, required=True, help="Maximum combined output size"
    )
    parser.add_argument("--output", type=Path, required=True, help="Captured command output")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.command[:1] == ["--"]:
        args.command = args.command[1:]
    if not args.command:
        parser.error("command is required after --")
    if args.timeout <= 0 or args.max_output_bytes <= 0:
        parser.error("--timeout and --max-output-bytes must be positive")
    return args


def terminate(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=1)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def emit(result: str, command_status: int | None, output_bytes: int) -> None:
    print(
        json.dumps(
            {
                "result": result,
                "command_status": command_status,
                "output_bytes": output_bytes,
            },
            separators=(",", ":"),
        )
    )


def main() -> int:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    output_bytes = 0
    reason: str | None = None

    with args.output.open("wb") as output:
        try:
            process = subprocess.Popen(
                args.command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except OSError as error:
            output.write(f"{error}\n".encode())
            emit("launch-error", None, output.tell())
            return HARNESS_FAILURE
        assert process.stdout is not None
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)

        while selector.get_map():
            remaining = args.timeout - (time.monotonic() - started)
            if remaining <= 0:
                reason = "timeout"
                terminate(process)
                break
            events = selector.select(timeout=min(remaining, 0.1))
            if not events and process.poll() is not None:
                events = selector.select(timeout=0)
                if not events:
                    break
            for key, _ in events:
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                available = args.max_output_bytes - output_bytes
                if len(chunk) > available:
                    output.write(chunk[:available])
                    output_bytes += available
                    reason = "output-limit"
                    terminate(process)
                    break
                output.write(chunk)
                output_bytes += len(chunk)
            if reason:
                break

    if process.poll() is None:
        terminate(process)
    status = process.returncode
    if reason:
        emit(reason, status, output_bytes)
        return HARNESS_FAILURE
    if status == 0:
        emit("unexpected-success", status, output_bytes)
        return UNEXPECTED_SUCCESS
    emit("expected-failure", status, output_bytes)
    return EXPECTED_FAILURE


if __name__ == "__main__":
    sys.exit(main())
