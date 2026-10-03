"use strict";

// A valid JSON document, with independently readable records. Never stringify or
// parse the whole workspace: large GTFS feeds can exceed the JS string limit.
const WORKSPACE_CHUNK_HEADER='{"format":"hastus-workspace-chunks","version":1,"records":[';
function* workspaceStorageRecords(root){
  const seen=new WeakMap();let nextId=0;
  function small(value){
    if(!value||typeof value!=="object"||Array.isArray(value))return false;
    const keys=Object.keys(value);if(keys.length>64)return false;
    let size=0;
    return keys.every(key=>{const v=value[key];size+=key.length+(typeof v==="string"?v.length:16);return size<16384&&(v===null||["string","number","boolean","undefined"].includes(typeof v));});
  }
  function* visit(value,key){
    if(typeof value==="string"&&value.length>32768){
      yield ["open",key,"string"];
      for(let i=0;i<value.length;i+=32768)yield ["text",value.slice(i,i+32768)];
      yield ["close"];return;
    }
    if(!value||typeof value!=="object"||small(value)){yield ["value",key,value??null];return;}
    if(seen.has(value)){yield ["ref",key,seen.get(value)];return;}
    const id=nextId++;seen.set(value,id);
    yield ["open",key,Array.isArray(value)?"array":"object",id];
    if(Array.isArray(value)){
      for(let i=0;i<value.length;i++)yield* visit(value[i],i);
    }else{
      for(const k of Object.keys(value))if(value[k]!==undefined)yield* visit(value[k],k);
    }
    yield ["close"];
  }
  yield* visit(root,null);
}
async function saveChunkedWorkspace(directory,name,snapshot){
  const handle=await directory.getFileHandle(name,{create:true}),writer=await handle.createWritable();
  try{
    await writer.write(WORKSPACE_CHUNK_HEADER+"\n");
    let buffer="",first=true;
    for(const record of workspaceStorageRecords(snapshot)){
      buffer+=(first?"":",")+JSON.stringify(record)+"\n";first=false;
      if(buffer.length>=262144){await writer.write(buffer);buffer="";await new Promise(resolve=>setTimeout(resolve,0));}
    }
    await writer.write(buffer+"]}\n");
    // File System Access commits on close; abort preserves the last good save.
    await writer.close();
  }catch(error){try{await writer.abort();}catch{}throw error;}
}
async function readChunkedWorkspace(file){
  const prefix=await file.slice(0,WORKSPACE_CHUNK_HEADER.length).text();
  if(prefix!==WORKSPACE_CHUNK_HEADER)return JSON.parse(await file.text()); // v9 and earlier
  const reader=file.stream().getReader(),decoder=new TextDecoder(),stack=[],refs=new Map();
  let pending="",root,started=false,finished=false,rootWritten=false,blocks=0;
  const invalid=()=>{throw new Error("Sauvegarde de travail incomplète ou invalide.");};
  function assign(key,value){
    if(!stack.length){if(rootWritten)invalid();root=value;rootWritten=true;return;}
    const parent=stack[stack.length-1];if(parent.kind==="string")invalid();
    if(parent.kind==="array"){
      if(key!==parent.value.length)invalid();parent.value.push(value);
    }else{
      if(typeof key!=="string")invalid();
      Object.defineProperty(parent.value,key,{value,writable:true,enumerable:true,configurable:true});
    }
  }
  function line(text){
    if(!started){if(text!==WORKSPACE_CHUNK_HEADER)invalid();started=true;return;}
    if(text==="]}"){if(stack.length||!rootWritten||finished)invalid();finished=true;return;}
    if(!text.trim())return;
    if(finished)invalid();
    const record=JSON.parse(text[0]===","?text.slice(1):text),[op,key,kind,id]=record;
    if(op==="value")assign(key,kind);
    else if(op==="ref"){if(!refs.has(kind))invalid();assign(key,refs.get(kind));}
    else if(op==="open"){
      if(!["array","object","string"].includes(kind))invalid();
      const value=kind==="object"?{}:[];
      if(kind!=="string"){if(refs.has(id))invalid();refs.set(id,value);assign(key,value);}
      stack.push({key,kind,value});
    }else if(op==="text"){
      const current=stack[stack.length-1];if(current?.kind!=="string"||typeof key!=="string")invalid();current.value.push(key);
    }else if(op==="close"){
      const current=stack.pop();if(!current)invalid();if(current.kind==="string")assign(current.key,current.value.join(""));
    }else invalid();
  }
  try{
    while(true){
      const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});
      let start=0,index;
      while((index=pending.indexOf("\n",start))!==-1){line(pending.slice(start,index));start=index+1;}
      pending=pending.slice(start);
      if(done)break;
      if(++blocks%16===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(pending)line(pending);
    if(!finished)invalid();return root;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
