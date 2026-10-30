// Keep only game HTML here: restoring a game must not roll back prepared images.
const GAME_HISTORY_LIMIT=3;
function gameHistoryEntries(){
 const current=safeGameHTML(state.gameHTML||'');
 const entries=(Array.isArray(state.versions)?state.versions:[])
  .filter(html=>typeof html==='string'&&/<html[\s>]/i.test(html))
  .map(safeGameHTML).filter(html=>html!==current);
 return entries.filter((html,index)=>entries.lastIndexOf(html)===index).slice(-GAME_HISTORY_LIMIT);
}
function rememberGame(html){
 const next=safeGameHTML(html),current=safeGameHTML(state.gameHTML||'');
 const history=gameHistoryEntries().filter(previous=>previous!==next);
 if(current&&current!==next)history.push(current);
 state.versions=history.slice(-GAME_HISTORY_LIMIT);
 state.gameHTML=next;save();
}
function restoreGameVersion(html){
 if(controller||!gameHistoryEntries().includes(html))return null;
 rememberGame(html);
 return state.gameHTML;
}
function gameHistoryButton(onRestore){
 const button=action('이전 게임으로 돌아가기',()=>openGameHistory(onRestore),false,true);
 button.disabled=gameHistoryEntries().length===0;
 if(button.disabled)button.title='아직 보관된 이전 게임이 없습니다.';
 return button;
}
function openGameHistory(onRestore){
 if(controller){flash('진행 중인 작업을 마친 뒤 돌아갈 수 있어요.');return;}
 const entries=gameHistoryEntries().reverse();
 if(!entries.length){flash('아직 보관된 이전 게임이 없습니다.');return;}
 const d=dialog('이전 게임으로 돌아가기');d.classList.add('game-history-dialog');
 const help=el('p','muted','최근 보관한 게임을 골라 실행해 보세요. 만든 그림은 그대로 두고 게임만 돌아갑니다. 지금 게임도 이 목록에 보관됩니다.');
 const label=el('label','game-history-label','돌아갈 게임'),select=el('select');select.setAttribute('aria-label','돌아갈 게임');
 entries.forEach((html,index)=>{const option=el('option','',index===0?'최근 보관 게임 1 · 가장 최근':'최근 보관 게임 '+(index+1));option.value=String(index);select.append(option);});label.append(select);
 const frame=el('iframe');frame.title='이전 게임 미리보기';frame.setAttribute('sandbox','allow-scripts allow-pointer-lock');frame.referrerPolicy='no-referrer';
 const status=el('p','muted');status.setAttribute('role','status');
 const preview=()=>{frame.srcdoc=entries[Number(select.value)];status.textContent='게임을 확인한 뒤 아래 버튼을 눌러 주세요.';};
 select.onchange=preview;
 const bar=el('div','actions');bar.append(action('취소',()=>closeDialog(d)),action('이 게임으로 돌아가기',()=>{
  const restored=restoreGameVersion(entries[Number(select.value)]);
  if(!restored){status.textContent='게임 목록이 바뀌었어요. 닫은 뒤 다시 선택해 주세요.';return;}
  closeDialog(d);render();
  if(onRestore)onRestore(restored);else myGame();
 },true));
 d.append(help,label,frame,status,bar);preview();
}
