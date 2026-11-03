const $=id=>document.getElementById(id);let current=0,zoom=100;
function show(index){
 current=Math.max(0,Math.min(shots.length-1,index));const shot=shots[current];
 $('photo').src=shot.file;$('photo').alt=shot.title;$('title').textContent=shot.title;
 $('position').textContent=(current+1)+' / '+shots.length+' · '+shot.group;
 $('chapter').value=shots.findIndex(s=>s.group===shot.group);
 $('prev').disabled=current===0;$('next').disabled=current===shots.length-1;
 $('stage').scrollTop=0;$('stage').scrollLeft=0;history.replaceState(null,'','#'+(current+1));
 if(shots[current+1]){const preload=new Image();preload.src=shots[current+1].file;}
}
function setZoom(value){zoom=Math.max(100,Math.min(250,value));$('photo').style.width=zoom+'%';$('reset').textContent=zoom+'%';$('smaller').disabled=zoom===100;$('bigger').disabled=zoom===250;}
$('prev').onclick=()=>show(current-1);$('next').onclick=()=>show(current+1);
$('chapter').onchange=e=>show(Number(e.target.value));
$('smaller').onclick=()=>setZoom(zoom-25);$('bigger').onclick=()=>setZoom(zoom+25);$('reset').onclick=()=>setZoom(100);
function focusPhoto(value){document.body.classList.toggle('photo-only',value);$('exit-focus').hidden=!value;}
$('fullscreen').onclick=()=>focusPhoto(true);$('exit-focus').onclick=()=>focusPhoto(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')focusPhoto(false);});
document.addEventListener('keydown',e=>{if(['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='ArrowRight'){e.preventDefault();show(current+1);}if(e.key==='ArrowLeft'){e.preventDefault();show(current-1);}if(e.key==='+'||e.key==='=')setZoom(zoom+25);if(e.key==='-')setZoom(zoom-25);});
setZoom(100);show((Number(location.hash.slice(1))||1)-1);
