// WebP retains the original canvas quality and bytes. Load PNG-8 only on fallback.
let png8EncoderJob,canvasWebPAvailable;
function loadPNG8Encoder(){
 if(window.FlappyPNG8)return Promise.resolve(window.FlappyPNG8);
 if(png8EncoderJob)return png8EncoderJob;
 png8EncoderJob=new Promise((resolve,reject)=>{
  const script=document.createElement('script');let objectURL,timer;
  const finish=error=>{clearTimeout(timer);script.onload=script.onerror=null;script.remove();if(objectURL)URL.revokeObjectURL(objectURL);if(error)reject(error);else resolve(window.FlappyPNG8);};
  script.onload=()=>finish(window.FlappyPNG8?null:Error('PNG encoder unavailable'));
  script.onerror=()=>finish(Error('PNG encoder unavailable'));
  timer=setTimeout(()=>finish(Error('PNG encoder timeout')),15000);
  if(data.png8EncoderSource){objectURL=URL.createObjectURL(new Blob([data.png8EncoderSource],{type:'text/javascript'}));script.src=objectURL;}
  else script.src=data.png8EncoderURL;
  document.head.appendChild(script);
 }).catch(error=>{png8EncoderJob=null;throw error;});
 return png8EncoderJob;
}
async function canvasImageDataURL(canvas,quality){
 try{const webp=canvas.toDataURL('image/webp',quality);if(webp.startsWith('data:image/webp;base64,')){canvasWebPAvailable=true;return webp;}}catch{}
 canvasWebPAvailable=false;
 try{return (await loadPNG8Encoder()).fromCanvas(canvas);}catch{throw Error('그림을 저장하지 못했습니다. 다시 시도해 주세요.');}
}
function isSavedPNG8(src){
 if(canvasWebPAvailable!==false||!src.startsWith('data:image/png;base64,'))return false;
 try{const header=atob(src.slice(22,66));return header.charCodeAt(24)===8&&header.charCodeAt(25)===3;}catch{return false;}
}
