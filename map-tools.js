/* Shared Web Mercator coordinates for backgrounds, stops and resized views.
   No assignments are changed by this presentation-only module. */
function mapTools(){
  let cachedKeys=null,cachedStops=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=p=>p&&p.lat!==''&&p.lon!==''&&p.lat!=null&&p.lon!=null&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon)&&Math.abs(+p.lat)<85.051129&&Math.abs(+p.lon)<=180;
  function project(p,z){const s=256*2**z,sin=Math.sin(+p.lat*Math.PI/180);return{x:(+p.lon+180)/360*s,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*s};}
  function tiles(g,view={x:0,y:0,width:g.width,height:g.height}){
    const ox=g.center.x-g.width/2,oy=g.center.y-g.height/2,n=2**g.zoom,out=[];
    for(let y=Math.floor((oy+view.y)/256);y<=Math.floor((oy+view.y+view.height)/256);y++)for(let x=Math.floor((ox+view.x)/256);x<=Math.floor((ox+view.x+view.width)/256);x++){
      if(y<0||y>=n)continue;
      out.push(`<image class="osm-tile" href="https://tile.openstreetmap.org/${g.zoom}/${(x%n+n)%n}/${y}.png" x="${x*256-ox}" y="${y*256-oy}" width="256" height="256"/>`);
    }
    return '<g class="osm-tiles">'+out.join('')+'</g>';
  }
  const attrs=g=>' data-map-geometry="'+esc(JSON.stringify(g))+'"';
  function background(g,view={x:0,y:0,width:g.width,height:g.height}){
    // The OSM document keeps a fixed virtual pixel size inside the same SVG.
    // A small inset avoids fitBounds rounding down to a different integer zoom.
    const width=Math.ceil(view.width),height=Math.ceil(view.height),cx=g.center.x-g.width/2+view.x+width/2,cy=g.center.y-g.height/2+view.y+height/2,s=256*2**g.zoom;
    const geo=(x,y)=>({lon:x/s*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*y/s)))*180/Math.PI});
    const nw=geo(cx-width*.495,cy-height*.495),se=geo(cx+width*.495,cy+height*.495);
    const url='https://www.openstreetmap.org/export/embed.html?bbox='+encodeURIComponent([nw.lon,se.lat,se.lon,nw.lat].join(','))+'&amp;layer=mapnik';
    return `<foreignObject class="osm-fixed-background" x="${view.x}" y="${view.y}" width="${width}" height="${height}" pointer-events="none"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;pointer-events:none"><iframe inert="" tabindex="-1" aria-hidden="true" loading="lazy" referrerpolicy="origin" title="OpenStreetMap" src="${url}" style="display:block;position:static;width:${width}px;height:${height}px;border:0;pointer-events:none"></iframe></div></foreignObject>`;
  }
  function stops(source){
    const keys=[source.gtfsStops,source.parsed?.stops,source.parsed?.hastus,source.mapping,source.parsed?.times,source.parsed?.trips,source.parsed?.routes,source.parsed?.variants,source.timingPointIds,source.timingPointIds?.size];
    if(cachedKeys&&keys.every((k,i)=>k===cachedKeys[i]))return cachedStops;
    const rows=source.gtfsStops?.length?source.gtfsStops:source.parsed?.stops?.rows||source.gtfs?.stops?.rows||[],m=source.mapping||{},byId=new Map(),routes=new Map(),tp=new Set(source.timingPointIds||[]),known=Boolean(source.timingPointIds?.size||source.timingPointIds?.length||source.timingSourceStats||source.parsed?.times?.headers?.includes('timepoint')),clean=s=>String(s??'').trim().replace(/^:/,'');
    const routeNames=new Map((source.parsed?.routes?.rows||[]).map(r=>[r.route_id,r.route_short_name||r.route_long_name||r.route_id]));
    const trips=new Map((source.parsed?.trips?.rows||[]).map(t=>[t.trip_id,routeNames.get(t.route_id)||t.route_id]));
    for(const t of source.parsed?.times?.rows||[]){const id=clean(t.stop_id),route=trips.get(t.trip_id);if(!source.timingPointIds?.size&&!source.timingPointIds?.length&&String(t.timepoint)==='1')tp.add(id);if(!routes.has(id))routes.set(id,new Set());if(route)routes.get(id).add(route);}
    const variants=source.parsed?.variants,headers=variants?.headers||[],routeColumn=headers.find(h=>/^(route|ligne|line)([_\s-]?(id|code|no|number|identifier|1))?$/i.test(h)),stopColumn=headers.find(h=>/^(stop|arr[eê]t)([_\s-]?(id|code|no|number|identifier))?$/i.test(h));
    if(routeColumn&&stopColumn)for(const r of variants.rows){const id=clean(r[stopColumn]);if(!routes.has(id))routes.set(id,new Set());if(r[routeColumn])routes.get(id).add(String(r[routeColumn]));}
    for(const r of rows){if(String(r.location_type||'0')!=='0')continue;const id=clean(r.stop_id),p={id,description:r.stop_name||r.stop_desc||id,lat:r.stop_lat,lon:r.stop_lon,timing:known?tp.has(id):null,routes:[...(routes.get(id)||[])]};if(id&&valid(p))byId.set(id,p);}
    for(const r of source.parsed?.hastus?.rows||[]){const id=clean(r[m.stopId]),p={id,description:r[m.stopDesc]||id,lat:r[m.lat],lon:r[m.lon],timing:known?tp.has(id):null,routes:[...(routes.get(id)||[])]};if(id&&valid(p)&&!byId.has(id))byId.set(id,p);}
    cachedKeys=keys;cachedStops=[...byId.values()];return cachedStops;
  }
  function mount(getStops,language=()=>document.documentElement.lang){
    if(document.documentElement.__mapContextMounted)return;document.documentElement.__mapContextMounted=true;
    document.querySelectorAll('style[data-map-context-style],.map-context-controls,.map-context-layer,.map-context-popup').forEach(n=>n.remove());
    const style=document.createElement('style');style.dataset.mapContextStyle='';style.textContent=`.map-context-controls{position:relative;z-index:4;display:flex;align-items:center;gap:7px;padding:5px 9px;background:#f4f6f0;color:#273b30;font:12px Arial}.map-context-controls input{min-width:0;width:18px;height:18px}.map-context-layer{pointer-events:auto}.map-context-layer [data-stop-info]{cursor:pointer;pointer-events:all}.map-context-layer text{font:10px Arial;fill:#20372d;paint-order:stroke;stroke:#fff;stroke-width:3px}.map-context-popup{position:fixed;z-index:2147483647;max-width:min(360px,92vw);max-height:75vh;overflow:auto;padding:16px;border:1px solid #839279;border-radius:12px 0;background:#fff;color:#22362b;box-shadow:0 5px 25px #0004;font:14px/1.5 Arial}.map-context-popup button{float:right;margin-left:12px}.map-context-popup p{margin:6px 0}.map-context-controls[data-floating]{position:absolute;top:52px;left:8px}@media print{.map-context-controls,.map-context-popup{display:none!important}}`;
    document.head.append(style);
    const ns='http://www.w3.org/2000/svg';let seen=new WeakMap(),enabled=false,popup=null,pending=0;
    const tr=(fr,en)=>language()==='en'?en:fr;
    function geometry(svg){try{if(svg.dataset.mapGeometry)return JSON.parse(svg.dataset.mapGeometry);}catch{}const tile=[...svg.querySelectorAll('image')].find(n=>/tile\.openstreetmap\.org/.test(n.getAttribute('href')||''));if(!tile)return null;const match=tile.getAttribute('href').match(/\/(\d+)\/(\d+)\/(\d+)\.png/),vb=svg.viewBox.baseVal;if(!match)return null;return{zoom:+match[1],width:vb.width,height:vb.height,center:{x:+match[2]*256-parseFloat(tile.getAttribute('x'))+vb.width/2,y:+match[3]*256-parseFloat(tile.getAttribute('y'))+vb.height/2}};}
    function show(p,target){
      popup?.remove();popup=document.createElement('div');popup.className='map-context-popup';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Stop '+p.id);popup.tabIndex=-1;
      const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label',tr('Fermer','Close'));close.onclick=()=>{popup.remove();target.focus();};popup.append(close);
      for(const value of ['Stop ID: '+p.id,p.description,'Latitude: '+Number(p.lat).toFixed(6)+' · Longitude: '+Number(p.lon).toFixed(6),tr('Routes : ','Routes: ')+(p.routes?.join(', ')||tr('Non renseignées','Not available')),tr('Timing point : ','Timing point: ')+(p.timing==null?tr('Inconnu','Unknown'):p.timing?tr('Oui','Yes'):tr('Non','No'))]){const line=document.createElement('p');line.textContent=value;popup.append(line);}
      (target.closest('dialog[open]')||document.body).append(popup);const b=target.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(innerWidth-popup.offsetWidth-8,b.left))+'px';popup.style.top=Math.max(8,Math.min(innerHeight-popup.offsetHeight-8,b.bottom+8))+'px';popup.focus();
    }
    function draw(svg,g,stops){
      svg.querySelector('.map-context-layer')?.remove();const layer=document.createElementNS(ns,'g');layer.classList.add('map-context-layer');
      const vb=svg.viewBox.baseVal,own=[...svg.querySelectorAll('circle:not(.place-radius):not(.candidate-zone)')].map(c=>({x:+c.getAttribute('cx'),y:+c.getAttribute('cy')}));
      for(const p of stops){const w=project(p,g.zoom),x=w.x-g.center.x+g.width/2,y=w.y-g.center.y+g.height/2;if(x<vb.x||y<vb.y||x>vb.x+vb.width||y>vb.y+vb.height)continue;
        const current=own.some(q=>Math.hypot(q.x-x,q.y-y)<2);if(!current&&!enabled)continue;
        const node=document.createElementNS(ns,'g');node.dataset.stopInfo=p.id;node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label','Stop '+p.id+' · '+p.description);const dot=document.createElementNS(ns,'circle');for(const [k,v] of Object.entries({cx:x,cy:y,r:current?10:4,fill:current?'transparent':p.timing===true?'#176a8a':p.timing===false?'#b56b20':'#66706a',stroke:current?'none':'white'}))dot.setAttribute(k,v);node.append(dot);
        if(!current){const text=document.createElementNS(ns,'text');text.setAttribute('x',x+6);text.setAttribute('y',y-6);text.textContent=p.id;node.append(text);}
        node.addEventListener('click',e=>{e.stopPropagation();show(p,node);});node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();show(p,node);}});layer.append(node);
      }svg.removeAttribute('aria-hidden');(svg.querySelector('.map-movable')||svg).append(layer);
    }
    function scan(){pending=0;observer.disconnect();const sourceStops=getStops(),stops=sourceStops.filter(valid),lang=language();document.querySelectorAll('.map-context-controls').forEach(bar=>{bar.lastChild.textContent=tr('Stops aux alentours','Surrounding stops');});for(const svg of document.querySelectorAll('svg')){if(svg.closest('.map-context-popup')||svg.classList.contains('map-only-labels'))continue;const g=geometry(svg);if(!g)continue;if(!svg.dataset.mapGeometry)svg.dataset.mapGeometry=JSON.stringify(g);const old=seen.get(svg),stamp=svg.getAttribute('viewBox');if(old?.stamp===stamp&&old.enabled===enabled&&old.sourceStops===sourceStops&&old.lang===lang&&svg.querySelector('.map-context-layer'))continue;seen.set(svg,{stamp,enabled,sourceStops,lang});
        const host=svg.closest('.map-only-canvas,.map-stage,.browser-map-stage,.network-map,.place-map,.map-card-stage,.combined-map-stage')||svg.parentElement;
        if(!host.querySelector(':scope > .map-context-controls')){const bar=document.createElement('label');bar.className='map-context-controls';bar.dataset.noTranslate='';if(host.matches('.map-only-canvas,.map-stage'))bar.dataset.floating='';const check=document.createElement('input');check.type='checkbox';check.checked=enabled;check.setAttribute('role','switch');bar.append(check,document.createTextNode(tr('Stops aux alentours','Surrounding stops')));bar.addEventListener('click',e=>e.stopPropagation());check.onchange=()=>{enabled=check.checked;document.querySelectorAll('.map-context-controls input').forEach(n=>n.checked=enabled);scan();};host.append(bar);}
        draw(svg,g,stops);
      }observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['viewBox']});}
    const observer=new MutationObserver(()=>{if(!pending)pending=requestAnimationFrame(scan);});scan();
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&popup?.isConnected){e.stopPropagation();popup.remove();}},true);
    return {refresh(){seen=new WeakMap();scan();}};
  }
  return {valid,project,tiles,background,attrs,stops,mount};
}
