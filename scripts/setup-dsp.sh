#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/eurorack"
SUPERPARASITES="$ROOT/vendor/superparasites"
VALLEY="$ROOT/vendor/valley-rack-free"

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


if [[ ! -e "$SUPERPARASITES/.git" ]]; then
  mkdir -p "$ROOT/vendor"
  echo "Fetching SuperParasites DSP sources..."
  git clone --depth 1 --recurse-submodules --shallow-submodules     https://github.com/patrickdowling/superparasites.git "$SUPERPARASITES"
else
  echo "SuperParasites DSP sources already present: $SUPERPARASITES"
fi

if ! git -C "$VALLEY" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  mkdir -p "$ROOT/vendor"
  echo "Fetching ValleyRackFree DSP sources (Plateau)..."
  git clone --depth 1 https://github.com/ValleyAudio/ValleyRackFree.git "$VALLEY"
else
  echo "ValleyRackFree DSP sources already present: $VALLEY"
fi

echo "Initialising required upstream submodules..."
git -C "$VENDOR" submodule update --init --recursive --depth 1 stmlib
git -C "$SUPERPARASITES" submodule update --init --recursive --depth 1 stmlib

if [[ ! -f "$VENDOR/stmlib/utils/random.cc" ]]; then
  echo "stmlib submodule is incomplete: $VENDOR/stmlib/utils/random.cc is missing" >&2
  exit 1
fi

if [[ ! -f "$VENDOR/tides2/poly_slope_generator.h" ]]; then
  echo "Tides 2018 DSP sources are incomplete: $VENDOR/tides2 is missing" >&2
  exit 1
fi


if [[ ! -f "$VENDOR/elements/dsp/part.cc" || ! -f "$VENDOR/elements/resources.cc" ]]; then
  echo "Elements DSP sources are incomplete: $VENDOR/elements is missing" >&2
  exit 1
fi

if [[ ! -f "$VENDOR/clouds/dsp/granular_processor.cc" ]]; then
  echo "Clouds DSP sources are incomplete: $VENDOR/clouds is missing" >&2
  exit 1
fi

if [[ ! -f "$SUPERPARASITES/supercell/dsp/granular_processor.cc" ]]; then
  echo "SuperParasites DSP sources are incomplete: $SUPERPARASITES/supercell is missing" >&2
  exit 1
fi

if [[ ! -f "$VALLEY/src/Plateau/Dattorro.cpp" || \
      ! -f "$VALLEY/src/dsp/filters/OnePoleFilters.cpp" ]]; then
  echo "Valley Plateau DSP sources are incomplete" >&2
  exit 1
fi

if [[ ! -f "$SUPERPARASITES/stmlib/utils/random.cc" ]]; then
  echo "SuperParasites stmlib submodule is incomplete" >&2
  exit 1
fi

cat <<'MSG'
DSP sources ready.

Next, make sure Emscripten is active in this shell (em++ must be in PATH), then run:
  npm run dsp:build
MSG
