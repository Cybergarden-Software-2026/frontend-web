import {useEffect,useRef,useState} from 'react';
export function QrScanner({onCode,onClose}:{onCode:(code:string)=>void;onClose:()=>void}){
 const video=useRef<HTMLVideoElement>(null),[error,setError]=useState('');const code=useRef(onCode);code.current=onCode;
 useEffect(()=>{let stream:MediaStream|null=null,stopped=false,timer:ReturnType<typeof setTimeout>;
  async function start(){try{
   const {default:jsQR}=await import('jsqr');
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:720}},audio:false});
   if(stopped){stream.getTracks().forEach(t=>t.stop());return}
   const el=video.current!;el.srcObject=stream;await el.play();const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
   function scan(){if(stopped)return;if(el.readyState>=2&&el.videoWidth){canvas.width=Math.min(el.videoWidth,960);canvas.height=Math.round(el.videoHeight*canvas.width/el.videoWidth);ctx.drawImage(el,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height),result=jsQR(image.data,image.width,image.height,{inversionAttempts:'dontInvert'});if(result?.data){stopped=true;stream?.getTracks().forEach(t=>t.stop());code.current(result.data);return}}timer=setTimeout(scan,200)}scan();
  }catch{if(!stopped)setError('Камера недоступна. Разрешите доступ или вставьте текст QR-кода вручную.')}}void start();
  return()=>{stopped=true;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop())};
 },[]);
 return <div className="scanner" role="dialog" aria-modal="true" aria-labelledby="scan-title"><div className="scanner-panel"><button className="close" aria-label="Закрыть камеру" onClick={onClose}>×</button><h2 id="scan-title">Наведите камеру на QR</h2><p>Найдите QR-код под меню основного сайта</p><div className="camera"><video ref={video} playsInline muted/><span className="scan-frame"/></div>{error&&<p className="error" role="alert">{error}</p>}<button className="button outline" onClick={onClose}>Ввести код вручную</button></div></div>;
}
