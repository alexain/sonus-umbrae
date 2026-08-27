#include <algorithm>
#include <cmath>
#include <cstdint>

#include "marbles/random/random_generator.h"
#include "marbles/random/random_stream.h"
#include "marbles/random/t_generator.h"
#include "marbles/random/x_y_generator.h"
#include "marbles/random/quantizer.h"
#include "stmlib/dsp/dsp.h"

namespace {

constexpr int kCapacity = 128;

void InitScale(marbles::Scale* scale, const int* notes, int count) {
  scale->base_interval = 1.0f;
  scale->num_degrees = 12;
  for (int i = 0; i < 12; ++i) {
    bool active = false;
    for (int j = 0; j < count; ++j) {
      if (notes[j] == i) {
        active = true;
        break;
      }
    }
    scale->degree[i].voltage = static_cast<float>(i) / 12.0f;
    scale->degree[i].weight = active ? 255 : 4;
  }
}

struct DicesState {
  marbles::RandomGenerator random_generator;
  marbles::RandomStream random_stream;
  marbles::TGenerator t_generator;
  marbles::XYGenerator xy_generator;

  float sample_rate = 48000.0f;
  float rate = 0.5f;
  float jitter = 0.0f;
  float gate_bias = 0.5f;
  float gate_length = 0.45f;
  float gate_jitter = 0.0f;
  float spread = 0.5f;
  float bias = 0.5f;
  float steps = 0.75f;
  float deja_vu = 0.0f;
  int length = 8;
  int scale = 0;
  bool clock_patched = false;
  stmlib::GateFlags previous_clock = stmlib::GATE_FLAG_LOW;

  float clock[kCapacity];
  float ramp_buffer[kCapacity * 4];
  bool t_gates[kCapacity * 2];
  float voltages[kCapacity * 4];

  float output[7][kCapacity];

  DicesState() {
    random_generator.Init(0x6581u);
    random_stream.Init(&random_generator);
    t_generator.Init(&random_stream, sample_rate);
    xy_generator.Init(&random_stream, sample_rate);

    marbles::Scale scales[6];
    scales[0].InitMajor();

    const int minor[] = {0, 2, 3, 5, 7, 8, 10};
    const int pentatonic[] = {0, 2, 4, 7, 9};
    const int chromatic[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
    const int dorian[] = {0, 2, 3, 5, 7, 9, 10};
    const int fifths[] = {0, 7};

    InitScale(&scales[1], minor, 7);
    InitScale(&scales[2], pentatonic, 5);
    InitScale(&scales[3], chromatic, 12);
    InitScale(&scales[4], dorian, 7);
    InitScale(&scales[5], fifths, 2);

    for (int i = 0; i < 6; ++i) xy_generator.LoadScale(i, scales[i]);

    std::fill(clock, clock + kCapacity, 0.0f);
    std::fill(ramp_buffer, ramp_buffer + kCapacity * 4, 0.0f);
    std::fill(t_gates, t_gates + kCapacity * 2, false);
    std::fill(voltages, voltages + kCapacity * 4, 0.0f);
    for (auto& channel : output) std::fill(channel, channel + kCapacity, 0.0f);
  }
};

}  // namespace

extern "C" {

DicesState* su_dices_create() {
  return new DicesState();
}

void su_dices_destroy(DicesState* state) {
  delete state;
}

void su_dices_set_sample_rate(DicesState* state, float sample_rate) {
  if (!state || !std::isfinite(sample_rate) || sample_rate < 1000.0f) return;
  if (std::fabs(state->sample_rate - sample_rate) < 1.0f) return;

  state->sample_rate = sample_rate;
  state->random_generator.Init(0x6581u);
  state->random_stream.Init(&state->random_generator);
  state->t_generator.Init(&state->random_stream, sample_rate);
  state->xy_generator.Init(&state->random_stream, sample_rate);

  marbles::Scale scales[6];
  scales[0].InitMajor();
  const int minor[] = {0, 2, 3, 5, 7, 8, 10};
  const int pentatonic[] = {0, 2, 4, 7, 9};
  const int chromatic[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
  const int dorian[] = {0, 2, 3, 5, 7, 9, 10};
  const int fifths[] = {0, 7};
  InitScale(&scales[1], minor, 7);
  InitScale(&scales[2], pentatonic, 5);
  InitScale(&scales[3], chromatic, 12);
  InitScale(&scales[4], dorian, 7);
  InitScale(&scales[5], fifths, 2);
  for (int i = 0; i < 6; ++i) state->xy_generator.LoadScale(i, scales[i]);
}

void su_dices_set_rate(DicesState* state, float value) {
  if (state) state->rate = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_jitter(DicesState* state, float value) {
  if (state) state->jitter = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_gate_bias(DicesState* state, float value) {
  if (state) state->gate_bias = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_gate_length(DicesState* state, float value) {
  if (state) state->gate_length = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_gate_jitter(DicesState* state, float value) {
  if (state) state->gate_jitter = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_spread(DicesState* state, float value) {
  if (state) state->spread = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_bias(DicesState* state, float value) {
  if (state) state->bias = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_steps(DicesState* state, float value) {
  if (state) state->steps = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_deja(DicesState* state, float value) {
  if (state) state->deja_vu = std::clamp(value, 0.0f, 1.0f);
}
void su_dices_set_length(DicesState* state, int value) {
  if (state) state->length = std::clamp(value, 1, 16);
}
void su_dices_set_scale(DicesState* state, int value) {
  if (state) state->scale = std::clamp(value, 0, 5);
}
void su_dices_set_clock_patched(DicesState* state, int patched) {
  if (state) state->clock_patched = patched != 0;
}

float* su_dices_clock(DicesState* state) { return state ? state->clock : nullptr; }

void su_dices_process(DicesState* state, int size) {
  if (!state) return;
  size = std::clamp(size, 0, kCapacity);

  stmlib::GateFlags clock_flags[kCapacity];
  for (int i = 0; i < size; ++i) {
    const bool high = state->clock_patched && state->clock[i] > 0.1f;
    clock_flags[i] = stmlib::ExtractGateFlags(state->previous_clock, high);
    state->previous_clock = clock_flags[i];
  }

  marbles::Ramps ramps;
  ramps.master = &state->ramp_buffer[0];
  ramps.external = &state->ramp_buffer[kCapacity];
  ramps.slave[0] = &state->ramp_buffer[kCapacity * 2];
  ramps.slave[1] = &state->ramp_buffer[kCapacity * 3];

  state->t_generator.set_model(marbles::T_GENERATOR_MODEL_COMPLEMENTARY_BERNOULLI);
  state->t_generator.set_range(marbles::T_GENERATOR_RANGE_1X);
  state->t_generator.set_rate(state->rate);
  state->t_generator.set_bias(state->gate_bias);
  state->t_generator.set_jitter(state->jitter);
  state->t_generator.set_deja_vu(state->deja_vu);
  state->t_generator.set_length(state->length);
  state->t_generator.set_pulse_width_mean(state->gate_length);
  state->t_generator.set_pulse_width_std(state->gate_jitter);

  bool reset = false;
  state->t_generator.Process(
      state->clock_patched,
      &reset,
      clock_flags,
      ramps,
      state->t_gates,
      size);

  marbles::GroupSettings x;
  x.control_mode = marbles::CONTROL_MODE_IDENTICAL;
  x.voltage_range = marbles::VOLTAGE_RANGE_NARROW;
  x.register_mode = false;
  x.register_value = 0.0f;
  x.spread = state->spread;
  x.bias = state->bias;
  x.steps = state->steps;
  x.deja_vu = state->deja_vu;
  x.scale_index = state->scale;
  x.length = state->length;
  x.ratio.p = 1;
  x.ratio.q = 1;

  marbles::GroupSettings y = x;
  y.voltage_range = marbles::VOLTAGE_RANGE_FULL;
  y.spread = 0.75f;
  y.bias = 0.5f;
  y.steps = 0.25f;
  y.deja_vu = 0.0f;
  y.length = 1;
  y.ratio.p = 1;
  y.ratio.q = 16;

  state->xy_generator.Process(
      state->clock_patched
          ? marbles::CLOCK_SOURCE_EXTERNAL
          : marbles::CLOCK_SOURCE_INTERNAL_T1_T2_T3,
      x,
      y,
      &reset,
      clock_flags,
      ramps,
      state->voltages,
      size);

  const bool* gates = state->t_gates;
  const float* volts = state->voltages;
  for (int i = 0; i < size; ++i) {
    state->output[0][i] = *gates++ ? 1.0f : 0.0f;  // T1
    state->output[1][i] = ramps.master[i] < 0.5f ? 1.0f : 0.0f;  // T2
    state->output[2][i] = *gates++ ? 1.0f : 0.0f;  // T3

    state->output[3][i] = *volts++;  // X1, in logical volts
    state->output[4][i] = *volts++;  // X2
    state->output[5][i] = *volts++;  // X3
    state->output[6][i] = *volts++;  // Y
  }
}

float* su_dices_t1(DicesState* state) { return state ? state->output[0] : nullptr; }
float* su_dices_t2(DicesState* state) { return state ? state->output[1] : nullptr; }
float* su_dices_t3(DicesState* state) { return state ? state->output[2] : nullptr; }
float* su_dices_x1(DicesState* state) { return state ? state->output[3] : nullptr; }
float* su_dices_x2(DicesState* state) { return state ? state->output[4] : nullptr; }
float* su_dices_x3(DicesState* state) { return state ? state->output[5] : nullptr; }
float* su_dices_y(DicesState* state) { return state ? state->output[6] : nullptr; }

}  // extern "C"
