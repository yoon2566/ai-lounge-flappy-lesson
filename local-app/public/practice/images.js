export function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('그림을 열지 못했어요.'));im.src=src;});}
function canvas(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export async function removeMagenta(src){
 const im=await loadImage(src),c=canvas(512),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,512,512);const pixels=ctx.getImageData(0,0,512,512),d=pixels.data;
 const samples=[];for(let i=0;i<512;i+=8)for(const p of [i,511*512+i,i*512,i*512+511])samples.push([d[p*4],d[p*4+1],d[p*4+2]]);
 const bg=[0,1,2].map(k=>samples.map(s=>s[k]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]);
 if(!(bg[0]>bg[1]*1.25&&bg[2]>bg[1]*1.2))throw Error('분홍색 배경을 찾지 못했어요. 원본을 확인하고 다시 만들어 주세요.');
 const n=512*512,seen=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0,removed=0;
 function visit(p){if(p<0||p>=n||seen[p])return;seen[p]=1;const q=p*4,dist=Math.hypot(d[q]-bg[0],d[q+1]-bg[1],d[q+2]-bg[2]);if(d[q+3]<10||dist<78&&d[q]>d[q+1]*1.2&&d[q+2]>d[q+1]*1.1){queue[tail++]=p;d[q+3]=0;removed++;}}
 for(let i=0;i<512;i++){visit(i);visit(511*512+i);visit(i*512);visit(i*512+511);}
 while(head<tail){const p=queue[head++],x=p%512;if(x)visit(p-1);if(x<511)visit(p+1);visit(p-512);visit(p+512);}
 let left=512,top=512,right=0,bottom=0;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){if(d[(y*512+x)*4+3]>30){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 if(removed/n<.15||removed/n>.98||right<=left)throw Error('배경 제거 결과를 확인해 주세요. 다른 그림으로 다시 시도할 수 있어요.');
 ctx.putImageData(pixels,0,0);return {canvas:c,box:{left,top,right,bottom},removed:removed/n};
}
export async function prepareFrames(urls){
 const frames=await Promise.all(urls.map(removeMagenta));
 const box={left:Math.min(...frames.map(f=>f.box.left)),top:Math.min(...frames.map(f=>f.box.top)),right:Math.max(...frames.map(f=>f.box.right)),bottom:Math.max(...frames.map(f=>f.box.bottom))};
 const scale=224/Math.max(box.right-box.left+1,box.bottom-box.top+1),cx=(box.left+box.right)/2,cy=(box.top+box.bottom)/2;
 const outputs=frames.map(f=>{const c=canvas(256),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(f.canvas,128-cx*scale,128-cy*scale,512*scale,512*scale);return c.toDataURL('image/png');});
 return {frames:outputs,boxes:frames.map(f=>f.box),removed:frames.map(f=>f.removed)};
}
export async function alignFrame(src,{x=0,y=0,scale=1}={}){const im=await loadImage(src),c=canvas(256),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(im,128-128*scale+x,128-128*scale+y,256*scale,256*scale);return c.toDataURL('image/png');}
export async function dataURL(url){const r=await fetch(url);if(!r.ok)throw Error('그림을 읽지 못했어요.');const blob=await r.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
