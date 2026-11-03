import test from 'node:test';
import assert from 'node:assert/strict';
import {DEVICE_PROMPT,withDeviceSupportPrompt,migratePromptWizard} from './public/device-support.mjs';
import {generateCourse} from './course-api.mjs';

const saved=()=>({index:9,review:true,finalText:'학생이 직접 수정한 최종 문장',signature:'old',entries:Array.from({length:10},(_,i)=>({answer:'답 '+i,text:'문장 '+i,confirmed:true}))});

test('예전 조작 선택만 다시 묻고 다른 답과 수정한 원문은 보존한다',()=>{
 const original=saved(),{wizard,changed}=migratePromptWizard(original,'classic');
 assert.equal(changed,true);assert.equal(wizard.index,0);assert.equal(wizard.review,false);
 assert.deepEqual(wizard.entries.slice(1,9),original.entries.slice(1,9));
 assert.equal(wizard.entries.filter(e=>e.confirmed).length,8);
 assert.deepEqual(wizard.previousDeviceChoices.first,original.entries[0]);
 assert.deepEqual(wizard.previousDeviceChoices.last,original.entries[9]);
 assert.equal(wizard.previousDeviceChoices.finalText,original.finalText);
 assert.deepEqual(original,saved());
});
test('새로 답한 내용은 새로고침해도 다시 지우지 않는다',()=>{
 const {wizard}=migratePromptWizard(saved(),'classic');
 wizard.entries[0]={answer:'힘차게',text:'높이 올라가게 해 줘',confirmed:true};
 const again=migratePromptWizard(wizard,'classic');
 assert.equal(again.changed,false);assert.deepEqual(again.wizard,wizard);
});
test('변형의 기존 답과 최종 문장을 보존하고 공통 조작은 한 번만 붙인다',()=>{
 const original=saved(),{wizard}=migratePromptWizard(original,'variant');
 assert.deepEqual(wizard.entries,original.entries);assert.equal(wizard.review,true);
 assert.ok(wizard.finalText.startsWith(original.finalText));
 const twice=withDeviceSupportPrompt(withDeviceSupportPrompt(wizard.finalText));
 assert.equal(twice.split(DEVICE_PROMPT).length,2);
});
test('기기 한정 요청이어도 생성 AI에 PC와 태블릿을 필수 조건으로 전달한다',async t=>{
 let sent;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  sent=JSON.parse(options.body);
  return {ok:true,json:async()=>({choices:[{message:{content:'<html><body><script>window.FLAPPY_CONFIG=__FLAPPY_CONFIG__;/* flappy-lesson */</script></body></html>'}}],usage:{cost:0}})};
 });
 await generateCourse({kind:'classic',prompt:'스페이스바로만 날게 해 줘'},'test-key');
 const system=sent.messages.find(m=>m.role==='system').content;
 for(const part of ['PC·태블릿 공통 지원','마우스 클릭, 터치, 스페이스바를 모두 지원','pointerdown','44x44','별도로 내려받아'])assert.ok(system.includes(part),part);
});
