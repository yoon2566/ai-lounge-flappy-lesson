// Prompt editor and candidate preview. A candidate is saved only after validation and acceptance.
const openLessonPromptDialog=(()=>{
const node=(cls,text)=>el('div',cls,text),quizButton=(text,fn,primary)=>{const b=action(text,fn,primary);if(primary)b.classList.add('quiz-primary');return b;};
function downloadGameHtml(html,name='내가_만든_플래피게임.html'){
 if(!html)return;const url=URL.createObjectURL(new Blob(['\ufeff',safeGameHTML(html)],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openPromptDialog({value,applyLabel='게임 만들기',requiresValue=true,instructionText='문장을 확인하거나 고친 뒤, 아래 실행 버튼을 눌러 주세요.',onInput,onApply,onStop,onClose,returnFocus}){
 const element=document.createElement('dialog');element.className='prompt-dialog';element.setAttribute('aria-label','적용할 프롬프트');
 const heading=node('prompt-dialog-heading','적용할 프롬프트'),instruction=node('prompt-dialog-instruction',instructionText),input=document.createElement('textarea');
 input.className='prompt-dialog-input';input.setAttribute('aria-label','적용할 프롬프트');input.maxLength=16000;input.value=value||'';input.spellcheck=false;
 const canApply=()=>!requiresValue||Boolean(input.value.trim());
 const status=node('prompt-dialog-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const footer=node('prompt-dialog-footer');let busy=false,closed=false,phase='prompt',resultHtml='',removeFrameListener=null;
 function close(notify=true){if(closed)return;closed=true;removeFrameListener?.();element.close();element.remove();if(notify)onClose?.(phase);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})}
 function showPrompt(){if(phase==='prompt')return;removeFrameListener?.();removeFrameListener=null;phase='prompt';busy=false;resultHtml='';element.className='prompt-dialog';element.setAttribute('aria-label','적용할 프롬프트');element.replaceChildren(heading,instruction,input,status,footer);input.disabled=false;dismiss.disabled=false;stop.hidden=true;apply.disabled=!canApply();apply.textContent=applyLabel;status.textContent='';input.focus({preventScroll:true})}
 function showGame({html,title='완성된 게임',onEdit,onNext,previewOnly=false}){
  if(phase==='result'&&resultHtml===html)return;removeFrameListener?.();phase='result';busy=false;resultHtml=html;element.className='prompt-dialog prompt-game-result';element.setAttribute('aria-label',title);element.setAttribute('aria-busy','false');
  const resultHeading=node('error-result-heading',title),frame=document.createElement('iframe');frame.className='error-game-frame';frame.title='완성된 내 게임';frame.addEventListener('load',()=>{if(frame.isConnected)frame.focus({preventScroll:true})});
  const bar=node('error-result-footer'),hint=node('error-result-hint'),buttons=node('error-actions');hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
  let valid=false;
  const accept=quizButton('확인하고 다음 단계',()=>{if(valid)onNext?.();},true),download=quizButton('HTML 다운로드',()=>{if(valid)downloadGameHtml(html);});
  function reload(){removeFrameListener?.();removeFrameListener=mountGameFrame(frame,html,value=>{valid=value.valid;accept.disabled=download.disabled=!valid;hint.textContent=gameStatusText(value)+(value.errors.length&&!previewOnly?' 현재 게임은 그대로입니다.':'');hint.classList.toggle('error',value.errors.length>0);});}
  buttons.append(quizButton('닫기',()=>close()));
  if(!previewOnly)buttons.append(quizButton('프롬프트 고치기',()=>{showPrompt();onEdit?.()}));
  buttons.append(quizButton('다시 불러오기',reload),download);if(!previewOnly)buttons.append(accept);
  bar.append(hint,buttons);element.replaceChildren(resultHeading,frame,bar);reload();
 }
 const dismiss=quizButton('닫기',()=>{if(!busy)close()}),stop=quizButton('중지',()=>onStop?.()),apply=quizButton(applyLabel,()=>{if(!busy&&canApply())return onApply?.(input.value)},true);
 stop.hidden=true;apply.disabled=!canApply();input.oninput=()=>{onInput?.(input.value);apply.disabled=busy||!canApply()};
 input.addEventListener('keydown',event=>event.stopPropagation());input.addEventListener('keyup',event=>event.stopPropagation());
 footer.append(dismiss,stop,apply);element.append(heading,instruction,input,status,footer);
 element.addEventListener('cancel',event=>{event.preventDefault();if(!busy)close()});document.body.append(element);element.showModal();input.focus({preventScroll:true});
 return {element,input,status,apply,close,showPrompt,showGame,get phase(){return phase},update({value,busy:nextBusy=false,message=''}){busy=nextBusy;if(value!==undefined&&input.value!==value)input.value=value;input.disabled=busy;dismiss.disabled=busy;stop.hidden=!busy;apply.disabled=busy||!canApply();apply.textContent=busy?(applyLabel==='게임 만들기'?'게임 만드는 중…':'적용 중…'):applyLabel;status.textContent=message;element.setAttribute('aria-busy',String(busy))}};
}
return openPromptDialog;
})();
