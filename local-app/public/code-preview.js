(() => {
 const embedded=parent!==window,body=document.body,panel=document.getElementById('preview-panel');
 body.classList.toggle('code-embedded',embedded);
 const button=document.createElement('button');button.type='button';button.id='expand-code-preview';button.textContent='⛶ 크게 보기';button.setAttribute('aria-expanded','false');panel.querySelector('.result-heading').append(button);
 function expand(value,notify=true){body.classList.toggle('code-preview-expanded',value);button.textContent=value?'↙ 작게 보기':'⛶ 크게 보기';button.setAttribute('aria-expanded',String(value));if(embedded&&notify)parent.postMessage({channel:'course-preview',expanded:value},location.origin);}
 button.onclick=()=>expand(!body.classList.contains('code-preview-expanded'));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')expand(false);});
 window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.channel==='course-preview-close')expand(false,false);});
})();
