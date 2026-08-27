#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/eurorack"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if [[ ! -d "$VENDOR/.git" ]]; then
  mkdir -p "$ROOT/vendor"
  echo "Fetching Mutable Instruments eurorack DSP sources..."
  git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/pichenettes/eurorack.git "$VENDOR"
else
  echo "Mutable Instruments DSP sources already present: $VENDOR"
fi

echo "Initialising required upstream submodules..."
git -C "$VENDOR" submodule update --init --recursive --depth 1 stmlib

if [[ ! -f "$VENDOR/stmlib/utils/random.cc" ]]; then
  echo "stmlib submodule is incomplete: $VENDOR/stmlib/utils/random.cc is missing" >&2
  exit 1
fi

cat <<'MSG'
DSP sources ready.

Next, make sure Emscripten is active in this shell (em++ must be in PATH), then run:
  npm run dsp:build
MSG
