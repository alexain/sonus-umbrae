#include <algorithm>
#include <cstdint>

#include "rings/dsp/part.h"
#include "rings/dsp/patch.h"
#include "rings/dsp/performance_state.h"
#include "rings/dsp/dsp.h"

namespace {

struct ResonatorState {
  rings::Part part;
  rings::Patch patch;
  rings::PerformanceState performance;
  uint16_t reverb_buffer[32768];
  float input[rings::kMaxBlockSize];
  float main[rings::kMaxBlockSize];
  float aux[rings::kMaxBlockSize];

  ResonatorState() {
    std::fill(&reverb_buffer[0], &reverb_buffer[32768], 0);
    std::fill(&input[0], &input[rings::kMaxBlockSize], 0.0f);
    std::fill(&main[0], &main[rings::kMaxBlockSize], 0.0f);
    std::fill(&aux[0], &aux[rings::kMaxBlockSize], 0.0f);

    part.Init(reverb_buffer);
    part.set_model(rings::RESONATOR_MODEL_MODAL);
    part.set_polyphony(1);

    patch.structure = 0.5f;
    patch.brightness = 0.5f;
    patch.damping = 0.5f;
    patch.position = 0.5f;

    performance.strum = false;
    performance.internal_exciter = true;
    performance.internal_strum = false;
    performance.internal_note = false;
    performance.tonic = 0.0f;
    performance.note = 60.0f;
    performance.fm = 0.0f;
    performance.chord = 0;
  }
};

inline float Clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

}  // namespace

extern "C" {

ResonatorState* su_resonator_create() {
  return new ResonatorState();
}

void su_resonator_destroy(ResonatorState* state) {
  delete state;
}

void su_resonator_set_model(ResonatorState* state, int model) {
  if (!state) return;
  model = std::max(0, std::min(2, model));
  state->part.set_model(static_cast<rings::ResonatorModel>(model));
}

void su_resonator_set_polyphony(ResonatorState* state, int polyphony) {
  if (!state) return;
  if (polyphony != 1 && polyphony != 2 && polyphony != 4) polyphony = 1;
  state->part.set_polyphony(polyphony);
}

void su_resonator_set_note(ResonatorState* state, float midi_note) {
  if (!state) return;
  state->performance.note = midi_note;
}

void su_resonator_set_structure(ResonatorState* state, float value) {
  if (state) state->patch.structure = Clamp01(value);
}

void su_resonator_set_brightness(ResonatorState* state, float value) {
  if (state) state->patch.brightness = Clamp01(value);
}

void su_resonator_set_damping(ResonatorState* state, float value) {
  if (state) state->patch.damping = Clamp01(value);
}

void su_resonator_set_position(ResonatorState* state, float value) {
  if (state) state->patch.position = Clamp01(value);
}

void su_resonator_set_internal_exciter(ResonatorState* state, int enabled) {
  if (state) state->performance.internal_exciter = enabled != 0;
}

void su_resonator_strum(ResonatorState* state) {
  if (state) state->performance.strum = true;
}

float* su_resonator_in(ResonatorState* state) {
  return state ? state->input : nullptr;
}

float* su_resonator_main(ResonatorState* state) {
  return state ? state->main : nullptr;
}

float* su_resonator_aux(ResonatorState* state) {
  return state ? state->aux : nullptr;
}

int su_resonator_block_size() {
  return static_cast<int>(rings::kMaxBlockSize);
}

float su_resonator_sample_rate() {
  return rings::kSampleRate;
}

void su_resonator_process(ResonatorState* state) {
  if (!state) return;
  state->part.Process(
      state->performance,
      state->patch,
      state->input,
      state->main,
      state->aux,
      rings::kMaxBlockSize);
  state->performance.strum = false;
  std::fill(&state->input[0], &state->input[rings::kMaxBlockSize], 0.0f);
}

}  // extern "C"
