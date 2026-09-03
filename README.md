# Sonus Umbrae

**Sonus Umbrae** is an experimental browser-based live-coding environment for
building and performing modular audio systems entirely from text.

The central idea is simple: **the source code is the patch**. `VOICE`, `MOD`,
and `FX` declarations create sound and processing objects, while `PLAY`
describes audio routing. Editing and recompiling the source reconciles the live
audio graph without requiring a separate graphical patch editor.

Version **0.1.0** is the first tagged development release. The language,
runtime, DSP registry, and UI are still evolving.

## Current features

- Browser-based live-coding interface with a monochrome phosphor-inspired UI.
- Declarative source model with explicit `RUN` / `RUN STOP` transport semantics.
- Web Audio engine with AudioWorklet processing.
- WebAssembly DSP compiled from C/C++ with Emscripten.
- `VOICE` macro-oscillator family backed by Mutable Instruments Plaits DSP.
- `MOD` four-output modulation source backed by Mutable Instruments Tides 2018 DSP.
- `FX` stereo effects backed by the current Mist / SuperParasites integration.
- Per-object and per-route level control.
- Stereo-aware routing with mono-to-stereo normalization.
- Serial routing chains using `through` and `then`.
- Per-parameter and object-level temporal reevaluation with `every`.
- Time values stored in typed `SET` variables.
- Scale/note/frequency sequencing modes including order, random, walk, shuffle,
  and reverse.
- `SEQ` generative sources, currently including a Turing Machine model with
  mutable shift-register loops, scale/note material, independent timing, and
  an optional live register view.
- Local `MOD` declarations inside `VOICE` and `FX`.
- Optional signal views and a read-only Scheme view.
- Source diagnostics with per-line error highlighting.
- Plain-text `.sum` session files.

## Example

```text
SET movement: 2 beats

CLOCK set 120 bpm

VOICE lead with view:
    sound macro.fm with lpg
    level 85
    scale C minor with range C3 C5, walk every movement
    morph rnd(30,70) every 1 sec

    MOD motion:
        rate 4 sec
        shape sine
        relation phase with shift 100

    timbre from motion.a with depth 35

FX grain with view:
    model mist.grain
    mix 100
    position rnd(20,80) every 4 sec
    density rnd(30,70) every movement

PLAY lead at 75
    through grain at 60
    then MAIN

MAIN level 80
```

`RUN` starts the complete program transport. `RUN STOP` stops the clock,
voices, schedulers, and modulators together. `Cmd+Backspace` is the current
shortcut for `RUN STOP`.

A generative Turing source can be shared by voices independently of their read
rate:

```text
SEQ melody with view:
    model turing
    length 8
    change 12
    notes [C2 Eb2 G2 Bb2 C3]
    every 1 beat

VOICE bass:
    sound macro.analog
    note from melody every 1 beat
```

## Routing

A route level belongs to the object immediately before `through` or `then`:

```text
PLAY lead at 70 through grain at 50 then MAIN
```

This means:

```text
lead  -> grain   70%
grain -> MAIN    50%
```

The same route can be written on separate lines:

```text
PLAY lead at 70
    through grain at 50
    then MAIN
```

A mono source routed to a stereo `FX` is normalized to both input channels.
A stereo `FX` routed to `MAIN` maps left-to-left and right-to-right by default.

Explicit channel selection is also available:

```text
PLAY lead.out through grain.L
PLAY lead.aux through grain.R

PLAY grain.L through MAIN.L
PLAY grain.R through MAIN.R
```

## Levels

Object level and route level are deliberately separate:

```text
VOICE lead:
    sound macro.fm
    level 80

PLAY lead at 50 through MAIN

MAIN level 70
```

`VOICE level` affects the source object itself. `at` affects only the
corresponding route. `MAIN level` controls the final main bus.

Scopes follow the signal at the point they represent: a `VOICE` scope reflects
the voice level, while the main audio-out scope reflects routing and
`MAIN level`.

## Temporal evaluation

`every` is the public timing syntax for dynamic properties:

```text
morph rnd(20,80) every 2 sec
scale C minor with walk every 1 beat
```

Timing modifiers belong to `every`:

```text
morph rnd(20,80) every 3 sec with drift
scale C minor with random every 2 beats with loose, chance 80
```

An object-level `every` acts as the fallback for dynamic properties that do not
declare their own cadence:

```text
SET movement: 4 sec

VOICE pad:
    every movement
    sound macro.waves
    morph rnd(20,80)
    timbre rnd(30,70) every 1 sec
```

All timing remains attached to the shared runtime scheduler and master clock.

## Effects

`FX` declarations are top-level objects. The current Mist family includes:

```text
mist.grain
mist.stretch
mist.delay
mist.spectral
mist.reverb
mist.resonator
mist.repeat
mist.smear
```

For example:

```text
FX texture:
    model mist.grain
    position 50
    size 60
    density 40
    texture 50
    pitch 0
    mix 100
    spread 50
    feedback 20
    reverb 30
```

Local modulators can be declared inside an effect:

```text
FX texture:
    model mist.grain

    MOD motion:
        rate 4 sec
        shape sine

    position from motion.a with depth 30
```

Musical pitch sequencing is supported only on compatible Mist models:

```text
scale C minor with range C3 C5, random every 2 beats
```

C4 is the current zero-semitone pitch reference for this mapping.

## Interface

The main screen is intentionally minimal: a status bar and the live source
editor. Press `Esc` to enter command mode.

Useful commands include:

```text
:scheme
:config
:help
:save
:load
:run
:run stop
:start
:stop
:panic
```

`Tab` toggles directly between the live editor and the read-only Scheme view.

## Project status

Sonus Umbrae 0.1.0 is still experimental. Current work is focused on:

- stabilizing the high-level language and parser;
- making routing semantics consistent across mono, stereo, modulation, and
  future multi-output hardware;
- expanding engine-specific parameter schemas;
- improving runtime scheduling and event semantics;
- improving Scheme and scope visualization;
- keeping DSP integrations replaceable behind Sonus Umbrae-specific public
  engine names.

The language is intentionally not tied to the identity or user interface of any
one upstream hardware module.

## Building

See [BUILD.md](BUILD.md) for Node.js, Emscripten, DSP source setup, WebAssembly
builds, and local development instructions.

## Language reference

The current language notes and examples live in
[docs/LANGUAGE.md](docs/LANGUAGE.md).

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned language, routing, MIDI, audiovisual,
native-platform, and hardware directions.

## Open source and third-party code

Sonus Umbrae's own source code is released under the MIT License. See
[LICENSE](LICENSE).

The project downloads and compiles third-party DSP code during development.
Those components retain their own copyright and license terms. See
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Mutable Instruments is a registered trademark. Sonus Umbrae is an independent
project and is not affiliated with or endorsed by Mutable Instruments.
