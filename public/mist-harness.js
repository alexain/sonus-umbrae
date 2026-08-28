const logElement = document.querySelector('#log');
const runButton = document.querySelector('#run');

function write(message, cls = '') {
  const line = document.createElement('div');
  line.textContent = message;
  if (cls) line.className = cls;
  logElement.append(line);
}

function exported(exports, name) {
  const fn = exports[name] ?? exports[`_${name}`];
  if (typeof fn !== 'function') throw new Error(`missing WASM export: ${name}`);
  return fn;
}

function peak(buffer) {
  let result = 0;
  for (const sample of buffer) result = Math.max(result, Math.abs(sample));
  return result;
}

async function loadWasm() {
  const response = await fetch(`/dsp/mist-harness.wasm?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`mist-harness.wasm HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  return WebAssembly.instantiate(module, {
    env: {
      abort: () => { throw new Error('WASM abort'); },
    },
  });
}

async function run() {
  runButton.disabled = true;
  logElement.replaceChildren();

  try {
    write('Loading mist-harness.wasm...');
    const instance = await loadWasm();
    const e = instance.exports;
    const memory = e.memory;
    if (!(memory instanceof WebAssembly.Memory)) throw new Error('WASM memory export missing');

    const init = exported(e, 'su_mist_harness_init');
    const inputPtr = exported(e, 'su_mist_harness_input');
    const outputPtr = exported(e, 'su_mist_harness_output');
    const setBypass = exported(e, 'su_mist_harness_set_bypass');
    const setTrigger = exported(e, 'su_mist_harness_set_trigger');
    const setDensity = exported(e, 'su_mist_harness_set_density');
    const setPosition = exported(e, 'su_mist_harness_set_position');
    const setSize = exported(e, 'su_mist_harness_set_size');
    const process = exported(e, 'su_mist_harness_process');

    init();

    const inputAddress = inputPtr();
    const outputAddress = outputPtr();
    const input = new Int16Array(memory.buffer, inputAddress, 64);
    const output = new Int16Array(memory.buffer, outputAddress, 64);

    write(`WASM instantiated. input=0x${inputAddress.toString(16)}, output=0x${outputAddress.toString(16)}`, 'pass');

    // Test 1: Clouds' own bypass. This validates memory pointers + Process().
    setBypass(1);
    for (let i = 0; i < 32; i += 1) {
      const sample = Math.round(Math.sin(i / 32 * Math.PI * 2) * 12000);
      input[i * 2] = sample;
      input[i * 2 + 1] = sample;
    }
    output.fill(0);
    process();

    let mismatch = 0;
    for (let i = 0; i < 64; i += 1) {
      if (input[i] !== output[i]) mismatch += 1;
    }

    if (mismatch === 0) {
      write(`PASS 1 — GranularProcessor bypass copied all 64 samples exactly.`, 'pass');
    } else {
      write(`FAIL 1 — bypass mismatch in ${mismatch}/64 samples; output peak=${peak(output)}.`, 'fail');
      throw new Error('Stop: Clouds/WASM ABI or Process path is broken before granular processing.');
    }

    // Test 2: actual granular engine.
    setBypass(0);
    setDensity(0.82);
    setPosition(0.20);
    setSize(0.42);

    let phase = 0;
    const phaseIncrement = 2 * Math.PI * 220 / 32000;
    let maxWetPeak = 0;
    let firstWetBlock = -1;

    // Feed 4 seconds at the native Clouds sample rate, in native 32-sample blocks.
    const blocks = Math.ceil(4 * 32000 / 32);
    for (let block = 0; block < blocks; block += 1) {
      for (let i = 0; i < 32; i += 1) {
        const sample = Math.round(Math.sin(phase) * 10000);
        phase += phaseIncrement;
        if (phase >= Math.PI * 2) phase -= Math.PI * 2;
        input[i * 2] = sample;
        input[i * 2 + 1] = sample;
      }

      // Explicitly seed grains periodically in addition to density's automatic generation.
      if (block % 32 === 0) setTrigger(1);

      output.fill(0);
      process();

      const blockPeak = peak(output);
      if (blockPeak > maxWetPeak) maxWetPeak = blockPeak;
      if (firstWetBlock < 0 && blockPeak > 32) firstWetBlock = block;
    }

    if (maxWetPeak > 32) {
      const firstMs = firstWetBlock * 32 / 32000 * 1000;
      write(`PASS 2 — granular wet output is non-zero. peak=${maxWetPeak}, first activity≈${firstMs.toFixed(1)} ms.`, 'pass');
      write('Clouds DSP is healthy outside AudioWorklet. The next step is integrating this exact bridge into Mist.', 'pass');
    } else {
      write(`FAIL 2 — granular output remained silent. max peak=${maxWetPeak}.`, 'fail');
      write('The problem is now reproducible outside AudioWorklet and must be fixed in the Clouds initialization/bridge.', 'fail');
    }
  } catch (error) {
    write(`ERROR — ${error instanceof Error ? error.message : String(error)}`, 'fail');
    console.error(error);
  } finally {
    runButton.disabled = false;
  }
}

runButton.addEventListener('click', run);
