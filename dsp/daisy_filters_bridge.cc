/*
 * Sonus Umbrae DaisySP filter backend.
 *
 * Uses the MIT-licensed DaisySP State Variable Filter by Electrosmith.
 * The public Sonus DSL exposes this as FILTER ... MODEL svf.
 */

#include <algorithm>
#include <cstddef>
#include "Filters/svf.h"

namespace {
constexpr int kMaxBlockSize = 128;

struct DaisyFiltersState {
  daisysp::Svf svf;
  float sample_rate = 48000.0f;
  float input[kMaxBlockSize]{};
  float low[kMaxBlockSize]{};
  float high[kMaxBlockSize]{};
  float band[kMaxBlockSize]{};
  float notch[kMaxBlockSize]{};
  float peak[kMaxBlockSize]{};

  void Init(float sr) {
    sample_rate = std::max(8000.0f, sr);
    svf.Init(sample_rate);
    svf.SetFreq(1000.0f);
    svf.SetRes(0.0f);
    svf.SetDrive(0.0f);
  }
};
}

extern "C" {

DaisyFiltersState* su_daisy_filters_create() {
  auto* state = new DaisyFiltersState();
  state->Init(48000.0f);
  return state;
}

void su_daisy_filters_destroy(DaisyFiltersState* state) { delete state; }

void su_daisy_filters_set_sample_rate(DaisyFiltersState* state, float sample_rate) {
  if (state) state->Init(sample_rate);
}

void su_daisy_filters_set_cutoff(DaisyFiltersState* state, float hz) {
  if (!state) return;
  const float max_hz = state->sample_rate / 3.0f;
  state->svf.SetFreq(std::clamp(hz, 1.0f, max_hz));
}

void su_daisy_filters_set_resonance(DaisyFiltersState* state, float resonance) {
  if (state) state->svf.SetRes(std::clamp(resonance, 0.0f, 1.0f));
}

void su_daisy_filters_set_drive(DaisyFiltersState* state, float drive) {
  if (!state) return;
  // DaisySP Svf::SetDrive expects a useful range of 0..10 internally.
  state->svf.SetDrive(std::clamp(drive, 0.0f, 1.0f) * 10.0f);
}

float* su_daisy_filters_in(DaisyFiltersState* state) { return state ? state->input : nullptr; }
float* su_daisy_filters_low(DaisyFiltersState* state) { return state ? state->low : nullptr; }
float* su_daisy_filters_high(DaisyFiltersState* state) { return state ? state->high : nullptr; }
float* su_daisy_filters_band(DaisyFiltersState* state) { return state ? state->band : nullptr; }
float* su_daisy_filters_notch(DaisyFiltersState* state) { return state ? state->notch : nullptr; }
float* su_daisy_filters_peak(DaisyFiltersState* state) { return state ? state->peak : nullptr; }

void su_daisy_filters_process(DaisyFiltersState* state, int size) {
  if (!state) return;
  const int frames = std::clamp(size, 0, kMaxBlockSize);
  for (int i = 0; i < frames; ++i) {
    state->svf.Process(state->input[i]);
    state->low[i] = state->svf.Low();
    state->high[i] = state->svf.High();
    state->band[i] = state->svf.Band();
    state->notch[i] = state->svf.Notch();
    state->peak[i] = state->svf.Peak();
  }
}

}
