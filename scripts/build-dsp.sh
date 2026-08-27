#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/eurorack"
OUTPUT="$ROOT/public/dsp/voice.wasm"

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ not found. Install/activate Emscripten (emsdk) before building the DSP." >&2
  exit 1
fi

if [[ ! -d "$VENDOR/plaits" ]]; then
  echo "Mutable DSP sources not found. Run: npm run dsp:setup" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
PLAITS_DSP=()
while IFS= read -r source; do
  PLAITS_DSP+=("$source")
done < <(find "$VENDOR/plaits/dsp" -name '*.cc' -type f | sort)

em++ \
  -std=c++17 \
  -O3 \
  -DTEST \
  -I"$VENDOR" \
  "$ROOT/dsp/plaits_bridge.cc" \
  "$VENDOR/stmlib/utils/random.cc" \
  "$VENDOR/stmlib/dsp/atan.cc" \
  "$VENDOR/stmlib/dsp/units.cc" \
  "${PLAITS_DSP[@]}" \
  "$VENDOR/plaits/resources.cc" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=33554432 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_voice_create","_su_voice_destroy","_su_voice_set_model","_su_voice_set_frequency","_su_voice_set_harmo","_su_voice_set_timbre","_su_voice_set_morph","_su_voice_set_v_oct","_su_voice_set_trigger","_su_voice_process","_su_voice_out","_su_voice_aux"]' \
  -Wl,--no-entry \
  -o "$OUTPUT"

echo "Built $OUTPUT"
