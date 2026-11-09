#!/usr/bin/env python3
"""Run a heavy command only when a slot of its lane is free, so parallel sessions share the machine safely.

Usage:
  python3 queue_run.py LANE -- COMMAND [ARG ...]
  python3 queue_run.py --status

LANE     trellis  1 slot  (TRELLIS.2 3D generation, about 25GB of memory each)
         render   2 slots (Blender full-length video renders, about 21 minutes each)
The command waits until a slot is free, then runs; its exit code is returned. Slots are OS file locks under
~/work/image-to-3d/queue/, so a crashed or killed session frees its slot automatically. While waiting it
prints one line per minute. --status shows who holds each slot.
Override the slot count with DIORAMA_SLOTS_<LANE>=N (e.g. DIORAMA_SLOTS_RENDER=1).
"""
import fcntl
import os
import subprocess
import sys
import time

LANES = {"trellis": 1, "render": 2}
QDIR = os.path.expanduser("~/work/image-to-3d/queue")


def slots(lane):
    return int(os.environ.get(f"DIORAMA_SLOTS_{lane.upper()}", LANES[lane]))


def status():
    for lane in LANES:
        for i in range(slots(lane)):
            p = os.path.join(QDIR, f"{lane}-{i}.lock")
            fd = os.open(p, os.O_RDWR | os.O_CREAT)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                state = "free"
                fcntl.flock(fd, fcntl.LOCK_UN)
            except BlockingIOError:
                state = "busy: " + (open(p).read().strip() or "?")
            os.close(fd)
            print(f"{lane}-{i}: {state}")


def main():
    os.makedirs(QDIR, exist_ok=True)
    if sys.argv[1:2] == ["--status"]:
        return status()
    if len(sys.argv) < 4 or sys.argv[2] != "--" or sys.argv[1] not in LANES:
        sys.exit(__doc__)
    lane, cmd = sys.argv[1], sys.argv[3:]
    start, last = time.time(), 0
    while True:
        for i in range(slots(lane)):
            fd = os.open(os.path.join(QDIR, f"{lane}-{i}.lock"), os.O_RDWR | os.O_CREAT)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                os.close(fd)
                continue
            os.ftruncate(fd, 0)
            os.write(fd, f"pid {os.getpid()} since {time.strftime('%H:%M:%S')} cwd {os.getcwd()} :: {' '.join(cmd)[:200]}".encode())
            print(f"QUEUE {lane}-{i} acquired after {int(time.time() - start)}s", flush=True)
            try:
                return subprocess.call(cmd)
            finally:
                os.ftruncate(fd, 0)
                fcntl.flock(fd, fcntl.LOCK_UN)
                os.close(fd)
        if time.time() - last >= 60:
            print(f"QUEUE waiting for {lane} ({int(time.time() - start)}s)", flush=True)
            last = time.time()
        time.sleep(5)


if __name__ == "__main__":
    sys.exit(main() or 0)
