const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('map-tools.js','utf8'),ctx);const tools=ctx.mapTools();
assert.equal(tools.valid({lat:'',lon:'0'}),false);assert.equal(tools.valid({lat:0,lon:0}),true);assert.equal(tools.valid({lat:91,lon:0}),false);
const g={width:1000,height:430,zoom:16,center:tools.project({lat:45,lon:-75},16)};
for(const view of [{x:0,y:0,width:1000,height:430},{x:-40.6,y:10.5,width:731.2,height:1100.4}]){
 const markup=tools.background(g,view);assert.match(markup,/foreignObject/);assert.match(markup,/inert=""/);assert.match(markup,/referrerpolicy="origin"/);
 const bbox=new URL(markup.match(/src="([^"]+)"/)[1].replaceAll('&amp;','&')).searchParams.get('bbox').split(',').map(Number);
 const nw=tools.project({lat:bbox[3],lon:bbox[0]},g.zoom),se=tools.project({lat:bbox[1],lon:bbox[2]},g.zoom);
 assert.ok(Math.abs(se.x-nw.x-Math.ceil(view.width)*.99)<1e-5);assert.ok(Math.abs(se.y-nw.y-Math.ceil(view.height)*.99)<1e-5);
 const expected=g.center.x-g.width/2+view.x+Math.ceil(view.width)/2;assert.ok(Math.abs((se.x+nw.x)/2-expected)<1e-5,'Background centre remains on the marker projection');
}
const source={parsed:{stops:{rows:[{stop_id:'01',stop_name:'A <script>',stop_lat:'45',stop_lon:'-75'},{stop_id:'02',stop_lat:'45.01',stop_lon:'-75'},{stop_id:'x',stop_lat:'',stop_lon:''},{stop_id:'station',location_type:'1',stop_lat:45,stop_lon:-75}]},times:{headers:['timepoint'],rows:[{stop_id:'01',trip_id:'t',timepoint:'1'},{stop_id:'02',trip_id:'t',timepoint:'0'}]},trips:{rows:[{trip_id:'t',route_id:'r'}]},routes:{rows:[{route_id:'r',route_short_name:'10'}]}}};
const before=JSON.stringify(source),stops=tools.stops(source);assert.equal(stops.length,2);assert.equal(stops[0].id,'01');assert.equal(stops[0].timing,true);assert.equal(stops[1].timing,false);assert.equal(stops[0].routes[0],'10');assert.equal(tools.stops(source),stops,'Reuse the index instead of scanning schedules for every map');assert.equal(JSON.stringify(source),before);
assert.equal(tools.stops({parsed:{stops:source.parsed.stops}})[0].timing,null,'No source means unknown, not non-TP');
console.log('PASS: map coordinate validity, fixed background projection/zoom, point identity, route/TP metadata, source immutability and cached index.');
