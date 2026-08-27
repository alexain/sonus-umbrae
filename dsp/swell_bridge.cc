#include <algorithm>
#include <cmath>
#include <cstdint>

#include "stmlib/utils/gate_flags.h"
#include "tides2/poly_slope_generator.h"
#include "tides2/ramp/ramp_extractor.h"

namespace {

constexpr int kRenderCapacity = 128;

float Clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

struct SwellState {
  tides::PolySlopeGenerator generator;
  tides::RampExtractor ramp_extractor;
  float sample_rate = 48000.0f;
  float frequency = 0.25f;
  float slope = 0.5f;
  float shape = 0.5f;
  float smooth = 0.5f;
  float shift = 0.5f;
  float v_oct = 0.0f;
  tides::RampMode mode = tides::RAMP_MODE_LOOPING;
  tides::OutputMode output_mode = tides::OUTPUT_MODE_SLOPE_PHASE;
  tides::Range range = tides::RANGE_CONTROL;
  bool trigger_patched = false;
  bool clock_patched = false;
  stmlib::GateFlags previous_trigger = stmlib::GATE_FLAG_LOW;
  stmlib::GateFlags previous_clock = stmlib::GATE_FLAG_LOW;
  float trigger[kRenderCapacity];
  float clock[kRenderCapacity];
  float v_oct_input[kRenderCapacity];
  float output[4][kRenderCapacity];

  SwellState() {
    generator.Init();
    generator.Reset();
    ramp_extractor.Init(sample_rate, 40.0f / sample_rate);
    std::fill(trigger, trigger + kRenderCapacity, 0.0f);
    std::fill(clock, clock + kRenderCapacity, 0.0f);
    std::fill(v_oct_input, v_oct_input + kRenderCapacity, 0.0f);
    for (auto& channel : output) std::fill(channel, channel + kRenderCapacity, 0.0f);
  }
};

}  // namespace

extern "C" {

SwellState* su_swell_create() {
  return new SwellState();
}

void su_swell_destroy(SwellState* state) {
  delete state;
}

void su_swell_set_sample_rate(SwellState* state, float value) {
  if (state && std::isfinite(value) && value > 1000.0f) {
    state->sample_rate = value;
    state->ramp_extractor.Init(value, 40.0f / value);
  }
}

void su_swell_set_frequency(SwellState* state, float value) {
  if (state && std::isfinite(value) && value > 0.0f) state->frequency = value;
}

void su_swell_set_slope(SwellState* state, float value) {
  if (state) state->slope = Clamp01(value);
}

void su_swell_set_shape(SwellState* state, float value) {
  if (state) state->shape = Clamp01(value);
}

void su_swell_set_smooth(SwellState* state, float value) {
  if (state) state->smooth = Clamp01(value);
}

void su_swell_set_shift(SwellState* state, float value) {
  if (state) state->shift = Clamp01(value);
}

void su_swell_set_mode(SwellState* state, int value) {
  if (!state) return;
  if (value == 0) state->mode = tides::RAMP_MODE_AD;
  else if (value == 2) state->mode = tides::RAMP_MODE_AR;
  else state->mode = tides::RAMP_MODE_LOOPING;
  state->generator.Reset();
}

void su_swell_set_output_mode(SwellState* state, int value) {
  if (!state) return;
  if (value == 0) state->output_mode = tides::OUTPUT_MODE_GATES;
  else if (value == 1) state->output_mode = tides::OUTPUT_MODE_AMPLITUDE;
  else if (value == 3) state->output_mode = tides::OUTPUT_MODE_FREQUENCY;
  else state->output_mode = tides::OUTPUT_MODE_SLOPE_PHASE;
  state->generator.Reset();
}

void su_swell_set_range(SwellState* state, int value) {
  if (!state) return;
  state->range = value == 1 ? tides::RANGE_AUDIO : tides::RANGE_CONTROL;
  state->generator.Reset();
}

void su_swell_set_trigger_patched(SwellState* state, int patched) {
  if (state) state->trigger_patched = patched != 0;
}

void su_swell_set_clock_patched(SwellState* state, int patched) {
  if (!state) return;
  const bool next = patched != 0;
  if (next && !state->clock_patched) state->ramp_extractor.Reset();
  state->clock_patched = next;
}

float* su_swell_trigger(SwellState* state) { return state ? state->trigger : nullptr; }
float* su_swell_clock(SwellState* state) { return state ? state->clock : nullptr; }
float* su_swell_v_oct(SwellState* state) { return state ? state->v_oct_input : nullptr; }

void su_swell_process(SwellState* state, int size) {
  if (!state) return;
  size = std::max(0, std::min(size, kRenderCapacity));

  tides::PolySlopeGenerator::OutputSample frames[kRenderCapacity];
  stmlib::GateFlags trigger_flags[kRenderCapacity];
  stmlib::GateFlags clock_flags[kRenderCapacity];
  float ramp[kRenderCapacity];

  float v_oct_sum = 0.0f;
  for (int i = 0; i < size; ++i) {
    const bool trigger_high = state->trigger_patched && state->trigger[i] > 0.1f;
    const bool clock_high = state->clock_patched && state->clock[i] > 0.1f;
    trigger_flags[i] = stmlib::ExtractGateFlags(state->previous_trigger, trigger_high);
    clock_flags[i] = stmlib::ExtractGateFlags(state->previous_clock, clock_high);
    state->previous_trigger = trigger_flags[i];
    state->previous_clock = clock_flags[i];
    v_oct_sum += state->v_oct_input[i];
  }

  const float v_oct = size > 0 ? v_oct_sum / static_cast<float>(size) : 0.0f;
  const float free_frequency_hz = state->frequency * std::pow(2.0f, v_oct);
  float normalized_frequency = std::min(0.249f, free_frequency_hz / state->sample_rate);
  const float* external_ramp = nullptr;

  if (state->clock_patched) {
    tides::Ratio ratio;
    ratio.ratio = 1.0f;
    ratio.q = 1;
    normalized_frequency = state->ramp_extractor.Process(
        state->range == tides::RANGE_AUDIO,
        state->range == tides::RANGE_AUDIO && state->mode == tides::RAMP_MODE_AR,
        ratio,
        clock_flags,
        ramp,
        size);
    if (!state->trigger_patched) external_ramp = ramp;
  }

  state->generator.Render(
      state->mode,
      state->output_mode,
      state->range,
      normalized_frequency,
      state->slope,
      state->shape,
      state->smooth,
      state->shift,
      state->trigger_patched ? trigger_flags : clock_flags,
      external_ramp,
      frames,
      size);

  for (int i = 0; i < size; ++i) {
    for (int channel = 0; channel < 4; ++channel) {
      // Preserve Tides' Eurorack-like logical voltage range. Destinations such
      // as Voice parameter CV inputs apply their own ±5V normalization.
      state->output[channel][i] = frames[i].channel[channel];
    }
  }
}

float* su_swell_out1(SwellState* state) { return state ? state->output[0] : nullptr; }
float* su_swell_out2(SwellState* state) { return state ? state->output[1] : nullptr; }
float* su_swell_out3(SwellState* state) { return state ? state->output[2] : nullptr; }
float* su_swell_out4(SwellState* state) { return state ? state->output[3] : nullptr; }

}  // extern "C"
