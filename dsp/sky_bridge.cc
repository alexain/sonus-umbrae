/*
 * Sonus Umbrae SKY reverb backend.
 *
 * Wraps Ghost Note Audio's MIT-licensed CloudSeedCore algorithm.  The Sonus
 * controls intentionally form a compact ambient-oriented surface rather than
 * exposing CloudSeedCore's complete parameter matrix.
 */
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

#include "DSP/ReverbController.h"
#include "Programs.h"

namespace {
constexpr int kCapacity = 128;
constexpr float kMaxPredelaySeconds = 0.5f;

float clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

struct SkyState {
  Cloudseed::ReverbController reverb{48000};
  float inputL[kCapacity] = {};
  float inputR[kCapacity] = {};
  float outputL[kCapacity] = {};
  float outputR[kCapacity] = {};
  std::vector<float> predelayL;
  std::vector<float> predelayR;
  std::size_t predelayWrite = 0;
  float sampleRate = 48000.0f;
  float size = 0.78f;
  float decay = 0.90f;
  float damp = 0.35f;
  float bloom = 0.76f;
  float predelay = 0.08f;
  float motion = 0.30f;
  float width = 0.90f;
  bool frozen = false;

  SkyState() {
    Cloudseed::initPrograms();
    for (int i = 0; i < Cloudseed::Parameter::COUNT; ++i) {
      reverb.SetParameter(i, Cloudseed::ProgramDarkPlate[i]);
    }
    // Fully-wet core: Sonus performs the equal-power dry/wet blend outside WASM.
    reverb.SetParameter(Cloudseed::Parameter::DryOut, 0.0);
    reverb.SetParameter(Cloudseed::Parameter::EarlyOut, 0.20);
    reverb.SetParameter(Cloudseed::Parameter::LateOut, 1.0);
    reverb.SetParameter(Cloudseed::Parameter::TapEnabled, 0.0);
    reverb.SetParameter(Cloudseed::Parameter::Interpolation, 1.0);
    rebuildPredelay();
    applyAll();
    // Match CloudSeedCore's reference lifecycle: after applying a program and
    // configuring the sample rate/parameters, clear all delay/filter state
    // before the first process block.
    reverb.ClearBuffers();
  }

  void rebuildPredelay() {
    const auto capacity = static_cast<std::size_t>(std::ceil(sampleRate * kMaxPredelaySeconds)) + 2;
    predelayL.assign(capacity, 0.0f);
    predelayR.assign(capacity, 0.0f);
    predelayWrite = 0;
  }

  void applyAll() {
    reverb.SetSamplerate(static_cast<int>(std::lround(sampleRate)));
    reverb.SetParameter(Cloudseed::Parameter::LateLineCount, 1.0);
    reverb.SetParameter(Cloudseed::Parameter::LateLineSize, size);
    reverb.SetParameter(Cloudseed::Parameter::LateLineDecay, frozen ? 1.0 : decay);

    // DAMP is intentionally inverse to CloudSeed's high-cut control: 0 is open,
    // 1 is dark.  Keep enough top end at maximum damping for an ambient tail.
    reverb.SetParameter(Cloudseed::Parameter::HighCutEnabled, 1.0);
    reverb.SetParameter(Cloudseed::Parameter::HighCut, 1.0f - damp * 0.82f);

    // BLOOM controls how slowly the field becomes dense.  CloudSeedCore already
    // has separate early/late diffusion networks, so drive their count, delay and
    // feedback together instead of adding an unrelated envelope after the tank.
    const float b = bloom;
    reverb.SetParameter(Cloudseed::Parameter::EarlyDiffuseEnabled, 1.0);
    reverb.SetParameter(Cloudseed::Parameter::EarlyDiffuseCount, 0.15f + b * 0.75f);
    reverb.SetParameter(Cloudseed::Parameter::EarlyDiffuseDelay, 0.12f + b * 0.72f);
    reverb.SetParameter(Cloudseed::Parameter::EarlyDiffuseFeedback, 0.35f + b * 0.58f);
    reverb.SetParameter(Cloudseed::Parameter::EarlyDiffuseModAmount, motion * 0.45f);
    reverb.SetParameter(Cloudseed::Parameter::EarlyDiffuseModRate, 0.18f + motion * 0.38f);

    reverb.SetParameter(Cloudseed::Parameter::LateDiffuseEnabled, 1.0);
    reverb.SetParameter(Cloudseed::Parameter::LateDiffuseCount, 0.25f + b * 0.70f);
    reverb.SetParameter(Cloudseed::Parameter::LateDiffuseDelay, 0.18f + b * 0.70f);
    reverb.SetParameter(Cloudseed::Parameter::LateDiffuseFeedback, 0.45f + b * 0.52f);
    reverb.SetParameter(Cloudseed::Parameter::LateDiffuseModAmount, motion * 0.55f);
    reverb.SetParameter(Cloudseed::Parameter::LateDiffuseModRate, 0.16f + motion * 0.42f);

    reverb.SetParameter(Cloudseed::Parameter::LateLineModAmount, motion);
    reverb.SetParameter(Cloudseed::Parameter::LateLineModRate, 0.15f + motion * 0.55f);

    // CloudSeed's input cross-mix narrows the channels as it rises; use the
    // inverse of WIDTH there, and its cross-seed control to decorrelate the tank.
    reverb.SetParameter(Cloudseed::Parameter::InputMix, 1.0f - width);
    reverb.SetParameter(Cloudseed::Parameter::EqCrossSeed, width);
  }

  void setSampleRate(float sr) {
    if (!std::isfinite(sr) || sr < 8000.0f) return;
    sampleRate = sr;
    rebuildPredelay();
    applyAll();
    reverb.ClearBuffers();
  }

  void process(int frames) {
    frames = std::max(0, std::min(frames, kCapacity));
    float delayedL[kCapacity] = {};
    float delayedR[kCapacity] = {};
    const std::size_t delaySamples = static_cast<std::size_t>(
      std::lround(clamp01(predelay) * kMaxPredelaySeconds * sampleRate));
    const std::size_t capacity = predelayL.size();

    for (int i = 0; i < frames; ++i) {
      predelayL[predelayWrite] = frozen ? 0.0f : inputL[i];
      predelayR[predelayWrite] = frozen ? 0.0f : inputR[i];
      const std::size_t read = (predelayWrite + capacity - std::min(delaySamples, capacity - 1)) % capacity;
      delayedL[i] = predelayL[read];
      delayedR[i] = predelayR[read];
      predelayWrite = (predelayWrite + 1) % capacity;
    }

    reverb.Process(delayedL, delayedR, outputL, outputR, frames);
    for (int i = 0; i < frames; ++i) {
      // CloudSeed can build very large feedback fields.  A soft safety stage at
      // the WebAudio boundary keeps pathological live edits finite.
      outputL[i] = std::tanh(outputL[i]);
      outputR[i] = std::tanh(outputR[i]);
    }
  }
};
}

extern "C" {
SkyState* su_sky_create() { return new SkyState(); }
void su_sky_destroy(SkyState* state) { delete state; }
void su_sky_set_sample_rate(SkyState* state, float sr) { if (state) state->setSampleRate(sr); }
void su_sky_set_size(SkyState* state, float value) { if (state) { state->size = clamp01(value); state->applyAll(); } }
void su_sky_set_decay(SkyState* state, float value) { if (state) { state->decay = clamp01(value); state->applyAll(); } }
void su_sky_set_damp(SkyState* state, float value) { if (state) { state->damp = clamp01(value); state->applyAll(); } }
void su_sky_set_bloom(SkyState* state, float value) { if (state) { state->bloom = clamp01(value); state->applyAll(); } }
void su_sky_set_predelay(SkyState* state, float value) { if (state) state->predelay = clamp01(value); }
void su_sky_set_motion(SkyState* state, float value) { if (state) { state->motion = clamp01(value); state->applyAll(); } }
void su_sky_set_width(SkyState* state, float value) { if (state) { state->width = clamp01(value); state->applyAll(); } }
void su_sky_set_freeze(SkyState* state, int enabled) { if (state) { state->frozen = enabled != 0; state->applyAll(); } }
float* su_sky_in_l(SkyState* state) { return state ? state->inputL : nullptr; }
float* su_sky_in_r(SkyState* state) { return state ? state->inputR : nullptr; }
float* su_sky_out_l(SkyState* state) { return state ? state->outputL : nullptr; }
float* su_sky_out_r(SkyState* state) { return state ? state->outputR : nullptr; }
void su_sky_process(SkyState* state, int frames) { if (state) state->process(frames); }
}
