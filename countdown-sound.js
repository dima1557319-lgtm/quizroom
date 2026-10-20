// One clock per player view, regardless of the number of question cards.
export class CountdownSound {
 constructor({context=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),now=()=>Date.now()}={}){this.createContext=context;this.now=now;this.enabled=true;this.next=0;this.stage=null;}
 unlock(){if(!this.enabled)return;try{this.audio||=this.createContext();void this.audio.resume()?.catch(()=>{});}catch{/* Browsers without Web Audio keep the visual timer. */}}
 toggle(){this.enabled=!this.enabled;this.next=0;if(this.enabled)this.unlock();return this.enabled;}
 update({remaining,stage,active,visible}){
  if(stage!==this.stage){this.stage=stage;this.next=0;}
  if(!this.enabled||!active||!visible||remaining<=0||remaining>10||this.audio?.state!=='running'){this.next=0;return;}
  const now=this.now();if(now<this.next)return;
  // Accelerate from one tick per second to four ticks per second.
  this.next=now+250+750*(remaining-1)/9;
  try{const at=this.audio.currentTime,osc=this.audio.createOscillator(),gain=this.audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(1200,at);osc.frequency.exponentialRampToValueAtTime(450,at+.035);gain.gain.setValueAtTime(.055,at);gain.gain.exponentialRampToValueAtTime(.001,at+.045);osc.connect(gain);gain.connect(this.audio.destination);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+.05);}catch{}
 }
}
