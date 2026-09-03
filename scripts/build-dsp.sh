#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/eurorack"
SUPERPARASITES="$ROOT/vendor/superparasites"
VALLEY="$ROOT/vendor/valley-rack-free"
VOICE_OUTPUT="$ROOT/public/dsp/voice.wasm"
SWELL_OUTPUT="$ROOT/public/dsp/swell.wasm"
MIST_OUTPUT="$ROOT/public/dsp/mist.wasm"
LIQUID_OUTPUT="$ROOT/public/dsp/liquid.wasm"
VAST_OUTPUT="$ROOT/public/dsp/vast.wasm"

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ not found. Install/activate Emscripten (emsdk) before building the DSP." >&2
  exit 1
fi

if [[ ! -d "$VENDOR/plaits" ]]; then
  echo "Mutable DSP sources not found. Run: npm run dsp:setup" >&2
  exit 1
fi

mkdir -p "$(dirname "$VOICE_OUTPUT")"
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
  -o "$VOICE_OUTPUT"

echo "Built $VOICE_OUTPUT"

em++ \
  -std=c++17 \
  -O3 \
  -DTEST \
  -I"$VENDOR" \
  "$ROOT/dsp/swell_bridge.cc" \
  "$VENDOR/tides2/poly_slope_generator.cc" \
  "$VENDOR/tides2/ramp/ramp_extractor.cc" \
  "$VENDOR/tides2/resources.cc" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=16777216 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_swell_create","_su_swell_destroy","_su_swell_set_sample_rate","_su_swell_set_frequency","_su_swell_set_slope","_su_swell_set_shape","_su_swell_set_smooth","_su_swell_set_shift","_su_swell_set_mode","_su_swell_set_output_mode","_su_swell_set_range","_su_swell_set_trigger_patched","_su_swell_set_clock_patched","_su_swell_trigger","_su_swell_clock","_su_swell_v_oct","_su_swell_process","_su_swell_out1","_su_swell_out2","_su_swell_out3","_su_swell_out4"]' \
  -Wl,--no-entry \
  -o "$SWELL_OUTPUT"

echo "Built $SWELL_OUTPUT"


SUPERPARASITES_DSP=()
while IFS= read -r source; do
  SUPERPARASITES_DSP+=("$source")
done < <(find "$SUPERPARASITES/supercell/dsp" -name '*.cc' -type f | sort)

SUPERPARASITES_STMLIB=()
while IFS= read -r source; do
  SUPERPARASITES_STMLIB+=("$source")
done < <(find "$SUPERPARASITES/stmlib/dsp" "$SUPERPARASITES/stmlib/utils" -name '*.cc' -type f | sort)

em++ \
  -std=c++17 \
  -O3 \
  -Wno-c++11-narrowing \
  -DTEST \
  -DSUPERCELL \
  -I"$SUPERPARASITES" \
  "$ROOT/dsp/mist_bridge.cc" \
  "${SUPERPARASITES_DSP[@]}" \
  "${SUPERPARASITES_STMLIB[@]}" \
  "$SUPERPARASITES/supercell/resources.cc" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=8388608 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_mist_init","_su_mist_set_sample_rate","_su_mist_set_mode","_su_mist_set_mix","_su_mist_set_position","_su_mist_set_size","_su_mist_set_pitch","_su_mist_set_density","_su_mist_set_texture","_su_mist_set_spread","_su_mist_set_feedback","_su_mist_set_reverb","_su_mist_set_freeze","_su_mist_set_reverse","_su_mist_in_l","_su_mist_in_r","_su_mist_trig","_su_mist_out_l","_su_mist_out_r","_su_mist_process"]' \
  -Wl,--no-entry \
  -o "$MIST_OUTPUT"

echo "Built $MIST_OUTPUT (SuperParasites backend)"



em++ \
  -std=c++17 \
  -O3 \
  -DNDEBUG \
  -I"$VALLEY/src" \
  "$ROOT/dsp/vast_bridge.cc" \
  "$VALLEY/src/Plateau/Dattorro.cpp" \
  "$VALLEY/src/dsp/filters/OnePoleFilters.cpp" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=33554432 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_vast_create","_su_vast_destroy","_su_vast_set_sample_rate","_su_vast_set_size","_su_vast_set_decay","_su_vast_set_damp","_su_vast_set_diffuse","_su_vast_set_predelay","_su_vast_set_motion","_su_vast_set_spread","_su_vast_set_freeze","_su_vast_in_l","_su_vast_in_r","_su_vast_out_l","_su_vast_out_r","_su_vast_process"]' \
  -Wl,--no-entry \
  -o "$VAST_OUTPUT"

echo "Built $VAST_OUTPUT (Valley Plateau Dattorro backend)"

em++ \
  -std=c++17 \
  -O3 \
  "$ROOT/dsp/liquid_bridge.cc" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=2097152 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_liquid_create","_su_liquid_destroy","_su_liquid_set_sample_rate","_su_liquid_set_cutoff","_su_liquid_set_resonance","_su_liquid_in","_su_liquid_bp12","_su_liquid_lp12","_su_liquid_lp24","_su_liquid_process"]' \
  -Wl,--no-entry \
  -o "$LIQUID_OUTPUT"

echo "Built $LIQUID_OUTPUT (Ripples VA backend)"
