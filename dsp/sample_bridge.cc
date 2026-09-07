#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>

namespace {
constexpr int kMaxFrames = 128;

struct SampleState {
  float sample_rate = 48000.0f;
  float source_rate = 48000.0f;
  float* left = nullptr;
  float* right = nullptr;
  int frames = 0;
  double position = 0.0;
  float start = 0.0f;
  float end = 1.0f;
  float level = 1.0f;
  float frequency = 130.8127826502993f;
  float root_frequency = 130.8127826502993f;
  bool loop = false;
  bool reverse = false;
  bool active = false;
  bool stopping = false;
  int transition_frames = 0;
  int transition_remaining = 0;
  int stop_frames = 0;
  int stop_remaining = 0;
  float transition_from_l = 0.0f;
  float transition_from_r = 0.0f;
  float last_out_l = 0.0f;
  float last_out_r = 0.0f;
  float out_l[kMaxFrames]{};
  float out_r[kMaxFrames]{};
};

float clampf(float v, float lo, float hi) { return std::max(lo, std::min(hi, v)); }

float sample_at(const float* data, int frames, double position) {
  if (!data || frames <= 0) return 0.0f;
  if (position <= 0.0) return data[0];
  if (position >= frames - 1) return data[frames - 1];
  const int index = static_cast<int>(position);
  const int next = std::min(index + 1, frames - 1);
  const float frac = static_cast<float>(position - index);
  return data[index] + (data[next] - data[index]) * frac;
}

int anti_click_frames(const SampleState* state, double rate, double first, double last) {
  if (!state || state->sample_rate <= 0.0f) return 1;
  const int base = std::max(1, static_cast<int>(std::lround(state->sample_rate * 0.003)));
  const double abs_rate = std::abs(rate);
  if (abs_rate <= 0.0) return base;
  const double region_output_frames = std::max(1.0, (last - first) / abs_rate);
  const int region_limit = std::max(1, static_cast<int>(std::floor(region_output_frames * 0.25)));
  return std::min(base, region_limit);
}

float ramp_up_gain(int remaining, int total) {
  if (remaining <= 0 || total <= 1) return 1.0f;
  return 1.0f - static_cast<float>(remaining - 1) / static_cast<float>(total - 1);
}

float ramp_down_gain(int remaining, int total) {
  if (remaining <= 0) return 0.0f;
  if (total <= 1) return 0.0f;
  return static_cast<float>(remaining - 1) / static_cast<float>(total - 1);
}
}

extern "C" {
SampleState* su_sample_create() { return new SampleState(); }

void su_sample_destroy(SampleState* state) {
  if (!state) return;
  std::free(state->left);
  std::free(state->right);
  delete state;
}

void su_sample_set_sample_rate(SampleState* state, float rate) {
  if (state && std::isfinite(rate) && rate > 0.0f) state->sample_rate = rate;
}

int su_sample_load(SampleState* state, const float* left, const float* right, int frames, float source_rate) {
  if (!state || !left || frames <= 0 || !std::isfinite(source_rate) || source_rate <= 0.0f) return 0;
  auto* new_left = static_cast<float*>(std::malloc(sizeof(float) * frames));
  auto* new_right = static_cast<float*>(std::malloc(sizeof(float) * frames));
  if (!new_left || !new_right) {
    std::free(new_left);
    std::free(new_right);
    return 0;
  }
  std::memcpy(new_left, left, sizeof(float) * frames);
  std::memcpy(new_right, right ? right : left, sizeof(float) * frames);
  std::free(state->left);
  std::free(state->right);
  state->left = new_left;
  state->right = new_right;
  state->frames = frames;
  state->source_rate = source_rate;
  state->active = false;
  state->stopping = false;
  state->position = 0.0;
  state->transition_remaining = 0;
  state->stop_remaining = 0;
  state->last_out_l = 0.0f;
  state->last_out_r = 0.0f;
  return 1;
}

void su_sample_set_params(
  SampleState* state,
  float start,
  float end,
  int loop,
  int reverse,
  float level,
  float frequency,
  float root_frequency
) {
  if (!state) return;
  state->start = clampf(start, 0.0f, 1.0f);
  state->end = clampf(end, 0.0f, 1.0f);
  if (state->end < state->start) std::swap(state->start, state->end);
  state->loop = loop != 0;
  state->reverse = reverse != 0;
  state->level = clampf(level, 0.0f, 2.0f);
  if (std::isfinite(frequency) && frequency > 0.0f) state->frequency = frequency;
  if (std::isfinite(root_frequency) && root_frequency > 0.0f) state->root_frequency = root_frequency;
}

void su_sample_trigger(SampleState* state) {
  if (!state || state->frames <= 0) return;
  const double first = state->start * static_cast<double>(state->frames - 1);
  const double last = state->end * static_cast<double>(state->frames - 1);
  const double pitch_ratio = state->root_frequency > 0.0f
    ? static_cast<double>(state->frequency) / static_cast<double>(state->root_frequency)
    : 1.0;
  const double rate = (state->source_rate / state->sample_rate) * pitch_ratio;
  const int fade_frames = anti_click_frames(state, rate, first, last);

  state->transition_from_l = state->last_out_l;
  state->transition_from_r = state->last_out_r;
  state->transition_frames = fade_frames;
  state->transition_remaining = fade_frames;
  state->stop_frames = fade_frames;
  state->stop_remaining = 0;
  state->stopping = false;
  state->position = state->reverse ? last : first;
  state->active = true;
}

void su_sample_stop(SampleState* state) {
  if (!state || !state->active || state->stopping) return;
  state->stopping = true;
  state->stop_remaining = std::max(1, state->stop_frames);
}

void su_sample_process(SampleState* state, int frames) {
  if (!state) return;
  frames = std::max(0, std::min(frames, kMaxFrames));
  std::fill(state->out_l, state->out_l + frames, 0.0f);
  std::fill(state->out_r, state->out_r + frames, 0.0f);
  if (!state->active || state->frames <= 0) return;

  const double first = state->start * static_cast<double>(state->frames - 1);
  const double last = state->end * static_cast<double>(state->frames - 1);
  const double pitch_ratio = state->root_frequency > 0.0f
    ? static_cast<double>(state->frequency) / static_cast<double>(state->root_frequency)
    : 1.0;
  const double rate = (state->source_rate / state->sample_rate) * pitch_ratio;
  const double step = state->reverse ? -rate : rate;

  const int fade_frames = anti_click_frames(state, rate, first, last);

  for (int i = 0; i < frames; ++i) {
    const bool crossed = !state->reverse ? state->position > last : state->position < first;
    if (crossed) {
      if (!state->loop || state->stopping) {
        state->active = false;
        state->stopping = false;
        state->last_out_l = 0.0f;
        state->last_out_r = 0.0f;
        break;
      }
      state->position = state->reverse ? last : first;
      state->transition_from_l = 0.0f;
      state->transition_from_r = 0.0f;
      state->transition_frames = fade_frames;
      state->transition_remaining = fade_frames;
    }

    float left = sample_at(state->left, state->frames, state->position) * state->level;
    float right = sample_at(state->right, state->frames, state->position) * state->level;

    if (state->transition_remaining > 0) {
      const float gain = ramp_up_gain(state->transition_remaining, state->transition_frames);
      left = state->transition_from_l + (left - state->transition_from_l) * gain;
      right = state->transition_from_r + (right - state->transition_from_r) * gain;
      --state->transition_remaining;
    }

    const double remaining_source_frames = !state->reverse
      ? std::max(0.0, last - state->position)
      : std::max(0.0, state->position - first);
    const double remaining_output_frames = std::abs(rate) > 0.0
      ? remaining_source_frames / std::abs(rate)
      : static_cast<double>(fade_frames);
    if (remaining_output_frames < fade_frames) {
      const float edge_gain = clampf(
        static_cast<float>(remaining_output_frames / static_cast<double>(fade_frames)),
        0.0f,
        1.0f
      );
      left *= edge_gain;
      right *= edge_gain;
    }

    if (state->stopping) {
      const float stop_gain = ramp_down_gain(state->stop_remaining, state->stop_frames);
      left *= stop_gain;
      right *= stop_gain;
      if (state->stop_remaining > 0) --state->stop_remaining;
      if (state->stop_remaining <= 0) {
        state->active = false;
        state->stopping = false;
      }
    }

    state->out_l[i] = left;
    state->out_r[i] = right;
    state->last_out_l = left;
    state->last_out_r = right;
    state->position += step;

    if (!state->active) {
      state->last_out_l = 0.0f;
      state->last_out_r = 0.0f;
      break;
    }
  }
}

float* su_sample_out_l(SampleState* state) { return state ? state->out_l : nullptr; }
float* su_sample_out_r(SampleState* state) { return state ? state->out_r : nullptr; }

float su_sample_position(SampleState* state) {
  if (!state || state->frames <= 1) return 0.0f;
  return clampf(static_cast<float>(state->position / static_cast<double>(state->frames - 1)), 0.0f, 1.0f);
}

int su_sample_active(SampleState* state) { return state && state->active ? 1 : 0; }
}
