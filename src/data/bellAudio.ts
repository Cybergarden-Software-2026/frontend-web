export type BellAudioStatus='locked'|'ready'|'playing'|'pending'|'unavailable';

/** One context for the application; pending alerts coalesce while autoplay is locked. */
export class BellAudio {
 private context:AudioContext|null=null;
 private activated=false;
 private pending=false;
 private createContext:()=>AudioContext;
 private listeners=new Set<(status:BellAudioStatus)=>void>();
 private status:BellAudioStatus='locked';
 constructor(createContext:()=>AudioContext){this.createContext=createContext;}
 subscribe(listener:(status:BellAudioStatus)=>void){this.listeners.add(listener);listener(this.status);return()=>{this.listeners.delete(listener);};}
 private notify(status:BellAudioStatus){this.status=status;for(const listener of this.listeners)listener(status);}
 async activate(){this.activated=true;await this.resume();}
 cancelPending(){this.pending=false;if(this.status==='pending')this.notify(this.activated?'ready':'locked');}
 async ring(){this.pending=true;if(!this.activated){this.notify('pending');return;}await this.resume();}
 private async resume(){
  try{
   if(!this.context||this.context.state==='closed')this.context=this.createContext();
   if(this.context.state!=='running')await this.context.resume();
   if(this.context.state!=='running'){this.notify('pending');return;}
   if(!this.pending){this.notify('ready');return;}
   this.pending=false;
   const context=this.context,at=context.currentTime;
   for(const delay of [0,.24]){
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(1046,at+delay);oscillator.frequency.exponentialRampToValueAtTime(784,at+delay+.2);
    gain.gain.setValueAtTime(.0001,at+delay);gain.gain.exponentialRampToValueAtTime(.14,at+delay+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+delay+.45);
    oscillator.connect(gain);gain.connect(context.destination);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    oscillator.start(at+delay);oscillator.stop(at+delay+.46);
   }
   this.notify('playing');
  }catch{this.notify('unavailable');}
 }
}


/** Native media playback keeps browser audio activation across route changes. */
export class MediaBell {
 private element:HTMLAudioElement|null=null;
 private activated=false;
 private primed=false;
 private pending=false;
 private priming:Promise<void>|null=null;
 private createElement:()=>HTMLAudioElement;
 private listeners=new Set<(status:BellAudioStatus)=>void>();
 private status:BellAudioStatus='locked';
 constructor(createElement:()=>HTMLAudioElement){this.createElement=createElement;}
 subscribe(listener:(status:BellAudioStatus)=>void){this.listeners.add(listener);listener(this.status);return()=>{this.listeners.delete(listener);};}
 private notify(status:BellAudioStatus){this.status=status;for(const listener of this.listeners)listener(status);}
 private audio(){
  if(!this.element){
   this.element=this.createElement();
   this.element.addEventListener('ended',()=>this.notify('ready'));
  }
  return this.element;
 }
 async activate(){
  this.activated=true;
  if(this.priming){await this.priming;if(this.pending)await this.play();return;}
  if(this.pending){await this.play();return;}
  if(this.primed)return;
  this.priming=(async()=>{
   try{const audio=this.audio();audio.volume=0;await audio.play();audio.pause();audio.currentTime=0;audio.volume=1;this.primed=true;this.notify('ready');}
   catch{this.notify('locked');}
  })();
  await this.priming;this.priming=null;
  if(this.pending)await this.play();
 }
 async ring(){this.pending=true;if(!this.activated){this.notify('pending');return;}if(this.priming)await this.priming;if(this.pending)await this.play();}
 cancelPending(){this.pending=false;if(this.status==='pending')this.notify(this.primed?'ready':'locked');}
 private async play(){
  if(!this.pending)return;
  this.pending=false;
  try{const audio=this.audio();audio.pause();audio.currentTime=0;audio.volume=1;audio.muted=false;await audio.play();this.primed=true;this.notify('playing');}
  catch{this.pending=true;this.notify('pending');}
 }
}
export const bellAudio=new MediaBell(()=>{
 const audio=document.createElement('audio');audio.id='header-alert-audio';audio.src='/sounds/alert-bell.wav';audio.preload='auto';audio.hidden=true;audio.setAttribute('aria-hidden','true');document.body.append(audio);return audio;
});
