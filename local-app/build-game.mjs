import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url);
let html=await fs.readFile(new URL('../assets/source-practice.html',root),'utf8');
function swap(a,b){if(!html.includes(a))throw Error('원본 게임 연결 지점 누락: '+a.slice(0,50));html=html.replace(a,b);}
swap("(() => {",`(() => {
  const config=window.FLAPPY_CONFIG||{},assets=config.assets||{},images={};
  for(const [kind,source] of Object.entries(assets)){if(typeof source==='string'){const im=new Image();im.src=source;images[kind]=im;}}
  const has=kind=>images[kind]?.complete&&images[kind].naturalWidth>0;
  let lives=config.lives||3,shield=config.ability==='shield'?1:0,invincibleUntil=0;
`);
swap('function ready(){','function ready(){lives=config.lives||3;shield=config.ability===\'shield\'?1:0;invincibleUntil=0;');
swap('function sound(kind){if(!audio)return;','function sound(kind){if(!audio||config.sound===false)return;');
swap('velocity=C.impulse;sound','velocity=C.impulse*(config.jump||1);sound');
swap("actor.x-=dt*(actor.kind==='coin'?P.coinSpeed:P.cloudSpeed);","actor.x-=dt*(actor.kind==='coin'?P.coinSpeed:P.cloudSpeed)*(config.speed||1);if(config.ability==='magnet'&&actor.kind==='coin'&&Math.abs(actor.x-78)<75){actor.y+=(y+12-actor.y)*Math.min(1,dt*4);}");
swap("if(actor.kind==='cloud'&&cloudTouch(hit,actor)){finish(now);return;}","if(actor.kind==='cloud'&&cloudTouch(hit,actor)){if(now<invincibleUntil)continue;actors.splice(i,1);finish(now);return;}");
swap("function finish(now){if(mode!=='playing')return;","function finish(now){if(mode!=='playing'||now<invincibleUntil)return;if(shield>0||lives>1){if(shield>0)shield--;else lives--;invincibleUntil=now+1400;y=Math.min(y,C.field-70);visualY=y;velocity=C.impulse;sound('hit');return;}");
swap('function sky(now){','function sky(now){if(has(\'background\')){g.drawImage(images.background,0,0,C.width,C.field);return;}');
swap('function coin(actor,now){','function coin(actor,now){if(has(\'item\')){g.drawImage(images.item,actor.x-14,actor.y-14,28,28);return;}');
swap('function cloud(actor){','function cloud(actor){if(has(\'obstacle\')){g.drawImage(images.obstacle,actor.x-24,actor.y-24,48,48);return;}');
swap('    if(owlSpriteReady&&owlSprite',`    if(has('frame1')){const frame=Math.floor(now/((config.interval||.3)*1000))%2===1&&has('frame2')?'frame2':'frame1';if(now<invincibleUntil)g.globalAlpha=.45+Math.sin(now/80)*.2;g.drawImage(images[frame],-6,-12,48,48);g.restore();return;}
    if(owlSpriteReady&&owlSprite`);
swap('character(drawY,drawAngle,motionTime);floor(now);',"character(drawY,drawAngle,motionTime);floor(now);g.fillStyle='#fff6dc';g.font='bold 13px sans-serif';g.fillText('♥ '+lives+(shield?'  🛡':''),12,27);");
swap("if(data.command==='restart')ready();","if(data.command==='restart')ready();if(data.command==='pause'){stopTimers();}if(data.command==='resume'&&mode==='playing'){lastUpdate=clock();stopTimers();physicsTimer=setInterval(()=>step(clock()),C.tick);}");
swap("status.textContent={ready:","parent.postMessage({channel:'flappy-state',state:value,score:points},'*');status.textContent={ready:");
swap('<script>','<script>window.FLAPPY_CONFIG=__FLAPPY_CONFIG__;</script><script>');
await fs.writeFile(new URL('public/game-template.html',root),html);
console.log('기존 별빛 비행 엔진에 두 프레임·이미지·규칙 설정 연결 완료');
