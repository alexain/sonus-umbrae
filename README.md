# Sonus Umbrae

**Sonus Umbrae** is an experimental browser-based live-coding environment for composing and performing modular audio systems entirely from text.

The source document is the patch: declarations describe generators, modulators, processors, sequencing and routing, while the runtime reconciles edits against the live audio graph. The project combines a typed musical language, a shared scheduler, Web Audio / AudioWorklet orchestration and WebAssembly DSP backends. The graphical Scheme view is intentionally an observer of the running patch rather than a second patch-editing surface.

Sonus Umbrae is not built around one synthesizer family or one upstream hardware ecosystem. Its public language uses its own engine and model names while selected permissively licensed DSP implementations are integrated behind those abstractions.

## Current characteristics

- Text-first modular live coding with hot reload quantized to the musical transport.
- Shared beat/wall-clock scheduler for `every`, probability, named clock objects, clock-rate derivation and generative events.
- Typed reusable values including scalar, time, note, frequency, scale and envelope specifications, with a unified `PITCH` property for `SCALE`, `NOTES`, and `FREQS` material.
- Stateful `SEQ` sources, including a Turing-style generative sequencer.
- Stereo-aware routing, serial processing chains and explicit per-route levels.
- AudioWorklet processing with C/C++ DSP compiled to independent WebAssembly modules.
- Macro synthesis engines derived from permissively licensed Mutable Instruments Plaits DSP.
- `matter` physical modelling derived from Mutable Instruments Elements DSP.
- `resonator.*` models derived from Mutable Instruments Rings DSP, including internal polyphony and stereo MAIN/AUX behaviour.
- Four-output modulation derived from Mutable Instruments Tides 2018 DSP.
- `MOD ... model dices` random-voltage modulation derived from selected MIT-licensed Mutable Instruments Marbles components, exposing `x1`, `x2`, `x3` and slow `y` outputs.
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

### Environment

The live environment includes dedicated Configuration, Help, Scheme, and About screens, a keyboard-first `Esc` quick menu, and a terminal-style `>` command prompt. Optional program capabilities are declared with the top-of-file `USE` directive; editor-only preferences remain outside the language and are stored locally by the browser. See `docs/LANGUAGE.md` for the language contract.


The configuration screen can select the browser audio output when supported, request a sample rate, choose a Web Audio latency mode, and display the effective sample rate and reported latency. Audio-structural changes restart the audio engine after confirmation.


### Euclidean timing

Any `EVERY`-driven change can use clock-synchronous Euclidean timing, for example `EVERY EUCLIDEAN 5/16 WITH ROTATE 2`. `CLOCK`, `CHANCE`, and `LOOSE` remain composable timing modifiers.


### Registers

`REGISTER` provides stateful pitch storage. `model shift` consumes a `SEQ` source on `write every ...` and exposes stages such as `canon.1`, `canon.2`, etc. Life pools can be consumed with readers such as `with random` or `with walk`.

### Creative delay

`FX ... model delay` is a WASM creative multi-line delay. It supports 1..8 lines, musical or absolute delay times, stereo/time spread, feedback, probabilistic true reverse capture, probabilistic discrete-window pitch shifting, ping-pong stereo motion, tape-coloured feedback, diffusion, and wet/dry mix. Reverse decisions apply only to newly captured windows and remain attached to those tails through feedback.

Delay `spread` can be loosened without exposing per-line timing: `spread 60 with loose 40`. `loose 0` is regular but unquantized; the default is `25` for more independent line spacing.


<!-- SONUS-0.3.0-README -->
## 0.3.0 highlights

The 0.3.0 release expands Sonus Umbrae's generative modulation and performance tooling:

- `MOD ... model dices`, a Marbles-derived random-voltage backend with `x1`, `x2`, `x3`, and slow `y` outputs.
- Dices controls for `rate`, `spread`, `bias`, `steps`, `deja`, `length`, and `diversity`.
- `LIVE` editor controls for Dices parameters; these currently use commit-on-release semantics.
- Module view scaling with `WITH VIEW`, `WITH VIEW <n>V`, and `WITH VIEW <n>X`.
- Dices views preserve their real `-5V..+5V` control-voltage domain and label traces as `X1 / X2 / X3 / Y`.
- The creative delay gains discrete-window probabilistic pitch shifting and ping-pong behaviour in addition to reverse/tape/diffusion processing.
- Configuration now includes a persistent `OUTPUT LEVEL` control, independent from script-level `MAIN LEVEL`.


<!-- SONUS-GITHUB-PAGES -->
## Browser preview

The `main` branch is deployable to GitHub Pages. Release WASM files are committed under `public/dsp/`, so the Pages workflow only installs the JavaScript dependencies and runs the Vite production build.

Expected public URL:

```text
https://alexain.github.io/sonus-umbrae/
```

The browser preview is intended for testing current releases. Web Audio capabilities such as explicit output-device selection remain browser-dependent.
