#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

#include "supercell/dsp/frame.h"
#include "supercell/dsp/granular_processor.h"

namespace {

constexpr int kHostCapacity = 128;
constexpr int kNativeCapacity = 96;
constexpr int kCloudsBlock = 32;
constexpr size_t kLargeBufferSize = 118784;
constexpr size_t kSmallBufferSize = 65536 - 128;
constexpr float kCloudsSampleRate = 32000.0f;

clouds::GranularProcessor processor;
uint8_t large_buffer[kLargeBufferSize];
uint8_t small_buffer[kSmallBufferSize];

float host_in_l[kHostCapacity];
float host_in_r[kHostCapacity];
float host_trig[kHostCapacity];
float host_out_l[kHostCapacity];
float host_out_r[kHostCapacity];

clouds::ShortFrame native_in[kNativeCapacity];
clouds::ShortFrame native_out[kNativeCapacity];

float host_sample_rate = 48000.0f;
float host_mix = 0.5f;
int playback_mode = 0;
bool initialized = false;
bool previous_trigger = false;

inline int16_t FloatToShort(float value) {
  value = std::clamp(value, -1.0f, 1.0f);
  return static_cast<int16_t>(std::lrint(value * 32767.0f));
}

inline float ShortToFloat(int16_t value) {
  return static_cast<float>(value) / 32768.0f;
}

clouds::PlaybackMode ModeFromInt(int mode) {
  switch (mode) {
    case 0: return clouds::PLAYBACK_MODE_GRANULAR;
    case 1: return clouds::PLAYBACK_MODE_STRETCH;
    case 2: return clouds::PLAYBACK_MODE_LOOPING_DELAY;
    case 3: return clouds::PLAYBACK_MODE_SPECTRAL;
    case 4: return clouds::PLAYBACK_MODE_OLIVERB;
    case 5: return clouds::PLAYBACK_MODE_RESONESTOR;
    case 6: return clouds::PLAYBACK_MODE_KAMMERL;
    case 7: return clouds::PLAYBACK_MODE_SPECTRAL_CLOUD;
    default: return clouds::PLAYBACK_MODE_GRANULAR;
  }
}

void InitializeParameters() {
  clouds::Parameters* p = processor.mutable_parameters();

  p->position = 0.5f;
  p->size = 0.5f;
  p->pitch = 0.0f;
  p->density = 0.5f;
  p->texture = 0.5f;

  // Sonus Umbrae performs the actual dry/wet mix in WebAudio. SuperParasites
  // still needs a fully-wet value for its normal processing modes.
  p->dry_wet = 1.0f;
  p->stereo_spread = 0.5f;
  p->feedback = 0.0f;
  p->reverb = 0.0f;

  p->freeze = false;
  p->capture = false;
  p->gate = false;

  p->granular.overlap = 0.0f;
  p->granular.window_shape = 0.5f;
  p->granular.stereo_spread = 0.5f;
  p->granular.use_deterministic_seed = false;
  p->granular.reverse = false;

  p->spectral.quantization = 0.5f;
  p->spectral.refresh_rate = 0.5f;
  p->spectral.phase_randomization = 0.0f;
  p->spectral.warp = 0.5f;

  p->kammerl.probability = 0.5f;
  p->kammerl.pitch_mode = 0.0f;
  p->kammerl.clock_divider = 0.5f;
  p->kammerl.distortion = 0.0f;
  p->kammerl.slice_selection = 0.5f;
  p->kammerl.slice_modulation = 0.5f;
  p->kammerl.size_modulation = 0.5f;
  p->kammerl.pitch = 0.5f;
}

void UpdateModeSpecificParameters() {
  clouds::Parameters* p = processor.mutable_parameters();

  // SuperParasites maps the physical Blend controls to Kammerl/Beat Repeat
  // parameters. Recreate that mapping from Mist's existing controls.
  p->kammerl.probability = host_mix;
  p->kammerl.clock_divider = p->stereo_spread;
  p->kammerl.pitch_mode = p->feedback;
  p->kammerl.distortion = p->reverb;
  p->kammerl.slice_selection = p->position;
  p->kammerl.slice_modulation = p->texture;
  p->kammerl.size_modulation = p->density;
  p->kammerl.pitch = std::clamp((p->pitch + 48.0f) / 96.0f, 0.0f, 1.0f);

  // Resonestor repurposes the original dry/wet parameter as distortion.
  // Keep it neutral because Sonus Umbrae owns dry/wet externally.
  p->dry_wet = playback_mode == 5 ? 0.0f : 1.0f;
}

}  // namespace

extern "C" {

void su_mist_init() {
  std::memset(large_buffer, 0, sizeof(large_buffer));
  std::memset(small_buffer, 0, sizeof(small_buffer));
  std::memset(host_in_l, 0, sizeof(host_in_l));
  std::memset(host_in_r, 0, sizeof(host_in_r));
  std::memset(host_trig, 0, sizeof(host_trig));
  std::memset(host_out_l, 0, sizeof(host_out_l));
  std::memset(host_out_r, 0, sizeof(host_out_r));
  std::memset(native_in, 0, sizeof(native_in));
  std::memset(native_out, 0, sizeof(native_out));

  processor.Init(
      large_buffer, sizeof(large_buffer),
      small_buffer, sizeof(small_buffer));

  processor.set_silence(false);
  processor.set_bypass(false);
  processor.set_quality(0);

  playback_mode = 0;
  processor.set_playback_mode(clouds::PLAYBACK_MODE_GRANULAR);
  InitializeParameters();

  processor.Prepare();
  previous_trigger = false;
  initialized = true;
}

void su_mist_set_sample_rate(float value) {
  if (std::isfinite(value) && value >= 8000.0f) host_sample_rate = value;
}

void su_mist_set_mode(int mode) {
  playback_mode = std::clamp(mode, 0, 7);
  processor.set_playback_mode(ModeFromInt(playback_mode));

  // Prepare() performs the mode-specific workspace reset. Calling it here and
  // again from process() matches the firmware's foreground Prepare loop.
  processor.Prepare();
}

void su_mist_set_mix(float value) {
  host_mix = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_set_position(float value) {
  processor.mutable_parameters()->position = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_set_size(float value) {
  processor.mutable_parameters()->size = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_set_pitch(float value) {
  processor.mutable_parameters()->pitch = std::clamp(value, -48.0f, 48.0f);
}

void su_mist_set_density(float value) {
  processor.mutable_parameters()->density = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_set_texture(float value) {
  processor.mutable_parameters()->texture = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_set_spread(float value) {
  processor.mutable_parameters()->stereo_spread = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_set_feedback(float value) {
  processor.mutable_parameters()->feedback = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_set_reverb(float value) {
  processor.mutable_parameters()->reverb = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_set_freeze(int enabled) {
  processor.set_freeze(enabled != 0);
}

void su_mist_set_reverse(int enabled) {
  processor.mutable_parameters()->granular.reverse = enabled != 0;
}

float* su_mist_in_l() { return host_in_l; }
float* su_mist_in_r() { return host_in_r; }
float* su_mist_trig() { return host_trig; }
float* su_mist_out_l() { return host_out_l; }
float* su_mist_out_r() { return host_out_r; }

void su_mist_process(int size) {
  if (!initialized) return;
  size = std::clamp(size, 0, kHostCapacity);
  if (size == 0) return;

  UpdateModeSpecificParameters();

  const float ratio = kCloudsSampleRate / host_sample_rate;
  const int native_size = std::clamp(
      static_cast<int>(std::lrint(static_cast<float>(size) * ratio)),
      1,
      kNativeCapacity);

  for (int i = 0; i < native_size; ++i) {
    const float position = native_size == 1
        ? 0.0f
        : static_cast<float>(i) * static_cast<float>(size - 1) /
          static_cast<float>(native_size - 1);
    const int a = std::clamp(static_cast<int>(position), 0, size - 1);
    const int b = std::min(size - 1, a + 1);
    const float fraction = position - static_cast<float>(a);

    const float left = host_in_l[a] + (host_in_l[b] - host_in_l[a]) * fraction;
    const float right = host_in_r[a] + (host_in_r[b] - host_in_r[a]) * fraction;
    native_in[i].l = FloatToShort(left);
    native_in[i].r = FloatToShort(right);
  }

  bool capture = false;
  bool gate = false;
  for (int i = 0; i < size; ++i) {
    const bool high = host_trig[i] > 0.3f;
    capture = capture || (high && !previous_trigger);
    gate = gate || high;
    previous_trigger = high;
  }

  clouds::Parameters* parameters = processor.mutable_parameters();
  parameters->capture = capture;
  parameters->gate = gate;

  processor.Prepare();

  for (int offset = 0; offset < native_size; offset += kCloudsBlock) {
    const int block_size = std::min(kCloudsBlock, native_size - offset);
    processor.Process(native_in + offset, native_out + offset, block_size);
    processor.Prepare();
  }

  parameters->capture = false;

  for (int i = 0; i < size; ++i) {
    const float position = size == 1
        ? 0.0f
        : static_cast<float>(i) * static_cast<float>(native_size - 1) /
          static_cast<float>(size - 1);
    const int a = std::clamp(static_cast<int>(position), 0, native_size - 1);
    const int b = std::min(native_size - 1, a + 1);
    const float fraction = position - static_cast<float>(a);

    const float left_a = ShortToFloat(native_out[a].l);
    const float left_b = ShortToFloat(native_out[b].l);
    const float right_a = ShortToFloat(native_out[a].r);
    const float right_b = ShortToFloat(native_out[b].r);

    host_out_l[i] = left_a + (left_b - left_a) * fraction;
    host_out_r[i] = right_a + (right_b - right_a) * fraction;
  }
}

}  // extern "C"
