# Sonus Umbrae Roadmap

Sonus Umbrae is an experimental live-coding environment for composing, sequencing, routing and performing modular audio systems from text. The browser implementation is currently the reference platform, while the language and runtime are being designed to remain portable beyond the web.

This roadmap is directional rather than a release commitment. Items may change shape, move between milestones, or be dropped as the language and runtime evolve.

## Current foundation

The current development line already includes the main architectural pieces required for a complete live-coding environment:

- Text-first `.sum` programs with hot reload reconciled against the running audio graph.
- Typed reusable values through `SET`, including scalar, time, note, frequency, scale, envelope and kit data.
- `VOICE`, `DRUMKIT`, `FILTER`, `MOD`, `FX`, `CLOCK`, `SEQ` and `REGISTER` objects.
- Unified musical `PITCH` material based on notes, frequencies, scales and stateful sources.
- Shared beat/wall-clock scheduling with named clocks, derived rates, Euclidean timing, chance, loose timing, jitter and drift.
- Stereo-aware routing with named ports, serial/parallel paths, route levels and automatic MAIN routing where appropriate.
- AudioWorklet processing with independent C/C++ WebAssembly DSP modules.
- Multiple synthesis families, physical modelling, modulation sources, multimode filtering and stereo effects.
- Synthesized and sample-backed `DRUMKIT` workflows with reusable kits.
- Sample `VOICE` playback with root tuning, regions, loop/reverse, slicing, slice sequencing, waveform views and automatic anti-click smoothing.
- Stateful generative sources including Turing-style sequencing, cellular-automata pools and shift-register pitch storage.
- Reusable VCA/parameter envelopes and embedded processing inside compatible objects.
- Read-only Scheme topology and optional live parameter/signal views.
- Keyboard-first live environment controls, Configuration, Help, Scheme and About screens.
- Capability-gated runtime features through top-of-file `USE` declarations.

The focus of future work is therefore less on filling basic synthesis gaps and more on consolidating timing, event semantics, routing metadata, modular interoperability, runtime structure and performance workflows.

## Near term

### Timing and sequencing

- Swing as a first-class clock feel control.
- General ratchet/retrigger support at the event/timing layer rather than as a sample-specific feature.
- Phase offsets and additional clock-relationship controls.
- Clearer common semantics for event probability, weighted value selection and trigger skipping.
- Additional reusable timing/group constructs where they reduce repetition without making the language pattern-centric.
- Preserve current musical timing behaviour across hot reload and transport stop/restart.

### Event-driven language core

The primary control-flow model should remain musical and event-driven rather than becoming a conventional general-purpose scripting language.

A future event form is expected to build on clock and trigger sources, for example:

`when (Clock.out) { ... }`

Temporary clock-rate views should be expressible without requiring a named derived clock:

`when (Clock.out("/2")) { ... }`

`when (Clock.out("*2")) { ... }`

Event modifiers should use the same function-call style as normal language operations:

`when (Clock.out("/2"), cycle("1:4"), prob(30)) { ... }`

Initial candidate modifiers include:

- `cycle("1:4")`, `cycle("2:4")`, etc. for positions in a repeating event cycle.
- `cycle("first")` for the first event after handler evaluation.
- `cycle("!first")` for every event except the first.
- `prob(n)` for event probability after other conditions match.

Richer conditionals, iteration and persistent event-local state can be considered where they provide clear musical value.

### Signal, gate and trigger routing

The runtime already exposes a mixture of audio ports, pitch/CV-like inputs, triggers and parameter modulation. These should converge toward one capability-driven routing model.

Planned work:

- Generic routing from any compatible output port to any compatible input or parameter.
- Internal port metadata for `SIGNAL`, `GATE` and `TRIGGER` semantics.
- Per-connection attenuation and inversion.
- Runtime validation based on declared module capabilities rather than object-category special cases.
- Audio-rate modulation without an artificial language-level distinction between audio and CV where the DSP supports it.
- Broader modulation coverage for model parameters that are currently not exposed as modulatable targets.
- A stable module metadata format describing parameters, ports, trigger/gate behaviour, stereo capability, views and hot-reload policy.

The language should not depend on the identity or panel layout of any one upstream hardware module.

### Runtime and codebase consolidation

As the feature set grows, the implementation should become more modular without requiring a disruptive rewrite.

Planned direction:

- Incrementally split large parser/runtime/audio/UI files by responsibility.
- Move object-family parsing and runtime behaviour into focused modules.
- Reduce duplicated engine/model conditionals by extending registry metadata.
- Make scheduler ownership and lifecycle explicit for hot reload, transport stop and object replacement.
- Keep DSP modules independent where practical instead of building one monolithic WASM library.
- Add regression coverage around parser metadata passes, scheduler re-registration, routing capability checks and state preservation.

## Sample and drum workflows

The first sample playback milestone is considered functionally complete for now.

Current capabilities include:

- Sample assets as VOICE sources with optional root-note declaration.
- Classic varispeed pitch behaviour.
- Region selection, loop and reverse playback.
- Equal region slicing with forward, reverse, random, walk and pendulum traversal.
- Per-slice reverse markers and weighted random selection.
- Waveform views with region dimming, slice guides and active-slice indication.
- Automatic anti-click smoothing at playback boundaries.
- Sample-backed DRUMKIT lanes and reusable hybrid kits.

Possible later extensions, intentionally deferred until there is a concrete musical need:

- Per-slice relative tuning/transpose while keeping slice syntax readable.
- General polyphonic sample voice allocation.
- Choke groups and explicit gate/one-shot behaviour.
- Time-stretch/tempo-sync independent of pitch.
- Loop crossfades beyond the current anti-click smoothing.

These should remain secondary to shared timing/event/routing work unless real usage exposes a stronger need.

## Modulation and parameter system

The project already includes reusable envelopes and multiple modulation engines. Future work should concentrate on interoperability rather than simply adding more modulation sources.

Planned direction:

- Extend modulation support consistently across compatible parameters.
- Clarify snapshot values versus continuously evaluated signals.
- Add reusable stateful helpers where useful, such as `walk()`, `chaos()`, `slew()`, reproducible `seed()`, numeric `wrap()` and `quantize()`.
- Keep slow control-rate and audio-rate modulation semantics explicit in module metadata.
- Preserve meaningful raw modulation domains in visual monitoring rather than normalizing everything prematurely.

## Visual monitoring and Scheme

The Scheme view remains a read-only representation of the running modular topology, not a graphical patch editor.

Planned improvements include:

- SIGNAL views as oscilloscopes.
- TRIGGER views as event timelines/particles.
- GATE views as high/low timelines.
- PARAMETER views showing base and live values.
- Compact variable/value monitoring.
- Optional spectrum and level visualizers.
- Pan, zoom, fit-to-view and keyboard navigation for large topologies.
- Clear rendering of branching, fan-in, fan-out and feedback paths.
- Visual differentiation of SIGNAL, GATE and TRIGGER connections once the common port model is established.

Embedded views should remain associated with their parent runtime objects where possible.

## MIDI and external control

MIDI should operate both as a direct mapping layer and as an ordinary modular signal/event source.

Candidate mapping descriptors include:

- `a.timbre(20).midi("#20");`
- `a.timbre(20).midi("#20@2");`
- note/event descriptors such as `"!C2"` or `"!C2@3"` where appropriate.
- MIDI learn for assigning hardware controls without entering controller numbers manually.

A future built-in `Midi` source should expose ordinary Sonus Umbrae ports, for example:

- `Midi.note` as a pitch SIGNAL.
- `Midi.gate` as a GATE held from Note On to Note Off.
- `Midi.trig` as a TRIGGER emitted on Note On.
- `Midi.velocity` as a SIGNAL.
- Later pitch bend, pressure, modulation and MIDI clock sources.

MIDI should not become a separate special-purpose routing subsystem. Its signals should use the same attenuation, validation, visualization and Scheme rules as internal sources.

Implementation should follow consolidation of the common SIGNAL/GATE/TRIGGER port model.

## Multi-script sessions

Multi-script support remains intentionally postponed until event ownership and runtime lifecycle semantics are stable.

Intended direction:

- Multiple independent scripts resident in one session.
- Local object/value scope per script.
- Independent execution while another script is edited.
- Explicit namespaces for cross-script access.
- Well-defined ownership and cleanup of persistent objects, clocks, handlers and state.
- Human-readable `.sum` session storage containing all scripts.

A fixed script bank may be useful for performance-oriented or dedicated-device workflows, but the exact interaction model is still open.

## Visual engine / audiovisual performance

A programmable visual engine remains a longer-term direction. It should use the same language and runtime concepts rather than introducing a separate visual programming language.

The visual subsystem should have an independent lifecycle from audio and remain disabled by default. Candidate primitives include geometric shapes, text, grids, sprites, bitmap/pixel sources and procedural textures, with properties such as position, scale, rotation, opacity, colour, distortion, blur, feedback and trails.

Audio/runtime values should eventually be routable into visual properties through the same SIGNAL/GATE/TRIGGER model used elsewhere.

A dedicated analysis layer may expose musically useful values such as level, onset, spectral-band energy and pitch-derived features without requiring direct per-sample coupling between audio and graphics.

The browser implementation should eventually support a separate fullscreen visual-output client suitable for a second display or projector. Scheme should represent the entire visual subsystem only as an optional aggregated endpoint rather than exposing every visual primitive as a node.

## Beyond the browser

The web version is the current reference implementation, not necessarily the final platform.

The language/runtime should remain portable enough to support possible future dedicated applications for:

- macOS
- Windows
- iPadOS / iOS
- Android
- Linux

Potential native applications could provide lower-latency audio backends, richer multi-channel I/O, MIDI/OSC integration, local session management, offline DSP builds and touch-first interfaces where appropriate.

The core language should remain as platform-independent as practical.

## Dedicated hardware / Eurorack

A long-term experimental direction is running Sonus Umbrae on dedicated hardware, potentially including a Eurorack device.

Relevant requirements include:

- deterministic runtime behaviour;
- compact CPU/memory footprint;
- physical audio/CV/gate/trigger I/O;
- multiple resident scripts;
- fast switching and performance controls;
- a minimal display/navigation model;
- session transfer between desktop/web and hardware.

This remains exploratory and depends on the requirements of a future hardware target.

## Session format

The `.sum` format should remain:

- human-readable;
- text-based;
- version-control friendly;
- portable between implementations;
- capable of representing future multi-script sessions without becoming an opaque project container.

Runtime-only state should not silently become necessary to understand or reproduce a session.

## Design principles

Sonus Umbrae should continue to follow these principles:

- Code is the source of truth.
- The system is live rather than command-line oriented.
- The language describes musical/runtime intent rather than mirroring upstream hardware interfaces.
- Values are observed through views rather than `print()`-style console output.
- Scheme is read-only and never becomes a graphical patch editor.
- Routing should increasingly be capability-driven rather than category-driven.
- Audio and CV-like data are signals; gate and trigger semantics are metadata for interpretation and visualization.
- Runtime changes should be reconciled rather than destructively restarting the entire audio system.
- DSP integrations should remain modular and license-compatible.
- The language should remain suitable for ambient, generative, rhythmic, experimental and modular composition without becoming centred on any single workflow.
