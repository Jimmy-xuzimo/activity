type EventRecord = { ts:string; title:string; repoName:string; url:string|null; type:string };
const root = document.querySelector<HTMLElement>('[data-timeline]');
if (root) {
 const viewport=root.querySelector<HTMLElement>('.time-viewport')!;
 const svg=root.querySelector<SVGElement>('.time-svg')!;
 const points=root.querySelector<HTMLElement>('.time-points')!;
 const range=root.querySelector<HTMLElement>('.time-range')!;
 const help=root.querySelector<HTMLElement>('.time-help')!;
 const selection=root.querySelector<HTMLElement>('.time-selection')!;
 const list=root.querySelector<HTMLElement>('.time-events')!;
 const data=JSON.parse(document.getElementById('time-data')!.textContent!) as EventRecord[];
 const day=86400000;
 const buckets=new Map<string,EventRecord[]>();
 for(const event of data) { const key=new Date(Date.parse(event.ts)+8*3600000).toISOString().slice(0,10); const rows=buckets.get(key)||[];rows.push(event);buckets.set(key,rows); }
 const days=[...buckets].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,rows])=>({date,rows,time:Date.parse(date+'T00:00:00+08:00')}));
 const min=(days[0]?.time||Date.now())-day,max=(days.at(-1)?.time||Date.now())+day;
 const full=Math.max(day*2,max-min);let span=full,start=min,selected=days.at(-1)?.date||'',frame=0;
 const zh=()=>document.documentElement.lang.startsWith('zh');
 const dateLabel=(t:number)=>new Date(t+8*3600000).toISOString().slice(0,10);
 const clamp=()=>{span=Math.min(full,Math.max(day*3,span));start=Math.min(max-span,Math.max(min,start));};
 function details() {
  const entry=days.find(d=>d.date===selected);
  selection.textContent=entry?`${entry.date} · ${entry.rows.length} ${zh()?'条活动':'activities'}`:'';
  list.replaceChildren();
  for(const item of entry?.rows||[]) {const row=document.createElement('div');row.className='time-event';const time=document.createElement('time');time.textContent=new Date(Date.parse(item.ts)+8*3600000).toISOString().slice(11,16);const content=document.createElement(item.url?'a':'span');content.textContent=item.title;if(content instanceof HTMLAnchorElement && item.url && /^https:\/\/github\.com\//.test(item.url)){content.href=item.url;content.target='_blank';content.rel='noopener';}const repo=document.createElement('small');repo.textContent=item.repoName==='私有项目'?(zh()?'私有项目':'Private project'):item.repoName;row.append(time,content,repo);list.append(row);}
 }
 function render() {
  frame=0;clamp();const width=viewport.clientWidth,pad=24,usable=Math.max(1,width-pad*2);
  range.textContent=`${dateLabel(start)} — ${dateLabel(start+span)}`;
  help.textContent=zh()?'滚轮缩放 · 左右拖动 · 点击圆点查看当天活动 · 方向键平移':'Scroll to zoom · drag to pan · select a dot for activity · arrow keys to pan';
  const ns='http://www.w3.org/2000/svg';svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${width} 220`);
  const line=document.createElementNS(ns,'line');line.setAttribute('x1',String(pad));line.setAttribute('x2',String(width-pad));line.setAttribute('y1','150');line.setAttribute('y2','150');line.setAttribute('class','time-axis');svg.append(line);
  const step=span>180*day?30*day:span>45*day?7*day:span>12*day?2*day:day;
  for(let t=Math.ceil(start/step)*step;t<=start+span;t+=step){let x=pad+(t-start)/span*usable;const tick=document.createElementNS(ns,'text');tick.setAttribute('x',String(x));tick.setAttribute('y','192');tick.setAttribute('text-anchor','middle');tick.textContent=dateLabel(t).slice(span>180*day?0:5);svg.append(tick);}
  points.replaceChildren();
  // Bucket nearby days into one marker when zoomed out to prevent overlap.
  const groups=new Map<number,typeof days>();
  for(const entry of days){if(entry.time<start||entry.time>start+span)continue;const x=pad+(entry.time-start)/span*usable;const key=Math.floor(x/32);const group=groups.get(key)||[];group.push(entry);groups.set(key,group);}
  for(const group of groups.values()) {const entry=group[0],count=group.reduce((s,d)=>s+d.rows.length,0);const x=pad+(entry.time-start)/span*usable;const button=document.createElement('button');button.type='button';button.className='time-point';button.style.left=`${x}px`;button.style.setProperty('--stem',`${Math.min(96,24+Math.sqrt(count)*9)}px`);button.classList.toggle('is-selected',group.some(d=>d.date===selected));button.setAttribute('aria-label',`${entry.date}${group.length>1?' – '+group.at(-1)!.date:''}: ${count} ${zh()?'条活动':'activities'}`);button.title=button.getAttribute('aria-label')!;button.textContent=String(count);button.addEventListener('click',()=>{if(group.length>1){span=Math.max(day*3,group.at(-1)!.time-entry.time+day*2);start=entry.time-day;}else{selected=entry.date;details();}schedule();});points.append(button);}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(render);}
 function zoom(factor:number,anchor=.5){const t=start+span*anchor;span*=factor;start=t-span*anchor;clamp();schedule();}
 viewport.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-120,Math.min(120,e.deltaY))*.004),(e.clientX-viewport.getBoundingClientRect().left)/viewport.clientWidth);},{passive:false});
 let drag:{x:number;start:number;id:number}|null=null;
 viewport.addEventListener('pointerdown',e=>{if((e.target as Element).closest('button'))return;drag={x:e.clientX,start,id:e.pointerId};viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-dragging');});
 viewport.addEventListener('pointermove',e=>{if(!drag)return;start=drag.start-(e.clientX-drag.x)/Math.max(1,viewport.clientWidth-48)*span;clamp();schedule();});
 const end=()=>{drag=null;viewport.classList.remove('is-dragging');};viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
 viewport.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();start+=(e.key==='ArrowRight'?1:-1)*span*.15;schedule();}if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.65);}if(e.key==='-'){e.preventDefault();zoom(1.5);}});
 root.querySelector('[data-time="in"]')!.addEventListener('click',()=>zoom(.65));root.querySelector('[data-time="out"]')!.addEventListener('click',()=>zoom(1.5));root.querySelector('[data-time="reset"]')!.addEventListener('click',()=>{start=min;span=full;schedule();});
 new ResizeObserver(schedule).observe(viewport);new MutationObserver(()=>{schedule();details();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});details();render();
}
