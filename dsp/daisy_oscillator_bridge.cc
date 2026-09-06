/*
 * Sonus Umbrae DaisySP basic oscillator backend.
 *
 * Uses the MIT-licensed DaisySP Oscillator by Electrosmith. The public Sonus
 * DSL exposes these as VOICE sound sine/triangle/sawtooth/ramp/square.
 */

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>

#include "Synthesis/oscillator.h"

namespace {
constexpr int kMaxBlockSize = 128;

enum Waveform : int {
  kSine = 0,
  kTriangle = 1,
  kSawtooth = 2,
  kRamp = 3,
  kSquare = 4,
};

struct DaisyOscillatorState {
  daisysp::Oscillator oscillator;
  float sample_rate = 48000.0f;
  float frequency = 440.0f;
  float width = 0.5f;
  int waveform = kSine;
  float output[kMaxBlockSize]{};

  void Init(float sr) {
    sample_rate = std::max(8000.0f, sr);
    oscillator.Init(sample_rate);
    oscillator.SetAmp(1.0f);
    ApplyWaveform();
    oscillator.SetFreq(frequency);
    oscillator.SetPw(width);
  }

  void ApplyWaveform() {
    uint8_t daisy_waveform = daisysp::Oscillator::WAVE_SIN;
    switch (waveform) {
      case kTriangle: daisy_waveform = daisysp::Oscillator::WAVE_POLYBLEP_TRI; break;
      case kSawtooth: daisy_waveform = daisysp::Oscillator::WAVE_POLYBLEP_SAW; break;
      case kRamp: daisy_waveform = daisysp::Oscillator::WAVE_RAMP; break;
      case kSquare: daisy_waveform = daisysp::Oscillator::WAVE_POLYBLEP_SQUARE; break;
      case kSine:
      default: daisy_waveform = daisysp::Oscillator::WAVE_SIN; break;
    }
    oscillator.SetWaveform(daisy_waveform);
  }
};
}

extern "C" {

DaisyOscillatorState* su_daisy_oscillator_create() {
  auto* state = new DaisyOscillatorState();
  state->Init(48000.0f);
  return state;
}

void su_daisy_oscillator_destroy(DaisyOscillatorState* state) { delete state; }

void su_daisy_oscillator_set_sample_rate(DaisyOscillatorState* state, float sample_rate) {
  if (state) state->Init(sample_rate);
}

void su_daisy_oscillator_set_waveform(DaisyOscillatorState* state, int waveform) {
  if (!state) return;
  state->waveform = std::clamp(waveform, static_cast<int>(kSine), static_cast<int>(kSquare));
  state->ApplyWaveform();
}

void su_daisy_oscillator_set_frequency(DaisyOscillatorState* state, float frequency) {
  if (!state || !std::isfinite(frequency) || frequency <= 0.0f) return;
  const float max_frequency = state->sample_rate * 0.45f;
  state->frequency = std::clamp(frequency, 1.0f, max_frequency);
  state->oscillator.SetFreq(state->frequency);
}

void su_daisy_oscillator_set_width(DaisyOscillatorState* state, float width) {
  if (!state || !std::isfinite(width)) return;
  state->width = std::clamp(width, 0.0f, 1.0f);
  state->oscillator.SetPw(state->width);
}

float* su_daisy_oscillator_out(DaisyOscillatorState* state) {
  return state ? state->output : nullptr;
}

void su_daisy_oscillator_process(DaisyOscillatorState* state, int size) {
  if (!state) return;
  const int frames = std::clamp(size, 0, kMaxBlockSize);
  for (int i = 0; i < frames; ++i) state->output[i] = state->oscillator.Process();
}

}
