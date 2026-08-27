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

### Main

`Main` is a built-in singleton representing the system audio interface / master audio endpoint.

Send audio to the master input with:

```text
a.out -> Main.in
```

`Main` cannot be reassigned.

The master output can be observed with:

```text
Main.view()
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
a.out(70) -> Main.in
a.aux(20) -> Main.in
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
a.out -> Main.in
```

### Connection attenuation / inversion

An optional amount on the source endpoint belongs to that specific connection:

```text
a.out(50) -> Main.in
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
- multi-channel `Main` I/O;
- richer clock generation, probability, division and multiplication.

The goal is to keep these features compatible with the same declarative, live-reconciled object and routing model.
