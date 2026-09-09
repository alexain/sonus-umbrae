export type TimingKind = 'none' | 'every' | 'euclidean' | 'pattern' | 'reference';
export type TimingReaderMode = 'forward' | 'reverse' | 'pendulum' | 'random' | 'shuffle' | 'walk';

export type TimingEditorState = {
  enabled: boolean;
  kind: TimingKind;
  value: string;
  readerMode: TimingReaderMode;
  readerAmount: string;
};

export type TimingEditorOptions = {
  editor: HTMLTextAreaElement;
  state: TimingEditorState;
  showEnabledToggle?: boolean;
  title?: string;
  showReaderMode?: boolean;
};


export function timingStateFromValue(value: string, enabled = true): TimingEditorState {
  const text = value.trim();
  let kind: TimingKind = 'every';
  if (/^every\s+euclidean\b/i.test(text)) kind = 'euclidean';
  else if (/^(?:mode\s+\w+\s+)?pattern\b/i.test(text)) kind = 'pattern';
  else if (/^rhythm\b/i.test(text)) kind = 'reference';
  else if (!/^every\b/i.test(text)) kind = 'every';
  return { enabled, kind, value: text || 'every 1 beat', readerMode: 'forward', readerAmount: '1' };
}

function field(labelText: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('label'); wrap.className = 'object-builder-field';
  const span = document.createElement('span'); span.textContent = labelText; wrap.append(span, control); return wrap;
}
function hint(text: string): HTMLElement { const el = document.createElement('div'); el.className = 'object-builder-secondary-hint'; el.textContent = text; return el; }

export class TimingEditor {
  private state: TimingEditorState;
  private readState: (() => TimingEditorState) | null = null;

  constructor(private readonly options: TimingEditorOptions) {
    this.state = { ...options.state };
  }

  mount(): HTMLElement {
    const column = document.createElement('section'); column.className = 'object-builder-timing-column object-builder-reusable-timing';
    const header = document.createElement('div'); header.className = 'object-builder-timing-column-header';
    const heading = document.createElement('h3'); heading.textContent = this.options.title ?? 'TIMING';
    const toggle = document.createElement('label'); toggle.className = 'object-builder-timing-enable';
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = this.options.showEnabledToggle === false ? true : this.state.enabled;
    toggle.append(enabled, document.createTextNode(' Enabled')); header.append(heading);
    if (this.options.showEnabledToggle !== false) header.append(toggle);

    const fields = document.createElement('div'); fields.className = 'object-builder-timing-fields';
    const type = document.createElement('select');
    type.append(new Option('Every','every'), new Option('Euclidean','euclidean'), new Option('Pattern','pattern'), new Option('Reference','reference'));
    type.value = this.state.kind === 'none' ? 'every' : this.state.kind;

    const modeOptions = (shuffle = false): HTMLSelectElement => {
      const select = document.createElement('select');
      const modes = shuffle ? ['forward','reverse','pendulum','random','shuffle','walk'] : ['forward','reverse','pendulum','random','walk'];
      for (const mode of modes) select.append(new Option(mode[0].toUpperCase() + mode.slice(1), mode));
      return select;
    };
    const renderModePreview = (container: HTMLElement, mode: string): void => {
      const patterns: Record<string,string[]> = { forward:['1','2','3','4'], reverse:['4','3','2','1'], pendulum:['1','2','3','4','3','2'], random:['2','4','1','3'], shuffle:['3','1','4','2'], walk:['2','3','2','1','2','3'] };
      container.replaceChildren();
      (patterns[mode] ?? patterns.forward).forEach((value,index,array) => { const node=document.createElement('span'); node.className='object-builder-reader-node'; node.textContent=value; container.append(node); if(index<array.length-1){const arrow=document.createElement('i');arrow.textContent=mode==='walk'?'↔':'→';container.append(arrow);} });
    };

    const everyMatch = this.state.value.match(/^every\s+([^\s]+)\s+(beat|sec|ms)/i);
    const every = document.createElement('div'); every.className = 'object-builder-timing-mode-panel';
    const everyMain = document.createElement('div'); everyMain.className='object-builder-timing-compact-row';
    const amount=document.createElement('input'); amount.type='text'; amount.value=everyMatch?.[1] ?? '1';
    const unit=document.createElement('select'); for(const u of ['beat','sec','ms']) unit.append(new Option(u,u)); unit.value=everyMatch?.[2] ?? 'beat';
    const everyMode=modeOptions(true); everyMode.value=this.state.kind==='every'?this.state.readerMode:'forward';
    everyMain.append(field('Interval',amount),field('Unit',unit));
    const modeField = field('Mode', everyMode);
    if (this.options.showReaderMode !== false) everyMain.append(modeField);
    const walkAmount=document.createElement('input'); walkAmount.type='number'; walkAmount.min='0.01'; walkAmount.step='0.01'; walkAmount.value=this.state.readerAmount || '1';
    const walkField=field('Walk amount',walkAmount); walkField.classList.add('object-builder-walk-amount');
    const modePreview=document.createElement('div'); modePreview.className='object-builder-reader-preview';
    const redrawMode=()=>{walkField.hidden=everyMode.value!=='walk';renderModePreview(modePreview,everyMode.value);}; everyMode.addEventListener('change',redrawMode);redrawMode();
    if (this.options.showReaderMode === false) { walkField.hidden = true; modePreview.hidden = true; }
    every.append(everyMain,walkField,modePreview);

    const euclidMatch=this.state.value.match(/^every\s+euclidean\s+(\d+)\/(\d+)/i);
    const euclid=document.createElement('div'); euclid.className='object-builder-timing-mode-panel';
    const steps=document.createElement('input');steps.type='number';steps.min='1';steps.max='32';steps.step='1';steps.value=euclidMatch?.[2]??'16';euclid.append(field('Steps',steps));
    let pulses=Math.max(1,Number(euclidMatch?.[1]??1)); let rotate=Math.max(0,Number(this.state.value.match(/\brotate\s+(\d+)/i)?.[1]??0));
    const previewRow=document.createElement('div');previewRow.className='object-builder-euclidean-preview-row';
    const minus=document.createElement('button');minus.type='button';minus.className='object-builder-euclidean-pulse-button';minus.textContent='−';
    const plus=document.createElement('button');plus.type='button';plus.className='object-builder-euclidean-pulse-button';plus.textContent='+';
    const preview=document.createElement('div');preview.className='object-builder-euclidean-preview';
    const rotateRow=document.createElement('div');rotateRow.className='object-builder-rotate-row';const left=document.createElement('button');left.type='button';left.textContent='◀';const rotateValue=document.createElement('output');const right=document.createElement('button');right.type='button';right.textContent='▶';rotateRow.append(hint('Rotate'),left,rotateValue,right);
    const renderEuclid=()=>{const count=Math.max(1,Math.min(32,Math.floor(Number(steps.value)||16)));steps.value=String(count);pulses=Math.max(1,Math.min(count,pulses));rotate=((rotate%count)+count)%count;rotateValue.textContent=String(rotate);minus.disabled=!enabled.checked||pulses<=1;plus.disabled=!enabled.checked||pulses>=count;const size=190,center=95,radius=72;const base=Array.from({length:count},(_,s)=>((s*pulses)%count)<pulses);const rotated=rotate===0?base:base.map((_,s)=>base[(s-rotate+count)%count]);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${size} ${size}`);const ring=document.createElementNS(svg.namespaceURI,'circle');ring.setAttribute('cx',String(center));ring.setAttribute('cy',String(center));ring.setAttribute('r',String(radius));ring.setAttribute('class','euclidean-ring');svg.append(ring);rotated.forEach((hit,s)=>{const angle=-Math.PI/2+(s/count)*Math.PI*2;const dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('cx',String(center+Math.cos(angle)*radius));dot.setAttribute('cy',String(center+Math.sin(angle)*radius));dot.setAttribute('r',hit?'5.5':'3.5');dot.setAttribute('class',hit?'euclidean-step active':'euclidean-step');svg.append(dot);});const label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',String(center));label.setAttribute('y',String(center+4));label.setAttribute('text-anchor','middle');label.setAttribute('class','euclidean-label');label.textContent=`${pulses}/${count}`;svg.append(label);preview.replaceChildren(svg);};
    minus.addEventListener('click',()=>{pulses--;renderEuclid();});plus.addEventListener('click',()=>{pulses++;renderEuclid();});left.addEventListener('click',()=>{rotate--;renderEuclid();});right.addEventListener('click',()=>{rotate++;renderEuclid();});steps.addEventListener('input',renderEuclid);previewRow.append(minus,preview,plus);euclid.append(previewRow,rotateRow);

    const patternMatch=this.state.value.match(/^(?:mode\s+(forward|reverse|pendulum|walk|random)\s+)?pattern\s+\[([^\]]+)\](?:\s+steps\s+(\d+))?/i);
    const pattern=document.createElement('div');pattern.className='object-builder-timing-mode-panel';const patternTop=document.createElement('div');patternTop.className='object-builder-timing-compact-row two';
    const patternSteps=document.createElement('input');patternSteps.type='number';patternSteps.min='1';patternSteps.max='128';patternSteps.step='1';patternSteps.value=patternMatch?.[3]??'16';const patternMode=modeOptions(false);patternMode.value=patternMatch?.[1]??'forward';patternTop.append(field('Steps',patternSteps),field('Mode',patternMode));
    let events=new Set<number>((patternMatch?.[2]??'1 5 9 13').trim().split(/\s+/).map(v=>Number(v.match(/^\d+/)?.[0])).filter(v=>Number.isInteger(v)&&v>0));let page=0;const pager=document.createElement('div');pager.className='object-builder-pattern-pager';const grid=document.createElement('div');grid.className='object-builder-pattern-grid';
    const renderPattern=()=>{const count=Math.max(1,Math.min(128,Math.floor(Number(patternSteps.value)||16)));patternSteps.value=String(count);events=new Set([...events].filter(s=>s<=count));if(!events.size)events.add(1);const pages=Math.ceil(count/32);page=Math.min(page,pages-1);pager.replaceChildren();const prev=document.createElement('button');prev.type='button';prev.className='object-builder-pattern-page-nav';prev.textContent='‹';prev.disabled=page===0;prev.addEventListener('click',()=>{page=Math.max(0,page-1);renderPattern();});pager.append(prev);for(let p=0;p<pages;p++){const b=document.createElement('button');b.type='button';b.className='object-builder-pattern-page';b.textContent=String(p+1);b.classList.toggle('active',p===page);b.addEventListener('click',()=>{page=p;renderPattern();});pager.append(b);}const next=document.createElement('button');next.type='button';next.className='object-builder-pattern-page-nav';next.textContent='›';next.disabled=page>=pages-1;next.addEventListener('click',()=>{page=Math.min(pages-1,page+1);renderPattern();});pager.append(next);grid.replaceChildren();const first=page*32+1,last=Math.min(count,first+31);for(let s=first;s<=last;s++){const b=document.createElement('button');b.type='button';b.className='object-builder-pattern-step';b.textContent=String(s);b.classList.toggle('active',events.has(s));b.addEventListener('click',()=>{if(events.has(s)&&events.size>1)events.delete(s);else events.add(s);renderPattern();});grid.append(b);}};
    patternSteps.addEventListener('input',()=>{page=0;renderPattern();});pattern.append(patternTop,pager,grid,hint('32 steps per page (16 + 16), up to 128. Click steps to toggle events.'));

    const reference=document.createElement('div');reference.className='object-builder-timing-mode-panel object-builder-reference-panel';const refSelect=document.createElement('select');const refInfo=document.createElement('div');refInfo.className='object-builder-reference-info';const refs=this.findTimingReferences();if(!refs.length)refSelect.append(new Option('No RHYTHM sources',''));else for(const ref of refs)refSelect.append(new Option(ref.name,ref.name));const refName=this.state.value.match(/^rhythm\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1]??'';if(refName&&refs.some(r=>r.name===refName))refSelect.value=refName;const updateRef=()=>{const item=refs.find(r=>r.name===refSelect.value);refInfo.replaceChildren();if(!item){refInfo.textContent='Declare SET name: RHYTHM ... to reuse a complete timing structure.';return;}const strong=document.createElement('strong');strong.textContent='SET · RHYTHM';const span=document.createElement('span');span.textContent=item.detail;refInfo.append(strong,span);};refSelect.addEventListener('change',updateRef);updateRef();reference.append(field('Rhythm',refSelect),refInfo);

    const chanceRow=document.createElement('div');chanceRow.className='object-builder-chance-row';const chance=document.createElement('input');chance.type='range';chance.min='0';chance.max='100';chance.step='1';chance.value=this.state.value.match(/\bchance\s+(\d+(?:\.\d+)?)/i)?.[1]??'100';const chanceOut=document.createElement('output');chanceOut.textContent=`${chance.value}%`;chance.addEventListener('input',()=>chanceOut.textContent=`${chance.value}%`);const chanceWrap=document.createElement('div');chanceWrap.className='object-builder-mini-slider';chanceWrap.append(chance,chanceOut);const looseLabel=document.createElement('label');looseLabel.className='object-builder-clock-extra-toggle';const loose=document.createElement('input');loose.type='checkbox';loose.checked=/(?:^|[,\s])loose(?:,|$)/i.test(this.state.value);looseLabel.append(loose,document.createTextNode(' Loose'));chanceRow.append(field('Chance',chanceWrap),looseLabel);

    const clockWrap=document.createElement('div');clockWrap.className='object-builder-inline-clock';const clockSource=document.createElement('select');clockSource.append(new Option('Master','master'));for(const name of this.findClockNames())clockSource.append(new Option(name,name));const extraLabel=document.createElement('label');extraLabel.className='object-builder-clock-extra-toggle';const extras=document.createElement('input');extras.type='checkbox';extraLabel.append(extras,document.createTextNode(' Derived / feel'));const clockHead=document.createElement('div');clockHead.className='object-builder-clock-head';clockHead.append(field('Clock',clockSource),extraLabel);const clockFields=document.createElement('div');clockFields.className='object-builder-inline-clock-fields';const rate=document.createElement('input');rate.type='text';rate.value='/2';rate.placeholder='/4 or *2';
    const mini=(label:string)=>{const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='1';input.value='0';const out=document.createElement('output');out.textContent='0';input.addEventListener('input',()=>out.textContent=input.value);const wrap=document.createElement('div');wrap.className='object-builder-mini-slider';wrap.append(input,out);return {input,out,field:field(label,wrap)};};const jitter=mini('Jitter'),drifter=mini('Drifter');clockFields.append(field('Derived rate',rate),jitter.field,drifter.field);clockWrap.append(clockHead,clockFields);
    const clockMatch=this.state.value.match(/\bon\s+clock\s+([^,]+)(.*)$/i);if(clockMatch){const head=clockMatch[1].trim();const derived=head.match(/^(?:(\w+)\s+)?([/*]\s*\d+(?:\.\d+)?)$/);if(derived){clockSource.value=derived[1]??'master';extras.checked=true;rate.value=derived[2].replace(/\s+/g,'');jitter.input.value=clockMatch[2].match(/\bjitter\s+(\d+(?:\.\d+)?)/i)?.[1]??'0';drifter.input.value=clockMatch[2].match(/\bdrifter\s+(\d+(?:\.\d+)?)/i)?.[1]??'0';}else if([...clockSource.options].some(o=>o.value===head))clockSource.value=head;}jitter.out.textContent=jitter.input.value;drifter.out.textContent=drifter.input.value;
    const syncClock=()=>{clockFields.hidden=!extras.checked;};extras.addEventListener('change',syncClock);syncClock();
    const clockModifiers=()=>{const source=clockSource.value;if(!extras.checked)return source==='master'?[]:[`clock ${source}`];const rv=/^[/*]\s*\d+(?:\.\d+)?$/.test(rate.value.trim())?rate.value.trim().replace(/\s+/g,''):'/1';const result=[`clock ${source==='master'?'':`${source} `}${rv}`];if(Number(jitter.input.value)>0)result.push(`jitter ${jitter.input.value}`);if(Number(drifter.input.value)>0)result.push(`drifter ${drifter.input.value}`);return result;};
    const localModifiers=()=>{const mods:string[]=[];if(Number(chance.value)<100)mods.push(`chance ${chance.value}`);if(loose.checked)mods.push('loose');return mods;};const onClause=(mods:string[])=>mods.length?` on ${mods.join(', ')}`:'';

    const panels=[every,euclid,pattern,reference];
    const sync=()=>{const isEnabled=this.options.showEnabledToggle===false?true:enabled.checked;fields.classList.toggle('disabled',!isEnabled);type.disabled=!isEnabled;every.hidden=type.value!=='every';euclid.hidden=type.value!=='euclidean';pattern.hidden=type.value!=='pattern';reference.hidden=type.value!=='reference';chanceRow.hidden=type.value==='pattern';clockWrap.hidden=type.value==='reference';const beatBased=type.value!=='every'||unit.value==='beat';clockWrap.classList.toggle('disabled',!beatBased);for(const panel of panels)for(const control of panel.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button'))control.disabled=!isEnabled;for(const control of chanceRow.querySelectorAll<HTMLInputElement>('input'))control.disabled=!isEnabled;for(const control of clockWrap.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))control.disabled=!isEnabled||!beatBased;renderEuclid();};
    enabled.addEventListener('change',sync);type.addEventListener('change',sync);unit.addEventListener('change',sync);fields.append(field('Type',type),every,euclid,pattern,reference,chanceRow,clockWrap);column.append(header,fields);sync();

    this.readState=()=>{const isEnabled=this.options.showEnabledToggle===false?true:enabled.checked;if(!isEnabled)return{enabled:false,kind:'none',value:'',readerMode:'forward',readerAmount:walkAmount.value||'1'};if(type.value==='every'){const mods=unit.value==='beat'?[...clockModifiers(),...localModifiers()]:localModifiers();return{enabled:true,kind:'every',value:`every ${amount.value||'1'} ${unit.value}${onClause(mods)}`,readerMode:everyMode.value as TimingReaderMode,readerAmount:walkAmount.value||'1'};}if(type.value==='euclidean'){const mods=rotate>0?[`rotate ${rotate}`]:[];mods.push(...clockModifiers(),...localModifiers());return{enabled:true,kind:'euclidean',value:`every euclidean ${pulses}/${steps.value||'16'}${onClause(mods)}`,readerMode:'forward',readerAmount:'1'};}if(type.value==='pattern'){const count=Math.max(1,Math.min(128,Math.floor(Number(patternSteps.value)||16)));const active=[...events].filter(s=>s<=count).sort((a,b)=>a-b);const mode=patternMode.value!=='forward'?`mode ${patternMode.value} `:'';const cm=clockModifiers();const clockText=cm.length?` on clock ${cm[0].replace(/^clock\s+/,'')}${cm.slice(1).length?`, ${cm.slice(1).join(', ')}`:''}`:' on clock /1';return{enabled:true,kind:'pattern',value:`${mode}pattern [${active.join(' ')}] steps ${count}${clockText}`,readerMode:'forward',readerAmount:'1'};}return{enabled:true,kind:'reference',value:refSelect.value?`rhythm ${refSelect.value}${localModifiers().length?` ${localModifiers().join(', ')}`:''}`:'',readerMode:'forward',readerAmount:'1'};};
    return column;
  }

  getState(): TimingEditorState { return this.readState ? this.readState() : { ...this.state }; }

  private findClockNames(): string[] { const out:string[]=[];for(const line of this.options.editor.value.split(/\r?\n/)){const m=line.match(/^\s*CLOCK\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);if(m&&!/^set$/i.test(m[1]))out.push(m[1]);}return[...new Set(out)]; }
  private findTimingReferences(): Array<{name:string;detail:string}> { const result:Array<{name:string;detail:string}>=[];for(const line of this.options.editor.value.split(/\r?\n/)){const m=line.match(/^\s*SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*RHYTHM\s+(.+)$/i);if(m)result.push({name:m[1],detail:m[2].trim()});}return result.filter((item,index)=>result.findIndex(other=>other.name===item.name)===index); }
}
