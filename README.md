# Sonus Umbrae

**Sonus Umbrae** is an experimental browser-based live coding environment for building and performing modular audio systems entirely from text.

It is designed around a simple idea: **the source code is the patch**. Objects describe sound generators and processors, `->` creates signal connections, and editing the source continuously reconciles the running audio graph without requiring a separate graphical patch editor.

Sonus Umbrae is currently an early prototype. The language, runtime and APIs are expected to evolve.

## Current features

- Browser-based live coding interface with a monochrome phosphor-inspired UI.
- Declarative source model: editing the document updates the running graph.
- Web Audio engine with AudioWorklet processing.
- WebAssembly DSP support compiled from C/C++ with Emscripten.
- `Voice()` synthesis engine based on the MIT-licensed Mutable Instruments Plaits DSP.
- Built-in `Audio` audio interface singleton.
- Built-in `Clock` master clock and derived clock rates.
- Signal routing with per-connection attenuation and inversion.
- Live signal, trigger and parameter views.
- Read-only `:scheme` view for inspecting the current routing graph.
- Source diagnostics with per-line error highlighting.
- Plain-text `.sum` session files.

## Example

```text
Clock.bpm(120)

a = Voice().model(2).freq(220)
Clock.out -> a.trig

a.timbre(55)
a.out(70) -> Audio.out

a.out.view()
a.timbre.view()
Audio.view()
```

Connection gain is part of the route itself:

```text
a.out(50) -> Audio.out
```

A negative value acts as an attenuverter:

```text
source.out(-50) -> destination.parameter
```

Sonus Umbrae does not enforce a hard language-level distinction between audio and control voltage. Internally, ports carry metadata such as `signal`, `gate`, or `trigger`, mainly so the environment can visualize them appropriately.

## Interface

The main screen is intentionally minimal: a status bar and the live source editor. Press `Esc` to enter command mode.

Useful commands currently include:

```text
:scheme
:config
:help
:save
:load
:start
:stop
:clock start
:clock stop
:panic
```

`Tab` toggles directly between the live editor and the read-only Scheme view.

## Project status

Sonus Umbrae is pre-alpha software. At this stage the project is focused on defining:

- the live language and its declarative runtime;
- signal routing semantics;
- reusable port and parameter metadata;
- browser-native real-time DSP infrastructure;
- a compact visual language for inspecting live patches.

The current `Voice()` engine is only the first external DSP integration. Future engines and processors are not intended to be limited to Mutable Instruments-derived code.

## Building

See [BUILD.md](BUILD.md) for macOS setup, Node.js, Emscripten, DSP source setup and local development instructions.

## Language reference

The current language notes and examples live in [docs/LANGUAGE.md](docs/LANGUAGE.md).

## Open source and third-party code

Sonus Umbrae's own source code is released under the MIT License. See [LICENSE](LICENSE).

The project can download and compile third-party DSP code during development. Those components retain their own copyright and license terms. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

The current `Voice()` implementation uses DSP code from the Mutable Instruments Eurorack repository. Mutable Instruments states that its STM32F project code, including Plaits, is distributed under the MIT License. Mutable Instruments is a registered trademark; Sonus Umbrae is an independent project and is not affiliated with or endorsed by Mutable Instruments.


Additional modules include `Swell()` (Tides 2018 DSP) and `Dices()` (Marbles DSP). Both use Sonus Umbrae-specific names while retaining the applicable upstream MIT license notices.
