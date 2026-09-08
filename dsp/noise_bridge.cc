/*
 * Sonus Umbrae DaisySP noise backend.
 *
 * Shared by VOICE sound noise.* and MOD model noise.*. Models are selected at
 * runtime so one WASM/worklet pair covers white, dust, clocked and fractal
 * noise without duplicating the audio backend.
 */

#include <algorithm>
#include <cstddef>

#include "Noise/clockednoise.h"
#include "Noise/dust.h"
#include "Noise/fractal_noise.h"
#include "Noise/whitenoise.h"

namespace {
constexpr int kMaxBlockSize = 128;

enum class NoiseModel : int {
  White = 0,
  Dust = 1,
  Clocked = 2,
  Fractal = 3,
};

using FractalNoise = daisysp::FractalRandomGenerator<daisysp::ClockedNoise, 5>;

struct NoiseState {
  daisysp::WhiteNoise white;
  daisysp::Dust dust;
  daisysp::ClockedNoise clocked;
  FractalNoise fractal;
  NoiseModel model = NoiseModel::White;
  float frequency = 440.0f;
  float density = 0.5f;
  float output[kMaxBlockSize]{};

  explicit NoiseState(float sample_rate) {
    const float sr = sample_rate > 1.0f ? sample_rate : 48000.0f;
    white.Init();
    white.SetAmp(1.0f);
    dust.Init();
    dust.SetDensity(density);
    clocked.Init(sr);
    clocked.SetFreq(frequency);
    fractal.Init(sr);
    fractal.SetFreq(frequency);
    fractal.SetColor(0.5f);
  }

  void SetFrequency(float hz) {
    // PITCH/RATE has a defined DSP meaning only for clocked noise. White,
    // Dust and Fractal remain independent from VOICE pitch / MOD rate.
    frequency = std::clamp(hz, 0.001f, 20000.0f);
    clocked.SetFreq(frequency);
  }

  void SetDensity(float value) {
    density = std::clamp(value, 0.0f, 1.0f);
    dust.SetDensity(density);
  }

  float Process() {
    switch (model) {
      case NoiseModel::Dust: return dust.Process();
      case NoiseModel::Clocked: return clocked.Process();
      case NoiseModel::Fractal: return std::clamp(fractal.Process(), -1.0f, 1.0f);
      case NoiseModel::White:
      default: return white.Process();
    }
  }
};
}

extern "C" {

NoiseState* su_noise_create(float sample_rate) { return new NoiseState(sample_rate); }
void su_noise_destroy(NoiseState* state) { delete state; }

void su_noise_set_model(NoiseState* state, int model) {
  if (!state) return;
  state->model = static_cast<NoiseModel>(std::clamp(model, 0, 3));
}

void su_noise_set_frequency(NoiseState* state, float frequency) {
  if (state) state->SetFrequency(frequency);
}

void su_noise_set_density(NoiseState* state, float density) {
  if (state) state->SetDensity(density);
}

float* su_noise_out(NoiseState* state) {
  return state ? state->output : nullptr;
}

void su_noise_process(NoiseState* state, int size) {
  if (!state) return;
  const int frames = std::clamp(size, 0, kMaxBlockSize);
  for (int i = 0; i < frames; ++i) state->output[i] = state->Process();
}

}
