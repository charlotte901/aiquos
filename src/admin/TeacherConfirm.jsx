import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function useTeacherConfirm(){
 const [pending,setPending]=useState(null);const resolve=useRef(null);const cancel=useRef(null);
 const finish=value=>{resolve.current?.(value);resolve.current=null;setPending(null)};
 useEffect(()=>{if(!pending)return;const previous=document.activeElement;cancel.current?.focus();const key=e=>{if(e.key==='Escape')finish(false);if(e.key==='Tab'){const buttons=[...document.querySelectorAll('.teacher-confirm button')];const next=buttons[(buttons.indexOf(document.activeElement)+(e.shiftKey?-1:1)+buttons.length)%buttons.length];e.preventDefault();next?.focus();}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()};},[pending]);
 useEffect(()=>()=>resolve.current?.(false),[]);
 const confirm=message=>new Promise(done=>{resolve.current=done;setPending(message)});
 const dialog=pending&&createPortal(<div className="drawer-overlay" onClick={e=>{if(e.target===e.currentTarget)finish(false)}}><section className="edit-dialog teacher-confirm" role="alertdialog" aria-modal="true" aria-labelledby="teacher-confirm-title" aria-describedby="teacher-confirm-message"><header><h2 id="teacher-confirm-title">请确认操作</h2></header><div className="edit-body" id="teacher-confirm-message" style={{whiteSpace:'pre-wrap'}}>{pending}</div><footer><div><button ref={cancel} className="is-ghost" onClick={()=>finish(false)}>取消</button><button onClick={()=>finish(true)}>确认</button></div></footer></section></div>,document.body);
 return {confirm,dialog};
}
