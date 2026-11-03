// Keep the canvas bitmap and its displayed rectangle at the same aspect ratio.
// Included in previews and exported HTML, so generated CSS cannot squash the game.
function installGameAspect(){
 function attach(){
  const canvas=document.querySelector('canvas#game');if(!canvas)return;
  function fit(){
   const scale=Math.min(document.documentElement.clientWidth/canvas.width,document.documentElement.clientHeight/canvas.height);
   if(!Number.isFinite(scale)||scale<=0)return;
   for(const [key,value] of Object.entries({width:canvas.width*scale+'px',height:canvas.height*scale+'px','max-width':'none','max-height':'none','min-width':'0','min-height':'0',flex:'none','object-fit':'contain'}))canvas.style.setProperty(key,value,'important');
  }
  fit();window.addEventListener('resize',fit);
  new MutationObserver(fit).observe(canvas,{attributes:true,attributeFilter:['width','height']});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
}
export function withGameAspectRatio(html){
 if(html.includes('id="flappy-aspect-fit"'))return html;
 const script='<script id="flappy-aspect-fit">('+installGameAspect.toString()+')();</script>';
 return /<\/body\s*>/i.test(html)?html.replace(/<\/body\s*>/i,script+'</body>'):html+script;
}
