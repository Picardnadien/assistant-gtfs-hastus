/* Compressed, lazy GTFS payloads keep large client reports usable offline. */
function reportPayloadTools(){
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
  async function compress(stream){return encode(new Uint8Array(await new Response(stream.pipeThrough(new CompressionStream('gzip'))).arrayBuffer()));}
  async function text(value){return compress(new Blob([value]).stream());}
  async function table(value){
    const encoder=new TextEncoder(),cell=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
    let index=-1;
    const stream=new ReadableStream({async pull(controller){
      if(index===-1){controller.enqueue(encoder.encode(value.headers.map(cell).join(',')+'\r\n'));index=0;}
      if(index>=value.rows.length){controller.close();return;}
      const end=Math.min(index+1000,value.rows.length),lines=[];
      for(;index<end;index++)lines.push(value.headers.map(h=>cell(value.rows[index][h])).join(','));
      controller.enqueue(encoder.encode(lines.join('\r\n')+'\r\n'));await pause();
    }});
    return compress(stream);
  }
  async function pack(data){
    if(typeof CompressionStream==='undefined')throw Error('Ce navigateur ne permet pas la compression des rapports. Utilisez une version récente de Chrome ou Edge. / Browser compression unavailable.');
    const out={...data};
    if(data.gtfs){
      out.gtfs={...data.gtfs};
      if(!data.gtfs.times.packedCsv){
        const ids=new Set();for(const row of data.gtfs.times.rows)ids.add(row.stop_id);
        out.gtfs.times={headers:data.gtfs.times.headers,rows:[],stopIds:[...ids],packedCsv:await table(data.gtfs.times)};
      }
      out.gtfs.archiveEntries=[];
      for(const entry of data.gtfs.archiveEntries||[]){out.gtfs.archiveEntries.push(entry.packedText?entry:{name:entry.name,packedText:await text(entry.text)});await pause();}
    }
    out.networkTables={};
    for(const [name,value] of Object.entries(data.networkTables||{}))out.networkTables[name]=value.packedCsv?value:{headers:value.headers,rows:[],packedCsv:await table(value)};
    return out;
  }
  async function unpack(value){
    const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  async function expand(data){
    const out={...data},parse=reportPackageTools().parse;
    if(data.gtfs){out.gtfs={...data.gtfs};
      if(data.gtfs.times.packedCsv){await pause();out.gtfs.times=parse(await unpack(data.gtfs.times.packedCsv));}
      out.gtfs.archiveEntries=[];for(const entry of data.gtfs.archiveEntries||[]){out.gtfs.archiveEntries.push(entry.packedText?{name:entry.name,text:await unpack(entry.packedText)}:entry);await pause();}
    }
    out.networkTables={};for(const [name,value] of Object.entries(data.networkTables||{}))out.networkTables[name]=value.packedCsv?parse(await unpack(value.packedCsv)):value;
    return out;
  }
  return {pack,expand};
}
function reportPayloadWorker(data,edits,task){
  return new Promise((resolve,reject)=>{
    const source=reportPackageTools.toString()+'\n'+reportPayloadTools.toString()+'\n'+reportEditorEngine.toString()+`\nonmessage=async event=>{try{const {data,edits,task}=event.data,expanded=await reportPayloadTools().expand(data);if(task==='expand'){postMessage({value:expanded});return;}const result=reportEditorEngine(expanded,edits,true,task==='zip');if(result.errors.length)throw Error(result.errors.join(', '));if(task==='zip'){const bytes=reportPackageTools().zip(reportPackageTools().files(expanded,result));postMessage({value:bytes},[bytes.buffer]);}else postMessage({value:result[task]});}catch(error){postMessage({error:error.message});}};`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));let worker;
    const cleanup=()=>{worker?.terminate();URL.revokeObjectURL(url);};
    try{worker=new Worker(url);worker.onmessage=event=>{cleanup();event.data.error?reject(Error(event.data.error)):resolve(event.data.value);};worker.onerror=event=>{cleanup();reject(Error(event.message||'Report worker failed'));};worker.postMessage({data,edits,task});}catch(error){cleanup();reject(error);}
  });
}
