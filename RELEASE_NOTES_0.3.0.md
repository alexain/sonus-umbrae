# Sonus Umbrae 0.3.0

## Highlights

Sonus Umbrae 0.3.0 adds a new generative random-voltage modulation backend, expands the creative delay, improves live module visualization, and introduces application-level output gain configuration.

### Dices

`MOD dices` derives selected random-voltage behaviour from MIT-licensed Mutable Instruments Marbles DSP while retaining Sonus Umbrae's own timing and routing architecture.

```text
MOD rnd WITH VIEW:
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

Dices uses a real `-5V..+5V` control domain. The three X outputs share macro controls with configurable diversity; Y is a slower modulation source.

### View scaling

Module views can use either an explicit voltage range or relative visual zoom:

```text
MOD rnd WITH VIEW 2V:
MOD rnd WITH VIEW 2X:
```

View scaling is display-only and never modifies the routed control value.

### Creative delay

The creative multi-line delay now includes probabilistic discrete-window pitch shifting and ping-pong behaviour in addition to reverse capture, tape colour, diffusion, line spread/looseness and feedback.

Pitch decisions are attached to newly captured delay windows rather than continuously gliding existing feedback material.

### Output level

Configuration adds a persistent `OUTPUT LEVEL` control (`0..200%`) that applies immediately to the final hardware gain. It is independent from script-level `MAIN LEVEL`.

## Compatibility

0.3.0 is still an active-development release. Language and DSP contracts may continue to evolve before a stable 1.0 API.
