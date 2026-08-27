# Sonus Umbrae Roadmap

Sonus Umbrae is currently developed as a browser-based modular live-coding environment, but the language and runtime are intentionally being designed so they are not tied permanently to the web platform.

This roadmap is directional rather than a release commitment. Features may move, change shape, or be dropped as the language evolves.

## Near term

### Language core

- Scalar variables with dynamic typing.
- Arithmetic, comparison, and logical expressions.
- Core functions such as `rnd()`, `choose()`, `coin()`, `clamp()`, and `map()`.
- Variable monitoring through `.view()`.
- Event-driven blocks such as `When (...) { ... }`.
- Conditional execution with `if`.
- Looping and iteration primitives.
- Persistent runtime state for event-driven code.
- Clear distinction between snapshot values and continuously evaluated signals.

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

- `Voice()` based on the Mutable Instruments Plaits DSP.
- Additional Mutable Instruments DSP where licensing permits.
- Original Sonus Umbrae DSP modules.
- Inspiration from other modular systems and open algorithms without necessarily reproducing their original user interfaces.
- A stable module metadata format describing parameters, ports, signal semantics, and visual behavior.

The language should not depend on the identity of any one upstream hardware module.

## Clock and event system

`Clock` is intended to evolve into a programmable master timing system rather than a simple metronome.

Planned directions include:

- Master BPM.
- Clock-derived trigger sources using ratios such as `/2`, `/4`, `*2`, and non-binary ratios.
- Meter information.
- Phase offsets.
- Swing.
- Probability.
- Trigger skipping.
- Ratchets.
- Irregular and algorithmically changing rates.
- Event-driven scripting connected to clock and trigger ports.

The design is conceptually closer to a programmable modular timing source than to a conventional DAW transport.

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
- Audio and CV are signals, not artificially separated language concepts.
- Gate and trigger semantics are metadata used for interpretation and visualization.
- Visual interfaces should remain compact, phosphor-inspired, keyboard-first, and deliberately non-IDE-like.
- The runtime should reconcile changes rather than destructively restart the whole audio system.
- The language should remain usable for ambient, generative, experimental, and modular composition without becoming pattern-centric.
