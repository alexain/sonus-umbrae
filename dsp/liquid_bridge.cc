
/*
 * Sonus Umbrae liquid.mono backend.
 *
 * Adapted from the Mutable Instruments Ripples emulation for VCV Rack
 * by Tyler Coy / Audible Instruments (GPL-3.0-or-later).
 *
 * Original project:
 *   https://github.com/VCVRack/AudibleInstruments
 *
 * This adaptation removes Rack/SIMD dependencies and exposes a compact
 * WASM C ABI while preserving the Ripples virtual-analog topology:
 * four nonlinear integrator cells, resonance feedforward/feedback,
 * 2-pole BP, 2-pole LP and 4-pole LP outputs, plus self-oscillation seed.
 */
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace {

constexpr int kCapacity = 128;
constexpr float kFreqMin = 20.0f;
constexpr float kFreqMax = 20000.0f;
constexpr float kFilterCellR = 33e3f;
constexpr float kFilterCellRC = 1.0f / (2.0f * 3.14159265358979323846f * kFreqMax);
constexpr float kFilterInputGain = kFilterCellR / 100e3f;
constexpr float kSelfMod = 0.01f;
constexpr float kFeedbackGain = 1e3f / 23e3f;
constexpr float kFeedforwardGain = 1e3f / 301e3f;
constexpr float kBP2Gain = -100e3f / 39e3f;
constexpr float kLP2Gain = -100e3f / 39e3f;
constexpr float kLP4Gain = -100e3f / 33e3f;
constexpr float kOpampSatV = 10.6f;
constexpr float kVtoICollectorVSat = -10.0f;

// Rack/Audible Instruments models audio in Eurorack volts, while WebAudio
// samples are nominally normalized around +/-1. Map a full-scale Sonus signal
// to about +/-5 V at the Ripples input and map +/-5 V back to roughly
// +/-1 in WebAudio. The final tanh rail guard still contains self-oscillation
// peaks approaching the analog op-amp rails without attenuating normal signals.
constexpr float kAudioToRackVolts = 5.0f;
constexpr float kRackVoltsToAudio = 0.20f;

float Clamp(float x, float lo, float hi) { return std::max(lo, std::min(hi, x)); }
float Clamp01(float x) { return Clamp(x, 0.0f, 1.0f); }

struct OnePole {
  float z = 0.0f;
  float a = 0.0f;
  void set(float cutoff, float sr) {
    a = 1.0f - std::exp(-2.0f * 3.14159265358979323846f * cutoff / sr);
  }
  float low(float x) { z += a * (x - z); return z; }
  float high(float x) { return x - low(x); }
};

float VtoI(float rfb, float vc, float rc, float vp = 0.0f, float rp = 1e12f) {
  const float vnom = -(vc * rfb / rc + vp * rfb / rp);
  const float vout = std::max(vnom, kVtoICollectorVSat);
  const float nrc = rp * rfb;
  const float nrp = rc * rfb;
  const float nrfb = rc * rp;
  const float vneg = (vc * nrc + vp * nrp + vout * nrfb) / (nrc + nrp + nrfb);
  return std::max((vneg - vout) / rfb, 0.0f);
}

float OTAVCA(float vp, float vn, float iabc) {
  // LM13700 differential pair approximation used by the Ripples model.
  constexpr float vt = 0.026f;
  return iabc * std::tanh((vp - vn) / (2.0f * vt));
}

struct LiquidState {
  float sampleRate = 48000.0f;
  float cutoff = 1000.0f;
  float resonance = 0.0f;
  float cells[4] = {0,0,0,0};
  float input[kCapacity] = {};
  float bp12[kCapacity] = {};
  float lp12[kCapacity] = {};
  float lp24[kCapacity] = {};
  OnePole feedforwardHp;
  OnePole freqLp;
  OnePole resLp;
  uint32_t rng = 0x6d2b79f5u;

  void resetFilters() {
    feedforwardHp = {};
    freqLp = {};
    resLp = {};
    feedforwardHp.set(1.0f / (2.0f * 3.14159265358979323846f * 301e3f * 220e-9f), sampleRate * 3.0f);
    freqLp.set(1.0f / (2.0f * 3.14159265358979323846f * 11e3f * 560e-12f), sampleRate * 3.0f);
    resLp.set(1.0f / (2.0f * 3.14159265358979323846f * 47e3f * 560e-12f), sampleRate * 3.0f);
  }
};

float Noise(LiquidState* s) {
  uint32_t x=s->rng; x^=x<<13; x^=x>>17; x^=x<<5; s->rng=x;
  return (float(x) / 4294967296.0f) - 0.5f;
}

void CoreStep(LiquidState* s, float input, float dt, float& bp, float& lp2, float& lp4) {
  // Ripples frequency control is V/oct with knob max at 20 kHz.
  const float vOct = std::log2(std::max(kFreqMin, std::min(kFreqMax, s->cutoff)) / kFreqMax);
  const float smoothVOct = s->freqLp.low(vOct);

  // Approximate the original resonance control-current path.
  const float resKnobV = s->resonance * 12.0f;
  float iRes = VtoI(47e3f, 0.0f, 22e3f, resKnobV, 62e3f);
  iRes = s->resLp.low(iRes);

  const float ff = s->feedforwardHp.high(input);
  const float rad = -std::exp2(smoothVOct) / kFilterCellRC;

  auto deriv = [&](const float y[4], float d[4]) {
    float vin[4] = {0, y[0], y[1], y[2]};
    const float vp = ff * kFeedforwardGain;
    const float vn = y[3] * kFeedbackGain;
    const float res = kFilterCellR * OTAVCA(vp, vn, iRes);
    vin[0] = input * kFilterInputGain + res;
    for (int i=0;i<4;++i) {
      const float sum = vin[i] + y[i];
      d[i] = rad * sum * (1.0f + sum * kSelfMod);
    }
  };

  float k1[4], mid[4], k2[4];
  deriv(s->cells, k1);
  for (int i=0;i<4;++i) mid[i]=s->cells[i] + k1[i]*dt*0.5f;
  deriv(mid, k2);
  for (int i=0;i<4;++i) s->cells[i]=Clamp(s->cells[i]+dt*k2[i], -kOpampSatV, kOpampSatV);

  const float lp1=s->cells[0];
  lp2=s->cells[1]*kLP2Gain;
  lp4=s->cells[3]*kLP4Gain;
  bp=(lp1+s->cells[1])*kBP2Gain;
}

} // namespace

extern "C" {

LiquidState* su_liquid_create() {
  auto* s = new LiquidState();
  s->resetFilters();
  return s;
}
void su_liquid_destroy(LiquidState* s){ delete s; }
void su_liquid_set_sample_rate(LiquidState* s,float sr){
  if(!s||!std::isfinite(sr)||sr<8000) return;
  s->sampleRate=sr; s->resetFilters();
}
void su_liquid_set_cutoff(LiquidState* s,float hz){
  if(s&&std::isfinite(hz)) s->cutoff=Clamp(hz,kFreqMin,kFreqMax);
}
void su_liquid_set_resonance(LiquidState* s,float x){
  if(s&&std::isfinite(x)) s->resonance=Clamp01(x);
}
float* su_liquid_in(LiquidState* s){ return s?s->input:nullptr; }
float* su_liquid_bp12(LiquidState* s){ return s?s->bp12:nullptr; }
float* su_liquid_lp12(LiquidState* s){ return s?s->lp12:nullptr; }
float* su_liquid_lp24(LiquidState* s){ return s?s->lp24:nullptr; }

void su_liquid_process(LiquidState* s,int size){
  if(!s) return;
  size=std::max(0,std::min(size,kCapacity));
  constexpr int os=3;
  const float dt=1.0f/(s->sampleRate*os);
  for(int i=0;i<size;++i){
    float bp=0,lp2=0,lp4=0;
    const float rackInput = s->input[i] * kAudioToRackVolts;
    float x=rackInput + 1e-6f*Noise(s); // self-oscillation bootstrap as original model
    // Zero-order hold across the oversampling sub-steps. Feeding the
    // sample only into the first sub-step (and zero into the others) reduces
    // the effective input level by roughly the oversampling factor and changes
    // the filter response.
    for(int k=0;k<os;++k) CoreStep(s, x, dt, bp, lp2, lp4);

    // Keep the analog-model voltage behaviour internally, then translate it
    // back to a WebAudio-safe domain. tanh acts only as a final rail guard and
    // preserves the resonant level relationship below clipping.
    s->bp12[i]=std::tanh(bp * kRackVoltsToAudio);
    s->lp12[i]=std::tanh(lp2 * kRackVoltsToAudio);
    s->lp24[i]=std::tanh(lp4 * kRackVoltsToAudio);
  }
}

}
