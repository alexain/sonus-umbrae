#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

#include "stmlib/utils/buffer_allocator.h"
#include "plaits/dsp/dsp.h"
#include "plaits/dsp/voice.h"

namespace {

constexpr int kRenderCapacity = 128;

struct VoiceState {
  plaits::Voice voice;
  plaits::Patch patch;
  plaits::Modulations modulations;
  char shared_buffer[16384];
  float out[kRenderCapacity];
  float aux[kRenderCapacity];
  float trigger = 0.0f;

  VoiceState() {
    stmlib::BufferAllocator allocator(shared_buffer, sizeof(shared_buffer));
    voice.Init(&allocator);

    std::memset(&patch, 0, sizeof(patch));
    std::memset(&modulations, 0, sizeof(modulations));

    patch.note = 69.0f;
    patch.harmonics = 0.5f;
    patch.timbre = 0.5f;
    patch.morph = 0.5f;
    patch.engine = 8;
    patch.decay = 0.5f;
    patch.lpg_colour = 0.5f;
  }
};

int ToInternalEngine(int model) {
  if (model >= 1 && model <= 16) return model + 7;
  if (model >= 17 && model <= 24) return model - 17;
  return 8;
}

float Clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

float FrequencyToMidi(float frequency) {
  return 69.0f + 12.0f * std::log2(frequency / 440.0f);
}

}  // namespace

extern "C" {

VoiceState* su_voice_create() {
  return new VoiceState();
}

void su_voice_destroy(VoiceState* state) {
  delete state;
}

void su_voice_set_model(VoiceState* state, int model) {
  if (!state) return;
  state->patch.engine = ToInternalEngine(model);
}

void su_voice_set_frequency(VoiceState* state, float frequency) {
  if (!state || !std::isfinite(frequency) || frequency <= 0.0f) return;
  state->patch.note = FrequencyToMidi(frequency);
}

void su_voice_set_harmo(VoiceState* state, float value) {
  if (state) state->patch.harmonics = Clamp01(value);
}

void su_voice_set_timbre(VoiceState* state, float value) {
  if (state) state->patch.timbre = Clamp01(value);
}

void su_voice_set_morph(VoiceState* state, float value) {
  if (state) state->patch.morph = Clamp01(value);
}


void su_voice_set_v_oct(VoiceState* state, float value) {
  if (!state || !std::isfinite(value)) return;
  // Sonus Umbrae represents V/OCT as logical volts: +1.0 raises the pitch by
  // one octave, -1.0 lowers it by one octave. Plaits expects note modulation
  // in semitones.
  state->modulations.note = value * 12.0f;
}

void su_voice_set_trigger(VoiceState* state, float value, int patched) {
  if (!state) return;
  state->trigger = value;
  state->modulations.trigger_patched = patched != 0;
}

void su_voice_process(VoiceState* state, int size) {
  if (!state) return;
  size = std::max(0, std::min(size, kRenderCapacity));

  int rendered = 0;
  while (rendered < size) {
    const int block_size = std::min<int>(plaits::kBlockSize, size - rendered);
    plaits::Voice::Frame frames[plaits::kBlockSize];
    state->modulations.trigger = state->trigger;
    state->voice.Render(state->patch, state->modulations, frames, block_size);

    for (int i = 0; i < block_size; ++i) {
      state->out[rendered + i] = static_cast<float>(frames[i].out) / 32768.0f;
      state->aux[rendered + i] = static_cast<float>(frames[i].aux) / 32768.0f;
    }
    rendered += block_size;
  }
}

float* su_voice_out(VoiceState* state) {
  return state ? state->out : nullptr;
}

float* su_voice_aux(VoiceState* state) {
  return state ? state->aux : nullptr;
}

}  // extern "C"
