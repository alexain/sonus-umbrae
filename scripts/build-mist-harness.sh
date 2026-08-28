#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/eurorack"
OUTPUT="$ROOT/public/dsp/mist-harness.wasm"

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ not found. Activate Emscripten first." >&2
  exit 1
fi

if [[ ! -f "$VENDOR/clouds/dsp/granular_processor.cc" ]]; then
  echo "Clouds sources are missing. Run: npm run dsp:setup" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

CLOUDS_DSP=()
while IFS= read -r source; do
  CLOUDS_DSP+=("$source")
done < <(find "$VENDOR/clouds/dsp" -name '*.cc' -type f | sort)

STMLIB_FFT=()
while IFS= read -r source; do
  STMLIB_FFT+=("$source")
done < <(find "$VENDOR/stmlib/fft" -name '*.cc' -type f | sort)

em++ \
  -std=c++17 \
  -O2 \
  -DTEST \
  -I"$VENDOR" \
  "$ROOT/dsp/mist_harness_bridge.cc" \
  "$VENDOR/stmlib/utils/random.cc" \
  "$VENDOR/stmlib/dsp/atan.cc" \
  "$VENDOR/stmlib/dsp/units.cc" \
  "${STMLIB_FFT[@]}" \
  "${CLOUDS_DSP[@]}" \
  "$VENDOR/clouds/resources.cc" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=33554432 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_mist_harness_init","_su_mist_harness_input","_su_mist_harness_output","_su_mist_harness_set_bypass","_su_mist_harness_set_trigger","_su_mist_harness_set_density","_su_mist_harness_set_position","_su_mist_harness_set_size","_su_mist_harness_process"]' \
  -Wl,--no-entry \
  -o "$OUTPUT"

echo "Built $OUTPUT"
echo "Open http://localhost:5173/mist-harness.html after starting Vite."
