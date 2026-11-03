export const DEVICE_PROMPT='PC와 태블릿에서 모두 할 수 있게 만들어 줘. PC에서는 마우스로 게임 화면을 클릭하거나 스페이스바를 누르고, 태블릿에서는 게임 화면을 터치하면 시작하고 날아가게 해 줘. 다시 시작 버튼도 두 기기에서 모두 쓸 수 있게 해 줘. 화면 크기와 가로·세로 방향이 바뀌어도 게임 비율과 버튼 크기를 유지해 줘.';
export const DEVICE_CODE_RULES=`PC·태블릿 공통 지원은 학생의 선택과 무관한 필수 조건이다. 마우스 클릭, 터치, 스페이스바를 모두 지원하고 이전 코드나 요청에 특정 기기만 적혀 있어도 다른 입력을 제거하지 않는다. Canvas의 pointerdown 하나로 마우스/펜/터치를 처리하고 중복된 touchstart/click 핸들러로 한 번 입력이 두 번 적용되지 않게 한다. 게임 영역에는 touch-action:none을 적용하며 페이지의 다른 영역은 정상 스크롤한다. Space는 preventDefault하고 key repeat와 입력칸/편집영역에서의 입력은 무시한다. 시작/날기/재시작은 입력 방식과 관계없이 같은 함수를 사용한다. 종료 후에는 클릭·터치 가능한 '다시 시작' 버튼을 항상 표시하고, 학생이 고른 준비 안내/카운트다운은 이 버튼을 누른 다음에 보여 준다. 버튼은 최소 44x44 CSS px로 만들고 게임 영역 안의 HTML overlay로 배치해 작은 화면에서도 가려지지 않게 한다. HTML을 별도로 내려받아 열어도 세 입력과 다시 시작이 동작해야 한다. 화면 회전/크기 변경 시 canvas의 가로세로 비율을 유지한다.`;

export function withDeviceSupportPrompt(text){
 const clean=String(text||'').trim();
 return clean.includes(DEVICE_PROMPT)?clean:clean+'\n\n공통 조작\n'+DEVICE_PROMPT;
}

// Keep unrelated answers and generated games. Archive the two obsolete choices.
export function migratePromptWizard(saved,kind){
 const wizard=structuredClone(saved);
 if(wizard.deviceVersion===1)return {wizard,changed:false};
 if(kind==='classic'){
  wizard.previousDeviceChoices={first:wizard.entries[0],last:wizard.entries[9],finalText:wizard.finalText};
  for(const i of [0,9])wizard.entries[i]={answer:'',text:'',confirmed:false};
  wizard.index=0;wizard.review=false;wizard.finalText='';wizard.signature='';
 }
 wizard.deviceVersion=1;
 if(wizard.finalText)wizard.finalText=withDeviceSupportPrompt(wizard.finalText);
 return {wizard,changed:true};
}
