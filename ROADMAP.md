# Sonus Umbrae Roadmap

Sonus Umbrae is currently developed as a browser-based modular live-coding environment, but the language and runtime are intentionally being designed so they are not tied permanently to the web platform.

This roadmap is directional rather than a release commitment. Features may move, change shape, or be dropped as the language evolves.

## 0.1.0 baseline

The first tagged development release establishes the current high-level
language and DSP architecture:

- `VOICE` objects with model-specific sound engines, per-object level, note /
  frequency / scale sequencing, LPG option, and parameter modulation.
- `MOD` objects with four related outputs, local declaration inside `VOICE` and
  `FX`, shared transport semantics, and optional scope views.
- `FX` objects with the current `mist.*` model family, stereo routing, dynamic
  parameters, musical pitch sequencing where supported, and local modulation.
- Explicit `CLOCK set ... bpm` master-clock transport.
- `every` as the public temporal reevaluation syntax, including object-level
  fallback timing and typed `SET` time variables.
- `PLAY ... through ... then ...` audio routing with per-edge `at` levels,
  stereo channel selectors, mono-to-stereo normalization, and multiline chains.
- `MAIN level` as a distinct final-bus control.
- Shared runtime scheduler for wall-clock and beat-based jobs.
- Read-only Scheme and optional scope views.

The items below describe directions beyond this baseline.

## Near term

### Language core

- Stateful `SEQ` generative sources; the first implemented model is a Turing Machine shift-register sequencer.
- Arithmetic, comparison, and logical expressions beyond the current scalar
  expression support.
- Richer conditional execution.
- Event-driven blocks integrated cleanly with the high-level syntax.
- Looping and iteration primitives where they remain useful for musical code.
- Persistent runtime state for event-driven code.
- Clear distinction between snapshot values and continuously evaluated signals.
- Stateful generative helpers including `walk()`, `chaos()`, `slew()`,
  reproducible `seed()`, numeric `wrap()`, and `quantize()`.
- Reusable timing/group constructs beyond per-property and object-level `every`.


### Signal routing

- Generic routing from any compatible output port to any compatible input or parameter.
- Per-connection attenuation and inversion:
  `source.out(-50) -> destination.input;`
- Internal port metadata for:
  - SIGNAL
  - GATE
  - TRIGGER
- Audio-rate modulation without an artificial distinction between audio and CV.
- Runtime validation of module ports and parameters.

### Visual monitoring

- SIGNAL views as oscilloscopes.
- TRIGGER views as independent moving event particles.
- GATE views as high/low timelines.
- PARAMETER views showing live and base values.
- Variable views collected into a compact VARIABLES monitor.
- Additional optional visualizers such as spectrum and level views.

### Scheme view

- Read-only topological graph generated from the live runtime.
- Compact content-driven module sizing.
- Embedded visualizers inside their parent modules.
- Distinct rendering for SIGNAL, GATE, and TRIGGER connections.
- Future animated signal activity.
- Pan, zoom, fit-to-view, and keyboard navigation for large patches.
- Explicit support for branching, fan-in, fan-out, and feedback paths.

## DSP modules

The initial DSP integration is based on permissively licensed open-source modules and algorithms.

Current direction:

- `VOICE` macro engines backed initially by Mutable Instruments Plaits DSP.
- `MOD` modulation backed initially by Mutable Instruments Tides 2018 DSP.
- `FX` processors backed by Mist / SuperParasites plus the MIT-licensed `sky` ambient reverb based on CloudSeedCore.
- `FILTER` processors backed by modular permissively licensed DSP areas; the first implementation is DaisySP `svf` with simultaneous multimode outputs.
- Additional DaisySP areas may be introduced as separate WASM modules rather than one monolithic library.
- LIVE performance controls now cover scalar sliders and note piano views; future work can add direct note-list editing and scheduled mute/bypass state changes.
- Additional permissively licensed DSP where appropriate.
- [x] Consolidate the active DSP build around permissive licenses only.
- Original Sonus Umbrae DSP modules.
- Inspiration from other modular systems and open algorithms without necessarily reproducing their original user interfaces.
- A stable module metadata format describing parameters, ports, signal semantics, and visual behavior.
- [x] Route `THROUGH` by exposed audio-port capability rather than declaration category, so source/processor hybrids such as Resonator and Matter remain `VOICE` objects while accepting audio input.

The language should not depend on the identity of any one upstream hardware module.

## Clock and event system

`Clock` is intended to evolve into a programmable master timing system rather than a simple metronome.

Planned directions include:

- [x] Master BPM with per-clock `jitter` and slow correlated `drifter` behaviour.
- [x] Named clock objects with optional `RATE` relative to the master, local `JITTER`/`DRIFTER`, optional `WITH VIEW`, immediate live pause via `_CLOCK`, and master pause cascading through the full musical clock tree while wall-clock scheduling continues.
- [x] Keep `SET` reserved for typed values: persistent clock objects are declared with `CLOCK`, with omitted `RATE` meaning master rate `*1`.
- Meter information.
- Phase offsets.
- Swing.
- Probability.
- Trigger skipping.
- Ratchets.
- Additional clock feel controls such as swing, phase, probability and algorithmically changing rates.
- Event-driven scripting connected to clock and trigger ports.

The design is conceptually closer to a programmable modular timing source than to a conventional DAW transport.



## Event-driven language core

The primary control-flow model should remain musical and event-driven rather than becoming a conventional general-purpose scripting language.

Initial event syntax:

`when (Clock.out) { ... }`

A temporary clock-rate view can be requested directly from the event source without creating a named derived clock:

`when (Clock.out("/2")) { ... }`

`when (Clock.out("*2")) { ... }`

Event modifiers use the same function-call syntax as normal language operations:

`when (Clock.out("/2"), cycle("1:4"), prob(30)) { ... }`

Initial modifiers:

- `cycle("1:4")`, `cycle("2:4")`, etc. select a position in a repeating event cycle.
- `cycle("first")` matches only the first event after the handler is evaluated.
- `cycle("!first")` matches every event except the first.
- `prob(n)` applies a percentage probability after the cycle condition matches.

Modifiers are optional and order-independent. This avoids introducing a separate object/map configuration syntax solely for `when`.

The language may later gain conventional `if`, `for`, or other control structures where genuinely useful, but musical event primitives should remain the preferred way to express temporal behavior.


## Visual engine / audiovisual performance

Sonus Umbrae should eventually include a programmable visual engine driven by the same live-coding language used for audio.

The visual engine is a separate subsystem from the audio engine:

- The audio engine starts automatically when the application launches, subject to browser/device permission requirements.
- The visual engine is disabled by default.
- The visual engine is started and stopped explicitly from command mode, for example:
  `:visual start`
  `:visual stop`
- A separate command may open the visual output client, for example:
  `:visual open`
- The main status bar should indicate visual-engine state independently from audio-engine state.

The same `.sum` source can contain both audio and visual code. Visual objects should follow the same object/parameter/routing model as audio modules rather than introducing a separate visual programming language.

Possible visual primitives include:

- `Circle()`
- `Rect()`
- `Line()`
- `Grid()`
- `Pixel()`
- `Text()`
- `Ascii()`
- `Bitmap()`
- `Sprite()`
- procedural noise and pixel-art sources

Possible visual properties and transforms include:

- position
- scale and size
- rotation
- opacity
- color
- gradients
- distortion
- blur
- glow
- feedback
- trails
- mirror/kaleidoscopic transforms
- pixelation
- threshold/posterization

Audio/runtime values should be routable into visual properties using the same conceptual patching model used elsewhere in Sonus Umbrae. SIGNAL, GATE, and TRIGGER sources may drive visual behavior without requiring a separate syntax family.

Examples of future concepts include:

`Clock.out -> visual.trig;`

`voice.out -> visual.distort;`

`voice.timbre -> visual.size;`

The exact visual API will be designed after the core event and routing systems are stable.

### Audio analysis for visuals

The visual engine should not require rendering individual audio samples directly. A dedicated analysis layer can expose musically useful derived values such as:

- level / envelope
- onset
- low/mid/high spectral energy
- spectrum bands
- pitch or other extracted features where useful

These values can then be routed to visual parameters using the normal language model.

### Separate visual output

The browser implementation should support a dedicated visual-output client, initially as another route/end-point of the same application, for example:

`/visual`

This allows:

- live coding and runtime monitoring on the primary display
- fullscreen generated visuals on a second monitor or projector
- the visual output to remain active while the main UI switches between LIVE, SCHEME, CONFIG, or other screens

The architecture should not assume that the visual renderer always runs on the same display or even the same machine. A future implementation may allow the visual client to connect to the active Sonus Umbrae session over a local network.

### Scheme interaction

The Scheme view remains focused on the audio/modular runtime and must not expand into a graph of every visual object.

Individual visual primitives such as `Circle`, `Text`, `Bitmap`, gradients, or visual effects should **not** appear as separate Scheme nodes.

If the visual engine receives data from the modular graph, Scheme may show one aggregated terminal node:

`VISUAL`

This node represents the entire visual subsystem. Connections entering it may use a dedicated visual-control edge style so they are distinguishable from normal audio, gate, and trigger routing.

The node may show only compact aggregate state such as:

- engine ON/OFF
- number of active visual objects
- number of incoming control connections

The internal visual scene remains opaque to Scheme.

## Multi-script sessions

Multi-script support is intentionally postponed until the core language/runtime semantics are stable.

The intended model is:

- A session can hold multiple independent scripts in memory.
- Each script has its own local variable/object scope.
- Scripts can continue running independently while another script is being edited.
- Cross-script access may use explicit namespaces, for example:
  `DRONE.a`
- Script names act as namespaces and are likely to use a normalized uppercase form.
- A script may create persistent objects, event handlers, clocks, or other runtime state.
- Stopping or replacing a script must have well-defined ownership and cleanup semantics.
- `.sum` session files should eventually be able to store all scripts in one human-readable, versionable document.

A possible initial layout is a fixed bank of scripts (for example `00` through `09`), inspired by hardware live-coding workflows but not intended to reproduce any specific device.

Multi-script support becomes particularly useful on constrained or dedicated devices where several prepared programs can remain resident and be switched or combined during performance.

## MIDI integration

MIDI should be able to operate both as a direct control-mapping layer and as a modular signal/event source.

Planned parameter mapping syntax includes descriptors such as:

- `a.timbre(20).midi("#20");` for MIDI CC 20.
- `a.timbre(20).midi("#20@2");` for MIDI CC 20 on channel 2.
- Note/event descriptors such as `"!C2"` or `"!C2@3"` where appropriate.
- MIDI learn for assigning hardware controls without manually entering controller numbers.

A future built-in `Midi` source should convert incoming MIDI into ordinary Sonus Umbrae ports so it can participate in the same routing graph as software and Eurorack signals. Candidate ports include:

- `Midi.note` as a SIGNAL carrying pitch in the logical V/OCT domain.
- `Midi.gate` as a GATE held high from Note On until Note Off.
- `Midi.trig` as a TRIGGER emitted on Note On.
- `Midi.velocity` as a SIGNAL.
- Future pitch bend, pressure, modulation, and MIDI clock sources.
- `Midi.ch(n)` as an optional channel filter, with channel 1 as the default when omitted.

A typical future patch could therefore use:

`Midi.note -> a.v_oct;`

`Midi.gate -> a.trig;`

MIDI must not become a separate special-purpose signal system. Once converted to Sonus Umbrae ports, MIDI-derived SIGNAL, GATE, and TRIGGER data should follow the same routing, attenuation, visualization, and Scheme rules as every other source.

`Voice.v_oct` is the first pitch-CV input intended for this model. Internally it remains a continuous SIGNAL; user-facing displays should prefer musical note names (for example `C2`, `F#3`, or `A4 +12c`) rather than raw voltage values.

## Beyond the browser

The web version is currently the reference implementation, not necessarily the final platform.

The language/runtime should remain portable enough to support possible future dedicated applications for:

- macOS
- Windows
- iPadOS
- iOS
- Android
- Linux

Potential native applications could provide:

- Lower-latency/native audio backends.
- Better multi-channel audio interface support.
- MIDI and OSC integration.
- Local project/session management.
- Offline DSP builds.
- Plugin hosting or plugin versions where practical.
- Touch-first interfaces on tablets.

The core language should remain as platform-independent as practical.

## Dedicated hardware / Eurorack

A long-term experimental direction is running Sonus Umbrae on dedicated hardware, potentially including a Eurorack module.

A hardware implementation could benefit significantly from:

- Multiple scripts stored in memory.
- Fast script switching.
- A small monochrome/pixel display.
- Physical CV, gate, trigger, and audio I/O.
- Encoders/buttons for navigation rather than graphical editing.
- The same textual language used by the web/native versions.
- Session transfer between desktop/web and hardware.
- A reduced but deterministic DSP/runtime profile suitable for embedded hardware.

This is exploratory and depends heavily on CPU, memory, audio latency, storage, and display constraints.

## Session format

The `.sum` format should remain:

- Human-readable.
- Text-based.
- Version-control friendly.
- Portable between implementations.
- Capable of representing future multi-script sessions without turning into an opaque binary project file.

Runtime-only state should not silently become required to understand or reproduce a session.

## Design principles

Sonus Umbrae should continue to follow these principles:

- Code is the source of truth.
- The system is live, not command-line oriented.
- Values are observed through views rather than `print()`-style console output.
- The Scheme view is read-only and never becomes a graphical patch editor.
- Visual objects are programmed in the same language, but Scheme exposes them only through an optional aggregated `VISUAL` endpoint rather than individual visual nodes.
- Audio and visual engines have independent lifecycle state; visual output is opt-in by default.
- Audio and CV are signals, not artificially separated language concepts.
- Gate and trigger semantics are metadata used for interpretation and visualization.
- Visual interfaces should remain compact, phosphor-inspired, keyboard-first, and deliberately non-IDE-like.
- The runtime should reconcile changes rather than destructively restart the whole audio system.
- The language should remain usable for ambient, generative, experimental, and modular composition without becoming pattern-centric.


## Matter physical modeling

- [x] Compile Mutable Instruments Elements DSP into a dedicated `matter.wasm`.
- [x] Run Elements in an AudioWorklet with host-rate resampling while preserving the original 32 kHz DSP contract.
- [x] Expose Elements as one high-level `matter` VOICE engine with mixed BOW/BLOW/STRIKE exciters and stereo output.
- [x] Integrate Matter voices with note/scale sequencing, routing, levels, hot reload, Scheme, and musical transport stop.
- [x] Add typed AD/ADR/ASR/ADSR/DAHDSR envelope values, SET/FROM compatibility, and Matter DRIVE triggering through the global scheduler.
- [ ] Evaluate future audio-rate modulation inputs for selected Matter parameters without exposing the original Eurorack panel semantics.


## Resonator physical modeling

- [x] Compile Mutable Instruments Rings DSP into a dedicated `resonator.wasm`.
- [x] Expose the three primary Rings resonator models as `resonator.modal`, `resonator.sympathetic`, and `resonator.string`.
- [x] Support Rings 1/2/4-note internal polyphony through `SOUND ... WITH N NOTES`.
- [x] Automatically strum on VOICE note events.
- [x] Treat MAIN/AUX as a logical stereo output (MAIN -> L, AUX -> R) while allowing explicit `.main` / `.aux` mono routing.
- [x] Expose the original mono audio input so a Resonator VOICE can also process another source in `PLAY ... THROUGH resonator THEN ...` chains.
- [ ] Evaluate explicit strum/pitch decoupling only after the initial note-driven workflow has been tested musically.
