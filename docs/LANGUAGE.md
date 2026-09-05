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
    PITCH NOTES C4

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

`SET` declarations can be local to `VOICE`, `FX`, or `FILTER` scopes. A local
name shadows a global name only inside its owning object. This is useful for
notes, scalar values, timing values, and structured envelopes.

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

Named clocks may also be local to an object when several parameters need to
share the same derived clock without publishing it globally:

```text
VOICE lead:
    CLOCK clockvoice RATE /2 WITH JITTER 5
    TIMBRE 60 EVERY 1 beat ON CLOCK clockvoice
    MORPH 40 EVERY 2 beat ON CLOCK clockvoice
```

The local clock is the same kind of master-derived clock as an anonymous
`ON CLOCK /2` expression; naming it simply makes the same timeline reusable
inside that object. `CLOCK SET` remains global and is not valid inside an
object.

Use named clocks from beat-based `EVERY` clauses:

```text
VOICE bass:
    SOUND macro.analog
    PITCH NOTES [C2 Eb2 G2] WITH WALK EVERY 1 beat on CLOCK slow
```

or use an anonymous master-derived rate directly when no persistent clock
object is needed:

```text
MORPH 50 EVERY 2 beats on CLOCK /4
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

`ENVELOPE` is a structured, lightweight value for shaping compatible scalar
parameters. The public language does not require the user to choose between
AD/AR/ASR/ADSR names: the shape is inferred from the properties that are
present.

Inline envelopes stay on the parameter line and use comma-separated named
properties:

```text
TIMBRE ENVELOPE [att log 20 ms, dec 1/2 beat, sus 60, rel 2 beat, range 30 to 90]
```

The canonical property names and their compact aliases are:

```text
ATTACK   / ATT
DECAY    / DEC
SUSTAIN  / SUS
RELEASE  / REL
DELAY    / DEL
HOLD
RANGE
```

`ATTACK`, `DECAY`, and `RELEASE` are linear by default. `LOG` may be written
before their duration to select a logarithmic curve; `LIN` is accepted when an
explicit linear label is preferred. `DELAY` and `HOLD` are durations and do not
have a curve. `SUSTAIN` is a level in `0..100`. `RANGE min TO max` maps the
normalized envelope to the target parameter domain and defaults to `0 TO 100`.

Time stages accept `ms`, `sec`, or `beat`, including fractional beat values:

```text
TIMBRE ENVELOPE [att 20 ms, hold 1/4 beat, rel log 2 beat]
```

Beat-based stages inherit the musical clock of the parameter. Therefore:

```text
TIMBRE ENVELOPE [att 1/2 beat, rel 1 beat] EVERY 4 beat ON CLOCK human
```

is triggered every four `human` ticks and its beat-based envelope stages are
measured against that same named clock. Without `ON CLOCK`, the master clock is
used. `ms`/`sec` stages remain wall-clock based.

Reusable envelopes use the multiline typed `SET` form:

```text
SET motion TYPE ENVELOPE:
    ATTACK LOG 20 ms
    DECAY 1/2 beat
    SUSTAIN 60
    RELEASE 2 beat
    RANGE 30 TO 90
```

and can then be used as the value of a compatible parameter:

```text
VOICE lead:
    SOUND macro.fm
    TIMBRE motion
```

`SET` can also be declared inside an object. Local values use lexical scope and
do not leak into other objects:

```text
VOICE lead:
    SET notes: [C3 Eb3 G3]
    SET motion TYPE ENVELOPE:
        ATTACK 20 ms
        RELEASE 1 beat

    PITCH notes EVERY 1 beat
    TIMBRE motion
```

An envelope without `SUSTAIN` is one-shot. A sustained envelope is gated and,
in the current implementation, follows the containing VOICE trigger/gate rather
than declaring its own independent `EVERY`. This keeps release semantics
explicit and avoids inventing a hidden gate duration.

Matter `DRIVE` accepts the new `ENVELOPE` spelling but currently keeps the
existing DSP-rate backend restrictions: linear, full-range `ms`/`sec` shapes
without `DELAY`/`HOLD`. Generic scalar parameter envelopes run through the host
control-rate envelope runtime.

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
PITCH NOTES C4
```

A fixed frequency:

```text
PITCH FREQS 220
```

A list:

```text
PITCH NOTES [C3 G3 Bb3]
```

Selection modifiers:

```text
PITCH NOTES [C3 G3 Bb3] with random
PITCH NOTES [C3 G3 Bb3] with walk
PITCH NOTES [C3 G3 Bb3] with shuffle
PITCH NOTES [C3 G3 Bb3] with reverse
```

Scales are written as:

```text
PITCH SCALE C minor
```

The root note is normalized automatically to uppercase. Supported scale modes include the diatonic modes plus major and minor-pentatonic scales:

```text
PITCH SCALE C major-pentatonic
PITCH SCALE A minor-pentatonic
```

Pentatonic scales use the same range, selection, sequencing, `SET`, and `SEQ life` machinery as the other scales. For example:

```text
SEQ sparks WITH VIEW:
    MODEL life
    SIZE 16
    PITCH SCALE C minor-pentatonic WITH RANGE C2 C5
    EVOLVE EVERY 8 beat
```

A range and sequencing mode can be combined:

```text
PITCH SCALE C minor with range C2 C5, walk
```

## every

`every` is the public temporal reevaluation syntax.

Per-property timing:

```text
morph rnd(30,70) every 1 sec
```

```text
PITCH SCALE C minor with walk every 2 beats
```

Timing modifiers belong to the `every` clause:

```text
morph rnd(20,80) every 3 sec on drift
```

```text
PITCH SCALE C minor with random every 2 beats on loose, chance 80
```

The canonical order is:

```text
property value [with property modifiers] every time [on timing modifiers]
```

`every` stays at the end of the property expression.

### Euclidean every

`EVERY EUCLIDEAN hits/steps` is a beat-synchronous timing mode. It distributes
`hits` as evenly as possible across `steps` ticks of the selected clock:

```text
TIMBRE rnd(20,80) EVERY EUCLIDEAN 5/16
```

The pattern advances one step on every tick of the master clock by default.
Use the normal clock modifier to drive it from a derived or named clock:

```text
MORPH wander(30,70) EVERY EUCLIDEAN 3/8 WITH CLOCK slow
```

`ROTATE` rotates the Euclidean pattern without changing its hit count:

```text
MORPH rnd(20,80) EVERY EUCLIDEAN 5/16 WITH ROTATE 2
```

Timing modifiers compose normally:

```text
EVOLVE EVERY EUCLIDEAN 7/16 WITH CLOCK slow, ROTATE 3, CHANCE 80
```

`CHANCE` is evaluated only on Euclidean hit steps. `LOOSE` applies its normal
timing looseness only to those hits. `ROTATE` is valid only with
`EVERY EUCLIDEAN`.

Euclidean timing is an `EVERY` mode rather than a `SEQ` model, so it can drive
any property or state change that already accepts `EVERY`.

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

    morph motion.a with depth 40
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

    morph motion.a with depth 30
    timbre motion.b with depth 20
    harmo motion.c with depth 15
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
PITCH NOTES C4
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
PITCH NOTES [C3 G3 Bb3] with random every 1 beat
```

Scale sequencing:

```text
PITCH SCALE C minor with range C3 C5, walk every 2 beats
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

    position motion.a with depth 30
    density motion.b with depth 20
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
    PITCH NOTES C2

_FILTER tone:
    MODEL svf
    CUTOFF 60

_FX space:
    MODEL sky

_CLOCK pulse RATE *2
```

The effect depends on the object's audio role: `_VOICE` mutes the voice output while preserving DSP state; `_FILTER` bypasses the filter and passes its input through all exposed filter outputs; `_FX` bypasses the processor dry while stopping new input into the wet engine so an existing reverb/delay tail can decay; `_CLOCK` pauses the selected named clock while the rest of the musical clock tree continues; `_CLOCK SET ... bpm` pauses the entire musical clock tree. Wall-clock `sec`/`ms` scheduling continues during a master-clock pause.

The underscore is a live-performance state change. While the program is running, adding or removing `_` takes effect immediately without `Cmd+Enter`; the disabled-object colour follows the same runtime state, so a yellow block is already muted, bypassed or paused. A later normal compile preserves the source declaration as the source of truth. Timed mute/bypass scheduling is not part of this version yet.

## Quick menu and command prompt

Press `Esc` from the editor to open the compact quick menu. The menu is keyboard-driven: `C` opens Configuration, `A` opens About, `S` saves, `L` loads, `R` restarts the audio engine/runtime using the current program, and `N` creates a new empty project.

Press `>` from the live editor to enter the terminal-style command prompt. The prompt uses `>` rather than `:`. Current useful commands include:

```text
>scheme
>config
>help
>about
>save
>load
>new
>clear
>run
>run stop
>start
>stop
>test 440
>test stop
>panic
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
PITCH SCALE C minor with walk every 1 beat
PITCH SCALE C minor with walk 3 every 1 beat
```

Without an amount, `walk` moves by one sequence step at a time. With an amount,
the runtime may move forward or backward by up to that many sequence steps on
each update.

For a scale, these are scale degrees/list positions rather than semitones.

```text
PITCH SCALE C minor with range C2 C5, walk 2 every 1 beat
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
    PITCH SCALE C minor with range C3 C5, walk 2 every 2 beats on clock slow
    morph 50 with trend 20 every 1 beat on clock /4
```

The generator determines **how** the value changes. `every` determines **when**
it changes. `ON CLOCK ...` determines which clock provides those beat steps.





### Delay spread looseness

For `FX ... model delay`, `spread` accepts an optional `with loose` modifier:

```text
FX echo:
    model delay
    lines 4
    time 1 beat
    spread 60 with loose 40
```

`spread` controls how far the delay lines separate in time and stereo. `loose`
controls how strictly those times follow exact rhythmic subdivisions.

- `loose 0` keeps the rhythmic multitap geometry exact.
- Higher values progressively move the taps toward a freer cluster around the
  reference time and add a small stable per-line offset.
- The offset is stable for the life of the delay instance; it does not wander
  continuously.
- If omitted, `loose` defaults to `25`.

`time` is the center of the delay-line distribution, not the last tap of a
rhythmic grid. At higher `spread` values, some lines fall before the reference
time and some after it. `loose` adds stable asymmetry between those lines;
there is no implicit quantization to `1/N`, `2/N`, etc.

`spread ... with loose ...` can also be combined with `every`; the timing
modifier applies to changes of the spread value, while the `loose` amount stays
attached to that spread declaration.

## REGISTER

`REGISTER` stores pitch values from a `SEQ` source. The first model is `shift`,
an N-stage shift register. Stage `1` is always the newest value.

```text
REGISTER canon:
    model shift
    size 4
    pitch melody
    write every 1 beat
```

A Turing `SEQ` produces one pitch, so it can be consumed directly:

```text
REGISTER canon:
    model shift
    size 4
    pitch melody
    write every euclidean 5/16 with rotate 2
```

A Life `SEQ` exposes a pitch pool, so the register must select how to read it:

```text
REGISTER canon:
    model shift
    size 4
    pitch ecosystem with random
    write every 1 beat
```

Supported Life readers are `order`, `random`, `walk`, `reverse`, `pendulum`,
`first`, and `last`.

Register stages are referenced as pitch sources with one-based indices:

```text
VOICE one:
    sound resonator.string
    pitch canon.1

VOICE two:
    sound resonator.string
    pitch canon.2
```

On each `write` event, the new pitch is inserted at stage `1`; older values move
toward higher stages and the oldest value is discarded. `size` accepts values
from 2 to 32.

`write every ...` uses the normal global timing system, including beat, wall
time, named clocks, Euclidean timing, `chance`, `loose`, and other supported
`every` modifiers.

`REGISTER` is stateful. Hot reload preserves its current stages and resizes them
when `size` changes.

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
    PITCH SCALE C minor with range C2 C4
    every 1 beat
```

The generated source is used directly by name:

```text
VOICE bass:
    sound macro.analog
    PITCH melody every 1 beat
```

The `SEQ` timing and the consumer timing are independent. For example:

```text
SEQ melody:
    model turing
    length 8
    change 10
    PITCH SCALE D dorian with range D2 D4
    every 2 beats

VOICE bass:
    sound macro.analog
    PITCH melody every 1 beat
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
PITCH SCALE C minor with range C2 C4
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
every 1 beat on clock /4
every 2 beats on coin
```

A SEQ source controls its own generation, so consumers do not add list
selection modes on top of it. The canonical form is therefore:

```text
PITCH melody every 1 beat
```

rather than `note melody with random ...`.

### Life note-pool sequencer

`MODEL life` is a pool sequencer rather than a single-current-note source. At startup it creates one cellular grid and maps the live cells onto the declared pitch material. With no suffix it uses Conway's classic Life rule (`B3/S23`). Named Life-like variants can be selected with a dotted model name: `life.highlife` (`B36/S23`), `life.seeds` (`B2/S`), `life.day-night` (`B3678/S34678`), or `life.morley` (`B368/S245`). If no `EVOLVE` property is present, the initial grid remains static for the whole run.

```text
SEQ ecosystem WITH VIEW:
    MODEL life
    SIZE 16
    PITCH SCALE C minor WITH RANGE C2 C5
```

`SIZE` currently accepts `8` or `16`. `PITCH SCALE ... WITH RANGE ...`, `PITCH NOTES [...]`, or `PITCH FREQS [...]` defines the pitch material available to the grid. The SEQ itself has no playhead and does not choose a current note. Its view therefore shows only the live/dead cell matrix.

Available Life-like models:

```text
MODEL life             // Conway B3/S23 (default)
MODEL life.highlife    // B36/S23
MODEL life.seeds       // B2/S
MODEL life.day-night   // B3678/S34678
MODEL life.morley      // B368/S245
```

All variants use the same square grid and 8-neighbour Moore neighbourhood; only their birth/survival rule differs. `DENSITY`, `MAX`, `RESPAWN`, `EVOLVE`, `PITCH`, and consumer reader modes work identically for every variant.

Evolution is explicit and optional:

```text
SEQ ecosystem WITH VIEW:
    MODEL life
    SIZE 16
    DENSITY 15 WITH MAX 20, RESPAWN
    PITCH SCALE C minor WITH RANGE C2 C5
    EVOLVE EVERY 8 beat
```

`EVOLVE EVERY ...` uses the normal scheduling grammar, including `ON CLOCK ...`, `ON CHANCE ...`, and the other compatible timing modifiers. Each evolution changes the pool only; it never forces a consumer to change its currently sounding note.

`DENSITY` controls the random population used when the Life grid is first created. The default is `34`, preserving the original behavior. An optional `WITH MAX` caps the percentage of live cells both after initialization and after every evolution; excess live cells are removed at random. Add `RESPAWN` to regenerate the grid with the initial density whenever an evolution reaches zero live cells.

```text
DENSITY 15 WITH MAX 20, RESPAWN
```

`MAX` must be in `0..100` and cannot be lower than the initial `DENSITY`. `RESPAWN` can also be used without a maximum (`DENSITY 10 WITH RESPAWN`). It acts only after an evolution produces an empty grid; it does not inject cells while Life is still active. `DENSITY` does not otherwise bias Conway's evolution; it only seeds the initial state, while `MAX` acts as an explicit musical population limiter.

Consumers read the same pool independently. Unlike Turing, a Life pool requires a reader mode at the point of use:

```text
VOICE arp:
    PITCH ecosystem WITH WALK EVERY 1/2 beat

VOICE bells:
    PITCH ecosystem WITH RANDOM EVERY 4 beat ON CHANCE 30

VOICE anchor:
    PITCH ecosystem WITH FIRST EVERY 2 beat
```

The initial reader modes are `ORDER`, `RANDOM`, `WALK`, `REVERSE`, `PENDULUM`, `FIRST`, and `LAST`. Each consumer owns its own reader state, so two voices may choose different notes from the same live-cell pool at the same time.

When `EVOLVE` kills the cell currently associated with a consumer, the consumer keeps its current note until its own next `EVERY` event. At that point it chooses again from the new pool. `WALK` retains the old cell position as its geometric reference even if that cell has died. If the grid temporarily has no live cells, consumers retain their previous note until live material becomes available again.

A future inline reader view may overlay the consumer's selected cell, but the SEQ module view itself intentionally remains state-only: it displays just the active cells.

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

`CUTOFF` remains the normalized scalar/generative cutoff control. Musical cutoff material now uses the same unified `PITCH` property as other objects: `PITCH SCALE ...`, `PITCH NOTES [...]`, or `PITCH FREQS [...]`, including the existing selection and `EVERY ... WITH ...` timing grammar where applicable. `RESONANCE` and `DRIVE` use the 0..100 Sonus control range. The SVF is intentionally exposed as the DaisySP filter itself; Sonus does not add artificial self-oscillation or oscillator behaviour.

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

`LIVE PITCH` is the first typed exception to the scalar rule. It opens the inline piano view for the note value or note list, so the canonical performance form is now:

```text
VOICE lead:
    SOUND macro.analog
    LIVE PITCH NOTES C3
```

The older `PITCH NOTES ... WITH VIEW` form remains accepted for compatibility, but `LIVE PITCH NOTES ...` is the preferred spelling. The piano is display-only in this version; direct key editing of the source note/list is reserved for a later iteration. Other typed or derived values such as `PITCH FREQS`, `PITCH SCALE`, named sources and envelopes are not yet `LIVE`-editable. The qualifier is UI metadata; it does not introduce a second scheduler or hidden parameter value.

## USE directive

`USE` is the program capability directive. It is optional, may appear only once, and must be the first effective instruction in the source (blank lines and comments may precede it). Capability names are comma-separated:

```text
USE visual, midi
```

The currently reserved capability names are `visual`, `midi`, `audioin`, and `osc`. In the 0.2.x runtime they establish the capability lifecycle and restart contract; individual optional backends can be attached to that lifecycle as they are implemented.

`USE` is structural rather than a live parameter. If its normalized capability set changes while code is running, Sonus does not hot-reconcile the edit. It asks for confirmation because the runtime must be stopped and rebuilt. Cancelling restores the previous `USE` directive in the editor. Accepting performs a runtime restart and rebuilds the program using the new capability set. Reordering the same capabilities does not require a restart.

`USE` is intentionally not used for editor-only facilities such as the variable inspector, diagnostics, or live-control refresh rate. Those belong to the environment configuration.

## Environment screens

`>CONFIG` opens environment preferences. These settings are not part of the Sonus program and therefore do not alter program semantics. The screen is keyboard-first: `Up/Down` selects a row, `Left/Right` changes a value, and `Enter` toggles or advances the selected value. The selected row is shown in reverse video.

The Audio section reports the effective Web Audio sample rate and available latency information. `SAMPLE RATE` can use the device default or request 44.1, 48, 88.2 or 96 kHz. Where the browser supports Audio Output Devices, `OUTPUT DEVICE` enumerates and selects available audio outputs; unsupported browsers keep that row browser-controlled. Device and sample-rate changes are structural: Sonus asks for confirmation, restarts the audio engine, reloads its AudioWorklets/WASM, and then rebuilds the current program. Cancelling restores the previous configuration. Browser APIs do not expose reliable hardware bit depth, so Sonus does not invent a bit-depth readout.

The Interface section includes the variable inspector, lightweight runtime metrics, the header DSP status, and the refresh rate used by `LIVE` controls. Preferences are stored locally by the browser.

`>ABOUT` opens the project/version and runtime information screen. `>HELP` remains the command reference and `>SCHEME` remains the signal-graph view.

### Direct typed SET values

A compatible named value or runtime source is used directly as a property value. `FROM` is no longer part of the public language. Name resolution checks local scope first and then global scope:

```text
VOICE bass:
    SET notes: [C2 G1 C2 Bb1]
    PITCH notes WITH ORDER EVERY 2 beat ON CLOCK bassclock
```

`SEQ` and `MOD` outputs follow the same rule: use the source name directly, for example `PITCH melody` or `MORPH motion.a WITH DEPTH 30`. The source type determines how the parameter consumes it.

During quantized hot reload, voices driven by a sequence keep their current pitch instead of jumping back to the first declared note. This avoids an unnecessary pitch/strum discontinuity when the same live program is reconciled.

### Manual Life reset

A running `SEQ` using `MODEL life` can be repopulated without recompiling the program or changing transport state:

```text
:life reset ecosystem
```

Omit the name to reset every active Life sequence:

```text
:life reset
```

The new population uses the sequence's current `DENSITY` and optional `MAX` settings. Manual reset is independent of `EVOLVE` and does not require `RESPAWN`.

### LIVE update semantics

`LIVE` controls do not all update the runtime in the same way.

Continuous parameters stream intermediate values while the control is moved. For
example, a filter `cutoff` can be swept continuously.

Commit parameters update the visible source value during editing, but the runtime
receives the new value only when the edit is committed. This is used for
structural or capture-time parameters whose intermediate drag values must not
retroactively alter existing DSP state.

The update policy belongs to the parameter schema, not to the slider widget, so
the same semantics can be reused by future MIDI or external control surfaces.

## Creative delay

`FX` exposes a multi-line creative delay backed by DSPark for the forward delay path and a Sonus reverse-window layer for true backwards playback.

```text
FX echo:
    model delay
    lines 4
    time 1/4 beat
    spread 35
    feedback 55
    reverse 30
    tape 45
    diffusion 20
    mix 35
```

`lines` selects 1..8 preallocated delay lines. `time` accepts `ms`, `sec`, or fractional `beat` values. `spread` distributes the lines around the base time and across the stereo field. `feedback`, `tape`, `diffusion`, and `mix` are continuous 0..100 controls.

`reverse` is a 0..100 capture probability, not a global playback switch. At the beginning of each new delay window each line decides whether new material enters its forward or reverse path. `reverse 0` always captures forward; `reverse 100` always captures backwards. Once material has entered a path, its direction is preserved through feedback. Changing `reverse` live affects only newly captured material.

Because `reverse` is a capture-time parameter, its `LIVE` slider uses commit semantics: moving the slider previews the source value, and the DSP receives the new probability only when the slider is released.

The reverse path performs actual backwards buffer playback. It does not emulate reversal with filtering, modulation, or reversed feedback polarity.


Reverse windows are atomic. Changing delay geometry (`time`, `spread`, or
`lines`) starts future reverse captures on a clean window boundary so a reversed
segment is never split across two different window lengths. With more active
lines, the maximum temporal spread widens automatically to keep dense delay
configurations from collapsing into a tight cluster.

### Probabilistic delay pitch shifting

The creative delay can transpose newly captured material before it enters the
delay/feedback network:

```text
FX echo:
    model delay
    pitch 40 with semitones [-12 7 12]
```

`40` is the probability that a new delay window is transposed. If a pitch event
is selected, one non-zero shift is chosen from the supplied pool and remains
part of that material through its feedback lifetime.

Two convenience forms are also supported:

```text
pitch 35 with octaves [-1 1]
pitch 50 with scale minor
```

`octaves` is converted to semitones. `scale` uses the scale's interval set as a
pool of transpositions. The current DSPark pitch shifter supports shifts from
-12 to +12 semitones, so this first version is limited to one octave down/up.

Absolute note names are intentionally not accepted here: transposing arbitrary
audio *to* an absolute note would require pitch detection/quantization, which is
a separate processor.

### Delay ping-pong

`pingpong 0..100` now controls actual cross-feedback rather than only cross-mixing
the wet output. At `100`, local same-side feedback is removed and recirculation
is fed into the opposite stereo side; intermediate values blend local and
cross-feedback.

### MOD dices

`dices` is the Sonus random-voltage modulator derived from the MIT-licensed
Marbles random-voltage core. It exposes only the X/Y-style random modulation
features; Marbles' trigger/gate section and internal musical quantizer are not
included.

```text
MOD rnd:
    model dices
    rate 1 beat
    spread 60
    bias 50
    steps 35
    deja 20
    length 8
    diversity 50
```

Outputs:

```text
rnd.x1
rnd.x2
rnd.x3
rnd.y
```

`x1`, `x2`, and `x3` update at `rate`. `y` is a slower smooth/random channel
running at one sixteenth of the X rate.

Parameters:

- `rate`: accepts `hz`, `beat`, `sec`, or `ms`.
- `spread 0..100`: controls the width/shape of the random distribution.
- `bias 0..100`: biases the distribution toward lower or higher values.
- `steps 0..100`: below 50 the signal becomes increasingly smooth, 50 is
  sample-and-hold, above 50 it becomes progressively more stepped/quantized.
- `deja 0..100`: controls the tendency to reuse the stored random sequence;
  0 is fresh random, 100 is a locked loop.
- `length 1..16`: length of the deja-vu memory.
- `diversity 0..100`: increases the difference in behaviour between X1, X2 and
  X3 while leaving them under the same macro controls.

The output domain is control voltage style `-5..+5`, matching the existing MOD
routing domain.

`dices` can be used in parameter modulation:

```text
FILTER tone:
    model svf
    cutoff rnd.x1 with depth 50
```

or in explicit routes:

```text
rnd.y -> someDestination.in
```
