
(()=>{const root=document.getElementById('geobis-explorer'),$=id=>root.querySelector('#gx-'+id),D={stops:[],places:[],routes:{},shapes:[],links:[],tiles:[],deadheadLoaded:false},S=new Map(D.stops.map(s=>[s.id,s])),P=new Map(D.places.map(p=>[p.id,p]));let kind='places',selected='',selkind='places',center=[-117.379108,33.192579],scale=23000,route=null;const svg=$('map'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let projection;const dh=p=>!D.deadheadLoaded?'Matrice non chargée':p?(p.dh[0]+p.dh[1]?'Direct : '+p.dh[0]+' départs / '+p.dh[1]+' arrivées':p.ref&&P.get(p.ref)?.dh.some(n=>n)?'Référence liée · aucun lien direct':'Aucun lien direct'):'Aucune place associée';
function save(){}
function choose(k,id){selkind=k;selected=id;if(k==='routes'){route=id;const pts=D.shapes.filter(s=>s.route===id).flatMap(s=>s.points);fit(pts);}else{route=null;const o=(k==='stops'?S:P).get(id);if(o?.lon!=null){center=[o.lon,o.lat];scale=k==='stops'?3000000:1500000;}}render();save();}
function fit(pts){if(!pts.length)return;const w=svg.clientWidth||600,h=svg.clientHeight||550,p=d3.geoMercator().fitExtent([[35,35],[Math.max(80,w-35),Math.max(80,h-35)]],{type:'MultiPoint',coordinates:pts});center=p.invert([w/2,h/2]);scale=Math.min(3000000,Math.max(5000,p.scale()));}

function list(){const q=$('search').value.toLowerCase();let items=kind==='routes'?Object.entries(D.routes).map(([id,name])=>({id,name})):D[kind];items=items.filter(o=>(o.id+' '+o.name+' '+(o.ref||'')).toLowerCase().includes(q));$('count').textContent=items.length+' '+({places:'places',stops:'stops',routes:'routes'}[kind]);$('list').innerHTML=items.slice(0,100).map(o=>`<button class="row" data-id="${esc(o.id)}" aria-pressed="${selkind===kind&&selected===o.id}"><strong>${esc(o.id)} ${o.ref?'→ '+esc(o.ref):''}</strong><small>${esc(o.name)}</small><small class="sub">${kind==='places'?D.stops.filter(s=>s.place===o.id).length+' stops · '+dh(o):kind==='stops'?(o.tp?'TP · ':'')+(o.place?'Place '+esc(o.place):'Sans place'):'Afficher les variantes'}</small></button>`).join('')+(items.length>100?'<p class="sub">100 premiers résultats · affinez la recherche</p>':'');$('list').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>choose(kind,b.dataset.id));}
function detail(){const o=(selkind==='stops'?S:P).get(selected);if(selkind==='routes'){$('detail').innerHTML=`<span class="tag">Route ${esc(selected)}</span><h3>${esc(D.routes[selected])}</h3><h4>Variantes du shapefile</h4>${[...new Set(D.shapes.filter(s=>s.route===selected).map(s=>s.variant))].map(v=>`<span class="tag">${esc(v)}</span>`).join('')}<h4>Stops desservis</h4><div class="detail-stops">${D.stops.filter(s=>s.routes.includes(selected)).map(s=>stopButton(s)).join('')}</div>`;bindDetail();return;}if(!o){$('detail').innerHTML='<h3>Explorer le réseau</h3><p class="sub">Chargez vos sources puis sélectionnez un stop, une place ou une route.</p>';return;}const p=selkind==='stops'?P.get(o.place):o,ss=selkind==='places'?D.stops.filter(s=>s.place===o.id):[o];$('detail').innerHTML=`<span class="tag ${p?.children.length?'ref':''}">${selkind==='stops'?'Stop':'Place'} ${esc(o.id)}</span><h3>${esc(o.name)}</h3>${selkind==='places'?'<div class="sub">'+(o.estimated?'Centre estimé':'Coordonnées source')+' · emprise indicative</div>':''}<h4>Rattachements</h4>${selkind==='stops'?`<div class="fact">Place <span>${p?`<button data-place="${esc(p.id)}">${esc(p.id)}</button>`:'Non affecté'}</span></div>`:''}<div class="fact">Référence <span>${p?.ref?`<button class="ref" data-place="${esc(p.ref)}">${esc(p.ref)}</button>`:'Aucune'}</span></div>${p?.children.length?'<div class="sub">Places rattachées</div>'+p.children.map(id=>`<button class="tag ref" data-place="${esc(id)}">${esc(id)}</button>`).join(''):''}<h4>Matrice deadhead</h4><div>${esc(dh(p))}</div><div class="sub">Liens de la place, pas du Stop ID.</div><h4>${selkind==='places'?'Stops associés · '+ss.length:'Stop sélectionné'}</h4><div class="detail-stops">${ss.map(s=>stopButton(s)).join('')}</div><h4>Localisation</h4><div class="sub">${o.lat==null?'Coordonnées indisponibles':o.lat.toFixed(6)+' / '+o.lon.toFixed(6)}</div>`;bindDetail();}
function stopButton(s){return `<button class="row" data-stop="${esc(s.id)}"><strong>${esc(s.id)} ${s.tp?'· TP':''}</strong><small>${esc(s.name)}</small><small class="sub">Routes ${esc(s.routes.join(', '))}</small></button>`;}
function bindDetail(){$('detail').querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>choose('stops',b.dataset.stop));$('detail').querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>choose('places',b.dataset.place));}
function map(){const w=svg.clientWidth||500,h=svg.clientHeight||550;projection=d3.geoMercator().center(center).scale(scale).translate([w/2,h/2]);const xy=(lon,lat)=>projection([lon,lat]);let html='';const z=Math.max(2,Math.min(18,Math.round(Math.log2(scale*2*Math.PI/256)))),cx=Math.floor((center[0]+180)/360*2**z),cy=Math.floor((1-Math.asinh(Math.tan(center[1]*Math.PI/180))/Math.PI)/2*2**z),tiles=[];if(D.stops.length)for(let x=cx-3;x<=cx+3;x++)for(let y=cy-3;y<=cy+3;y++)tiles.push({x,y,z,src:`https://tile.openstreetmap.org/${z}/${x}/${y}.png`});for(const t of tiles){const lon=x=>x/2**t.z*360-180,lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/2**t.z)))*180/Math.PI,a=xy(lon(t.x),lat(t.y)),b=xy(lon(t.x+1),lat(t.y+1));if(b[0]<0||a[0]>w||b[1]<0||a[1]>h)continue;html+=`<image href="${t.src}" x="${a[0]}" y="${a[1]}" width="${b[0]-a[0]+.5}" height="${b[1]-a[1]+.5}"/>`;}
const inside=(x,y)=>x>=-20&&x<=w+20&&y>=-20&&y<=h+20;
if($('routes').checked)for(const s of D.shapes){if(route&&s.route!==route)continue;html+=`<polyline points="${s.points.map(p=>projection(p).join(',')).join(' ')}" fill="none" stroke="${route?'#008f9b':'#4b9ca8'}" stroke-width="${route?3:1.3}" opacity="${route?.9:.55}"/>`;}
const place=selkind==='places'?P.get(selected):P.get(S.get(selected)?.place),attached=place?D.stops.filter(s=>s.place===place.id&&s.lat!=null&&s.lon!=null):[];
if(attached.length){const pts=attached.map(s=>xy(s.lon,s.lat)),hull=d3.polygonHull(pts);if(hull)html+=`<polygon points="${hull.map(p=>p.join(',')).join(' ')}" fill="#789b3c33" stroke="#647f36" stroke-width="3" stroke-linejoin="round"/>`;else{const [x,y]=xy(place.lon,place.lat);const rad=Math.max(24,...pts.map(p=>Math.hypot(p[0]-x,p[1]-y)+15));html+=`<circle cx="${x}" cy="${y}" r="${rad}" fill="#789b3c22" stroke="#647f36" stroke-dasharray="5 4"/>`;}}
if($('ref').checked&&place){const pairs=place.ref?[[place,P.get(place.ref)]]:place.children.map(id=>[P.get(id),place]);for(const refs of pairs)if(refs?.[0]?.lon!=null&&refs?.[1]?.lon!=null){const a=xy(refs[0].lon,refs[0].lat),b=xy(refs[1].lon,refs[1].lat);html+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#8657a6" stroke-width="2" stroke-dasharray="5 4"/>`;}}
if($('stops').checked)for(const s of D.stops){if(s.lon==null||s.lat==null||route&&!s.routes.includes(route))continue;const [x,y]=xy(s.lon,s.lat);if(!inside(x,y))continue;const active=s.id===selected||s.place===place?.id;html+=`<circle class="marker" data-stop="${esc(s.id)}" cx="${x}" cy="${y}" r="${active?6:3.3}" fill="${s.tp?'#16778b':'#737f83'}" stroke="white" stroke-width="${active?2:1}"/>`;if($('labels').checked||active)html+=`<text x="${x+8}" y="${y-7}">${esc(s.id)}</text>`;}
if($('places').checked)for(const p of D.places){if(p.lon==null||p.lat==null)continue;const [x,y]=xy(p.lon,p.lat);if(!inside(x,y))continue;const active=p.id===place?.id;if(!active&&scale>180000&&attached.some(s=>Math.hypot(...xy(s.lon,s.lat).map((v,i)=>v-[x,y][i]))<12))continue;html+=`<rect class="marker" data-place="${esc(p.id)}" x="${x-5}" y="${y-5}" width="10" height="10" rx="2" fill="${p.children.length?'#8754a5':'#648133'}" stroke="white" stroke-width="2"/>`;if(active||scale>1400000)html+=`<text x="${x+10}" y="${y+18}">${esc(p.id)}${p.ref?' → '+esc(p.ref):''}</text>`;}
svg.innerHTML=html;svg.querySelectorAll('[data-stop]').forEach(e=>{const s=S.get(e.dataset.stop);e.onpointerenter=()=>{$('tip').hidden=false;$('tip').innerHTML=`<b>${esc(s.id)} · ${esc(s.name)}</b><br>Place : ${esc(s.place||'aucune')} · Référence : ${esc(P.get(s.place)?.ref||'aucune')}<br>${esc(dh(P.get(s.place)))}<br>${s.tp?'Timing point':s.routes.length?'Non TP':'TP non renseigné dans les variantes'} · Routes ${esc(s.routes.join(', '))}<br>${s.lat}, ${s.lon}`;};e.onpointerleave=()=>{$('tip').hidden=true};e.onclick=()=>choose('stops',s.id);});svg.querySelectorAll('[data-place]').forEach(e=>e.onclick=()=>choose('places',e.dataset.place));}
function render(){list();detail();map();}root.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;$('search').value='';root.querySelectorAll('[data-kind]').forEach(x=>x.setAttribute('aria-pressed',x===b));list();save();});$('search').oninput=list;['stops','places','routes','labels','ref'].forEach(id=>$(id).onchange=map);$('more').onclick=()=>{scale=Math.min(10000000,scale*1.6);map()};$('less').onclick=()=>{scale=Math.max(5000,scale/1.6);map()};$('fit').onclick=()=>{fit(D.stops.filter(s=>s.lon!==null).map(s=>[s.lon,s.lat]));map()};$('expand').onclick=()=>{root.querySelector('.shell').classList.toggle('focus-map');requestAnimationFrame(map)};$('sources').onclick=()=>{$('files').hidden=!$('files').hidden};$('total').textContent=D.stops.length+' stops · '+D.places.length+' places · '+Object.keys(D.routes).length+' routes';new ResizeObserver(map).observe(svg);render();
const raw={stops:[],places:[],variants:[],deadhead:'',shapes:[]};
const homePage=location.hostname.endsWith('github.io')?'app.html':'index.html';$('back').href=homePage;
try{document.documentElement.style.colorScheme=localStorage.getItem('hastus-ui-theme')==='clean-dark'?'dark':'light';}catch{}
for(const key of Object.keys(raw))$('file-'+key).onchange=async e=>{
 const file=e.target.files[0];if(!file)return;$('errors').textContent='Chargement…';
 try{let value;
 if(key==='deadhead')value=await file.text();
 else if(key==='shapes'){const entries=await unzipEntries(file),get=ext=>entries.find(e=>e.name.toLowerCase().endsWith(ext));if(!get('.shp')||!get('.dbf')||!get('.prj'))throw Error('ZIP : fichiers .shp, .dbf et .prj requis.');value=NetworkExplorerData.shapes(get('.shp').buffer,get('.dbf').buffer,get('.prj').text);}
 else{const table=await parseXlsxFirstSheet(file),required=key==='stops'?['Stop','Description','Place']:key==='places'?['Place','Description','Refer.']:['Route','Stop','TP'];if(required.some(h=>!table.headers.includes(h)))throw Error('Colonnes requises : '+required.join(', '));value=table.rows;}
 raw[key]=value;Object.assign(D,NetworkExplorerData.build(raw.stops,raw.places,raw.variants,raw.deadhead));D.shapes=raw.shapes;
 S.clear();P.clear();for(const s of D.stops)S.set(s.id,s);for(const p of D.places)P.set(p.id,p);
 if(key==='stops'){fit(D.stops.filter(s=>s.lon!==null).map(s=>[s.lon,s.lat]));selected='';}
 const missing=D.stops.filter(s=>s.lat===null).length;
 $('errors').textContent=D.stops.length+' stops · '+missing+' sans coordonnées (liste uniquement) · '+D.places.length+' places · '+D.shapes.length+' tracés. Données en mémoire uniquement.';
 $('total').textContent=D.stops.length+' stops · '+D.places.length+' places · '+Object.keys(D.routes).length+' routes';render();
 }catch(error){$('errors').textContent='Import non appliqué : '+error.message;e.target.value='';}
};
let drag=null;svg.onpointerdown=e=>{if(e.target.classList.contains('marker'))return;drag=[e.clientX,e.clientY,center.slice()];svg.setPointerCapture(e.pointerId)};svg.onpointermove=e=>{if(!drag)return;const p=d3.geoMercator().center(drag[2]).scale(scale).translate([svg.clientWidth/2,svg.clientHeight/2]);center=p.invert([svg.clientWidth/2-(e.clientX-drag[0]),svg.clientHeight/2-(e.clientY-drag[1])]);map()};svg.onpointerup=()=>{drag=null};
async function unzipEntries(file){
  const buffer=await file.arrayBuffer(),view=new DataView(buffer);let eocd=-1;
  for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw new Error("Archive ZIP invalide ou non prise en charge.");
  const count=view.getUint16(eocd+10,true),centralOffset=view.getUint32(eocd+16,true),decoder=new TextDecoder(),entries=[];let pos=centralOffset;
  for(let n=0;n<count;n++){
    if(view.getUint32(pos,true)!==0x02014b50)throw new Error("Répertoire ZIP invalide.");
    const method=view.getUint16(pos+10,true),compressedSize=view.getUint32(pos+20,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),localOffset=view.getUint32(pos+42,true);
    const name=decoder.decode(new Uint8Array(buffer,pos+46,nameLen));pos+=46+nameLen+extraLen+commentLen;if(name.endsWith("/"))continue;
    const localNameLen=view.getUint16(localOffset+26,true),localExtraLen=view.getUint16(localOffset+28,true),start=localOffset+30+localNameLen+localExtraLen,compressed=new Uint8Array(buffer,start,compressedSize);let data;
    if(method===0)data=compressed;else if(method===8&&typeof DecompressionStream!=="undefined"){const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));data=new Uint8Array(await new Response(stream).arrayBuffer());}else throw new Error(`Compression ZIP non prise en charge pour ${name}.`);
    entries.push({name,text:decoder.decode(data),buffer:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});
  }
  return entries;
}

function xlsxColumnIndex(reference){
  const letters=(String(reference||"").match(/^[A-Z]+/i)||[""])[0].toUpperCase();let index=0;
  for(const letter of letters)index=index*26+letter.charCodeAt(0)-64;
  return Math.max(0,index-1);
}
function resolveZipPath(base,target){
  if(target.startsWith("/"))return target.slice(1);
  const parts=`${base}/${target}`.split("/");const resolved=[];
  for(const part of parts){if(!part||part===".")continue;if(part==="..")resolved.pop();else resolved.push(part);}
  return resolved.join("/");
}
async function parseXlsxFirstSheet(file){
  const entries=await unzipEntries(file),byName=new Map(entries.map(entry=>[entry.name.replaceAll("\\","/"),entry.text])),parseXml=(name)=>{
    const text=byName.get(name);if(!text)throw new Error(`Élément Excel manquant : ${name}.`);
    const xml=new DOMParser().parseFromString(text,"application/xml");if(xml.getElementsByTagName("parsererror").length)throw new Error(`XML Excel invalide : ${name}.`);return xml;
  };
  const workbook=parseXml("xl/workbook.xml"),sheet=workbook.getElementsByTagName("sheet")[0];if(!sheet)throw new Error("Le classeur Excel ne contient aucune feuille.");
  const relationshipId=sheet.getAttribute("r:id")||sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id"),relationships=parseXml("xl/_rels/workbook.xml.rels"),relationship=[...relationships.getElementsByTagName("Relationship")].find(item=>item.getAttribute("Id")===relationshipId);
  if(!relationship)throw new Error("La première feuille Excel est introuvable.");
  const sheetPath=resolveZipPath("xl",relationship.getAttribute("Target")),worksheet=parseXml(sheetPath),sharedText=byName.get("xl/sharedStrings.xml"),sharedStrings=sharedText?[...parseXml("xl/sharedStrings.xml").getElementsByTagName("si")].map(item=>[...item.getElementsByTagName("t")].map(text=>text.textContent||"").join("")):[];
  const matrix=[];
  for(const row of worksheet.getElementsByTagName("row")){
    const values=[];
    for(const cell of row.getElementsByTagName("c")){
      const type=cell.getAttribute("t"),valueNode=cell.getElementsByTagName("v")[0],inlineNode=cell.getElementsByTagName("is")[0],raw=type==="inlineStr"?(inlineNode?.textContent||""):(valueNode?.textContent||""),value=type==="s"?(sharedStrings[Number(raw)]??""):type==="b"?(raw==="1"?"TRUE":"FALSE"):raw;
      values[xlsxColumnIndex(cell.getAttribute("r"))]=value;
    }
    matrix.push(values.map(value=>String(value??"")));
  }
  const headers=(matrix.shift()||[]).map(header=>header.trim());if(!headers.some(Boolean))throw new Error("La première feuille Excel ne contient pas d’en-têtes.");
  return {headers,rows:matrix.filter(row=>row.some(value=>value!=="")).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??""])))};
}


})();
