#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

#include "marbles/random/distributions.h"
#include "marbles/random/lag_processor.h"
#include "marbles/random/random_generator.h"
#include "marbles/random/random_sequence.h"
#include "marbles/random/random_stream.h"

namespace {

constexpr int kBlockSize = 128;
constexpr int kChannels = 4;
constexpr float kPi = 3.14159265358979323846f;

inline float clamp01(float v) {
  return std::max(0.0f, std::min(1.0f, v));
}

struct Dices {
  marbles::RandomGenerator random_generator;
  marbles::RandomStream random_stream;
  std::array<marbles::RandomSequence, kChannels> sequence;
  std::array<marbles::LagProcessor, kChannels> lag;

  float sample_rate = 48000.0f;
  float rate_hz = 1.0f;
  float spread = 0.5f;
  float bias = 0.5f;
  float steps = 0.5f;
  float deja = 0.0f;
  int length = 8;
  float diversity = 0.5f;

  float phase_x = 0.0f;
  float phase_y = 0.0f;
  std::array<float, kChannels> previous_phase {0,0,0,0};
  std::array<float, kChannels> target {0,0,0,0};
  std::array<float, kChannels> output {0,0,0,0};
  std::array<std::array<float, kBlockSize>, kChannels> block {};

  void init(float sr) {
    sample_rate = std::max(8000.0f, sr);
    random_generator.Init(0x4d595df4u);
    random_stream.Init(&random_generator);
    for (int i = 0; i < kChannels; ++i) {
      sequence[i].Init(&random_stream);
      lag[i].Init();
      target[i] = 0.0f;
      output[i] = 0.0f;
    }
  }

  float effective(float base, int channel, float amount) const {
    if (channel >= 3) return clamp01(base);
    const float pos = channel == 0 ? -1.0f : (channel == 1 ? 0.0f : 1.0f);
    return clamp01(base + pos * diversity * amount);
  }

  float shape_random(int channel, float u) {
    const float s = effective(spread, channel, 0.22f);
    const float b = effective(bias, channel, 0.18f);

    float degenerate_amount = 1.25f - s * 25.0f;
    float bernoulli_amount = s * 25.0f - 23.75f;
    degenerate_amount = clamp01(degenerate_amount);
    bernoulli_amount = clamp01(bernoulli_amount);

    float value = marbles::BetaDistributionSample(u, s, b);
    const float bernoulli_value = u >= (1.0f - b) ? 0.999999f : 0.0f;
    value += degenerate_amount * (b - value);
    value += bernoulli_amount * (bernoulli_value - value);

    return value * 10.0f - 5.0f;
  }

  float quantize(float value, float step_control) const {
    if (step_control <= 0.5f) return value;
    const float normalized = clamp01((value + 5.0f) * 0.1f);
    const float amount = (step_control - 0.5f) * 2.0f;
    const int levels = 2 + static_cast<int>(std::round(amount * 30.0f));
    const float q = std::round(normalized * static_cast<float>(levels - 1))
      / static_cast<float>(levels - 1);
    return q * 10.0f - 5.0f;
  }

  void new_value(int channel) {
    sequence[channel].set_length(length);
    // Sonus maps deja 0..1 onto the "fresh random -> locked loop" half of
    // Marbles' original bipolar deja-vu control.
    sequence[channel].set_deja_vu(deja * 0.5f);
    const float u = sequence[channel].NextValue(false, 0.0f);
    target[channel] = shape_random(channel, u);
    lag[channel].ResetRamp();
  }

  void process(int frames) {
    frames = std::max(0, std::min(kBlockSize, frames));
    const float x_inc = std::max(0.000001f, rate_hz / sample_rate);
    const float y_inc = x_inc / 16.0f;

    for (int i = 0; i < frames; ++i) {
      phase_x += x_inc;
      phase_y += y_inc;
      bool wrap_x = false;
      bool wrap_y = false;
      if (phase_x >= 1.0f) { phase_x -= std::floor(phase_x); wrap_x = true; }
      if (phase_y >= 1.0f) { phase_y -= std::floor(phase_y); wrap_y = true; }

      if (wrap_x) {
        for (int ch = 0; ch < 3; ++ch) new_value(ch);
      }
      if (wrap_y) new_value(3);

      for (int ch = 0; ch < kChannels; ++ch) {
        const float phase = ch == 3 ? phase_y : phase_x;
        const float step_control = effective(steps, ch, 0.22f);
        float v;
        if (step_control >= 0.5f) {
          v = quantize(target[ch], step_control);
        } else {
          const float smoothness = 1.0f - 2.0f * step_control;
          v = lag[ch].Process(target[ch], smoothness, phase);
        }
        output[ch] = v;
        block[ch][i] = v;
        previous_phase[ch] = phase;
      }
    }
  }
};

}

extern "C" {
void* su_dices_create() {
  Dices* d = new Dices();
  d->init(48000.0f);
  return d;
}
void su_dices_destroy(void* ptr) { delete static_cast<Dices*>(ptr); }
void su_dices_set_sample_rate(void* ptr, float v) { static_cast<Dices*>(ptr)->init(v); }
void su_dices_set_rate(void* ptr, float v) { static_cast<Dices*>(ptr)->rate_hz = std::max(0.001f, std::min(1000.0f, v)); }
void su_dices_set_spread(void* ptr, float v) { static_cast<Dices*>(ptr)->spread = clamp01(v); }
void su_dices_set_bias(void* ptr, float v) { static_cast<Dices*>(ptr)->bias = clamp01(v); }
void su_dices_set_steps(void* ptr, float v) { static_cast<Dices*>(ptr)->steps = clamp01(v); }
void su_dices_set_deja(void* ptr, float v) { static_cast<Dices*>(ptr)->deja = clamp01(v); }
void su_dices_set_length(void* ptr, float v) { static_cast<Dices*>(ptr)->length = std::max(1, std::min(16, static_cast<int>(std::round(v)))); }
void su_dices_set_diversity(void* ptr, float v) { static_cast<Dices*>(ptr)->diversity = clamp01(v); }
void su_dices_process(void* ptr, int frames) { static_cast<Dices*>(ptr)->process(frames); }
float* su_dices_x1(void* ptr) { return static_cast<Dices*>(ptr)->block[0].data(); }
float* su_dices_x2(void* ptr) { return static_cast<Dices*>(ptr)->block[1].data(); }
float* su_dices_x3(void* ptr) { return static_cast<Dices*>(ptr)->block[2].data(); }
float* su_dices_y(void* ptr) { return static_cast<Dices*>(ptr)->block[3].data(); }
}
