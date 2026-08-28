# Sonus Umbrae language notes

> **Status:** pre-alpha. This is a working reference for the language as currently implemented, not a stability guarantee.

Sonus Umbrae treats the source document as the desired state of a live modular audio system. The runtime evaluates the document and reconciles the running graph with that state.

Editing a declaration, parameter, route or view therefore adds, updates or removes the corresponding runtime object instead of permanently executing a sequence of commands.

## Evaluation

In the live editor:

```text
Enter
```

inserts a new line and evaluates the current source.

```text
Shift+Enter
```

inserts a line without evaluation.

```text
Cmd+Enter
```

forces evaluation of the current source without inserting a line.

When the document contains errors, the invalid desired state is not applied and the previous valid audio graph continues to run.

Comments currently begin with `#`.

## Built-in objects

### Audio

`Audio` is a built-in singleton representing the system audio interface / master audio endpoint.

Send audio to the master input with:

```text
a.out -> Audio.out
```

`Audio` cannot be reassigned.

The master output can be observed with:

```text
Audio.view()
```

which is currently equivalent to viewing the main output signal.

Future versions are expected to expose multiple physical inputs and outputs through the same object model.

### Clock

`Clock` is the built-in master timing source.

Set the master tempo:

```text
Clock.bpm(120)
```

A BPM of zero stops the declared master clock:

```text
Clock.bpm(0)
```

The master trigger output is:

```text
Clock.out
```

Observe it with:

```text
Clock.view()
```

Derived clock sources are created with `rate()`:

```text
half = Clock.rate("/2")
fast = Clock.rate("*2")
```

These are synchronized trigger sources rather than independent master clocks.

The command layer also provides temporary transport overrides:

```text
:clock stop
:clock start
```

## Voice

`Voice()` is currently the first full synthesis engine. Its DSP implementation is based on the MIT-licensed Mutable Instruments Plaits firmware, compiled to WebAssembly.

Create a voice:

```text
a = Voice()
```

Model 1 is the default. Select a model numerically:

```text
a.model(2)
```

or, for supported aliases, by name:

```text
a.model("analog")
```

Current primary parameters:

```text
a.freq(220)
a.harmo(40)
a.timbre(70)
a.morph(25)
```

Calls can be chained on creation:

```text
a = Voice().model(2).freq(220).harmo(40).timbre(70).morph(25)
```

This is intended to be equivalent to writing the calls separately.

### Voice outputs

The current voice exposes two named signal outputs:

```text
a.out
a.aux
```

For example:

```text
a.out(70) -> Audio.out
a.aux(20) -> Audio.out
```

### Trigger input

A trigger source can be routed to the voice trigger input:

```text
Clock.out -> a.trig
```

## Routing

Routing uses `->`:

```text
source.port -> destination.port
```

Example:

```text
a.out -> Audio.out
```

### Connection attenuation / inversion

An optional amount on the source endpoint belongs to that specific connection:

```text
a.out(50) -> Audio.out
```

This applies a gain of 50% to that connection.

Negative values invert the signal:

```text
source.out(-50) -> destination.parameter
```

This acts like an attenuverter at 50% with inverted polarity.

The current intended connection range is `-100..100`.

## Signal semantics

Sonus Umbrae intentionally does not expose separate routing syntax for audio and CV. They are both signal streams and can be patched freely, including at audio rate.

Internally, ports carry semantic metadata used by diagnostics, inspection and visualization. Current categories include:

- `SIGNAL`
- `GATE`
- `TRIGGER`

This metadata does not normally change the syntax used by the performer.

Future modules with numbered hardware outputs should still receive stable textual port names rather than special indexing syntax. For example, a four-output module may expose:

```text
b.out1
b.out2
b.out3
b.out4
```

This preserves the general `object.port` grammar throughout the language.

## Views

`view()` creates a live visual observer without changing the underlying signal.

The default visualization is selected from the semantic type of the observed value.

### Signal view

```text
a.out.view()
```

Signal outputs use an oscilloscope-style waveform view by default.

For objects with a primary output, this shorthand is also supported where applicable:

```text
a.view()
```

### Trigger view

```text
Clock.view()
```

Trigger outputs use an event-particle timeline rather than a conventional oscilloscope. Each emitted trigger creates an independent phosphor-like particle moving across the timeline.

At a stable clock rate, the default time window is designed to contain roughly four events. If the clock rate changes, particles already emitted keep the velocity determined when they were created while new particles use the new timing.

### Parameter view

Parameters can also be monitored:

```text
a.timbre.view()
```

The live panel shows the parameter value and its base value. This distinction will become more important as continuous modulation routing is expanded.

## Scheme view

Press `Tab` or enter command mode and run:

```text
:scheme
```

Scheme is a read-only topological visualization of the current runtime graph. It is not a graphical patch editor.

The graph flows primarily from left to right and shows objects, explicit parameter values and routing connections. Signal views belonging to a module are embedded inside that module's Scheme box rather than rendered as separate graph nodes.

Parameter views do not create additional Scheme elements because parameters are already represented directly in the module box.

Press `Esc` or `Tab` to return to live coding.

## Command mode

Press `Esc` from the live editor to open the command line at the bottom of the screen.

Current commands include:

```text
:config
:help
:scheme
:save
:load
:new
:clear
:start
:stop
:test 440
:test stop
:clock start
:clock stop
:panic
```

### Save and load

`:save` stores the current source as a plain-text `.sum` file using the browser/system file workflow.

`:load` loads a source file into the editor. Session files are intentionally plain text and suitable for source control.

## Planned language concepts

The following concepts are being explored but should not yet be treated as implemented syntax:

- conditional statements such as `if`;
- reactive conditions such as `when`;
- loops and reusable environments;
- additional parameter modulation semantics;
- more synthesis and processing engines;
- additional signal views such as spectra;
- multi-channel `Audio` I/O;
- richer clock generation, probability, division and multiplication.

The goal is to keep these features compatible with the same declarative, live-reconciled object and routing model.


## Generative functions

Sonus Umbrae includes small numerical/generative helpers that can be used anywhere an expression is accepted.

```text
x = rnd(10, 50);
y = choose(20, 40, 60, 80);
gate = coin(35);

wrapped = wrap(x, 0, 100);
stepped = quantize(x, 5);
```

Stateful functions retain state for their specific call-site until the document is evaluated again:

```text
when (Clock.out) {
    a.timbre(walk(20, 80, 5));
    a.morph(chaos("logistic", 10, 90));
}
```

Available chaos engines currently include `logistic`, `cubic`, and `henon`.

`slew(value, amount)` smooths changes at a call-site. `amount` is 0..100, where larger values respond more slowly.

`seed(n);` sets the deterministic random seed used by `rnd`, `choose`, `coin`, `prob`, `walk`, and chaos initialization. Reusing the same seed makes generative behavior reproducible after evaluation.


## Swell

`Swell()` is Sonus Umbrae's modulation/function-generator module based on the MIT-licensed DSP from Mutable Instruments Tides 2018.

```text
mod = Swell()
    .freq(0.25)
    .slope(50)
    .shape(50)
    .smooth(50)
    .shift(50);
```

The initial implementation runs in looping mode and exposes four related signal outputs:

```text
mod.out1
mod.out2
mod.out3
mod.out4
```

`mod.view()` is an alias for `mod.out1.view()`. Other outputs are viewed explicitly:

```text
mod.out2.view();
```

Swell can modulate Voice parameters directly. Route gain acts as an attenuverter:

```text
voice = Voice()
    .timbre(40)
    .morph(50);

mod = Swell().freq(0.2);

mod.out1(30) -> voice.timbre;
mod.out2(-20) -> voice.morph;
```

Audio and CV remain the same `SIGNAL` concept in the language; these connections therefore use the normal routing syntax.


### Swell modes and inputs

`Swell()` exposes the main operating modes of the Tides 2018 DSP:

```text
motion = Swell()
    .freq(0.25)
    .mode("loop")
    .output("phase")
    .range("control")
    .slope(50)
    .shape(50)
    .smooth(50)
    .shift(50);
```

Ramp modes are `"ad"`, `"loop"`, and `"ar"`. Output relationships are `"different"`, `"amplitude"`, `"phase"`, and `"frequency"`. `range("control")` selects the control-rate behavior; `range("audio")` selects the audio-rate behavior. `low`/`medium` are accepted aliases for control and `high` for audio.

Swell has three inputs in addition to its four outputs:

```text
Clock.out -> motion.trig;
Clock.out -> motion.clock;
pitch.out -> motion.v_oct;
```

`trig` follows the Tides ramp-mode semantics: AD trigger, looping reset, or AR gate. `clock` locks the generator 1:1 to an incoming clock using the original Tides ramp extractor. `v_oct` transposes free-running frequency at 1V/oct.

Low-frequency Swell views automatically use a longer oscilloscope history so LFO and envelope motion remains visible.


### Audio I/O

`Audio` is the built-in singleton representing the physical/system audio interface.

The default output route is written from the point of view of the physical destination:

```text
plaits.out(70) -> Audio.out;
```

`Audio.out` currently refers to the configured/default system output. The syntax is intentionally designed so future multi-channel interfaces can expose `Audio.out(n)` and physical inputs as `Audio.in(n)` without changing the routing model.

`Audio.out` has an automatic master scope.

### Module views and port views

A `.view()` on a module asks for the module-specific visualizer. A `.view()` on a port asks for the generic visualizer for that individual signal.

For Swell:

```text
motion.view();
```

opens one four-channel scope containing `out1`, `out2`, `out3`, and `out4`.

```text
motion.out1.view();
```

opens the normal single-signal scope for `out1`.

Both can be active at the same time. The same distinction is intended for future modules such as Pattern, where the object-level view can use a purpose-built visualization while individual ports keep generic signal/gate/trigger views.


For `Voice`, the object-level view compares both Plaits outputs in one scope:

```text
plaits.view();
```

This overlays `OUT` and `AUX` with separate traces. Individual port views remain available:

```text
plaits.out.view();
plaits.aux.view();
```


## Dices

`Dices()` is Sonus Umbrae's random gate and voltage generator built on the Mutable Instruments Marbles DSP.

```text
dice = Dices()
    .rate(50)
    .jitter(10)
    .gate_bias(50)
    .spread(60)
    .bias(50)
    .steps(80)
    .deja(25)
    .length(8)
    .scale("minor");
```

The control values `rate`, `jitter`, `gate_bias`, `spread`, `bias`, `steps`, and `deja` use the 0..100 knob-style range. `length` is 1..16.

Available scale names are `major`, `minor`, `pentatonic`, `chromatic`, `dorian`, and `fifths`.

Outputs:

- `t1`, `t2`, `t3`: gate streams.
- `x1`, `x2`, `x3`: random/quantized CV outputs in logical Eurorack volts, suitable for `v_oct`.
- `y`: slow random CV.

Input:

- `clock`: optional external clock. Without it, Dices uses Marbles' internal clock generator.

Example:

```text
Clock.out -> dice.clock;
dice.x1 -> plaits.v_oct;
dice.t1 -> plaits.trig;
plaits.out -> Audio.out;

dice.view();
```

`dice.view()` opens a dedicated sequence monitor showing the latest T gate decisions and X notes. Individual outputs still support generic views such as `dice.x1.view()` or `dice.t1.view()`.


Dices exposes the secondary Marbles gate-shape controls explicitly:

```text
dice.gate_length(45);
dice.gate_jitter(30);
```

`gate_length()` sets the mean T1/T3 pulse width. `gate_jitter()` controls pulse-width randomization around that mean. They map directly to the Marbles T generator pulse-width controls.

The dedicated Dices view displays `CLOCK INTERNAL` when free-running and `CLOCK EXTERNAL` when its clock input is patched. Its clock dot follows the effective T2 pulse, so timing jitter is visible rather than merely reflecting the upstream master clock.

`Y` is treated as a slow modulation signal. Both the Y trace inside `dice.view()` and `dice.y.view()` use the long-history LFO scope.


The Dices `Y` oscilloscope uses a fixed Eurorack display scale of ±5V. This affects visualization only: the signal itself remains in volts for routing and the numeric Y readout continues to show the actual voltage.


## Mist (phase 1 shell)

`Mist()` is introduced first as a stereo pass-through module. This phase validates the language API, routing and module view independently from the Clouds WASM backend.

```text
fx = Mist()
    .mode("granular")
    .position(50)
    .size(50)
    .pitch(0)
    .density(50)
    .texture(50)
    .mix(0)
    .spread(50)
    .feedback(0)
    .reverb(0)
    .view();
```

All effect parameters are parsed and retained, but audio is intentionally unity pass-through in phase 1.

```text
source.out -> fx.in;   // mono, duplicated to L/R
left.out -> fx.inL;
right.out -> fx.inR;

fx.outL -> Audio.out;
fx.outR -> Audio.out;
```

`fx.view()` shows `OUT L / R` as a two-trace module view. `fx.outL.view()` and `fx.outR.view()` remain generic single-port scopes.

The Clouds backend will be attached only after an isolated WASM harness passes outside the realtime AudioWorklet path.


The phase-1 `Mist()` shell deliberately has no Clouds backend. The upstream processor is validated separately at `/mist-harness.html`; only a backend that passes both the WASM bypass and granular-output tests should be connected to the realtime module.


### Mist Clouds backend

After the isolated harness passes, `Mist()` uses the same static-storage Clouds bridge in its AudioWorklet. The runtime WASM is intentionally built with a 4 MB initial memory instead of the earlier 32 MB experimental allocation.

`mix()` is an equal-power host-side crossfade: the Clouds processor always produces a fully wet stream while WebAudio mixes the dry input and wet output.

The `trig` input is available for explicit grain triggering:

```text
Clock.bpm(90);
Clock.out -> fx.trig;
```

It is optional; with density away from the center region, Clouds can generate grains without an external trigger.


### Mist: eight SuperParasites modes

`Mist()` now uses the SuperParasites processor and exposes all eight modes:

```text
fx.mode("granular");
fx.mode("stretch");
fx.mode("looping_delay");
fx.mode("spectral");
fx.mode("oliverb");
fx.mode("resonestor");
fx.mode("beat_repeat");
fx.mode("spectral_clouds");
```

The same primary controls remain available in every mode:

```text
.position()
.size()
.pitch()
.density()
.texture()
.mix()
.spread()
.feedback()
.reverb()
.freeze()
```

Their musical meaning follows the selected SuperParasites engine. For example, Oliverb interprets the controls as reverb size/decay/filter/modulation parameters, while Resonestor uses pitch, size, density and texture as resonator controls.

`reverse(true)` is also available for the Parasites modes that support reverse playback:

```text
fx.reverse(true);
```

Beat Repeat uses the existing Mist controls to recreate the SuperParasites/Kammerl control mapping: `mix` controls repeat probability, `spread` clock division, `feedback` pitch mode, `reverb` distortion, `position` slice selection, `texture` slice modulation and `density` size modulation. Sonus Umbrae still applies its own external equal-power dry/wet crossfade.

Changing mode causes the DSP to run SuperParasites' normal `Prepare()` mode-transition path, so modes with different workspaces such as spectral, Oliverb and Resonestor can reset their internal state correctly.


## Stereo output naming and routing

Stereo modules use a consistent output convention:

```text
fx.out       // stereo shorthand
fx.out_L     // left channel only
fx.out_R     // right channel only
```

The main audio bus follows the same convention:

```text
Audio.out
Audio.out_L
Audio.out_R
```

A mono source connected to `Audio.out` is duplicated automatically:

```text
plaits.out -> Audio.out;
```

A stereo source connected to `Audio.out` preserves L/R:

```text
fx.out -> Audio.out;
```

This expands internally to:

```text
fx.out_L -> Audio.out_L;
fx.out_R -> Audio.out_R;
```

Channels can be selected, attenuated and crossed explicitly:

```text
fx.out_L(50) -> Audio.out_R;
fx.out_R(75) -> Audio.out_L;
```

Selecting one channel of a stereo source makes that route mono, so this:

```text
fx.out_L -> Audio.out;
```

duplicates the left signal to both sides of the main output.

Parentheses are deliberately not used for logical L/R selection. They remain available for route attenuation today and for future hardware-output addressing. A future syntax such as:

```text
Audio.out(5)
```

can therefore mean physical hardware output 5 without conflicting with stereo channel selection.

`Audio.out` is always monitored as stereo using one overlaid two-trace oscilloscope. The L/R legend uses the same trace colors as other multi-output module views.
