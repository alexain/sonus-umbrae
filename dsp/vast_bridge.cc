/*
 * Sonus Umbrae VAST reverb backend.
 *
 * Wraps the original ValleyRackFree Plateau Dattorro DSP core.
 * ValleyRackFree is GPL-3.0; see THIRD_PARTY_NOTICES.md.
 */
#include <algorithm>
#include <cmath>
#include "Plateau/Dattorro.hpp"

namespace {
constexpr int kCapacity = 128;

struct VastState {
  Dattorro reverb{192000.0, 16.0, 4.0};
  float inputL[kCapacity] = {};
  float inputR[kCapacity] = {};
  float outputL[kCapacity] = {};
  float outputR[kCapacity] = {};
  float sampleRate = 48000.0f;
  float size = 0.72f;
  float decay = 0.88f;
  float damp = 0.38f;
  float diffuse = 0.76f;
  float predelay = 0.08f;
  float motion = 0.24f;
  float spread = 0.85f;
  bool frozen = false;

  VastState() { applyAll(); }

  void applyAll() {
    reverb.setSampleRate(sampleRate);

    // Plateau explicitly drives both input filters every process cycle.
    // Valley's OnePoleHPFilter constructed at exactly 0 Hz otherwise retains
    // zero coefficients, which mutes the signal before it reaches the tank.
    // Pitch 0 ~= 13.75 Hz (effectively open HPF); pitch 10 ~= 14.08 kHz LPF.
    reverb.setInputFilterLowCutoffPitch(0.0);
    reverb.setInputFilterHighCutoffPitch(10.0);

    // Plateau's size control is strongly curved before driving time scale.
    const double sizeKnob = std::clamp<double>(size, 0.0, 1.0);
    const double timeScale = 0.25 + sizeKnob * sizeKnob * 3.75;
    reverb.setTimeScale(timeScale);

    // Sonus predelay is normalized 0..1 => 0..200 ms.
    reverb.setPreDelay(std::clamp<double>(predelay, 0.0, 1.0) * 0.2);

    // Keep the useful Plateau range while allowing near-infinite tails.
    const double decayKnob = std::clamp<double>(decay, 0.0, 1.0);
    const double decayValue = 0.1 + std::pow(decayKnob, 1.7) * 0.8999;
    reverb.setDecay(std::clamp(decayValue, 0.1, 0.9999));

    const double diffusion = std::clamp<double>(diffuse, 0.0, 1.0);
    reverb.enableInputDiffusion(diffusion > 0.001);
    reverb.setTankDiffusion(diffusion * 10.0);

    // Valley's public filter setters use a 1V/oct-like pitch domain.
    // 10 is bright/open; lowering it damps the reverb tank.
    reverb.setTankFilterLowCutFrequency(0.0);
    reverb.setTankFilterHighCutFrequency(10.0 - std::clamp<double>(damp, 0.0, 1.0) * 5.5);

    const double m = std::clamp<double>(motion, 0.0, 1.0);
    reverb.setTankModSpeed(1.0 + m * m * 49.0);
    reverb.setTankModDepth(m * 16.0);
    reverb.setTankModShape(0.05 + std::clamp<double>(spread, 0.0, 1.0) * 0.90);
    reverb.freeze(frozen);
  }
};

float clamp01(float x) { return std::max(0.0f, std::min(1.0f, x)); }
}

extern "C" {
VastState* su_vast_create() { return new VastState(); }
void su_vast_destroy(VastState* s) { delete s; }
void su_vast_set_sample_rate(VastState* s, float sr) {
  if (!s || !std::isfinite(sr) || sr < 8000.0f) return;
  s->sampleRate = sr; s->applyAll();
}
void su_vast_set_size(VastState* s, float v) { if (s) { s->size=clamp01(v); s->applyAll(); } }
void su_vast_set_decay(VastState* s, float v) { if (s) { s->decay=clamp01(v); s->applyAll(); } }
void su_vast_set_damp(VastState* s, float v) { if (s) { s->damp=clamp01(v); s->applyAll(); } }
void su_vast_set_diffuse(VastState* s, float v) { if (s) { s->diffuse=clamp01(v); s->applyAll(); } }
void su_vast_set_predelay(VastState* s, float v) { if (s) { s->predelay=clamp01(v); s->applyAll(); } }
void su_vast_set_motion(VastState* s, float v) { if (s) { s->motion=clamp01(v); s->applyAll(); } }
void su_vast_set_spread(VastState* s, float v) { if (s) { s->spread=clamp01(v); s->applyAll(); } }
void su_vast_set_freeze(VastState* s, int enabled) { if (s) { s->frozen=enabled!=0; s->reverb.freeze(s->frozen); } }
float* su_vast_in_l(VastState* s) { return s ? s->inputL : nullptr; }
float* su_vast_in_r(VastState* s) { return s ? s->inputR : nullptr; }
float* su_vast_out_l(VastState* s) { return s ? s->outputL : nullptr; }
float* su_vast_out_r(VastState* s) { return s ? s->outputR : nullptr; }
void su_vast_process(VastState* s, int frames) {
  if (!s) return;
  frames = std::max(0, std::min(frames, kCapacity));
  for (int i=0;i<frames;++i) {
    // Match Plateau's native gain staging:
    // WebAudio +/-1 -> Eurorack +/-5 V -> Plateau -20 dB input stage => +/-0.5
    // Dattorro wet output -> Plateau wet gain x10 -> WebAudio /5 => x2.
    // Keeping these two conversions together preserves Plateau's intended
    // operating level and avoids overdriving the feedback tank.
    const double left = static_cast<double>(s->inputL[i]) * 0.5;
    const double right = static_cast<double>(s->inputR[i]) * 0.5;
    s->reverb.process(left, right);
    s->outputL[i] = static_cast<float>(std::tanh(s->reverb.getLeftOutput() * 2.0));
    s->outputR[i] = static_cast<float>(std::tanh(s->reverb.getRightOutput() * 2.0));
  }
}
}
