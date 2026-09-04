# Sonus Umbrae language notes

> **Status:** 0.1.0 development reference. The language is still experimental and may evolve.

Sonus Umbrae treats the source document as the desired state of a live modular
audio system. The runtime compiles the high-level language, reconciles the
running graph, and keeps the audio system live while the source changes.

The source code is the patch: sound generators, modulators, effects, timing,
routing, and views are all declared textually.

## Evaluation and transport

`Cmd+Enter` / `Ctrl+Enter` starts the program when LIVE is stopped. While LIVE is already running, it performs a quantized hot reload: the edited source is validated immediately and the new desired state is reconciled on the next master-clock beat. Existing DSP objects are retained where possible, so effect tails and persistent generative state do not restart just because a parameter or route changed.

`RUN` follows the same rule: start when stopped, hot-reload when already running.

`RUN STOP` is a musical transport stop. It stops master-clock transport, voice scheduling, parameter/beat jobs, and modulators, but leaves downstream FX routes alive so reverbs and delays can decay naturally. The full emergency cut remains `PANIC`.

The transport-stop shortcut is:

```text
Cmd+Backspace / Ctrl+Backspace
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
CLOCK SET 120 bpm
```

Its clock view is always active in the sidebar and in Scheme. `WITH VIEW` is
therefore not used on the master clock.

The master can have its own timing character:

```text
CLOCK SET 120 bpm WITH JITTER 8, DRIFTER 12
```

`JITTER 0..100` adds fast interval-to-interval timing variation. `DRIFTER
0..100` adds a slower correlated wander around the nominal tempo. Both are
properties of the clock object; the BPM shown in the status bar remains the
nominal BPM while the master view shows the actual trigger spacing.

The master clock may be paused live without stopping the rest of the program:

```text
_CLOCK SET 120 bpm WITH JITTER 8
```

Pausing the master stops the entire musical clock tree: the master, all named
clocks derived from it, and all beat-based jobs stop receiving ticks. Wall-clock
`sec`/`ms` jobs and already-running audio tails continue independently.
Removing the underscore starts a fresh musical clock epoch: beat phase is not
recovered or caught up, named clocks restart from the new master downbeat, and
no burst of missed beat events is emitted.

The clock value can also be dynamic:

```text
CLOCK SET rnd(110,120) bpm WITH CYCLE 4 beats
```

### Named clocks

A named clock is a runtime object and is declared with `CLOCK`, never with
`SET`. `SET` remains reserved for typed values/parameters.

A named clock inherits the master rate by default, so this is valid:

```text
CLOCK human WITH JITTER 10
```

It runs at the same nominal rate as the master but has its own local jitter.
`RATE` is optional and expresses a multiplier/divider of the master:

```text
CLOCK slow RATE /2
CLOCK fast RATE *2
CLOCK broken RATE /4 WITH JITTER 30, DRIFTER 8
```

A named clock gets a visual clock view only when explicitly requested:

```text
CLOCK slow RATE /2 WITH VIEW
CLOCK human WITH JITTER 10, DRIFTER 4, VIEW
```

The view uses the same moving clock-point language as the master clock view.
Named clock modifiers can therefore include `JITTER`, `DRIFTER` and `VIEW`,
separated by commas.

A named clock can be paused independently:

```text
_CLOCK human WITH JITTER 10, VIEW
```

Only that clock stops emitting ticks; the master and other clocks continue.
There is deliberately no `_SET` form because `SET` can hold non-clock typed
values and disabling it would invalidate unrelated dependencies.

Use named clocks from beat-based `EVERY` clauses:

```text
VOICE bass:
    SOUND macro.analog
    NOTE [C2 Eb2 G2] WITH WALK EVERY 1 beat WITH CLOCK slow
```

or use an anonymous master-derived rate directly when no persistent clock
object is needed:

```text
MORPH 50 EVERY 2 beats WITH CLOCK /4
```

The `EVERY` count is measured in ticks of the selected clock.

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

Typical macro-engine parameters include:

```text
harmo 50
timbre 50
morph 50
```

### Matter physical-modeling voices

`matter` is backed by the original Mutable Instruments Elements DSP, compiled as
a separate WebAssembly module. It remains one physical-modeling instrument: a
shared pitch/resonator, three exciters, two external mono excitation inputs,
and one logical stereo output.

```text
VOICE body:
    sound matter
    note C3
    bow 35 with timbre 50
    blow 20 with timbre 65
    strike 70 with timbre 40
    geometry 45
    brightness 65
    damping 55
    position 35
    space 25
```

`BOW`, `BLOW`, and `STRIKE` are independent exciter levels in `0..100`. If an
exciter is omitted its level defaults to `0`; its local `TIMBRE` defaults to
`50`. Resonator parameters use their normal object defaults when omitted.

#### Matter audio I/O

Matter preserves the two external audio paths of Elements. `body.in` is the
default external input and follows the envelope/diffuser excitation path;
`body.in2` is the second direct resonator input. Both are mono. The default
unsuffixed Matter output is stereo, with MAIN on the left and AUX on the right;
`.main`/`.out` and `.aux` select either output explicitly.

```text
PLAY source THROUGH body THEN MAIN
PLAY source THROUGH body.in2 THEN MAIN
```

Because Matter is a `VOICE` with audio inputs, it can be used as a serial
processor without changing its declaration category.

#### Envelope values

Envelope shapes are typed values. Structured envelope lists use commas because
time values consist of a number plus a unit:

```text
AD      [250 ms, 1.2 sec]
ADR     [4 sec, 300 ms, 1.2 sec]
ASR     [800 ms, 75, 2 sec]
ADSR    [20 ms, 300 ms, 70, 1.5 sec]
DAHDSR  [100 ms, 400 ms, 250 ms, 800 ms, 65, 2 sec]
```

The arity and value types are strict. Time stages require `ms` or `sec`; sustain
values use `0..100`. For example an ADSR always requires exactly four values and
its third value must be the sustain level.

Envelopes can be stored in `SET` and consumed only by compatible parameters:

```text
SET env1: ADR [4 sec, 300 ms, 1.2 sec]

VOICE body:
    sound matter
    strike 70
    drive from env1
```

`DRIVE` controls the common Elements excitation/performance signal. Without an
explicit `EVERY`, it is retriggered by the VOICE note event (including each new
note produced by a note/scale/SEQ source). Retriggering starts from the current
envelope level rather than forcing a discontinuity to zero.

`DRIVE` may instead use the normal global timing grammar:

```text
DRIVE AD [1 sec, 1 sec] EVERY 2 beat
DRIVE FROM env1 EVERY 4 beat WITH CHANCE 70
DRIVE FROM env1 EVERY 2 beat WITH CLOCK pulse, LOOSE
```

This does not create a local scheduler. The trigger is registered as another job
on the single runtime scheduler used by all `EVERY` events. When `DRIVE` has its
own `EVERY`, note changes update pitch but do not also retrigger DRIVE.

The envelope itself runs inside the Matter AudioWorklet at DSP rate. Its current
level drives Elements performance strength continuously; the gate stays active
while the envelope has non-zero energy, allowing bow/blow excitation to evolve
through the envelope while strike responds to the gate edge.

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

The source output defaults to the primary output of the object. `THROUGH` is
resolved by audio-port capability rather than by declaration category: an
object may be a `VOICE`, `FILTER`, or `FX` and still be a valid processor if it
exposes an audio input. An object with no audio input is rejected as a
`THROUGH` destination.

For a normal macro voice, explicit outputs are:

```text
lead.out
lead.aux
```

Example:

```text
PLAY lead.out through MAIN
```

Intermediate output selectors belong to the node, not to its input. For
example:

```text
PLAY lead THROUGH tone.hp THEN MAIN
```

routes `lead` into `tone.in`, then routes the SVF high-pass output to `MAIN`.
The same rule allows source/processor hybrids such as `resonator.*` and
`matter` to appear inside a serial chain.

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

### Stereo to mono coercion

When a stereo object is routed into a mono input without selecting a channel,
Sonus uses that object's primary channel. For the current stereo objects this
is MAIN/left. Explicit `.aux` or `.R` selection always overrides this default.

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


### Live disable, mute and bypass

A leading underscore on a live object declaration temporarily excludes that object without deleting its definition or routes. The runtime keeps the object instantiated so removing the underscore is a fast hot-state change:

```text
_VOICE bass:
    SOUND macro.analog
    NOTE C2

_FILTER tone:
    MODEL svf
    CUTOFF 60

_FX space:
    MODEL sky

_CLOCK pulse RATE *2
```

The effect depends on the object's audio role: `_VOICE` mutes the voice output while preserving DSP state; `_FILTER` bypasses the filter and passes its input through all exposed filter outputs; `_FX` bypasses the processor dry while stopping new input into the wet engine so an existing reverb/delay tail can decay; `_CLOCK` pauses the selected named clock while the rest of the musical clock tree continues; `_CLOCK SET ... bpm` pauses the entire musical clock tree. Wall-clock `sec`/`ms` scheduling continues during a master-clock pause.

The underscore is a live-performance state change. While the program is running, adding or removing `_` takes effect immediately without `Cmd+Enter`; the disabled-object colour follows the same runtime state, so a yellow block is already muted, bypassed or paused. A later normal compile preserves the source declaration as the source of truth. Timed mute/bypass scheduling is not part of this version yet.

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
engine itself. Generator scheduling and modulation stop, FILTER state is cleared immediately, while downstream tail-preserving FX remain alive long enough to decay naturally.

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
CLOCK slow RATE /2

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

The public language intentionally hides upstream implementation names behind
Sonus Umbrae engine families. Current families include macro synthesis,
physical modelling, resonators, modulation, stereo effects, ambient reverb and
multimode filtering. This keeps the language independent from any one upstream
hardware product or DSP library and allows future engines to coexist behind the
same object model.

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


### SVF multimode filter

`MODEL svf` is the clean multimode FILTER backed by Electrosmith DaisySP. One input sample is processed once and all five responses are available simultaneously:

```text
FILTER tone:
    MODEL svf
    CUTOFF 45
    RESONANCE 30
    DRIVE 0
```

The public outputs are:

```text
tone.lp
tone.hp
tone.bp
tone.np
```

`.lp` is the default. Therefore `PLAY source THROUGH tone THEN MAIN` uses the low-pass response. A response can also be selected directly on an intermediate node:

```text
PLAY source THROUGH tone.hp THEN MAIN
```

which means `source -> tone.in -> tone.hp -> MAIN`. Embedded FILTER blocks follow the same rule. DaisySP also computes a peak response internally, but Sonus does not expose it as a routing port in this language version.

`CUTOFF` retains the typed musical cutoff forms already supported by FILTER. It can be driven by a normalized scalar/generative value, explicit frequencies, notes or scales, including the existing selection and `EVERY ... WITH ...` timing grammar where applicable. `RESONANCE` and `DRIVE` use the 0..100 Sonus control range. The SVF is intentionally exposed as the DaisySP filter itself; Sonus does not add artificial self-oscillation or oscillator behaviour.

The implementation is compiled into the independent `daisy-filters.wasm` module. Future DaisySP DSP areas may use separate WASM modules rather than expanding this filter binary into a general-purpose monolith.

### Sky ambient reverb

`sky` uses Ghost Note Audio's MIT-licensed CloudSeedCore algorithm. It is tuned as an ambient/special-effect reverb rather than a room simulation, with a compact Sonus control surface over CloudSeedCore's diffusion, modulation, late delay network, filtering, and stereo decorrelation.

```text
FX space:
    MODEL sky
    SIZE 82
    DECAY 94
    BLOOM 76
    DAMPING 38
    PREDELAY 12
    MOTION 30
    WIDTH 92
    MIX 45
```

The accepted aliases are:

- `DECAY` -> feedback/tail length;
- `DAMP` or `DAMPING` -> high-frequency damping;
- `BLOOM` (or legacy `DIFFUSE`) -> progressive early/late diffusion density;
- `PREDELAY` -> 0..500 ms normalized pre-delay;
- `MOTION` -> delay/diffuser modulation;
- `WIDTH` (or `SPREAD`) -> stereo decorrelation;
- `SIZE`, `MIX`, and `FREEZE` retain their usual FX meanings.

`sky` does not expose musical pitch. The upstream source is fetched by `npm run dsp:setup` into `vendor/cloudseed-core/` and compiled into `sky.wasm`.

### Hot-reload timing continuity

When live code is already running, `Cmd/Ctrl+Enter` applies the validated update on the next master beat. Matching `every` jobs preserve their current phase across that update: for example, an `every 4 beats` sequence already at beat 3 continues to its fourth beat instead of restarting a new four-beat cycle. The same rule applies to beat-based and wall-clock `every` jobs as long as their source and interval are unchanged. Changing the cadence intentionally starts a new phase. `when(..., cycle(...))` event positions are preserved as well.


### Resonator voices

`resonator.*` is backed by the original Mutable Instruments Rings DSP, compiled
into a separate WebAssembly module. It is intentionally presented as a Sonus
Umbrae resonator family rather than as a virtual Eurorack panel.

The primary models are:

```text
SOUND resonator.modal
SOUND resonator.sympathetic
SOUND resonator.string
```

`resonator.strings` is an alias for `resonator.sympathetic`. Rings internal
polyphony is declared directly on the sound selector:

```text
SOUND resonator.modal WITH 1 NOTE
SOUND resonator.modal WITH 2 NOTES
SOUND resonator.modal WITH 4 NOTES
```

Only 1, 2, and 4 are valid. The default is 1 note.

The initial high-level parameters mirror the four shared Rings resonator
controls while preserving Sonus defaults when omitted:

```text
STRUCTURE  0..100
BRIGHTNESS 0..100
DAMPING    0..100
POSITION   0..100
```

Every new NOTE/scale/sequence pitch event automatically performs a Rings strum.
Pitch changes caused by hot reload also strum the existing resonator instance.
There is no explicit STRUM property in this first language version.

#### Resonator I/O and routing

The backend has one mono audio input and two mono outputs. Sonus treats the pair
as one logical stereo VOICE output:

```text
resonator.main -> stereo L
resonator.aux  -> stereo R
```

Thus:

```text
PLAY bells THROUGH MAIN
```

expands to MAIN -> `Audio.out_L` and AUX -> `Audio.out_R`. Explicit mono access
is available as:

```text
PLAY bells.main THROUGH MAIN
PLAY bells.aux THROUGH MAIN
```

If an unsuffixed Resonator output is sent to a mono destination, the language
selects its MAIN output automatically.

The Rings input is mono and is addressed by routing another object through the
Resonator VOICE:

```text
PLAY source THROUGH bells THEN MAIN
```

When an external source is connected, the Rings worklet uses the original
external-exciter path; with no input connection it uses the original internal
exciter.

### LIVE performance controls

`LIVE` is a performance-UI qualifier. For direct parameters whose native Sonus domain is `0..100`, it exposes a realtime slider without changing the DSP meaning:

```text
FILTER tone:
    MODEL svf
    LIVE CUTOFF 60
    LIVE RESONANCE 35
    DRIVE 10
```

In the live editor, each `LIVE` parameter receives a compact realtime slider.
Moving it sends the value directly to the active DSP parameter and also updates
the literal in the source itself, so performance control stays smooth while the
text remains the source of truth. When the gesture ends, the updated source is
reconciled with the runtime. A scalar generative modifier remains attached to
the updated base value, for example:

```text
LIVE CUTOFF 60 WITH WANDER 15
```

Changing the control to 72 rewrites only the literal as
`LIVE CUTOFF 72 WITH WANDER 15`; the wander process is preserved.

`LIVE NOTE` is the first typed exception to the scalar rule. It opens the inline piano view for the note value or note list, so the canonical performance form is now:

```text
VOICE lead:
    SOUND macro.analog
    LIVE NOTE C3
```

The older `NOTE ... WITH VIEW` form remains accepted for compatibility, but `LIVE NOTE ...` is the preferred spelling. The piano is display-only in this version; direct key editing of the source note/list is reserved for a later iteration. Other typed or derived values such as `FREQ`, `SCALE`, `FROM` and envelopes are not yet `LIVE`-editable. The qualifier is UI metadata; it does not introduce a second scheduler or hidden parameter value.
