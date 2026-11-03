(() => {
 const embedded=parent!==window,button=document.getElementById('expand-preview');
 document.body.classList.toggle('embedded-studio',embedded);
 if(embedded){
  const save=document.createElement('button');save.type='button';save.textContent='게임 저장';
  save.onclick=()=>document.getElementById('download').click();
  document.querySelector('.publish-panel').insertBefore(save,document.getElementById('studio-board'));
 }
 function setExpanded(value,notify=true){
  document.body.classList.toggle('preview-expanded',value);
  button.textContent=value?'↙ 작게 보기':'⛶ 크게 보기';
  button.setAttribute('aria-expanded',String(value));
  if(embedded&&notify)parent.postMessage({channel:'studio-view',expanded:value},location.origin);
  if(!value)button.focus();
 }
 button.onclick=()=>setExpanded(!document.body.classList.contains('preview-expanded'));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')setExpanded(false);});
 window.addEventListener('message',e=>{
  if(e.source===parent&&e.origin===location.origin&&e.data?.channel==='studio-view-close')setExpanded(false,false);
 });
})();
