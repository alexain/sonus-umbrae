#include <algorithm>
#include <cstdint>
#include <cstring>

#include "clouds/dsp/frame.h"
#include "clouds/dsp/granular_processor.h"

namespace {

constexpr size_t kBlockSize = 32;
constexpr size_t kLargeBufferSize = 118784;
constexpr size_t kSmallBufferSize = 65536 - 128;

// IMPORTANT: keep these as static-storage objects, just like the original
// Clouds firmware. This guarantees zero-initialization before Init().
clouds::GranularProcessor processor;
uint8_t large_buffer[kLargeBufferSize];
uint8_t small_buffer[kSmallBufferSize];

clouds::ShortFrame input[kBlockSize];
clouds::ShortFrame output[kBlockSize];

bool initialized = false;

}  // namespace

extern "C" {

void su_mist_harness_init() {
  std::memset(large_buffer, 0, sizeof(large_buffer));
  std::memset(small_buffer, 0, sizeof(small_buffer));
  std::memset(input, 0, sizeof(input));
  std::memset(output, 0, sizeof(output));

  processor.Init(
      large_buffer, sizeof(large_buffer),
      small_buffer, sizeof(small_buffer));

  processor.set_silence(false);
  processor.set_bypass(false);
  processor.set_playback_mode(clouds::PLAYBACK_MODE_GRANULAR);
  processor.set_quality(0);

  clouds::Parameters* p = processor.mutable_parameters();
  p->position = 0.25f;
  p->size = 0.45f;
  p->pitch = 0.0f;
  p->density = 0.80f;
  p->texture = 0.50f;
  p->dry_wet = 1.0f;
  p->stereo_spread = 0.50f;
  p->feedback = 0.0f;
  p->reverb = 0.0f;
  p->freeze = false;
  p->trigger = false;
  p->gate = false;

  // Init() intentionally sets reset_buffers_. In the hardware firmware,
  // Prepare() runs continuously in the main loop. The first call performs
  // all buffer/workspace initialization and makes Process() operational.
  processor.Prepare();
  initialized = true;
}

int16_t* su_mist_harness_input() {
  return reinterpret_cast<int16_t*>(input);
}

int16_t* su_mist_harness_output() {
  return reinterpret_cast<int16_t*>(output);
}

void su_mist_harness_set_bypass(int enabled) {
  processor.set_bypass(enabled != 0);
}

void su_mist_harness_set_trigger(int enabled) {
  processor.mutable_parameters()->trigger = enabled != 0;
}

void su_mist_harness_set_density(float value) {
  processor.mutable_parameters()->density = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_harness_set_position(float value) {
  processor.mutable_parameters()->position = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_harness_set_size(float value) {
  processor.mutable_parameters()->size = std::clamp(value, 0.0f, 1.0f);
}

void su_mist_harness_process() {
  if (!initialized) return;

  // Match the original firmware model: Prepare() runs outside the audio ISR.
  processor.Prepare();
  processor.Process(input, output, kBlockSize);
  processor.mutable_parameters()->trigger = false;
}

}  // extern "C"
