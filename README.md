# Sonus Umbrae

**Sonus Umbrae** is an experimental browser-based live-coding environment for composing and performing modular audio systems entirely from text.

The source document is the patch: declarations describe generators, modulators, processors, sequencing and routing, while the runtime reconciles edits against the live audio graph. The project combines a typed musical language, a shared scheduler, Web Audio / AudioWorklet orchestration and WebAssembly DSP backends. The graphical Scheme view is intentionally an observer of the running patch rather than a second patch-editing surface.

Sonus Umbrae is not built around one synthesizer family or one upstream hardware ecosystem. Its public language uses its own engine and model names while selected permissively licensed DSP implementations are integrated behind those abstractions.

## Current characteristics

- Text-first modular live coding with hot reload quantized to the musical transport.
- Shared beat/wall-clock scheduler for `every`, probability, named clock objects, clock-rate derivation and generative events.
- Typed reusable values including scalar, time, note, frequency, scale and envelope specifications.
- Stateful `SEQ` sources, including a Turing-style generative sequencer.
- Stereo-aware routing, serial processing chains and explicit per-route levels.
- AudioWorklet processing with C/C++ DSP compiled to independent WebAssembly modules.
- Macro synthesis engines derived from permissively licensed Mutable Instruments Plaits DSP.
- `matter` physical modelling derived from Mutable Instruments Elements DSP.
- `resonator.*` models derived from Mutable Instruments Rings DSP, including internal polyphony and stereo MAIN/AUX behaviour.
- Four-output modulation derived from Mutable Instruments Tides 2018 DSP.
- `mist.*` stereo effects derived from the permissively licensed SuperParasites/Clouds family.
- `sky` ambient reverb based on Ghost Note Audio CloudSeedCore.
- Multimode `svf` filtering based on Electrosmith DaisySP, with simultaneous `lp`/`hp`/`bp`/`np` outputs and low-pass as the default.
- Performance-oriented source controls with `LIVE` parameters/notes and hot mute/bypass/pause declarations for voices, filters, effects and both master/named clocks.
- Read-only Scheme topology view and optional live signal/parameter visualisation.
- Plain-text `.sum` sessions.

## Project documentation

- [`docs/LANGUAGE.md`](docs/LANGUAGE.md) — language syntax, typing, timing, object semantics and routing.
- [`BUILD.md`](BUILD.md) — local development, DSP source setup and WebAssembly builds.
- [`ROADMAP.md`](ROADMAP.md) — current direction and planned architecture.
- [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) — licensing overview for upstream components.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — attribution and notices required or requested by upstream projects.

## Status

Sonus Umbrae is under active development. The language, DSP registry and runtime contracts may still change while the architecture is being consolidated.
