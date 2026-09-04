#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/eurorack"
SUPERPARASITES="$ROOT/vendor/superparasites"
CLOUDSEED="$ROOT/vendor/cloudseed-core"
DAISYSP="$ROOT/vendor/daisysp"
VOICE_OUTPUT="$ROOT/public/dsp/voice.wasm"
SWELL_OUTPUT="$ROOT/public/dsp/swell.wasm"
MIST_OUTPUT="$ROOT/public/dsp/mist.wasm"
DAISY_FILTERS_OUTPUT="$ROOT/public/dsp/daisy-filters.wasm"
SKY_OUTPUT="$ROOT/public/dsp/sky.wasm"
MATTER_OUTPUT="$ROOT/public/dsp/matter.wasm"
RESONATOR_OUTPUT="$ROOT/public/dsp/resonator.wasm"

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ not found. Install/activate Emscripten (emsdk) before building the DSP." >&2
  exit 1
fi

if [[ ! -d "$VENDOR/plaits" ]]; then
  echo "Mutable DSP sources not found. Run: npm run dsp:setup" >&2
  exit 1
fi

mkdir -p "$(dirname "$VOICE_OUTPUT")"
rm -f "$ROOT/public/dsp/liquid.wasm"
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


echo "Building Matter (Mutable Instruments Elements backend)..."
ELEMENTS_DSP=()
while IFS= read -r source; do
  ELEMENTS_DSP+=("$source")
done < <(find "$VENDOR/elements/dsp" -name '*.cc' -type f | sort)

em++ \
  -std=c++17 \
  -O3 \
  -DTEST \
  -I"$VENDOR" \
  "$ROOT/dsp/matter_bridge.cc" \
  "$VENDOR/stmlib/utils/random.cc" \
  "$VENDOR/stmlib/dsp/atan.cc" \
  "$VENDOR/stmlib/dsp/units.cc" \
  "${ELEMENTS_DSP[@]}" \
  "$VENDOR/elements/resources.cc" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=33554432 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_matter_create","_su_matter_destroy","_su_matter_set_note","_su_matter_set_modulation","_su_matter_set_gate","_su_matter_set_strength","_su_matter_set_envelope","_su_matter_set_bow_level","_su_matter_set_bow_timbre","_su_matter_set_blow_level","_su_matter_set_blow_meta","_su_matter_set_blow_timbre","_su_matter_set_strike_level","_su_matter_set_strike_meta","_su_matter_set_strike_timbre","_su_matter_set_signature","_su_matter_set_geometry","_su_matter_set_brightness","_su_matter_set_damping","_su_matter_set_position","_su_matter_set_space","_su_matter_blow_in","_su_matter_strike_in","_su_matter_main","_su_matter_aux","_su_matter_block_size","_su_matter_sample_rate","_su_matter_process"]' \
  -Wl,--no-entry \
  -o "$MATTER_OUTPUT"

echo "Built $MATTER_OUTPUT (Elements backend, native 32 kHz / 16-frame blocks)"

echo "Building Resonator (Mutable Instruments Rings backend)..."
RINGS_DSP=()
while IFS= read -r source; do
  RINGS_DSP+=("$source")
done < <(find "$VENDOR/rings/dsp" -name '*.cc' -type f | sort)

em++ \
  -std=c++17 \
  -O3 \
  -DTEST \
  -I"$VENDOR" \
  "$ROOT/dsp/resonator_bridge.cc" \
  "$VENDOR/stmlib/utils/random.cc" \
  "$VENDOR/stmlib/dsp/atan.cc" \
  "$VENDOR/stmlib/dsp/units.cc" \
  "${RINGS_DSP[@]}" \
  "$VENDOR/rings/resources.cc" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=33554432 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_resonator_create","_su_resonator_destroy","_su_resonator_set_model","_su_resonator_set_polyphony","_su_resonator_set_note","_su_resonator_set_structure","_su_resonator_set_brightness","_su_resonator_set_damping","_su_resonator_set_position","_su_resonator_set_internal_exciter","_su_resonator_strum","_su_resonator_in","_su_resonator_main","_su_resonator_aux","_su_resonator_block_size","_su_resonator_sample_rate","_su_resonator_process"]' \
  -Wl,--no-entry \
  -o "$RESONATOR_OUTPUT"

echo "Built $RESONATOR_OUTPUT (Rings backend, native 48 kHz / 24-frame blocks)"

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
  -DBUFFER_SIZE=128 \
  -DMAX_STR_SIZE=32 \
  -include "$ROOT/dsp/cloudseed_compat.h" \
  -I"$CLOUDSEED" \
  "$ROOT/dsp/sky_bridge.cc" \
  "$CLOUDSEED/DSP/Biquad.cpp" \
  "$CLOUDSEED/DSP/RandomBuffer.cpp" \
  "$CLOUDSEED/Parameters.cpp" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=134217728 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_sky_create","_su_sky_destroy","_su_sky_set_sample_rate","_su_sky_set_size","_su_sky_set_decay","_su_sky_set_damp","_su_sky_set_bloom","_su_sky_set_predelay","_su_sky_set_motion","_su_sky_set_width","_su_sky_set_freeze","_su_sky_in_l","_su_sky_in_r","_su_sky_out_l","_su_sky_out_r","_su_sky_process"]' \
  -Wl,--no-entry \
  -o "$SKY_OUTPUT"

echo "Built $SKY_OUTPUT (Ghost Note Audio CloudSeedCore backend)"

echo "Building DaisySP filter module (SVF)..."
em++ \
  -std=c++17 \
  -O3 \
  -I"$DAISYSP/Source" \
  -I"$DAISYSP/Source/Utility" \
  "$ROOT/dsp/daisy_filters_bridge.cc" \
  "$DAISYSP/Source/Filters/svf.cpp" \
  -s STANDALONE_WASM=1 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=4194304 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_su_daisy_filters_create","_su_daisy_filters_destroy","_su_daisy_filters_set_sample_rate","_su_daisy_filters_set_cutoff","_su_daisy_filters_set_resonance","_su_daisy_filters_set_drive","_su_daisy_filters_in","_su_daisy_filters_low","_su_daisy_filters_high","_su_daisy_filters_band","_su_daisy_filters_notch","_su_daisy_filters_peak","_su_daisy_filters_process"]' \
  -Wl,--no-entry \
  -o "$DAISY_FILTERS_OUTPUT"

echo "Built $DAISY_FILTERS_OUTPUT (Electrosmith DaisySP SVF backend)"
