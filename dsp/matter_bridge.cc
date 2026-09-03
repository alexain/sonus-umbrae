#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

#include "elements/dsp/dsp.h"
#include "elements/dsp/part.h"

namespace {

constexpr int kBlockSize = static_cast<int>(elements::kMaxBlockSize);
constexpr size_t kReverbBufferSize = 32768;

struct MatterState {
  elements::Part part;
  elements::PerformanceState performance{};
  uint16_t reverb_buffer[kReverbBufferSize];
  float blow_in[kBlockSize];
  float strike_in[kBlockSize];
  float main[kBlockSize];
  float aux[kBlockSize];

  MatterState() {
    std::memset(reverb_buffer, 0, sizeof(reverb_buffer));
    std::memset(blow_in, 0, sizeof(blow_in));
    std::memset(strike_in, 0, sizeof(strike_in));
    std::memset(main, 0, sizeof(main));
    std::memset(aux, 0, sizeof(aux));

    part.Init(reverb_buffer);
    uint32_t seed[3] = {0x534f4e55u, 0x534d4154u, 0x54455221u};
    part.Seed(seed, 3);

    performance.gate = false;
    performance.note = 60.0f;
    performance.modulation = 0.0f;
    performance.strength = 0.8f;
  }
};

float Clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

}  // namespace

extern "C" {

MatterState* su_matter_create() {
  return new MatterState();
}

void su_matter_destroy(MatterState* state) {
  delete state;
}

void su_matter_set_note(MatterState* state, float midi_note) {
  if (state && std::isfinite(midi_note)) state->performance.note = midi_note;
}

void su_matter_set_modulation(MatterState* state, float semitones) {
  if (state && std::isfinite(semitones)) state->performance.modulation = semitones;
}

void su_matter_set_gate(MatterState* state, int gate) {
  if (state) state->performance.gate = gate != 0;
}

void su_matter_set_strength(MatterState* state, float value) {
  if (state) state->performance.strength = Clamp01(value);
}

#define MATTER_PATCH_SETTER(name, field) \
  void su_matter_set_##name(MatterState* state, float value) { \
    if (state) state->part.mutable_patch()->field = Clamp01(value); \
  }

MATTER_PATCH_SETTER(envelope, exciter_envelope_shape)
MATTER_PATCH_SETTER(bow_level, exciter_bow_level)
MATTER_PATCH_SETTER(bow_timbre, exciter_bow_timbre)
MATTER_PATCH_SETTER(blow_level, exciter_blow_level)
MATTER_PATCH_SETTER(blow_meta, exciter_blow_meta)
MATTER_PATCH_SETTER(blow_timbre, exciter_blow_timbre)
MATTER_PATCH_SETTER(strike_level, exciter_strike_level)
MATTER_PATCH_SETTER(strike_meta, exciter_strike_meta)
MATTER_PATCH_SETTER(strike_timbre, exciter_strike_timbre)
MATTER_PATCH_SETTER(signature, exciter_signature)
MATTER_PATCH_SETTER(geometry, resonator_geometry)
MATTER_PATCH_SETTER(brightness, resonator_brightness)
MATTER_PATCH_SETTER(damping, resonator_damping)
MATTER_PATCH_SETTER(position, resonator_position)
MATTER_PATCH_SETTER(space, space)

#undef MATTER_PATCH_SETTER

float* su_matter_blow_in(MatterState* state) {
  return state ? state->blow_in : nullptr;
}

float* su_matter_strike_in(MatterState* state) {
  return state ? state->strike_in : nullptr;
}

float* su_matter_main(MatterState* state) {
  return state ? state->main : nullptr;
}

float* su_matter_aux(MatterState* state) {
  return state ? state->aux : nullptr;
}

int su_matter_block_size() {
  return kBlockSize;
}

float su_matter_sample_rate() {
  return elements::kSampleRate;
}

void su_matter_process(MatterState* state) {
  if (!state) return;
  state->part.Process(
      state->performance,
      state->blow_in,
      state->strike_in,
      state->main,
      state->aux,
      kBlockSize);
}

}  // extern "C"
