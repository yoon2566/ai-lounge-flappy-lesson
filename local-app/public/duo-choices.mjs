// Original, explanatory SVG art. No external assets or brand characters.
const C={ink:'#474b57',muted:'#9ca2ad',line:'#dce0e6',sky:'#edf3f6',bird:'#f7cf55',wing:'#e5ab3c',blue:'#7fb3dd',coin:'#f4c64e',cloud:'#606775'};
const rect=(x,y,w,h,fill,rx=8)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const text=(x,y,s,size=14,color=C.ink)=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Malgun Gothic,system-ui,sans-serif" font-size="${size}" font-weight="800" fill="${color}">${s}</text>`;
const line=(x1,y1,x2,y2,color=C.ink,width=4)=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
const arrow=(x1,y1,x2,y2,color=C.ink)=>{const a=Math.atan2(y2-y1,x2-x1),s=7;return line(x1,y1,x2,y2,color)+line(x2,y2,x2-s*Math.cos(a-.65),y2-s*Math.sin(a-.65),color)+line(x2,y2,x2-s*Math.cos(a+.65),y2-s*Math.sin(a+.65),color);};
const bird=(x=90,y=55,scale=1,color=C.bird)=>`<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cx="0" cy="0" rx="22" ry="20" fill="${color}"/><ellipse cx="-9" cy="5" rx="10" ry="7" fill="${color===C.bird?C.wing:color===C.blue?'#568fc1':'#c8cbd2'}"/><ellipse cx="9" cy="-6" rx="6" ry="8" fill="#fff"/><circle cx="11" cy="-6" r="2.6" fill="${C.ink}"/><path d="M19 -1L32 4L19 8Z" fill="#e9a14e"/><path d="M-12 -18l4-7 5 7" fill="${color}"/></g>`;
const star=(x,y,size=13,fill='#fff0a8')=>`<path d="M0 -${size}L${size*.3} -${size*.3}L${size} 0L${size*.3} ${size*.3}L0 ${size}L-${size*.3} ${size*.3}L-${size} 0L-${size*.3} -${size*.3}Z" transform="translate(${x} ${y})" fill="${fill}"/>`;
const coin=(x,y,r=12,kind=0)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${kind===2?'#e7a142':C.coin}"/><circle cx="${x}" cy="${y}" r="${r-4}" fill="none" stroke="#fff0a8" stroke-width="2"/>${kind===1?star(x,y,r*.5):line(x,y-r*.33,x,y+r*.33,'#fff0a8',3)}`;
const cloud=(x,y,scale=1,kind=0)=>`<g transform="translate(${x} ${y}) scale(${scale})" fill="${C.cloud}"><rect x="-23" y="-3" width="48" height="22" rx="11"/><circle cx="-12" cy="-3" r="12"/><circle cx="6" cy="-8" r="16"/>${kind===1?'<circle cx="-25" cy="7" r="9"/><circle cx="24" cy="4" r="12"/><circle cx="-4" cy="14" r="11"/>':''}${kind===2?'<path d="M-10 0l6 3m8 0l6-3M-5 12q5-5 10 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>':''}</g>`;
const pipe=(x,top=24,bottom=78,w=22)=>rect(x,0,w,top,'#9da7ad',3)+rect(x-3,Math.max(0,top-8),w+6,8,'#7e8993',3)+rect(x,bottom,w,110-bottom,'#9da7ad',3)+rect(x-3,bottom,w+6,8,'#7e8993',3);
const sky=()=>rect(0,0,180,110,C.sky,10)+rect(0,101,180,9,'#dfe5e7',0);
const phone=(x=52,y=18)=>rect(x,y,42,69,C.ink,8)+rect(x+4,y+7,34,48,'#fff',4)+`<circle cx="${x+21}" cy="${y+61}" r="3" fill="#b9c1cd"/>`;
const key=(x=35,y=67,w=104)=>rect(x,y+3,w,25,'#a9afb8',6)+rect(x,y,w,24,'#f8f9fb',6)+text(x+w/2,y+16,'SPACE',10);
const tap=(x,y)=>`<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#aeb7c3" stroke-width="2" stroke-dasharray="4 5"/><path d="M${x} ${y+13}v-20q0-5 5-4l1 15 9 2q4 1 3 6l-3 15h-15l-8-13q-3-6 2-6Z" fill="#eee2d3" stroke="#b5a08e" stroke-width="2"/>`;
const retry=(x=90,y=53,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M15-13A21 21 0 1 0 21 7M15-25v13H2" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const frame=(inside)=>rect(22,7,136,96,'#dce3e8',10)+rect(28,13,124,84,'#fff',6)+inside;
const score=(n=1,x=90,y=31)=>text(x,y,String(n),23);
const burst=(x,y)=>star(x-25,y-18,6,C.coin)+star(x+26,y-14,8,C.coin)+star(x+23,y+18,5,C.coin);

function classic(step,i){
 switch(step){
  case 0:return bird(132,30,.72)+arrow(132,69,132,51,C.muted)+(i===0?phone(30,7)+key(51,76,94):i===1?phone(42,14)+tap(64,45):key(20,61,100)+arrow(71,48,71,24));
  case 1:return sky()+bird(70,30,.8)+arrow(115,29,115,[60,87,90][i])+(i===2?line(103,41,103,50,C.muted,2)+line(103,60,103,73,C.ink,3):'')+text(72,96,['천천히','빠르게','점점 빠르게'][i],11);
  case 2:return bird(87,57,[1.2,1.38,1.55][i],[C.bird,C.blue,'#e8ebef'][i])+star(143,27,7,'#d4dce4');
  case 3:return sky()+pipe(102,[25,12,38][i],[78,66,94][i],20)+pipe(150,[25,44,15][i],[78,98,73][i],18)+bird(43,54,.7)+arrow(91,55,65,55)+(i===2?arrow(133,67,133,37,C.muted):'');
  case 4:{const gap=[80,57,35][i],top=(110-gap)/2,bottom=top+gap;return sky()+pipe(111,top,bottom,30)+bird(66,55,.75)+arrow(96,55,96,top+7,C.muted)+arrow(96,55,96,bottom-7,C.muted);}
  case 5:return sky()+pipe(143,26,80)+bird(38,56,.7)+Array.from({length:i+1},(_,n)=>arrow(125-n*28,55,105-n*28,55)).join('')+text(90,97,['천천히','보통','점점 빠르게'][i],11);
  case 6:return frame(bird(72,66,.65)+(i===1?score(1,43,35):score(1,90,36))+(i===2?burst(90,34):''));
  case 7:return frame(i===0?text(90,52,'게임 끝',19)+bird(86,78,.55):i===1?`<g opacity=".4">${bird(88,56,1)}</g>`+burst(88,56):text(90,37,'내 점수',12)+score(12,90,73));
  case 8:return frame(text(90,34,['톡! 누르면 시작','돌기둥 사이로!','몇 점까지 갈까?'][i],12)+bird(63,65,.7)+(i===0?tap(111,61):i===1?pipe(119,43,83,17):score('?',121,77)));
  case 9:return i===0?rect(25,29,130,52,'#e5e8ed',12)+retry(90,54,.72):i===1?phone(68,13)+tap(89,48):key(15,70,102)+retry(137,36,.7)+text(60,42,'또는',11);
  default:return bird();
 }
}
function variant(step,i){
 switch(step){
  case 0:return sky()+(i===0?pipe(25,26,80,17)+line(20,15,50,97,'#c6ccd2',4)+arrow(62,56,91,56)+coin(125,55,19):i===1?bird(42,60,.75)+arrow(79,57,103,57)+coin(134,54,20,1):bird(51,61,.8)+coin(105,29)+coin(130,61)+coin(159,31));
  case 1:return coin(89,56,30,i)+(i===2?burst(90,54):'');
  case 2:return sky()+bird(27,60,.6)+(i===0?coin(78,32)+coin(113,77)+coin(149,47):i===1?`<path d="M61 60Q90 8 115 58T170 55" fill="none" stroke="#d1dbe3" stroke-width="3" stroke-dasharray="3 5"/>`+coin(70,43)+coin(110,47)+coin(150,75):coin(79,55)+coin(115,55)+coin(151,55))+arrow(154,97,119,97,C.muted);
  case 3:return cloud(90,54,[.95,1.3,1.3][i],i);
  case 4:return sky()+bird(25,62,.55)+(i===0?cloud(134,52,.65):i===1?cloud(72,47,.6)+cloud(118,65,.6)+cloud(163,47,.6):cloud(73,46,.45)+cloud(119,68,.5)+cloud(146,37,.5)+cloud(166,76,.48));
  case 5:return bird(54,67,.9)+coin(107,63,13)+text(120,32,'+1',23)+(i===1?burst(111,59):i===2?`<path d="M147 43V19l18-5v25M147 19l18-5" fill="none" stroke="${C.ink}" stroke-width="3"/><ellipse cx="142" cy="44" rx="6" ry="4" fill="${C.ink}"/><ellipse cx="160" cy="39" rx="6" ry="4" fill="${C.ink}"/>`:'');
  case 6:return frame(i===0?coin(64,57,19)+score(8,111,67):i===1?text(90,36,'다시 도전!',16)+retry(90,71,.7):`<g opacity=".35">${bird(87,55,1.2)}</g>`+burst(90,55));
  case 7:return sky()+bird(60,75,.85)+arrow(114,81,114,[37,57,15][i])+text(56,24,['그대로','살짝','힘차게'][i],12);
  case 8:return i===0?rect(0,0,180,110,'#e8f2f8',10)+`<circle cx="134" cy="27" r="16" fill="#f4d169"/>`+`<g fill="#fff"><ellipse cx="43" cy="32" rx="24" ry="10"/><circle cx="40" cy="27" r="12"/></g>`+bird(87,68,.85):i===1?rect(0,0,180,110,'#434d68',10)+`<path d="M131 12a21 21 0 1 0 25 29A22 22 0 0 1 131 12Z" fill="#f9e6a4"/>`+star(30,22,4)+star(52,65,3)+star(145,84,4)+bird(89,62,.85):rect(0,0,180,110,'#efd5c9',10)+rect(0,76,180,34,'#d8b1b4',0)+`<circle cx="133" cy="70" r="23" fill="#efb35f"/>`+bird(68,46,.9);
  case 9:return frame(i===0?score(0,89,36)+coin(60,69,12)+cloud(118,68,.6):i===1?score(0,90,35)+bird(52,70,.55)+coin(98,68,10)+cloud(133,65,.4):text(90,34,'다시 시작!',14)+score(0,47,70)+coin(90,66,10)+cloud(127,65,.4))+retry(153,93,.4);
  default:return bird();
 }
}

export function decorateChoices(kind,index){
 document.querySelectorAll('#answer-options button').forEach((button,i)=>{
  const label=button.querySelector('.choice-label')?.textContent||button.textContent;
  const picture=document.createElement('span');picture.className='choice-picture';picture.setAttribute('aria-hidden','true');
  picture.innerHTML=`<svg viewBox="0 0 180 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${kind==='variant'?variant(index,i):classic(index,i)}</svg>`;
  const caption=document.createElement('span');caption.className='choice-label';caption.textContent=label;
  button.replaceChildren(picture,caption);button.classList.add('duo-picture-choice');button.setAttribute('aria-label',label);
 });
}
