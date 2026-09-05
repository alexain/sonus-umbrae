#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <vector>

#define DSPARK_NO_FILE_IO 1
#include "Effects/Delay.h"
#include "Effects/PitchShifter.h"
#include "Core/AudioBuffer.h"
#include "Core/AudioSpec.h"

namespace {

constexpr int kBlockSize = 128;
constexpr int kMaxLines = 8;
constexpr int kMaxPitchShifts = 16;
constexpr float kMaxDelaySeconds = 4.0f;
constexpr float kPi = 3.14159265358979323846f;

inline float clamp01(float v) { return std::max(0.0f, std::min(1.0f, v)); }
inline float softclip(float x) { return std::tanh(x); }

class ReverseWindow {
public:
  void prepare(float sampleRate) {
    sampleRate_ = std::max(8000.0f, sampleRate);
    const int maxSamples = static_cast<int>(std::ceil(kMaxDelaySeconds * sampleRate_)) + 4;
    for (auto& bank : ext_) bank.assign(maxSamples, 0.0f);
    for (auto& bank : fb_) bank.assign(maxSamples, 0.0f);
    reset();
  }

  void reset() {
    captureBank_ = 0;
    playBank_ = 1;
    capturePos_ = 0;
    playPos_ = 0;
    windowSamples_ = 1;
    feedbackLp_ = 0.0f;
    primed_ = false;
    lastOut_ = 0.0f;
  }

  void setWindowSamples(int samples) {
    const int maxSamples = static_cast<int>(ext_[0].size()) - 1;
    const int next = std::max(1, std::min(maxSamples, samples));
    if (next == windowSamples_) return;

    // A reverse window is atomic: changing its length halfway through capture
    // would split one reversed event across two banks. Restart capture/playback
    // at a clean boundary when the geometry changes.
    windowSamples_ = next;
    capturePos_ = 0;
    playPos_ = 0;
    captureBank_ = 0;
    playBank_ = 1;
    primed_ = false;
    lastOut_ = 0.0f;
    for (auto& bank : ext_) std::fill(bank.begin(), bank.end(), 0.0f);
    for (auto& bank : fb_) std::fill(bank.begin(), bank.end(), 0.0f);
  }

  bool atWindowStart() const { return capturePos_ == 0; }

  float process(float input, float feedback, float tapeAmount) {
    const int n = windowSamples_;
    const int cap = capturePos_;
    const int rev = n - 1 - cap;

    // External material is written forward. Feedback is written backwards.
    // When the bank is later read backwards, the newly captured material is
    // reversed once while recirculated material keeps the direction it already
    // had. This is what lets live changes to reverse affect only new material.
    ext_[captureBank_][cap] = input;
    fb_[captureBank_][rev] = feedbackShape(lastOut_ * feedback, tapeAmount);

    float out = 0.0f;
    if (primed_) {
      const int read = n - 1 - playPos_;
      out = ext_[playBank_][read] + fb_[playBank_][read];
      // A short edge envelope avoids hard discontinuities at segment joins.
      const int fade = std::max(4, std::min(n / 6, static_cast<int>(sampleRate_ * 0.004f)));
      if (fade > 0) {
        float g = 1.0f;
        if (playPos_ < fade) {
          const float x = static_cast<float>(playPos_) / static_cast<float>(fade);
          g *= 0.5f - 0.5f * std::cos(kPi * x);
        }
        const int remain = n - 1 - playPos_;
        if (remain < fade) {
          const float x = static_cast<float>(remain) / static_cast<float>(fade);
          g *= 0.5f - 0.5f * std::cos(kPi * std::max(0.0f, x));
        }
        out *= g;
      }
    }

    lastOut_ = out;
    ++capturePos_;
    ++playPos_;
    if (capturePos_ >= n) {
      capturePos_ = 0;
      playPos_ = 0;
      std::swap(captureBank_, playBank_);
      primed_ = true;
    }
    return out;
  }

private:
  float feedbackShape(float x, float tapeAmount) {
    const float tape = clamp01(tapeAmount);
    const float cutoff = 18000.0f - tape * 14500.0f;
    const float a = std::exp(-2.0f * kPi * cutoff / sampleRate_);
    feedbackLp_ = (1.0f - a) * x + a * feedbackLp_;
    const float warm = softclip(feedbackLp_ * (1.0f + 1.8f * tape));
    return feedbackLp_ * (1.0f - tape) + warm * tape;
  }

  float sampleRate_ = 48000.0f;
  std::array<std::vector<float>, 2> ext_;
  std::array<std::vector<float>, 2> fb_;
  int captureBank_ = 0;
  int playBank_ = 1;
  int capturePos_ = 0;
  int playPos_ = 0;
  int windowSamples_ = 1;
  float feedbackLp_ = 0.0f;
  float lastOut_ = 0.0f;
  bool primed_ = false;
};

struct DelayLine {
  dspark::Delay<float> forward;
  std::array<dspark::PitchShifter<float>, 2> pitch;
  ReverseWindow reverse;
  bool routeNewToReverse = false;
  int segmentPos = 0;
  int segmentSamples = 1;
  uint32_t rng = 0x12345678u;
  float looseOffset = 0.0f;
  float currentPitchSemitones = 0.0f;
  int pitchSamplesRemaining = 0;
  int pitchWindowPos = 0;
  int activePitchBank = 0;

  float random01() {
    uint32_t x = rng;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    rng = x;
    return static_cast<float>(rng) / 4294967296.0f;
  }
};

class SonusDelay {
public:
  SonusDelay() = default;

  void setSampleRate(float sr) {
    sampleRate_ = std::max(8000.0f, sr);
    dspark::AudioSpec spec { sampleRate_, kBlockSize, 1 };
    for (int i = 0; i < kMaxLines; ++i) {
      lines_[i].forward.prepare(spec, kMaxDelaySeconds);
      lines_[i].forward.setSmoother(dspark::Delay<float>::SmootherType::Linear);
      lines_[i].forward.setSmoothingTime(18.0f);
      for (auto& shifter : lines_[i].pitch) {
        shifter.prepare(dspark::AudioSpec { sampleRate_, kBlockSize, 1 }, 512);
        shifter.setMix(1.0f);
        shifter.setTransientPreserve(true);
      }
      lines_[i].reverse.prepare(sampleRate_);
      lines_[i].rng = 0x9e3779b9u ^ static_cast<uint32_t>((i + 1) * 0x85ebca6bu);
      // Stable per-line detune. This is deliberately not regenerated when
      // parameters move, so `loose` changes the amount without making taps wander.
      uint32_t h = 0x7f4a7c15u ^ static_cast<uint32_t>((i + 1) * 0x9e3779b9u);
      h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
      lines_[i].looseOffset = (static_cast<float>(h) / 4294967295.0f) * 2.0f - 1.0f;
    }
    refreshLineTimes();
  }

  void setLines(float v) { lineCount_ = std::max(1, std::min(kMaxLines, static_cast<int>(std::round(v)))); refreshLineTimes(); }
  void setTimeMs(float v) { timeMs_ = std::max(5.0f, std::min(kMaxDelaySeconds * 1000.0f, v)); refreshLineTimes(); }
  void setSpread(float v) { spread_ = clamp01(v); refreshLineTimes(); }
  void setSpreadLoose(float v) { spreadLoose_ = clamp01(v); refreshLineTimes(); }
  void setFeedback(float v) { feedback_ = std::max(0.0f, std::min(0.985f, v)); refreshTape(); }
  void setReverse(float v) { reverseProbability_ = clamp01(v); }
  void setPitchProbability(float v) { pitchProbability_ = clamp01(v); }
  void setPitchShiftCount(float v) {
    pitchShiftCount_ = std::max(1, std::min(kMaxPitchShifts, static_cast<int>(std::round(v))));
  }
  void setPitchShiftValue(int index, float semitones) {
    if (index < 0 || index >= kMaxPitchShifts || !std::isfinite(semitones)) return;
    pitchShifts_[index] = std::max(-12.0f, std::min(12.0f, semitones));
  }
  void setTape(float v) { tape_ = clamp01(v); refreshTape(); }
  void setDiffusion(float v) { diffusion_ = clamp01(v); }
  void setMix(float v) { mix_ = clamp01(v); }
  void setPingPong(float v) { const float x = clamp01(v); pingPong_ = std::sqrt(x); refreshTape(); }

  float* inL() { return inL_.data(); }
  float* inR() { return inR_.data(); }
  float* outL() { return outL_.data(); }
  float* outR() { return outR_.data(); }

  void process(int frames) {
    frames = std::max(0, std::min(kBlockSize, frames));
    if (frames <= 0) return;

    // Pitch is selected exactly at each delay-window boundary. Two shifters
    // alternate between windows so a newly selected semitone value does not
    // glide from the previous one through the internal state of one shifter.
    for (int lineIndex = 0; lineIndex < lineCount_; ++lineIndex) {
      auto& line = lines_[lineIndex];

      const float position = lineCount_ <= 1
        ? 0.0f
        : (2.0f * static_cast<float>(lineIndex) / static_cast<float>(lineCount_ - 1) - 1.0f);
      const float pan = position * spread_;
      const float gainL = std::sqrt(0.5f * (1.0f - pan));
      const float gainR = std::sqrt(0.5f * (1.0f + pan));

      for (int i = 0; i < frames; ++i) {
        pitchedInput_[lineIndex][i] = inL_[i] * gainL + inR_[i] * gainR;
      }

      int offset = 0;
      while (offset < frames) {
        if (line.pitchSamplesRemaining <= 0) {
          line.currentPitchSemitones = choosePitchShift(line);
          line.pitchSamplesRemaining = std::max(1, line.segmentSamples);
          line.pitchWindowPos = 0;
          line.activePitchBank ^= 1;
          line.pitch[line.activePitchBank].setSemitones(line.currentPitchSemitones);
        }

        const int chunk = std::min(frames - offset, line.pitchSamplesRemaining);
        float* activeChannel = pitchedInput_[lineIndex].data() + offset;
        float* activeChannels[] = { activeChannel };

        // The active bank owns this complete window.
        line.pitch[line.activePitchBank].processBlock(
          dspark::AudioBufferView<float>(activeChannels, 1, chunk)
        );

        // Very short equal-power crossfade at the start of the new window.
        // The previous bank is processed only for the fade region to mask a
        // discontinuity; its semitone value is never interpolated.
        const int fadeSamples = std::max(
          1,
          std::min(
            static_cast<int>(sampleRate_ * 0.004f),
            std::max(1, line.segmentSamples / 10)
          )
        );
        const int fadeCount = std::max(
          0,
          std::min(chunk, fadeSamples - line.pitchWindowPos)
        );

        if (fadeCount > 0) {
          for (int j = 0; j < fadeCount; ++j) {
            pitchScratch_[j] =
              inL_[offset + j] * gainL + inR_[offset + j] * gainR;
          }

          float* oldChannel = pitchScratch_.data();
          float* oldChannels[] = { oldChannel };
          line.pitch[line.activePitchBank ^ 1].processBlock(
            dspark::AudioBufferView<float>(oldChannels, 1, fadeCount)
          );

          for (int j = 0; j < fadeCount; ++j) {
            const float x = static_cast<float>(line.pitchWindowPos + j)
              / static_cast<float>(fadeSamples);
            const float oldGain = std::cos(clamp01(x) * kPi * 0.5f);
            const float newGain = std::sin(clamp01(x) * kPi * 0.5f);
            activeChannel[j] = pitchScratch_[j] * oldGain + activeChannel[j] * newGain;
          }
        }

        offset += chunk;
        line.pitchSamplesRemaining -= chunk;
        line.pitchWindowPos += chunk;
      }
    }

    const float norm = 1.0f / std::sqrt(static_cast<float>(std::max(1, lineCount_)));
    const float localFeedback = feedback_ * (1.0f - pingPong_);

    for (int i = 0; i < frames; ++i) {
      const float dryL = inL_[i];
      const float dryR = inR_[i];
      float wetL = 0.0f;
      float wetR = 0.0f;

      for (int lineIndex = 0; lineIndex < lineCount_; ++lineIndex) {
        auto& line = lines_[lineIndex];
        if (line.reverse.atWindowStart()) {
          line.routeNewToReverse = line.random01() < reverseProbability_;
        }

        const float position = lineCount_ <= 1
          ? 0.0f
          : (2.0f * static_cast<float>(lineIndex) / static_cast<float>(lineCount_ - 1) - 1.0f);
        const float pan = position * spread_;
        const float gainL = std::sqrt(0.5f * (1.0f - pan));
        const float gainR = std::sqrt(0.5f * (1.0f + pan));

        // True ping-pong: a portion of the previous wet field is fed into the
        // opposite side's delay lines. At 100%, local feedback is disabled and
        // recirculation alternates sides.
        const float crossFeedback =
          (pingFeedbackR_ * gainL + pingFeedbackL_ * gainR)
          * feedback_ * pingPong_ * norm;

        const float source = pitchedInput_[lineIndex][i] + crossFeedback;
        const float forwardIn = line.routeNewToReverse ? 0.0f : source;
        const float reverseIn = line.routeNewToReverse ? source : 0.0f;

        const float forwardOut = line.forward.processSample(0, forwardIn);
        const float reverseOut = line.reverse.process(reverseIn, localFeedback, tape_);
        const float y = forwardOut + reverseOut;
        wetL += y * gainL;
        wetR += y * gainR;
      }

      wetL *= norm;
      wetR *= norm;

      // Store the undiffused wet field for the next ping-pong feedback sample.
      pingFeedbackL_ = wetL;
      pingFeedbackR_ = wetR;

      diffL_ += 0.12f * (wetL - diffL_);
      diffR_ += 0.12f * (wetR - diffR_);
      wetL = wetL * (1.0f - diffusion_) + diffL_ * diffusion_;
      wetR = wetR * (1.0f - diffusion_) + diffR_ * diffusion_;

      const float dryGain = std::cos(mix_ * kPi * 0.5f);
      const float wetGain = std::sin(mix_ * kPi * 0.5f);
      outL_[i] = dryL * dryGain + wetL * wetGain;
      outR_[i] = dryR * dryGain + wetR * wetGain;
    }
  }

private:
  float choosePitchShift(DelayLine& line) {
    if (pitchProbability_ <= 0.0f || line.random01() >= pitchProbability_) return 0.0f;

    std::array<int, kMaxPitchShifts> candidates {};
    int count = 0;
    for (int i = 0; i < pitchShiftCount_; ++i) {
      if (std::abs(pitchShifts_[i]) > 0.001f) candidates[count++] = i;
    }
    if (count == 0) return 0.0f;
    const int choice = std::min(count - 1, static_cast<int>(line.random01() * static_cast<float>(count)));
    return pitchShifts_[candidates[choice]];
  }

  void refreshTape() {
    const float lp = 18000.0f - tape_ * 14500.0f;
    for (auto& line : lines_) {
      line.forward.setFeedback(feedback_ * (1.0f - pingPong_));
      line.forward.setFeedbackLpHz(lp);
      line.forward.setFeedbackMode(
        tape_ > 0.001f
          ? dspark::Delay<float>::FeedbackMode::Analog
          : dspark::Delay<float>::FeedbackMode::Clean
      );
    }
  }

  void refreshLineTimes() {
    // Independent-line geometry:
    // `time` is the center, not the final tap. More active lines automatically
    // widen the usable time field so dense configurations do not collapse into
    // a tight multitap cluster.
    const float lineDensity = lineCount_ <= 1
      ? 0.0f
      : static_cast<float>(lineCount_ - 1) / static_cast<float>(kMaxLines - 1);
    const float maxWidth = 0.45f + 0.40f * lineDensity; // 45% .. 85% around center

    for (int i = 0; i < kMaxLines; ++i) {
      const int activeIndex = std::min(i, lineCount_ - 1);
      const float basePosition = lineCount_ <= 1
        ? 0.0f
        : (2.0f * static_cast<float>(activeIndex) / static_cast<float>(lineCount_ - 1) - 1.0f);

      // Stable per-line asymmetry. It changes the geometry, not continuously
      // over time, so the individual delay lines remain recognisable.
      const float looseWarp = lines_[i].looseOffset * spreadLoose_;
      float position = basePosition + looseWarp * (0.35f + 0.55f * spread_);
      position = std::max(-1.40f, std::min(1.40f, position));

      const float width = maxWidth * spread_;
      float factor = 1.0f + position * width;
      factor += lines_[i].looseOffset * spreadLoose_ * (0.05f + 0.05f * lineDensity);

      factor = std::max(0.10f, std::min(1.95f, factor));
      const float ms = std::max(5.0f, timeMs_ * factor);

      lines_[i].forward.setDelayMs(ms);
      lines_[i].forward.setFeedback(feedback_);
      lines_[i].segmentSamples = std::max(1, static_cast<int>(std::round(ms * sampleRate_ / 1000.0f)));
      lines_[i].reverse.setWindowSamples(lines_[i].segmentSamples);
      lines_[i].segmentPos = 0;
      lines_[i].pitchSamplesRemaining = 0;
      lines_[i].pitchWindowPos = 0;
    }
    refreshTape();
  }

  float sampleRate_ = 48000.0f;
  int lineCount_ = 4;
  float timeMs_ = 250.0f;
  float spread_ = 0.35f;
  float spreadLoose_ = 0.25f;
  float feedback_ = 0.45f;
  float reverseProbability_ = 0.0f;
  float pitchProbability_ = 0.0f;
  int pitchShiftCount_ = 1;
  std::array<float, kMaxPitchShifts> pitchShifts_ { 0.0f };
  float tape_ = 0.35f;
  float diffusion_ = 0.12f;
  float mix_ = 0.35f;
  float pingPong_ = 0.0f;
  float diffL_ = 0.0f;
  float diffR_ = 0.0f;
  float pingFeedbackL_ = 0.0f;
  float pingFeedbackR_ = 0.0f;
  std::array<DelayLine, kMaxLines> lines_;
  std::array<std::array<float, kBlockSize>, kMaxLines> pitchedInput_ {};
  std::array<float, kBlockSize> pitchScratch_ {};
  std::array<float, kBlockSize> inL_{};
  std::array<float, kBlockSize> inR_{};
  std::array<float, kBlockSize> outL_{};
  std::array<float, kBlockSize> outR_{};
};

} // namespace

extern "C" {

void* su_delay_create() { return new SonusDelay(); }
void su_delay_destroy(void* ptr) { delete static_cast<SonusDelay*>(ptr); }
void su_delay_set_sample_rate(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setSampleRate(v); }
void su_delay_set_lines(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setLines(v); }
void su_delay_set_time_ms(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setTimeMs(v); }
void su_delay_set_spread(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setSpread(v); }
void su_delay_set_spread_loose(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setSpreadLoose(v); }
void su_delay_set_feedback(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setFeedback(v); }
void su_delay_set_reverse(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setReverse(v); }
void su_delay_set_pitch_probability(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setPitchProbability(v); }
void su_delay_set_pitch_shift_count(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setPitchShiftCount(v); }
void su_delay_set_pitch_shift_value(void* ptr, int index, float v) { static_cast<SonusDelay*>(ptr)->setPitchShiftValue(index, v); }
void su_delay_set_tape(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setTape(v); }
void su_delay_set_diffusion(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setDiffusion(v); }
void su_delay_set_mix(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setMix(v); }
void su_delay_set_pingpong(void* ptr, float v) { static_cast<SonusDelay*>(ptr)->setPingPong(v); }
float* su_delay_in_l(void* ptr) { return static_cast<SonusDelay*>(ptr)->inL(); }
float* su_delay_in_r(void* ptr) { return static_cast<SonusDelay*>(ptr)->inR(); }
float* su_delay_out_l(void* ptr) { return static_cast<SonusDelay*>(ptr)->outL(); }
float* su_delay_out_r(void* ptr) { return static_cast<SonusDelay*>(ptr)->outR(); }
void su_delay_process(void* ptr, int frames) { static_cast<SonusDelay*>(ptr)->process(frames); }

}
