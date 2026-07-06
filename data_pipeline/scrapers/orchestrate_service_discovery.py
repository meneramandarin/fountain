from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DB_DIR = ROOT / "data" / "databases"
EXPORT_DIR = ROOT / "data" / "exports"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    env = os.environ.copy()
    if not env.get("OPENROUTER_API_KEY"):
        print("OPENROUTER_API_KEY is required and will be inherited by workers.", file=sys.stderr)
        return 2
    DB_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    processes: list[subprocess.Popen[str]] = []
    for index in range(args.workers):
        cmd = [
            sys.executable,
            "-m",
            "data_pipeline.scrapers.scrape_service_discovery",
            "--worker-index",
            str(index),
            "--worker-count",
            str(args.workers),
            "--db",
            str(DB_DIR / f"service_discovery_{index}.sqlite"),
            "--review-queue",
            str(EXPORT_DIR / f"service_discovery_review_queue_{index}.csv"),
            "--max-candidates-per-query",
            str(args.max_candidates_per_query),
            "--max-pages",
            str(args.max_pages),
            "--timeout",
            str(args.timeout),
            "--llm-timeout",
            str(args.llm_timeout),
            "--delay",
            str(args.delay),
        ]
        if args.reset:
            cmd.append("--reset")
        if args.model:
            cmd.extend(["--model", args.model])
        if args.max_cells:
            cmd.extend(["--max-cells", str(args.max_cells)])
        for category in args.category:
            cmd.extend(["--category", category])
        for metro in args.metro:
            cmd.extend(["--metro", metro])
        print(f"starting worker {index}: {' '.join(cmd)}", flush=True)
        processes.append(subprocess.Popen(cmd, cwd=ROOT, env=env, text=True))
    exit_code = 0
    try:
        for process in processes:
            code = process.wait()
            if code:
                exit_code = code
    except KeyboardInterrupt:
        for process in processes:
            process.terminate()
        for process in processes:
            process.wait()
        raise
    return exit_code


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Launch static-sharded service discovery workers.")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--category", action="append", default=[])
    parser.add_argument("--metro", action="append", default=[])
    parser.add_argument("--max-cells", type=int)
    parser.add_argument("--max-candidates-per-query", type=int, default=8)
    parser.add_argument("--max-pages", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--llm-timeout", type=int, default=120)
    parser.add_argument("--delay", type=float, default=0.75)
    parser.add_argument("--model")
    args = parser.parse_args(argv)
    if args.workers < 1:
        raise ValueError("--workers must be >= 1")
    return args


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
