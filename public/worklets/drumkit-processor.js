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
    this.samples=new Map();
    this.sampleVoices=[];
    this.port.onmessage=(event)=>{
      const m=event.data; if(!m) return;
      if(m.type==='sample') { this.storeSample(m); return; }
      if(m.type==='remove-sample') { this.samples.delete(String(m.alias||'')); return; }
      if(m.type==='trigger-sample') { this.triggerSample(m); return; }
      if(m.type!=='trigger') return;
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
  storeSample(message){
    const alias=String(message.alias||'');
    const sourceRate=this.num(message.sampleRate,0);
    const sourceChannels=Array.isArray(message.channels)?message.channels:[];
    if(!alias||sourceRate<=0||sourceChannels.length===0) return;
    const channels=sourceChannels.map((channel)=>channel instanceof Float32Array?channel:new Float32Array(channel));
    if(channels.some((channel)=>channel.length===0)) return;
    this.samples.set(alias,{sampleRate:sourceRate,channels});
  }
  triggerSample(message){
    const alias=String(message.alias||'');
    const sample=this.samples.get(alias); if(!sample) return;
    const tune=this.num(message.tune,0);
    const rate=(sample.sampleRate/sampleRate)*(2**(tune/12));
    const decay=this.unit(message.decay,1);
    const maxFrames=Math.min(...sample.channels.map((channel)=>channel.length));
    const endFrame=Math.max(1,Math.floor(maxFrames*Math.max(0.01,decay)));
    this.sampleVoices.push({
      sample,
      position:0,
      rate,
      endFrame,
      level:this.unit(message.level,1),
      pan:this.clamp(this.num(message.pan,0),-1,1),
    });
    if(this.sampleVoices.length>32) this.sampleVoices.splice(0,this.sampleVoices.length-32);
  }
  sampleAt(channel,position){
    const i=Math.floor(position); if(i<0||i>=channel.length) return 0;
    const next=Math.min(i+1,channel.length-1), frac=position-i;
    return channel[i]+(channel[next]-channel[i])*frac;
  }
  mixSamples(left,right,frames){
    if(this.sampleVoices.length===0) return;
    const alive=[];
    for(const voice of this.sampleVoices){
      const channels=voice.sample.channels;
      const sourceL=channels[0], sourceR=channels[1]??channels[0];
      const leftPan=voice.pan<=0?1:1-voice.pan;
      const rightPan=voice.pan>=0?1:1+voice.pan;
      let active=true;
      for(let i=0;i<frames;i+=1){
        if(voice.position>=voice.endFrame){active=false; break;}
        const remaining=Math.max(0,1-(voice.position/voice.endFrame));
        const envelope=remaining<0.02?remaining/0.02:1;
        const gain=voice.level*envelope/6;
        left[i]+=this.sampleAt(sourceL,voice.position)*gain*leftPan;
        right[i]+=this.sampleAt(sourceR,voice.position)*gain*rightPan;
        voice.position+=voice.rate;
      }
      if(active&&voice.position<voice.endFrame) alive.push(voice);
    }
    this.sampleVoices=alive;
  }
  process(_inputs,outputs){
    const out=outputs[0], frames=out?.[0]?.length??128;
    this.call('su_drumkit_process',this.handle,frames);
    const mem=new Float32Array(this.memory.buffer);
    if(out?.[0]) out[0].set(mem.subarray(this.leftPtr>>>2,(this.leftPtr>>>2)+frames));
    if(out?.[1]) out[1].set(mem.subarray(this.rightPtr>>>2,(this.rightPtr>>>2)+frames));
    if(out?.[0]&&out?.[1]) this.mixSamples(out[0],out[1],frames);
    return true;
  }
}
registerProcessor('sonus-drumkit',SonusDrumkitProcessor);
