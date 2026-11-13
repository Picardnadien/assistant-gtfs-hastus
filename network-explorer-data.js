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
  root.NetworkExplorerData={build,shapes};if(typeof module!=='undefined')module.exports=root.NetworkExplorerData;
})(typeof globalThis!=='undefined'?globalThis:this);
