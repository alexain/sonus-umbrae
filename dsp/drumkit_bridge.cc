#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include "BassDrum.hpp"
#include "Clap.hpp"
#include "HiHats.hpp"
#include "Snare.hpp"
#include "Toms.hpp"

namespace {
constexpr int kBlockSize = 128;
constexpr float kHalfPi = 1.5707963267948966f;
inline float clamp01(float v) { return std::max(0.0f, std::min(1.0f, v)); }
inline float clampPan(float v) { return std::max(-1.0f, std::min(1.0f, v)); }
inline float semiRatio(float s) { return std::pow(2.0f, s / 12.0f); }

struct Mix {
  float level = 1.0f, left = 0.70710678f, right = 0.70710678f;
  void set(float l, float pan) {
    level = clamp01(l);
    const float a = (clampPan(pan) + 1.0f) * 0.5f * kHalfPi;
    left = std::cos(a); right = std::sin(a);
  }
  void add(float s, float& l, float& r) const {
    l += s * level * left; r += s * level * right;
  }
};

struct Kit {
  SynthDrums606::BassDrumVoice kick;
  SynthDrums606::SnareVoice snare;
  SynthDrums606::ClapVoice clap;
  SynthDrums606::MetalHiHatVoice hat;
  SynthDrums606::TomVoice lowTom;
  SynthDrums606::TomVoice highTom;
  Mix kickMix, snareMix, clapMix, hatMix, lowTomMix, highTomMix;
  std::array<float, kBlockSize> left{}, right{};

  void init(float sr) {
    sr = std::max(8000.0f, sr);
    kick.init(sr); clap.init(sr); hat.init(sr);
    snare.init(sr, 0x6063u); lowTom.init(sr, 0x6061u); highTom.init(sr, 0x6062u);
    kickMix.set(1,0); snareMix.set(1,0); clapMix.set(1,0);
    hatMix.set(1,0); lowTomMix.set(1,0); highTomMix.set(1,0);
  }

  void triggerKick(float level,float pan,float tune,float decay,float transient) {
    kickMix.set(level,pan);
    kick.trigger(clamp01(transient),clamp01(decay),tune,0.0f);
  }
  void triggerSnare(float level,float pan,float tune,float decay,float snappy,float color) {
    snareMix.set(level,pan);
    snare.trigger(clamp01(decay),semiRatio(tune),clamp01(snappy),std::max(0.125f,std::min(8.0f,color)));
  }
  void triggerClap(float level,float pan,float tune,float decay,float noise) {
    clapMix.set(level,pan);
    clap.trigger(clamp01(decay),semiRatio(tune),clamp01(noise));
  }
  void triggerHat(bool open,float level,float pan,float tune,float decay) {
    hatMix.set(level,pan);
    hat.trigger(open ? SynthDrums606::kOpenHatSpec : SynthDrums606::kClosedHatSpec, clamp01(decay), semiRatio(tune));
  }
  void triggerTom(bool high,float level,float pan,float tune,float decay) {
    if (high) {
      highTomMix.set(level,pan);
      highTom.trigger(SynthDrums606::kHighTomSpec,clamp01(decay),semiRatio(tune));
    } else {
      lowTomMix.set(level,pan);
      lowTom.trigger(SynthDrums606::kLowTomSpec,clamp01(decay),semiRatio(tune));
    }
  }
  void process(int frames) {
    frames = std::max(0,std::min(kBlockSize,frames));
    for (int i=0;i<frames;++i) {
      float l=0.0f,r=0.0f;
      kickMix.add(kick.process(),l,r);
      snareMix.add(snare.process(),l,r);
      // The upstream clap voice has a much lower internal output trim than
      // the other 606 voices. Compensate at the Sonus host layer only; the
      // original MIT DSP remains untouched.
      clapMix.add(clap.process() * 3.0f,l,r);
      hatMix.add(hat.process(),l,r);
      lowTomMix.add(lowTom.process(),l,r);
      highTomMix.add(highTom.process(),l,r);
      left[i]=l*0.45f; right[i]=r*0.45f;
    }
  }
};
}

extern "C" {
void* su_drumkit_create(){auto* k=new Kit(); k->init(48000); return k;}
void su_drumkit_destroy(void* p){delete static_cast<Kit*>(p);}
void su_drumkit_set_sample_rate(void* p,float sr){static_cast<Kit*>(p)->init(sr);}
void su_drumkit_trigger_kick(void* p,float l,float pan,float t,float d,float tr){static_cast<Kit*>(p)->triggerKick(l,pan,t,d,tr);}
void su_drumkit_trigger_snare(void* p,float l,float pan,float t,float d,float s,float c){static_cast<Kit*>(p)->triggerSnare(l,pan,t,d,s,c);}
void su_drumkit_trigger_clap(void* p,float l,float pan,float t,float d,float n){static_cast<Kit*>(p)->triggerClap(l,pan,t,d,n);}
void su_drumkit_trigger_hihat(void* p,float l,float pan,float t,float d){static_cast<Kit*>(p)->triggerHat(false,l,pan,t,d);}
void su_drumkit_trigger_openhat(void* p,float l,float pan,float t,float d){static_cast<Kit*>(p)->triggerHat(true,l,pan,t,d);}
void su_drumkit_trigger_lowtom(void* p,float l,float pan,float t,float d){static_cast<Kit*>(p)->triggerTom(false,l,pan,t,d);}
void su_drumkit_trigger_hightom(void* p,float l,float pan,float t,float d){static_cast<Kit*>(p)->triggerTom(true,l,pan,t,d);}
void su_drumkit_process(void* p,int n){static_cast<Kit*>(p)->process(n);}
float* su_drumkit_left(void* p){return static_cast<Kit*>(p)->left.data();}
float* su_drumkit_right(void* p){return static_cast<Kit*>(p)->right.data();}
}
