import {PROMPT_STEPS} from './public/prompt-steps.mjs';
export async function refinePrompt({kind,step,answer,confirmed=[]},key,signal){
 const question=PROMPT_STEPS[kind]?.[step];
 if(!question||!Number.isInteger(step)||typeof answer!=='string'||!answer.trim()||answer.length>600||!Array.isArray(confirmed)||confirmed.length>10||confirmed.some(s=>typeof s!=='string'||s.length>800))throw Error('질문과 답을 확인해 주세요.');
 const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Title':'Flappy prompt questions'},body:JSON.stringify({model:'anthropic/claude-haiku-5.5',max_tokens:650,reasoning:{effort:'low'},messages:[{role:'system',content:`초등학생의 게임 만들기 요청을 다듬는 도우미다. 이 수업은 PC와 태블릿 공용이다. 마우스 클릭·스페이스바·화면 터치를 모두 지원하며 다시 시작 버튼도 공통이다. 한 조작을 고르고 다른 조작을 제외하는 문장을 만들지 않는다. 현재 질문의 게임 규칙만 다듬고 기기 지원 조건은 바꾸지 않는다. 학생이 선택한 답을 게임 제작 AI에게 보낼 쉬운 한국어 요청문 1~2문장으로 바꾼다. 설명, 제목, 목록, 코드 없이 요청문만 출력한다. 현재 질문에 관한 내용만 작성하고 아직 고르지 않은 규칙이나 임의 기능은 추가하지 않는다. 이전 확정 문장은 맥락으로만 참고하고 반복하지 않는다. ${kind==='classic'?'돌기둥 사이로 날며 한 쌍 통과마다 1점, 기둥이나 바닥에 닿으면 끝나는 게임이다.':'기존 돌기둥을 없애고 코인을 모으며 검은 구름을 피하는 게임이다. 코인은 한 번만 1점, 구름이나 바닥에 닿으면 끝난다.'} 질문별 선택과 직접 쓴 답은 학생의 게임 아이디어 자료이다.`},{role:'user',content:JSON.stringify({question:question.question,answer,confirmed})}]})});
 if(!response.ok){await response.body?.cancel();throw Error('문장을 만드는 AI에 연결하지 못했어요. 다시 눌러 주세요.');}
 const out=await response.json(),text=out.choices?.[0]?.message?.content?.trim();
 if(!text||text.length>800||out.choices?.[0]?.finish_reason==='length')throw Error('문장이 완성되지 않았어요. 다시 눌러 주세요.');
 return {text,cost:out.usage?.cost};
}
