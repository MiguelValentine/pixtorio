import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {optionsA} from './options-a.mjs';
import {optionsB} from './options-b.mjs';
import {flatten} from './raster.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const options = [...optionsA,...optionsB].sort((a,b)=>a.number-b.number);
const child=spawn(path.resolve(directory,'../../build/bin/Pixtorio.exe'),['--mcp'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const pending=new Map();
let sequence=0;
createInterface({input:child.stdout}).on('line',line=>{
  const response=JSON.parse(line), entry=pending.get(response.id);
  if(!entry)return;
  pending.delete(response.id);
  clearTimeout(entry.timeout);
  if(response.error)entry.reject(new Error(JSON.stringify(response.error)));
  else entry.resolve(response.result);
});
child.stderr.on('data',data=>process.stderr.write(data));
function request(method,params){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},35000);
    pending.set(id,{resolve,reject,timeout});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
}
async function call(name,args={}){
  const result=await request('tools/call',{name:`pixtorio_${name}`,arguments:args});
  if(result.isError)throw new Error(JSON.stringify(result.content));
  return JSON.parse(result.content.find(item=>item.type==='text').text);
}

const font={
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],
  '2':['110','001','010','100','111'],'3':['110','001','010','001','110'],
  '4':['101','101','111','001','001'],'5':['111','100','110','001','110'],
  '6':['011','100','111','101','111'],'7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'],'9':['111','101','111','001','110'],
  'A':['010','101','111','101','101'],'B':['110','101','110','101','110'],
  'C':['011','100','100','100','011'],'D':['110','101','101','101','110'],
  'E':['111','100','110','100','111'],'F':['111','100','110','100','100'],
  'G':['011','100','101','101','011'],'H':['101','101','111','101','101'],
  'I':['111','010','010','010','111'],'J':['001','001','001','101','010'],
  'K':['101','101','110','101','101'],'L':['100','100','100','100','111'],
  'M':['10001','11011','10101','10001','10001'],'N':['1001','1101','1011','1001','1001'],
  'O':['010','101','101','101','010'],'P':['110','101','110','100','100'],
  'Q':['010','101','101','111','011'],'R':['110','101','110','101','101'],
  'S':['011','100','010','001','110'],'T':['111','010','010','010','010'],
  'U':['101','101','101','101','111'],'V':['101','101','101','101','010'],
  'W':['10001','10001','10101','11011','10001'],'X':['101','101','010','101','101'],
  'Y':['101','101','010','010','010'],'Z':['111','001','010','100','111'],
  ' ':['00','00','00','00','00'],'/':['001','001','010','100','100'],
  '-':['000','000','111','000','000'],
};
function makeBoard(){
  const width=880,height=454;
  const cells=Array.from({length:width*height},(_,i)=>({x:i%width,y:Math.floor(i/width),color:'#EFF3F5'}));
  function dot(x,y,color){if(x>=0&&y>=0&&x<width&&y<height)cells[y*width+x]={x,y,color};}
  function text(label,x,y,color,scale=2){
    for(const letter of label){
      const glyph=font[letter]??font[' '];
      for(let gy=0;gy<glyph.length;gy++)for(let gx=0;gx<glyph[gy].length;gx++)if(glyph[gy][gx]==='1'){
        for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)dot(x+gx*scale+dx,y+gy*scale+dy,color);
      }
      x+=(glyph[0].length+1)*scale;
    }
  }
  text('PIXTORIO / LOGO STUDIES',28,20,'#253139',2);
  text('128 X 128',754,20,'#65777F',2);
  for(let x=28;x<852;x++)dot(x,43,'#CED9DE');
  for(const option of options){
    const index=option.number-1,col=index%5,row=Math.floor(index/5);
    const left=24+col*170,top=56+row*190;
    for(const pixel of flatten(option.layers).pixels())dot(left+18+pixel.x,top+pixel.y,pixel.color);
    text(String(option.number).padStart(2,'0'),left+20,top+140,'#253139',3);
    text(option.title,left+20,top+164,'#53666F',1);
  }
  return {width,height,pixels:cells};
}

try{
  await request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'pixtorio-ten-logo-studies',version:'1.0'}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const before=await call('list_documents');
  console.log('Existing tabs preserved:',before.documents.length);
  for(const option of options){
    const basename=String(option.number).padStart(2,'0')+'-'+option.slug;
    let doc=await call('create_document',{name:basename,width:128,height:128,colorMode:'rgba'});
    const documentId=doc.documentId;
    const colors=[...new Set(option.layers.flatMap(layer=>[...layer.cells.values()]))];
    doc=await call('edit_document',{documentId,operations:[
      {type:'update_layer',layerId:doc.layers[0].id,name:option.layers[0].name},
      ...option.layers.slice(1).map(layer=>({type:'add_layer',name:layer.name})),
      {type:'set_palette',colors},
    ]});
    await call('edit_document',{documentId,operations:option.layers.map(layer=>({
      type:'set_pixels',layerId:doc.layers.find(item=>item.name===layer.name).id,pixels:layer.pixels(),
    }))});
    await call('save_project',{documentId,path:path.join(directory,basename+'.pixio')});
    await call('export_image',{documentId,path:path.join(directory,basename+'.png'),format:'png',scale:1});
    console.log('Saved',basename,'128x128',option.layers.length,'layers');
  }
  const board=makeBoard();
  const doc=await call('create_document',{name:'00 - Ten logo studies',width:board.width,height:board.height,colorMode:'rgba'});
  for(let start=0;start<board.pixels.length;start+=50000){
    await call('edit_document',{documentId:doc.documentId,operations:[{type:'set_pixels',pixels:board.pixels.slice(start,start+50000)}]});
  }
  await call('save_project',{documentId:doc.documentId,path:path.join(directory,'00-overview.pixio')});
  await call('export_image',{documentId:doc.documentId,path:path.join(directory,'00-overview.png'),format:'png',scale:2});
  const preview=await request('tools/call',{name:'pixtorio_get_preview',arguments:{documentId:doc.documentId}});
  if(preview.isError||!preview.content.some(item=>item.type==='image'&&item.data.length))throw new Error('MCP preview missing');
  console.log('Overview exported and MCP preview verified. Active tab:',doc.documentId);
}finally{
  child.stdin.end();
}
