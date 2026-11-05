// One browser-owned post shared by the lesson and the board upload screen.
const flappyBoardClient=(()=>{
 let item=null;
 async function request(path,options={}){const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const data=await response.json();if(!response.ok)throw Error(data.error||'게시판 연결을 확인해 주세요.');return data;}
 function lock(run){if(!navigator.locks?.request)return Promise.reject(Error('최신 Chrome 또는 Edge에서 게시해 주세요.'));return navigator.locks.request('flappy-board-session-v1',run);}
 async function sync(){const data=await request('/api/board/mine');item=data.item;return item;}
 return {current:()=>item,refresh:()=>lock(sync),save:values=>lock(async()=>{await sync();const data=await request('/api/board',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});item=data.item;return data;})};
})();
