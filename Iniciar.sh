#!/usr/bin/env bash
set -euo pipefail
medal_package_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v python3 >/dev/null; then
  echo 'Install Python 3.11 or newer using your software manager.' >&2
  exit 1
fi
exec python3 "$medal_package_dir/preparar.py" --run "$@"
