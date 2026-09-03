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

The master clock is explicit and its monitor is always available:

```text
CLOCK set 120 bpm
```

The master can deliberately move away from a perfectly rigid pulse:

```text
CLOCK set 120 bpm with jitter 8, drift 12
```

`jitter 0..100` adds fast interval-to-interval timing variation. A value of 10
allows roughly ±10% instantaneous interval variation around the nominal tempo.
`drift 0..100` is slower and correlated: the clock gradually wanders around the
nominal BPM instead of choosing a completely new offset on every tick. The BPM
shown in the status bar remains the nominal BPM; the always-on master clock view
shows the actual irregular trigger spacing.

A program using beat-based `every` statements remains stopped with respect to
beat timing until a master clock is declared and the program transport is
running.

The clock value can also be dynamic:

```text
CLOCK set rnd(110,120) bpm with cycle 4 beats
```

### Named derived clocks

Simple one-off dividers and multipliers remain available:

```text
SET half: clock /2
SET double: clock *2
```

For a clock with its own timing character, declare a named `CLOCK` block:

```text
CLOCK slow with view:
    from MASTER /4
    jitter 15
    drift 25
```

`with view` is optional. Unlike the master clock, named clocks do not create a
sidebar monitor unless requested.

A named clock can derive from another named clock:

```text
CLOCK slow:
    from MASTER /2
    drift 10

CLOCK broken with view:
    from slow /3
    jitter 30
    drift 4
```

The rate is relative to the selected parent. The parent's jitter/drift character
is inherited and the child's values are added on top, capped at 100. This lets a
clock remain related to the master while becoming progressively less rigid.

Use named clocks from any beat-based `every` clause:

```text
VOICE bass:
    sound macro.analog
    note [C2 Eb2 G2] with walk every 1 beat with clock slow
```

or use an anonymous master-derived rate directly:

```text
morph 50 every 2 beats with clock /4
```

The `every` count is measured in ticks of the selected clock. Therefore
`every 2 beats with clock /2` updates every two ticks of the half-rate clock.
Timing modifiers such as `chance`, `coin` and `loose` remain local to the
`every` clause rather than changing the clock itself.


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

The language supports direct random expressions such as:

```text
rnd(10,50)
```

`rnd()` is stateless: each evaluation simply chooses a new value from the
requested range.

Sonus Umbrae also provides **generative modifiers**. These describe the musical
character of a changing value rather than exposing the mathematical algorithm
used internally.

The initial vocabulary is:

| Modifier | Character | Meaning of amount |
| --- | --- | --- |
| `wander` | gradual correlated movement | maximum freedom of movement per update |
| `trend` | persistent directional movement with inertia | strength of the current trend |
| `scatter` | independent jumps around the base value | maximum deviation from the base |
| `flutter` | small irregular movement concentrated near the base | maximum microvariation |

Examples:

```text
morph 50 with wander 20 every 1 beat
timbre 60 with trend 15 every 2 beats
harmo 40 with scatter 30 every 4 beats
position 50 with flutter 8 every 0.25 sec
```

The amount is interpreted in the natural domain of the parameter. For ordinary
0..100 parameters:

```text
morph 50 with wander 20 every 1 beat
```

starts from 50 and allows the wandering process to move with an intensity of
20 while always respecting the legal 0..100 range.

The modifiers are intentionally different:

```text
morph 50 with wander 20 every 1 beat
```

depends on the previous generated value, producing a random walk.

```text
morph 50 with trend 20 every 1 beat
```

develops a direction and tends to continue in that direction for several
updates before gradually reversing.

```text
morph 50 with scatter 20 every 1 beat
```

does not walk from the previous value; each update is a new deviation around
the base value 50.

```text
morph 50 with flutter 20 every 1 beat
```

also remains centered on the base but concentrates most changes closer to it,
producing smaller irregular fluctuations.

All generative modifiers are stateful for the lifetime of the running program.
`RUN STOP` and a subsequent fresh run reinitialize their state.

### Sequence movement

`wander`, `trend`, `scatter`, and `flutter` apply only to scalar parameters.
They are not sequencing modes for note lists or scales.

Discrete musical sequences keep their own vocabulary:

```text
random
walk
shuffle
reverse
```

`walk` can optionally take an amount:

```text
scale C minor with walk every 1 beat
scale C minor with walk 3 every 1 beat
```

Without an amount, `walk` moves by one sequence step at a time. With an amount,
the runtime may move forward or backward by up to that many sequence steps on
each update.

For a scale, these are scale degrees/list positions rather than semitones.

```text
scale C minor with range C2 C5, walk 2 every 1 beat
```

remains inside the declared C2..C5 range.

This distinction is intentional:

- `walk` answers **which item comes next in a discrete sequence**;
- `wander`, `trend`, `scatter`, and `flutter` answer **how a scalar value
  evolves over time**.


### Generative modifiers and derived clocks

Generative behavior composes with normal timing:

```text
SET slow: clock /2

VOICE lead:
    sound macro.fm
    scale C minor with range C3 C5, walk 2 every 2 beats with clock slow
    morph 50 with trend 20 every 1 beat with clock /4
```

The generator determines **how** the value changes. `every` determines **when**
it changes. `with clock ...` determines which clock provides those beat steps.



## SEQ and Turing Machine

`SEQ` declares a reusable generative note source. Unlike a static `SET`, a
sequencer owns runtime state and can evolve independently from the VOICE or FX
that reads it.

The first implemented model is `turing`, inspired by the shift-register
behaviour of classic modular Turing Machine sequencers:

```text
SEQ melody:
    model turing
    length 8
    change 12
    scale C minor with range C2 C4
    every 1 beat
```

The generated source is read with `from`:

```text
VOICE bass:
    sound macro.analog
    note from melody every 1 beat
```

The `SEQ` timing and the consumer timing are independent. For example:

```text
SEQ melody:
    model turing
    length 8
    change 10
    scale D dorian with range D2 D4
    every 2 beats

VOICE bass:
    sound macro.analog
    note from melody every 1 beat
```

Here the Turing register advances every two beats, while the voice reads its
current note every beat. Multiple consumers can therefore read the same
sequence source at different rates.

### Turing parameters

`length` sets the active shift-register length and accepts integers from 2 to
32. Traditional hardware-inspired lengths such as 2, 3, 4, 5, 6, 8, 12 and 16
are useful, but Sonus Umbrae does not restrict the sequencer to those values.

`change` is a percentage from 0 to 100 controlling how likely the feedback bit
is to mutate when the register advances:

```text
change 0
```

keeps the current loop locked, while higher values introduce progressively
more variation.

The musical material can be supplied as a scale:

```text
scale C minor with range C2 C4
```

or as an explicit note vocabulary:

```text
notes [C2 Eb2 G2 Bb2 C3]
```

Turing `notes` intentionally do not accept note weights, repeats or retrigs.
Those modifiers belong to list traversal modes such as `random`, whereas the
Turing register itself determines the generated selection.

`every` uses the normal Sonus Umbrae timing grammar, including derived clocks
and probability modifiers:

```text
every 1 beat with clock /4
every 2 beats with coin
```

A SEQ source controls its own generation, so consumers do not add list
selection modes on top of it. The canonical form is therefore:

```text
note from melody every 1 beat
```

rather than `note from melody with random ...`.

### Turing view

A Turing sequence can request a dedicated sidebar monitor:

```text
SEQ melody with view:
    model turing
    length 8
    change 12
    notes [C2 Eb2 G2 Bb2]
    every 1 beat
```

The panel shows the current register as filled/empty cells, the active length,
change amount and current note. The cells shift visually as the register
advances, making it possible to distinguish a stable repeating loop from a
stopped scheduler.

`SEQ` objects also appear in the VARIABLES monitor with type `Seq`.


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
