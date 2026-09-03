# Sonus Umbrae language notes

> **Status:** 0.1.0 development reference. The language is still experimental and may evolve.

Sonus Umbrae treats the source document as the desired state of a live modular
audio system. The runtime compiles the high-level language, reconciles the
running graph, and keeps the audio system live while the source changes.

The source code is the patch: sound generators, modulators, effects, timing,
routing, and views are all declared textually.

## Evaluation and transport

`Cmd+Enter` / `Ctrl+Enter` recompiles and starts the current live program.

`RUN` starts the complete program transport.

`RUN STOP` stops the complete live program, including:

- voice scheduling;
- master-clock transport;
- parameter reevaluation jobs;
- beat-based jobs;
- local and global `MOD` objects.

The current shortcut for `RUN STOP` on macOS is:

```text
Cmd+Backspace
```

The master clock does not start implicitly. A program that depends on beat
timing must declare a clock explicitly.

```text
CLOCK set 120 bpm
```

When the source contains errors, the invalid desired state is not applied and
the previous valid graph remains active.

Comments use:

```text
// comment
```

## Top-level statements

The current high-level language uses these main statement families:

```text
SET
CLOCK
VOICE
MOD
FX
PLAY
MAIN
```

`VOICE`, `MOD`, and `FX` declarations use colon-delimited blocks.

Example:

```text
CLOCK set 120 bpm

VOICE lead:
    sound macro.fm
    note C4

PLAY lead through MAIN
```

## SET

`SET` creates reusable typed values.

Scalar:

```text
SET amount: 50
```

Time:

```text
SET slow: 4 sec
SET pulse: 2 beats
```

Frequency:

```text
SET tuning: 220 hz
```

Note:

```text
SET root: C3
```

Note list:

```text
SET notes: [C3 Eb3 G3 Bb3]
```

Scale:

```text
SET harmony: C minor
```

A typed time variable can be reused by `every`:

```text
SET movement: 2 beats

VOICE lead:
    every movement
    sound macro.fm
    morph rnd(20,80)
```

## CLOCK

The master clock is explicit:

```text
CLOCK set 120 bpm
```

A program using beat-based `every` statements remains stopped with respect to
beat timing until a master clock is declared and the program transport is
running.

The clock value can also be dynamic:

```text
CLOCK set rnd(110,120) bpm
```

The timing system is shared by all objects. Wall-clock timing and beat timing
are handled by the same runtime scheduler.

## VOICE

A voice is declared with:

```text
VOICE lead:
    sound macro.fm
```

`VOICE` uses a public engine registry. Current macro-oscillator models are
exposed under `macro.*` names rather than upstream hardware names.

Examples include:

```text
sound macro.analog
sound macro.waves
sound macro.fm
```

Only parameters supported by the selected engine are accepted.

Typical engine parameters include:

```text
harmo 50
timbre 50
morph 50
```

### LPG

Compatible macro engines can enable the integrated low-pass gate:

```text
VOICE lead:
    sound macro.fm with lpg
```

When LPG is active, note events and sequence advances trigger the integrated
envelope/gate behavior.

### Voice level

The intrinsic output level of a voice is:

```text
VOICE lead:
    sound macro.fm
    level 80
```

`level` belongs to the voice itself and affects all routes sourced from that
voice.

## Notes, frequency, and scales

A voice can use a fixed note:

```text
note C4
```

A fixed frequency:

```text
freq 220
```

A list:

```text
note [C3 G3 Bb3]
```

Selection modifiers:

```text
note [C3 G3 Bb3] with random
note [C3 G3 Bb3] with walk
note [C3 G3 Bb3] with shuffle
note [C3 G3 Bb3] with reverse
```

Scales are written as:

```text
scale C minor
```

The root note is normalized automatically to uppercase.

A range and sequencing mode can be combined:

```text
scale C minor with range C2 C5, walk
```

## every

`every` is the public temporal reevaluation syntax.

Per-property timing:

```text
morph rnd(30,70) every 1 sec
```

```text
scale C minor with walk every 2 beats
```

Timing modifiers belong to the `every` clause:

```text
morph rnd(20,80) every 3 sec with drift
```

```text
scale C minor with random every 2 beats with loose, chance 80
```

The canonical order is:

```text
property value [with property modifiers] every time [with timing modifiers]
```

`every` stays at the end of the property expression.

### Object-level every

A `VOICE` or `FX` can declare a fallback cadence:

```text
VOICE lead:
    every 2 sec
    sound macro.fm
    morph rnd(20,80)
    timbre rnd(30,70)
```

All dynamic properties without their own `every` inherit the object-level
cadence.

An explicit property cadence overrides the object cadence:

```text
VOICE lead:
    every 4 sec
    sound macro.fm
    morph rnd(20,80)
    timbre rnd(30,70) every 1 sec
```

Precedence:

```text
property every
    >
object every
    >
no periodic reevaluation
```

`every` can also use a typed `SET` time variable:

```text
SET movement: 3 sec

VOICE lead:
    every movement
    sound macro.fm
    morph rnd(20,80)
```

All jobs remain synchronized to the shared runtime scheduler.

## MOD

`MOD` is the current four-output modulation object.

Top-level declaration:

```text
MOD motion:
    rate 4 sec
    shape sine
```

A module view can be requested directly:

```text
MOD motion with view:
    rate 4 sec
```

The four outputs are named:

```text
motion.a
motion.b
motion.c
motion.d
```

Current parameters include:

```text
rate 4 sec
slope 50
shape sine
smooth 50
shift 50
relation phase
range control
```

For phase-related output relationships:

```text
relation phase with shift 100
```

The four outputs remain synchronized and share the same underlying modulation
object.

### Local MOD inside VOICE

A `MOD` can be local to a voice:

```text
VOICE lead:
    sound macro.fm

    MOD motion:
        rate 4 sec
        shape sine

    morph from motion.a with depth 40
```

The local name is scoped to the containing object. Internally the runtime uses
a generated identifier, but that identifier is not part of the public language.

Multiple voice parameters can reuse different outputs from the same local
modulator:

```text
VOICE lead:
    sound macro.fm

    MOD motion:
        rate 4 sec
        relation phase with shift 100

    morph from motion.a with depth 30
    timbre from motion.b with depth 20
    harmo from motion.c with depth 15
```

`depth` is expressed in the logical -100..100 modulation range.

## FX

Effects are declared only at top level:

```text
FX grain:
    model mist.grain
```

`FX` is not currently allowed inside a `VOICE`.

A module view is requested with:

```text
FX grain with view:
    model mist.grain
```

Current Mist-family models:

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

These are Sonus Umbrae public model names mapped onto the current Mist /
SuperParasites backend.

Typical parameters include:

```text
position 50
size 50
pitch 0
density 50
texture 50
mix 100
spread 50
feedback 0
reverb 0
freeze off
reverse off
```

### Mix

`mix` is the effect dry/wet control:

```text
mix 0
```

fully dry.

```text
mix 100
```

fully wet.

Intermediate values use the host-side equal-power crossfade.

### Dynamic FX parameters

FX parameters support `rnd()` and `every`:

```text
FX grain:
    model mist.grain
    position rnd(20,80) every 4 sec
    density rnd(30,70) every 2 beats
```

An object-level fallback is also supported:

```text
FX grain:
    model mist.grain
    every 4 sec
    position rnd(20,80)
    density rnd(30,70)
```

### Musical pitch on Mist models

Compatible Mist models accept musical pitch syntax.

Fixed transposition by note:

```text
note C4
```

C4 is the current zero-semitone reference.

Examples:

```text
note C3
```

maps to approximately -12 semitones.

```text
note C5
```

maps to approximately +12 semitones.

Sequenced pitch:

```text
note [C3 G3 Bb3] with random every 1 beat
```

Scale sequencing:

```text
scale C minor with range C3 C5, walk every 2 beats
```

Frequency syntax is also accepted where musical pitch is supported:

```text
freq [130.81 196 261.63] with shuffle every 1 sec
```

### Local MOD inside FX

`MOD` can also be scoped to an effect:

```text
FX grain:
    model mist.grain

    MOD motion:
        rate 4 sec
        shape sine

    position from motion.a with depth 30
    density from motion.b with depth 20
```

The current Mist integration receives this modulation at control rate rather
than through dedicated audio-rate CV inputs.

## PLAY

Audio routing uses `PLAY`.

Basic route:

```text
PLAY lead through MAIN
```

The source output defaults to the primary output of the object.

For a voice, explicit outputs are:

```text
lead.out
lead.aux
```

Example:

```text
PLAY lead.out through MAIN
```

### Route level

`at` sets the gain of the route leaving the object immediately before it:

```text
PLAY lead at 70 through MAIN
```

This does not change `VOICE level`.

A chain can contain independent edge levels:

```text
PLAY lead at 70 through grain at 50 then MAIN
```

Semantics:

```text
lead  -> grain   70%
grain -> MAIN    50%
```

### then

`then` creates serial routing:

```text
PLAY lead through grain then MAIN
```

Longer chains are valid:

```text
PLAY lead through grain then delay then reverb then MAIN
```

### Multiline PLAY

Long routing chains can be written on multiple physical lines:

```text
PLAY lead at 70
    through grain at 50
    then reverb at 80
    then MAIN
```

Indented `through` / `then` lines are continuations of the original `PLAY`
statement.

## Stereo routing

Stereo effects use `.L` and `.R` channel selectors.

The suffix describes the channel; whether it is an input or output is inferred
from its position in the `PLAY` route.

Input selection:

```text
PLAY lead through grain.L
```

Output selection:

```text
PLAY grain.L through MAIN.L
```

Lowercase `.l` and `.r` are normalized to `.L` and `.R`.

### Mono to stereo normalization

A mono source sent to a stereo FX without a channel suffix is duplicated to
both FX input channels:

```text
PLAY lead through grain
```

Conceptually:

```text
lead.out -> grain.L
lead.out -> grain.R
```

### Stereo FX to MAIN

A stereo effect sent to `MAIN` without channel suffixes preserves stereo:

```text
PLAY grain through MAIN
```

Conceptually:

```text
grain.L -> MAIN.L
grain.R -> MAIN.R
```

Explicit routing is still available:

```text
PLAY lead.out through grain.L
PLAY lead.aux through grain.R

PLAY grain.L through MAIN.L
PLAY grain.R through MAIN.R
```

## MAIN

The final main-bus level is a separate top-level command:

```text
MAIN level 70
```

This is distinct from both:

```text
VOICE lead:
    level 80
```

and:

```text
PLAY lead at 50 through MAIN
```

The three gain stages are therefore:

```text
VOICE level
    ->
PLAY route at
    ->
MAIN level
```

## Views

`with view` requests an object-level visualization.

Examples:

```text
VOICE lead with view:
    sound macro.fm
```

```text
MOD motion with view:
    rate 4 sec
```

```text
FX grain with view:
    model mist.grain
```

VOICE views show the source object's output at the voice's own level.

MOD views use the four-output modulation visualization.

FX/Mist views are stereo.

The automatic main audio-out scope represents the signal after routing and
`MAIN level`.

## Scheme

Press `Tab` or use command mode:

```text
:scheme
```

Scheme is a read-only topological view of the current runtime. It is not a
graphical patch editor.

Declared parameter values are shown inside the owning module. Optional views
can also appear in the Scheme representation.

## Command mode

Press `Esc` from the editor to enter command mode.

Current useful commands include:

```text
:scheme
:config
:help
:save
:load
:new
:clear
:run
:run stop
:start
:stop
:test 440
:test stop
:panic
```

`:start` controls the Web Audio engine lifecycle.

`:run` compiles and starts the current live program.

`:run stop` stops the program transport without shutting down the Web Audio
engine itself.

## Save and load

`:save` writes the current source to a plain-text `.sum` file.

`:load` loads a `.sum` file into the editor.

Session files remain text-based and suitable for version control.

## Expression and generative helpers

The language already uses small expression helpers in dynamic parameter
contexts.

Examples:

```text
rnd(10,50)
```

and dynamic parameters such as:

```text
morph rnd(30,70) every 1 sec
```

The broader generative/event language is still evolving. Syntax documented in
older prototypes such as low-level object construction, direct `->` patching,
or `when (...) { ... }` should not be treated as part of the current 0.1.0
high-level language unless it is reintroduced explicitly.

## Current implementation boundary

The public 0.1.0 language intentionally hides the current upstream DSP module
names behind Sonus Umbrae engine families:

```text
VOICE -> macro.*
MOD   -> current four-output modulation backend
FX    -> mist.*
```

This keeps the language independent from any one upstream hardware product and
allows future DSP families to coexist behind the same object model.

## Planned language directions

The following remain future or incomplete areas:

- richer event-driven syntax;
- conditional execution;
- additional reusable generative/stateful functions;
- more synthesis engine families;
- more FX families;
- hardware and multi-channel audio I/O;
- MIDI and OSC integration;
- multi-script sessions;
- richer clock transformations and event generation;
- additional visualizers such as spectrum and level views;
- audiovisual objects and routing;
- native and dedicated-hardware runtimes.

The core design principle remains unchanged: the text document is the source of
truth, the runtime reconciles it live, and Scheme remains an observer rather
than a graphical editor.
