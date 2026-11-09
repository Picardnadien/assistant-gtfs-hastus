(function(root){
  const key=v=>String(v??'').trim().replace(/^:/,'').toUpperCase();
  const text=v=>String(v??'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleUpperCase('fr');
  function compare(stops,hastus,association,mapping){
    const index=new Map(),counts=new Map();
    for(const row of hastus){const k=key(row[mapping.stopId]);if(k){if(!index.has(k))index.set(k,[]);index.get(k).push(row);}}
    const physical=stops.filter(s=>!s.location_type||String(s.location_type)==='0');
    for(const s of physical){const k=key(s[association]);if(k)counts.set(k,(counts.get(k)||0)+1);}
    return physical.map(s=>{const k=key(s[association]),matches=index.get(k)||[],gtfs=String(s.stop_name??''),descriptions=[...new Set(matches.map(r=>String(r[mapping.stopDesc]??'')))];
      const status=!k?'missing-key':!matches.length?'unmatched':matches.length>1||counts.get(k)>1?'ambiguous':!text(gtfs)||!text(descriptions[0])?'missing-description':text(gtfs)===text(descriptions[0])?'same':'different';
      return {stopId:String(s.stop_id??''),associationValue:String(s[association]??''),gtfs,hastus:descriptions.join(' / '),status};});
  }
  function infer(stops,hastus,mapping){
    const scores={};
    for(const field of ['stop_id','stop_code']){
      const rows=compare(stops,hastus,field,mapping);
      scores[field]={total:rows.length,matched:rows.filter(r=>['same','different','missing-description'].includes(r.status)).length,ambiguous:rows.filter(r=>r.status==='ambiguous').length};
    }
    const a=scores.stop_id,b=scores.stop_code;
    const suggested=a.matched===b.matched?null:a.matched>b.matched?'stop_id':'stop_code';
    return {scores,suggested,reason:Math.max(a.matched,b.matched)===0?'none':suggested?'matched':'tie'};
  }
  function csv(table){return table.map(row=>row.map(v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';')).join('\r\n')+'\r\n';}
  function xlsxEntries(table){
    const xml=v=>String(v??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return [
      {name:'[Content_Types].xml',text:'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
      {name:'_rels/.rels',text:`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
      {name:'xl/workbook.xml',text:`<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Descriptions" sheetId="1" r:id="rId1"/></sheets></workbook>`},
      {name:'xl/_rels/workbook.xml.rels',text:`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`},
      {name:'xl/worksheets/sheet1.xml',text:`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="3" width="22" customWidth="1"/><col min="4" max="5" width="48" customWidth="1"/><col min="6" max="6" width="32" customWidth="1"/></cols><sheetData>${table.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:F${Math.max(1,table.length)}"/></worksheet>`}
    ];
  }
  if(typeof module!=='undefined')module.exports={compare,infer,csv,xlsxEntries};else root.StopDescriptionCheck={compare,infer,csv,xlsxEntries};
})(typeof globalThis!=='undefined'?globalThis:this);
