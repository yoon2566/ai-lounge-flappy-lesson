import vm from 'node:vm';
import {readCompletionStream} from './openrouter-stream.mjs';
export const COURSE_PROMPTS={
 classic:'화면을 누르거나 스페이스바를 누르면 새가 위로 날고, 누르지 않으면 아래로 내려가는 게임을 만들어 줘. 오른쪽에서 위아래 돌기둥이 다가오고, 새는 기둥 사이를 통과해야 해. 기둥 한 쌍을 지나면 1점이야. 기둥이나 바닥에 닿으면 게임이 끝나고 다시 시작할 수 있게 해 줘.',
 variant:'내가 만든 게임을 바꿔 줘. 돌기둥을 없애고, 오른쪽에서 코인과 작은 검은 구름이 다가오게 해 줘. 코인에 닿으면 코인이 사라지고 정확히 한 번 1점 올라가. 검은 구름이나 바닥에 닿으면 게임이 끝나. 새가 날아가는 조작은 그대로 두고, 다시 시작하면 점수와 코인과 구름을 초기화해 줘.'
};
export async function generateCourse({kind,prompt,previous},key,signal,onResponse=()=>{},onDelta=null){
 if(!Object.hasOwn(COURSE_PROMPTS,kind)||typeof prompt!=='string'||!prompt.trim()||prompt.length>10000)throw Error('만들 게임과 요청문을 확인해 주세요.');
 if(kind==='variant'&&(typeof previous!=='string'||!previous.includes('__FLAPPY_CONFIG__')||previous.length>180000))throw Error('먼저 돌기둥 게임을 코드로 만들어 주세요.');
 const system=`초등학생 플래피 게임 수업의 코딩 도우미. 요청을 실행 가능한 독립 HTML 전체 하나로 구현하고 html 코드블록으로 반환한다. Canvas 320x525 세로 화면, 화면 크기 대응, 스페이스/터치, 점수, 시작, 게임오버, 재시작을 구현한다. 그림은 직접 Canvas 도형으로 그린다. 외부 라이브러리/통신 없이 sandbox allow-scripts, 로컬파일에서 동작한다.
현재 단계: ${kind==='classic'?'원본 돌기둥 게임. 기둥 통과만 1점이다. 코인·아이템·검은 구름 장애물·보너스 점수는 절대 추가하지 않는다. 아래 설정 중 item과 magnet은 다음 변형 단계용 연결 규약일 뿐, 원본에서는 사용하지 않는다.':'코인 게임으로 변형. 기둥과 기둥 통과 점수는 완전히 없애고 코인 획득으로만 1점. 검은 구름과 바닥 충돌. 앞 단계 코드의 조작을 유지한다.'}
필수 연결 규약: <script>window.FLAPPY_CONFIG=__FLAPPY_CONFIG__;</script>를 정확히 한 번 넣어라. 이 자리표시자는 수업 앱이 JSON으로 채운다. const config=window.FLAPPY_CONFIG||{} 를 읽고 speed(기본1), lives(기본1), sound(기본true), ability(none/shield/magnet), jump(기본1), interval(기본0.3초) 값을 적용한다. lives는 충돌 때 1 차감하고 1.2초 무적시간, 0이면 종료. 기본값은 목숨1이므로 구름/바닥 즉시종료. shield는 시작할 때 1회 보호, magnet은 가까운 코인을 끌어온다. canvas id=game, 상태 표시 id=status data-state=ready/playing/dead 를 둔다.
이미지 적용 규약: config.assets는 frame1,frame2,background,item,obstacle의 이미지 주소 또는 data URL 문자열이다. 각 Image 객체를 로드하고 로드 성공 시 해당 이미지로 기본 도형을 대신 그린다. 미지정/로드실패 시 기본 도형으로 그린다. frame1/frame2는 정사각형 개별 그림이며 config.interval초마다 번갈아 표시한다. background는 배경, item은 코인 대신, obstacle은 장애물 대신 실제 Canvas에 그린다. 색상 변수에 URL을 쓰지 마라. 임의로 네트워크 API를 호출하지 말고 주어진 이미지 주소만 읽어라.
부모 window에서 온 {channel:'flappy-lesson',command:'tap'|'restart'|'pause'|'resume'} 메시지를 조작에 연결한다. tap은 준비/종료상태에서는 시작, 비행중이면 상승. restart는 초기화. pause/resume은 게임시간과 루프를 중복 없이 멈춤/재개. parent.postMessage({channel:'flappy-state',state:'ready'|'playing'|'dead',score},'*')로 상태를 알린다. HTML과 코드에 위 필수연결을 생략하지 말고 완성된 게임을 반환한다.`;
 const upstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Title':'Flappy local learning sequence'},body:JSON.stringify({model:'anthropic/claude-haiku-5.5',messages:[{role:'system',content:system},{role:'user',content:prompt+(kind==='variant'?'\n\n내가 앞 단계에서 만든 게임 코드:\n'+previous:'')}],max_tokens:20000,reasoning:{effort:'low'},stream:!!onDelta})});
 if(!upstream.ok){await upstream.body?.cancel();throw Error('게임을 만드는 AI 연결에 실패했어요. ('+upstream.status+')');}
 const out=onDelta?await readCompletionStream(upstream.body,onDelta):await upstream.json(),text=out.choices?.[0]?.message?.content||'',template=text.match(/```html\s*([\s\S]*?)```/i)?.[1]||text;onResponse({responseId:out.id,finishReason:out.choices?.[0]?.finish_reason,cost:out.usage?.cost,template});
 if(!/<html/i.test(template)||!/<\/html>/i.test(template)||(template.match(/__FLAPPY_CONFIG__/g)||[]).length!==1||!template.includes('flappy-lesson'))throw Error('게임 코드가 완성되지 않았어요. 이전 결과를 유지하고 다시 시도해 주세요.');
 for(const m of template.replace('__FLAPPY_CONFIG__','{}').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
 return {template,cost:out.usage?.cost};
}
