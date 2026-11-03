const byId=id=>document.getElementById(id);
const result=byId('preview-panel'),chat=byId('chat-panel');
document.body.classList.add('focus-workspace');
byId('chat-tab').textContent='01  게임 설명 만들기';byId('preview-tab').textContent='02  내 게임 해보기';
const left=document.createElement('div');left.className='question-choice';
const view=byId('question-view');
for(const el of [byId('question-topic'),byId('question-title'),byId('question-title').nextElementSibling,byId('answer-options'),byId('custom-answer')])left.append(el);
view.prepend(left);
const sentencePlaceholder=document.createElement('div');sentencePlaceholder.id='sentence-placeholder';sentencePlaceholder.innerHTML='<span class="placeholder-mark" aria-hidden="true">↗</span><h2>내 생각이 문장이 돼요</h2><p>답을 고르면 AI가 문장을 만들어요.<br>내 말로 고친 뒤 확정해 보세요.</p>';
view.append(sentencePlaceholder);
const sentenceHeader=document.createElement('div');sentenceHeader.className='sentence-heading';sentenceHeader.innerHTML='<span>02</span><strong>읽고, 고치고, 확정해요</strong>';byId('sentence-panel').prepend(sentenceHeader);
const side=document.createElement('div');side.className='result-sidebar';
side.append(result.querySelector('.result-heading'));
const lead=document.createElement('p');lead.className='result-lead';lead.textContent='내 설명이 게임이 됐어요.\nPC는 마우스·스페이스바,\n태블릿은 화면 터치로 날아요.';side.append(lead);
side.append(byId('actions'));
const edit=document.createElement('button');edit.type='button';edit.className='edit-prompt';edit.textContent='← 게임 설명 고치기';edit.onclick=()=>byId('chat-tab').click();side.append(edit);
const code=chat.querySelector('details:not(#custom-answer)');code.className='source-details';side.append(code,byId('next'));result.prepend(side);
const scene=document.createElement('div');scene.className='result-scene';scene.append(byId('empty'),byId('game'));result.append(scene);
side.append(byId('live-progress'));
const status=byId('status');view.after(status);
// Fit the AI sentence after switching from picture choices to review.
function fitSentence(){const field=byId('sentence');if(byId('sentence-panel').hidden)return;field.style.height='auto';field.style.height=Math.max(96,field.scrollHeight+2)+'px';}
function syncSentence(){sentencePlaceholder.hidden=!byId('sentence-panel').hidden;requestAnimationFrame(fitSentence);}
byId('sentence').addEventListener('input',fitSentence);window.addEventListener('resize',fitSentence);
new MutationObserver(syncSentence).observe(byId('sentence-panel'),{attributes:true,attributeFilter:['hidden']});syncSentence();
const chooseAgain=document.createElement('button');chooseAgain.id='choose-again';chooseAgain.type='button';chooseAgain.textContent='← 다른 답 고르기';
chooseAgain.onclick=()=>setExerciseStage('choose');byId('sentence-panel').append(chooseAgain);
export function setExerciseStage(stage){document.body.dataset.exerciseStage=stage;requestAnimationFrame(fitSentence);}
