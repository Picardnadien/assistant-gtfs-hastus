/* Read-only prototype: relationships are exact, case-sensitive HASTUS codes. */
(function(root){
  const str=v=>String(v??'').trim();
  const number=v=>str(v)===''?null:Number(str(v).replace(',','.'));
  const valid=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
  function build(stops,places=[],variants=[],deadhead=''){
    const routes={},use=new Map(),tp=new Set(),counts=new Map();
    const count=id=>{if(!counts.has(id))counts.set(id,[new Set(),new Set()]);return counts.get(id)};
    for(const r of variants){const id=str(r.Stop),route=str(r.Route);if(!id||!route)continue;if(!use.has(id))use.set(id,new Set());use.get(id).add(route);routes[route]=str(r.Description);if(/^(true|1|yes|oui)$/i.test(str(r.TP)))tp.add(id);}
    const links=[];for(const line of deadhead.split(/\r?\n/)){const c=line.split(';').map(str);if(c[0]!=='linkdt'||!c[2]||!c[3])continue;count(c[2])[0].add(c[3]);count(c[3])[1].add(c[2]);links.push([c[2],c[3]]);}
    const ss=stops.filter(r=>str(r.Stop)).map(r=>{const lat=number(r['Loca latitude']??r.Latitude),lon=number(r['Loca longitude']??r.Longitude);return {id:str(r.Stop),name:str(r.Description),place:str(r.Place),lat:valid(lat,lon)?lat:null,lon:valid(lat,lon)?lon:null,routes:[...(use.get(str(r.Stop))||[])],tp:tp.has(str(r.Stop))};});
    const by=new Map();for(const s of ss){if(!by.has(s.place))by.set(s.place,[]);by.get(s.place).push(s)}
    const pp=new Map();for(const r of places)if(str(r.Place))pp.set(str(r.Place),r);
    for(const s of ss)if(s.place&&!pp.has(s.place))pp.set(s.place,{Place:s.place});
    for(const r of [...pp.values()])if(str(r['Refer.'])&&!pp.has(str(r['Refer.'])))pp.set(str(r['Refer.']),{Place:str(r['Refer.'])});
    const ps=[...pp.values()].map(r=>{const id=str(r.Place),pts=(by.get(id)||[]).filter(s=>s.lat!==null),la=number(r['Loca latitude']??r.Latitude),lo=number(r['Loca longitude']??r.Longitude),known=valid(la,lo);return {id,name:str(r.Description),ref:str(r['Refer.']),children:[...pp.values()].filter(x=>str(x['Refer.'])===id).map(x=>str(x.Place)),lat:known?la:pts.length?pts.reduce((n,s)=>n+s.lat,0)/pts.length:null,lon:known?lo:pts.length?pts.reduce((n,s)=>n+s.lon,0)/pts.length:null,estimated:!known,dh:count(id).map(s=>s.size)};});
    return {stops:ss,places:ps,routes,links,shapes:[],tiles:[],deadheadLoaded:!!deadhead};
  }
  function shapes(shp,dbf,prj){
    if(!/(WGS[_ ]?1984|WGS[_ ]?84)/i.test(prj)||/PROJCS/i.test(prj))throw new Error('Shapefile : coordonnées WGS84 longitude/latitude requises.');
    const d=new DataView(dbf),decode=new TextDecoder('windows-1252'),rows=d.getUint32(4,true),head=d.getUint16(8,true),len=d.getUint16(10,true),fields=[];
    for(let p=32;p<head-1;p+=32)fields.push([decode.decode(new Uint8Array(dbf,p,11)).split('\0')[0],d.getUint8(p+16)]);
    const records=[];for(let n=0;n<rows;n++){const r={};let p=head+n*len+1;for(const [key,l]of fields){r[key]=decode.decode(new Uint8Array(dbf,p,l)).trim();p+=l}records.push(r)}
    const v=new DataView(shp),out=[];let p=100,n=0;
    while(p<shp.byteLength){const bytes=v.getInt32(p+4,false)*2,start=p+8,type=v.getInt32(start,true);if(type!==0&&type!==3)throw new Error('Shapefile : polylignes 2D requises.');if(type===3){const parts=v.getInt32(start+36,true),points=v.getInt32(start+40,true),offset=start+44+parts*4;for(let a=0;a<parts;a++){const from=v.getInt32(start+44+a*4,true),to=a+1<parts?v.getInt32(start+48+a*4,true):points,line=[];for(let i=from;i<to;i++){const lon=v.getFloat64(offset+i*16,true),lat=v.getFloat64(offset+i*16+8,true);if(!valid(lat,lon))throw new Error('Coordonnées shapefile hors WGS84.');line.push([lon,lat])}out.push({route:records[n]?.VAR_ROUTE||'',variant:records[n]?.VAR_IDENT||'',points:line})}}p=start+bytes;n++;}
    return out;
  }
  function fromGTFS(tables,extraPlaces=[]){
    const rows=key=>tables[key]?.rows||[],routes=Object.fromEntries(rows('routes').map(r=>[str(r.route_id),[r.route_short_name,r.route_long_name].filter(Boolean).join(' · ')]));
    const trips=new Map(rows('trips').map(t=>[str(t.trip_id),t])),uses=new Map(),tp=new Set(),shapeRoutes=new Map();
    for(const t of trips.values())if(str(t.shape_id)){if(!shapeRoutes.has(str(t.shape_id)))shapeRoutes.set(str(t.shape_id),new Set());shapeRoutes.get(str(t.shape_id)).add(str(t.route_id));}
    const known=(tables.times||tables.stop_times)?.headers?.includes('timepoint');
    for(const r of (tables.times||tables.stop_times)?.rows||[]){const id=str(r.stop_id),route=str(trips.get(str(r.trip_id))?.route_id);if(!uses.has(id))uses.set(id,new Set());if(route)uses.get(id).add(route);if(str(r.timepoint)==='1')tp.add(id);}
    const stops=rows('stops').filter(r=>!str(r.location_type)||str(r.location_type)==='0').map(r=>({Stop:r.stop_id,Description:r.stop_name,Place:r.parent_station,Latitude:r.stop_lat,Longitude:r.stop_lon}));
    const places=rows('stops').filter(r=>str(r.location_type)==='1').map(r=>({Place:r.stop_id,Description:r.stop_name,Latitude:r.stop_lat,Longitude:r.stop_lon}));
    const byPlace=new Map(places.map(p=>[str(p.Place),p]));for(const p of extraPlaces)byPlace.set(p.id,{...(byPlace.get(p.id)||{}),Place:p.id,Description:p.description,Latitude:p.lat,Longitude:p.lon,'Refer.':p.referenceId||''});
    const model=build(stops,[...byPlace.values()]);model.routes=routes;
    for(const stop of model.stops){stop.routes=[...(uses.get(stop.id)||[])];stop.tp=known?tp.has(stop.id):null;}
    const lines=new Map();for(const r of rows('shapes')){const id=str(r.shape_id),lat=number(r.shape_pt_lat),lon=number(r.shape_pt_lon);if(!valid(lat,lon))continue;if(!lines.has(id))lines.set(id,[]);lines.get(id).push({lat,lon,n:Number(r.shape_pt_sequence)});}
    for(const [id,pts] of lines){pts.sort((a,b)=>a.n-b.n);if(pts.length<2)continue;for(const route of shapeRoutes.get(id)||[])model.shapes.push({route,variant:id,points:pts.map(p=>[p.lon,p.lat])});}
    return model;
  }
  root.NetworkExplorerData={build,shapes,fromGTFS};if(typeof module!=='undefined')module.exports=root.NetworkExplorerData;
})(typeof globalThis!=='undefined'?globalThis:this);
