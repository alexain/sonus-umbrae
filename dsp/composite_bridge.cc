/*
 * Sonus Umbrae composite VOICE backend.
 *
 * Builds an audio-rate graph from DaisySP basic oscillators. The public DSL
 * references ordinary VOICE objects; this backend keeps private operator
 * instances so composite modulation never mutates the operators' normal dry
 * routing. Named MIX buses and the final output bus are real audio sums.
 */

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

#include "Synthesis/oscillator.h"

namespace {
constexpr int kMaxOperators = 16;
constexpr int kMaxEdges = 48;
constexpr int kMaxMixes = 16;
constexpr int kMaxMixInputs = 16;
constexpr int kMaxBlockSize = 128;
constexpr int kMaxOutputs = 16;

enum Relation : int { kFm = 0, kPm = 1, kAm = 2, kRing = 3, kSync = 4 };
enum OutputKind : int { kOperatorOutput = 0, kMixOutput = 1 };

void applyWaveform(daisysp::Oscillator& osc, int waveform) {
  uint8_t value = daisysp::Oscillator::WAVE_SIN;
  switch (waveform) {
    case 1: value = daisysp::Oscillator::WAVE_POLYBLEP_TRI; break;
    case 2: value = daisysp::Oscillator::WAVE_POLYBLEP_SAW; break;
    case 3: value = daisysp::Oscillator::WAVE_RAMP; break;
    case 4: value = daisysp::Oscillator::WAVE_POLYBLEP_SQUARE; break;
    default: break;
  }
  osc.SetWaveform(value);
}

struct Operator {
  daisysp::Oscillator osc;
  float frequency = 440.0f;
  float width = 0.5f;
  float level = 1.0f;
  int waveform = 0;
  float previous = 0.0f;
  float previous2 = 0.0f;
  float current = 0.0f;
};

struct Edge {
  int relation = kFm;
  int source = 0;
  int target = 0;
  float depth = 1.0f;
  float p1 = 0.0f;
  float p2 = 0.0f;
  bool invert = false;
};

struct MixInput {
  int source = 0;
  float level = 1.0f;
  int octave = 0;
  float detune = 0.0f;
  daisysp::Oscillator shifted;
  bool shiftedReady = false;
};

struct MixBus {
  int inputCount = 0;
  std::array<MixInput, kMaxMixInputs> inputs{};
  float current = 0.0f;
};

struct OutputTap {
  int kind = kOperatorOutput;
  int index = 0;
};

struct CompositeState {
  float sampleRate = 48000.0f;
  int operatorCount = 0;
  int edgeCount = 0;
  int mixCount = 0;
  int outputCount = 0;
  std::array<Operator, kMaxOperators> operators{};
  std::array<Edge, kMaxEdges> edges{};
  std::array<MixBus, kMaxMixes> mixes{};
  std::array<OutputTap, kMaxOutputs> outputTaps{};
  float outputs[kMaxOutputs][kMaxBlockSize]{};

  void initOperator(int index) {
    auto& op = operators[index];
    op.osc.Init(sampleRate);
    op.osc.SetAmp(1.0f);
    applyWaveform(op.osc, op.waveform);
    op.osc.SetFreq(op.frequency);
    op.osc.SetPw(op.width);
  }

  void initShifted(MixInput& input) {
    input.shifted.Init(sampleRate);
    input.shifted.SetAmp(1.0f);
    input.shiftedReady = true;
  }

  float sourceValue(const Edge& edge) const {
    if (edge.source < 0 || edge.source >= operatorCount) return 0.0f;
    float value = operators[edge.source].previous;
    return edge.invert ? -value : value;
  }

  void processOperators() {
    for (int i = 0; i < operatorCount; ++i) {
      auto& op = operators[i];
      float frequency = op.frequency;
      float phaseAdd = 0.0f;
      bool reset = false;
      float resetPhase = 0.0f;

      for (int e = 0; e < edgeCount; ++e) {
        const auto& edge = edges[e];
        if (edge.target != i) continue;
        float source = sourceValue(edge);
        if (edge.relation == kFm) {
          source += op.previous * edge.p1;
          frequency += source * op.frequency * 4.0f * edge.depth;
        } else if (edge.relation == kPm) {
          source += op.previous * edge.p1;
          phaseAdd += source * edge.depth * 0.5f;
        } else if (edge.relation == kSync) {
          const auto& sourceOp = operators[edge.source];
          const float now = edge.invert ? -sourceOp.previous : sourceOp.previous;
          const float before = edge.invert ? -sourceOp.previous2 : sourceOp.previous2;
          if (before <= 0.0f && now > 0.0f) {
            reset = true;
            resetPhase = std::clamp(edge.p1, 0.0f, 1.0f);
          }
        }
      }

      frequency = std::clamp(frequency, 1.0f, sampleRate * 0.45f);
      op.osc.SetFreq(frequency);
      if (reset) op.osc.Reset(resetPhase);
      if (phaseAdd != 0.0f) op.osc.PhaseAdd(phaseAdd);
      float value = op.osc.Process() * op.level;

      for (int e = 0; e < edgeCount; ++e) {
        const auto& edge = edges[e];
        if (edge.target != i) continue;
        const float source = sourceValue(edge);
        if (edge.relation == kAm) {
          const float bias = std::clamp(edge.p1, 0.0f, 1.0f);
          const float wet = std::clamp(bias + (1.0f - bias) * (source * 0.5f + 0.5f), -1.0f, 1.0f);
          const float modulation = (1.0f - edge.depth) + edge.depth * wet;
          const float mix = edge.p2 <= 0.0f ? 1.0f : std::clamp(edge.p2, 0.0f, 1.0f);
          value = value * ((1.0f - mix) + mix * modulation);
        } else if (edge.relation == kRing) {
          float modulator = source;
          if (edge.p2 > 0.0f) modulator = std::tanh(modulator * (1.0f + edge.p2 * 8.0f));
          const float wet = value * modulator;
          const float mix = edge.p1 <= 0.0f ? edge.depth : std::clamp(edge.p1, 0.0f, 1.0f);
          value = value * (1.0f - mix) + wet * mix;
        }
      }
      op.current = std::clamp(value, -4.0f, 4.0f);
    }

    for (int i = 0; i < operatorCount; ++i) {
      auto& op = operators[i];
      op.previous2 = op.previous;
      op.previous = op.current;
    }
  }

  void processMixes() {
    for (int m = 0; m < mixCount; ++m) {
      auto& mix = mixes[m];
      float sum = 0.0f;
      for (int i = 0; i < mix.inputCount; ++i) {
        auto& input = mix.inputs[i];
        if (input.source < 0 || input.source >= operatorCount) continue;
        const auto& source = operators[input.source];
        float value = source.previous;
        if (input.octave != 0 || std::fabs(input.detune) > 0.0001f) {
          if (!input.shiftedReady) initShifted(input);
          applyWaveform(input.shifted, source.waveform);
          const float ratio = std::pow(2.0f, static_cast<float>(input.octave) + input.detune / 1200.0f);
          input.shifted.SetFreq(std::clamp(source.frequency * ratio, 1.0f, sampleRate * 0.45f));
          input.shifted.SetPw(source.width);
          value = input.shifted.Process() * source.level;
        }
        sum += value * input.level;
      }
      mix.current = std::clamp(sum, -8.0f, 8.0f);
    }
  }

  float tapValue(const OutputTap& tap) const {
    if (tap.kind == kMixOutput) {
      return tap.index >= 0 && tap.index < mixCount ? mixes[tap.index].current : 0.0f;
    }
    return tap.index >= 0 && tap.index < operatorCount ? operators[tap.index].previous : 0.0f;
  }
};
}  // namespace

extern "C" {
CompositeState* su_composite_create() { return new CompositeState(); }
void su_composite_destroy(CompositeState* state) { delete state; }
void su_composite_set_sample_rate(CompositeState* state, float sampleRate) {
  if (!state || !std::isfinite(sampleRate)) return;
  state->sampleRate = std::max(8000.0f, sampleRate);
  for (int i = 0; i < state->operatorCount; ++i) state->initOperator(i);
  for (int m = 0; m < state->mixCount; ++m) {
    for (int i = 0; i < state->mixes[m].inputCount; ++i) state->initShifted(state->mixes[m].inputs[i]);
  }
}
void su_composite_set_operator_count(CompositeState* state, int count) {
  if (!state) return;
  state->operatorCount = std::clamp(count, 0, kMaxOperators);
  for (int i = 0; i < state->operatorCount; ++i) state->initOperator(i);
}
void su_composite_set_operator(CompositeState* state, int index, int waveform, float frequency, float width, float level) {
  if (!state || index < 0 || index >= state->operatorCount) return;
  auto& op = state->operators[index];
  op.waveform = std::clamp(waveform, 0, 4);
  op.frequency = std::max(1.0f, frequency);
  op.width = std::clamp(width, 0.0f, 1.0f);
  op.level = std::clamp(level, 0.0f, 1.0f);
  applyWaveform(op.osc, op.waveform);
  op.osc.SetFreq(op.frequency);
  op.osc.SetPw(op.width);
}
void su_composite_set_edge_count(CompositeState* state, int count) {
  if (state) state->edgeCount = std::clamp(count, 0, kMaxEdges);
}
void su_composite_set_edge(CompositeState* state, int index, int relation, int source, int target, float depth, float p1, float p2, int invert) {
  if (!state || index < 0 || index >= state->edgeCount) return;
  auto& edge = state->edges[index];
  edge.relation = std::clamp(relation, 0, 4);
  edge.source = source;
  edge.target = target;
  edge.depth = std::clamp(depth, 0.0f, 1.0f);
  edge.p1 = p1;
  edge.p2 = p2;
  edge.invert = invert != 0;
}
void su_composite_set_mix_count(CompositeState* state, int count) {
  if (state) state->mixCount = std::clamp(count, 0, kMaxMixes);
}
void su_composite_set_mix_input_count(CompositeState* state, int mixIndex, int count) {
  if (!state || mixIndex < 0 || mixIndex >= state->mixCount) return;
  state->mixes[mixIndex].inputCount = std::clamp(count, 0, kMaxMixInputs);
}
void su_composite_set_mix_input(CompositeState* state, int mixIndex, int inputIndex, int source, float level, int octave, float detune) {
  if (!state || mixIndex < 0 || mixIndex >= state->mixCount) return;
  auto& mix = state->mixes[mixIndex];
  if (inputIndex < 0 || inputIndex >= mix.inputCount) return;
  auto& input = mix.inputs[inputIndex];
  input.source = source;
  input.level = std::clamp(level, 0.0f, 1.0f);
  input.octave = std::clamp(octave, -8, 8);
  input.detune = std::clamp(detune, -1200.0f, 1200.0f);
  state->initShifted(input);
}
void su_composite_set_output_count(CompositeState* state, int count) {
  if (state) state->outputCount = std::clamp(count, 0, kMaxOutputs);
}
void su_composite_set_output(CompositeState* state, int index, int kind, int targetIndex) {
  if (!state || index < 0 || index >= state->outputCount) return;
  state->outputTaps[index].kind = kind == kMixOutput ? kMixOutput : kOperatorOutput;
  state->outputTaps[index].index = targetIndex;
}
float* su_composite_out(CompositeState* state, int output) {
  if (!state || output < 0 || output >= state->outputCount) return nullptr;
  return state->outputs[output];
}
void su_composite_process(CompositeState* state, int size) {
  if (!state) return;
  const int frames = std::clamp(size, 0, kMaxBlockSize);
  for (int frame = 0; frame < frames; ++frame) {
    state->processOperators();
    state->processMixes();
    for (int out = 0; out < state->outputCount; ++out) {
      state->outputs[out][frame] = state->tapValue(state->outputTaps[out]);
    }
  }
}
}
