# Sonus Umbrae editor snippets

Editor snippets are shorthand commands for creating normal Sonus Umbrae source quickly. They are an editor feature, not part of the Sonus language grammar.

Type a snippet on its own line and press `Tab`. The editor replaces the shorthand with the corresponding Sonus source. Once expanded, the result is ordinary editable code and is compiled and validated exactly as if it had been typed manually.

## General form

Most snippets use:

```text
@<kind> <name> <template>
```

Some object families use a shorter form because no template selector is needed.

Object names use the same identifier rule as the language:

```text
[A-Za-z][A-Za-z0-9_]*
```

The first character must therefore be a letter. Letters, digits, and `_` may follow it.

Valid names include `lead`, `lead1`, `bass_2`, and `MyVoice`. Names such as `123lead`, `_lead`, `.lead`, and `-lead` are invalid.

## VOICE

Use `@v` or `@voice`:

```text
@v lead macro.fm
```

expands to:

```text
VOICE lead:
    sound macro.fm
    pitch notes [C3]
```

Append `.full` to insert the public parameters registered for that engine:

```text
@v lead macro.fm.full
```

expands to:

```text
VOICE lead:
    sound macro.fm
    pitch notes [C3]
    harmo 50
    timbre 50
    morph 50
```

The supported VOICE templates are:

```text
sine
triangle
saw
sawtooth
ramp
square
macro.analog
macro.waves
macro.fm
macro.grain
macro.additive
macro.wavetable
macro.chord
macro.speech
macro.swarm
macro.noise
macro.particle
macro.string
macro.analog-vcf
macro.phase
macro.terrain
macro.strings
macro.chiptune
resonator.modal
resonator.sympathetic
resonator.strings
resonator.string
matter
```

`@v ... saw` is a convenience alias that generates `sound sawtooth`. Engine names otherwise use the public Sonus names directly; Mutable Instruments product names are not snippet aliases.

Without `.full`, VOICE snippets deliberately create only the minimum useful skeleton: `sound` and `pitch`. With `.full`, the registered public engine parameters are added with neutral starting values.

## ENVELOPE

Use `@env` followed by the SET name. ADSR is the default:

```text
@env pluck
```

expands to:

```text
SET pluck: ENVELOPE [
    ATTACK 5 ms
    DECAY 120 ms
    SUSTAIN 70
    RELEASE 180 ms
]
```

A common envelope shape can be selected explicitly:

```text
@env pluck ad
@env gate ar
@env perc adr
@env bass adsr
@env pad adhsr
```

Supported shapes are:

| Shape | Generated stages |
| --- | --- |
| `ad` | ATTACK, DECAY |
| `ar` | ATTACK, RELEASE |
| `adr` | ATTACK, DECAY, RELEASE |
| `adsr` | ATTACK, DECAY, SUSTAIN, RELEASE |
| `adhsr` | ATTACK, DECAY, HOLD, SUSTAIN, RELEASE |

The generated values are starting points only and can be edited normally after expansion.

## FX

Use `@fx`:

```text
@fx space mist.reverb
```

expands to:

```text
FX space:
    model mist.reverb
```

Append `.full` to include the registered public parameters and starting values:

```text
@fx space mist.reverb.full
```

Supported FX templates are:

```text
mist
mist.grain
mist.stretch
mist.delay
mist.spectral
mist.reverb
mist.resonator
mist.repeat
mist.smear
sky
delay
```

`mist` is a convenience template for `mist.reverb`. Without `.full`, only the required `model` property is generated.

## SEQ

Use `@seq <name> <model>`.

### Turing

```text
@seq melody turing
```

expands to a usable Turing skeleton containing `model`, `length`, `change`, pitch material, and timing.

### Constellation

```text
@seq melody constellation
```

creates a Constellation sequence with a default note pool and its principal generative parameters.

### Snake

```text
@seq path snake
```

creates a 4x4 Snake sequence with default scale material and `movement snake`.

### Life

```text
@seq ecosystem life
```

expands to:

```text
SEQ ecosystem:
    model life
    size 16
    density 34
    pitch scale C minor with range C2 C5
    evolve every 8 beat
```

The snippet creates only normal SEQ source. Life variants such as `life.highlife` remain normal language edits after expansion unless a dedicated snippet is added later.

## DRUMKIT

Use any of these equivalent forms:

```text
@d drums
@drum drums
@drumkit drums
```

They expand to:

```text
DRUMKIT drums:
    kit sonus606
```

The snippet uses the built-in `sonus606` kit as the starting point. Further kit overrides, per-drum settings, timing, and routing are added normally in Sonus source.

## CLOCK

Use `@c` or `@clock`.

A numeric argument creates a master-clock declaration:

```text
@c 120
```

expands to:

```text
CLOCK set 120 bpm
```

Decimal BPM values are accepted as well.

A name followed by a rate creates a named clock derived from the master clock:

```text
@c slow /4
@c fast *2
```

which expand to:

```text
CLOCK slow RATE /4
CLOCK fast RATE *2
```

The rate must use `/n` or `*n` with a positive value.

Snippets intentionally do not inspect the rest of the program before expanding. For example, using `@c 120` twice will create two master-clock declarations; the normal Sonus compiler remains responsible for reporting that the resulting program is invalid.

## `.full`

`.full` currently applies to VOICE and FX templates:

```text
@v lead macro.fm.full
@fx cloud mist.grain.full
```

The normal form creates the minimum useful object skeleton. The `.full` form additionally writes the public parameters registered for that template with useful initial values. It does not change runtime semantics and does not create a special object type.

## Error handling

Snippet expansion is deliberately separate from language parsing. A valid snippet expands into source first; compilation happens afterward using the normal Sonus parser and semantic checks.

If an `@...` command does not match a registered snippet, the editor reports it as an unknown snippet rather than silently treating it as Sonus source. Invalid object names are rejected by the same identifier convention used by the language.

This separation means snippets can remain compact and convenient without weakening the language rules. Generated source can always be edited, saved in a `.sum` file, version-controlled, or rewritten manually.
