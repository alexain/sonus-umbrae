class SonusDrumkitProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const bytes=options.processorOptions?.wasmBytes;
    if(!bytes) throw new Error('Drumkit WASM bytes missing');
    this.instance=new WebAssembly.Instance(new WebAssembly.Module(bytes),{});
    this.exports=this.instance.exports; this.memory=this.exports.memory;
    // SONUS606_STATIC_CTORS
    // Clap uses a static reconstruction table at sample rates above 44.1 kHz.
    // Run the standalone-WASM initializer before constructing any drum voices.
    const wasmInitialize = this.exports._initialize ?? this.exports.__wasm_call_ctors;
    if (typeof wasmInitialize === 'function') wasmInitialize();
    this.handle=this.call('su_drumkit_create');
    this.call('su_drumkit_set_sample_rate',this.handle,sampleRate);
    this.leftPtr=this.call('su_drumkit_left',this.handle); this.rightPtr=this.call('su_drumkit_right',this.handle);
    this.port.onmessage=(event)=>{
      const m=event.data; if(!m||m.type!=='trigger') return;
      const level=this.unit(m.level,1), pan=this.clamp(this.num(m.pan,0),-1,1), tune=this.num(m.tune,0), decay=this.unit(m.decay,.7);
      switch(String(m.voice||'').toLowerCase()){
        case 'kick': this.call('su_drumkit_trigger_kick',this.handle,level,pan,tune,decay,this.unit(m.transient,.3)); break;
        case 'snare': this.call('su_drumkit_trigger_snare',this.handle,level,pan,tune,decay,this.unit(m.snappy,.75),this.num(m.color,1)); break;
        case 'clap': this.call('su_drumkit_trigger_clap',this.handle,level,pan,tune,decay,this.unit(m.noise,.5)); break;
        case 'hihat': this.call('su_drumkit_trigger_hihat',this.handle,level,pan,tune,decay); break;
        case 'openhat': this.call('su_drumkit_trigger_openhat',this.handle,level,pan,tune,decay); break;
        case 'lowtom': this.call('su_drumkit_trigger_lowtom',this.handle,level,pan,tune,decay); break;
        case 'hightom': this.call('su_drumkit_trigger_hightom',this.handle,level,pan,tune,decay); break;
      }
    };
  }
  call(name,...args){const fn=this.exports[name]??this.exports[`_${name}`]; if(typeof fn!=='function') throw new Error(`Drumkit export missing: ${name}`); return fn(...args);}
  num(v,f){const n=Number(v); return Number.isFinite(n)?n:f;}
  unit(v,f){return this.clamp(this.num(v,f),0,1);}
  clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  process(_inputs,outputs){
    const out=outputs[0], frames=out?.[0]?.length??128;
    this.call('su_drumkit_process',this.handle,frames);
    const mem=new Float32Array(this.memory.buffer);
    if(out?.[0]) out[0].set(mem.subarray(this.leftPtr>>>2,(this.leftPtr>>>2)+frames));
    if(out?.[1]) out[1].set(mem.subarray(this.rightPtr>>>2,(this.rightPtr>>>2)+frames));
    return true;
  }
}
registerProcessor('sonus-drumkit',SonusDrumkitProcessor);
