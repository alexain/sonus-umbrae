# Sonus Umbrae

**Sonus Umbrae** is an experimental browser-based live-coding environment for building and performing modular audio systems from text.

The source document is the patch: `VOICE`, `DRUMKIT`, `MOD`, `FX`, `FILTER`, clocks, sequencers and routes describe the desired musical system, while the runtime reconciles edits against the live Web Audio graph. DSP backends are implemented with AudioWorklets and independent WebAssembly modules where practical.

## Highlights

- Text-first modular live coding with quantized hot reload.
- Musical clocks, reusable rhythms, probability and generative sequencing.
- Synth voices ranging from basic oscillators to macro, physical-model and resonator engines.
- Sample `VOICE` playback with root tuning, regions, loop/reverse, slicing, sequencing and waveform monitoring.
- Synthesized and sample-backed `DRUMKIT` instruments.
- DaisySP noise sources: `noise.white`, `noise.dust`, `noise.clocked` and `noise.fractal`, available as both audio `VOICE` engines and modulation sources where appropriate.
- Multi-output `MOD ... model lfo` with independent waveform, rate ratio, phase and level for each output.
- Additional modulation models including `swell`, `dices` and audio-rate `composite` graphs.
- Stereo routing, named ports, filters, delays, ambient/realtime effects and automatic MAIN routing.
- Read-only Scheme and signal views for observing the running patch.
- Plain-text `.sum` sessions.

Sonus Umbrae exposes its own public language rather than mirroring any particular hardware ecosystem. Selected permissively licensed DSP implementations are integrated behind those abstractions.

## Documentation

- [`docs/LANGUAGE.md`](docs/LANGUAGE.md) — language syntax and runtime semantics.
- [`docs/SNIPPETS.md`](docs/SNIPPETS.md) — editor shorthand for creating normal Sonus source.
- [`BUILD.md`](BUILD.md) — local development and WebAssembly DSP builds.
- [`ROADMAP.md`](ROADMAP.md) — current architectural direction.
- [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — upstream licensing and attribution.

## Try it online

Sonus Umbrae runs in a modern browser through the project GitHub Pages deployment:

**https://alexain.github.io/sonus-umbrae/**

The online build tracks the current public release from `main`. Web Audio capabilities such as explicit output-device selection remain browser-dependent.

## Status

Sonus Umbrae is under active development. Language, DSP registry and runtime contracts may still evolve while the architecture is consolidated.
