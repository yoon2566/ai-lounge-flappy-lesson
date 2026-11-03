// Keep the canvas bitmap and its displayed rectangle at the same aspect ratio.
// Included in previews and exported HTML, so generated CSS cannot squash the game.
function installGameAspect(){
 function attach(){
  const canvas=document.querySelector('canvas#game');if(!canvas)return;
  function fit(){
   const body=document.body,style=getComputedStyle(body),px=value=>parseFloat(value)||0;
   let horizontal=px(style.paddingLeft)+px(style.paddingRight)+px(style.marginLeft)+px(style.marginRight);
   let vertical=px(style.paddingTop)+px(style.paddingBottom)+px(style.marginTop)+px(style.marginBottom);
   // Generated pages may put instructions below the stage. Reserve their space.
   if(style.display==='block'||style.display==='flex'&&style.flexDirection==='column'){
    const flow=[...body.children].filter(el=>{const s=getComputedStyle(el);return el.getClientRects().length&&s.position!=='absolute'&&s.position!=='fixed'&&s.display!=='none';});
    for(const el of flow){if(el===canvas||el.contains(canvas))continue;const s=getComputedStyle(el);vertical+=el.getBoundingClientRect().height+px(s.marginTop)+px(s.marginBottom);}
    if(style.display==='flex')vertical+=Math.max(0,flow.length-1)*px(style.rowGap);
   }
   const scale=Math.min((document.documentElement.clientWidth-horizontal)/canvas.width,(document.documentElement.clientHeight-vertical)/canvas.height);
   if(!Number.isFinite(scale)||scale<=0)return;
   const stage=canvas.parentElement,stageStyle=getComputedStyle(stage);
   if(stage!==body&&stageStyle.aspectRatio!=='auto'){
    stage.style.setProperty('width',canvas.width*scale+'px','important');
    stage.style.setProperty('height',canvas.height*scale+'px','important');
   }
   for(const [key,value] of Object.entries({width:canvas.width*scale+'px',height:canvas.height*scale+'px','max-width':'none','max-height':'none','min-width':'0','min-height':'0',flex:'none','object-fit':'contain'}))canvas.style.setProperty(key,value,'important');
   document.documentElement.style.setProperty('overflow','hidden');
  }
  fit();requestAnimationFrame(fit);window.addEventListener('resize',fit);
  new MutationObserver(fit).observe(canvas,{attributes:true,attributeFilter:['width','height']});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
}
export function withGameAspectRatio(html){
 if(html.includes('id="flappy-aspect-fit"'))return html;
 const script='<script id="flappy-aspect-fit">('+installGameAspect.toString()+')();</script>';
 return /<\/body\s*>/i.test(html)?html.replace(/<\/body\s*>/i,script+'</body>'):html+script;
}
