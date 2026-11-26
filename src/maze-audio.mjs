/** New procedural audio. Contains no Seedling recordings or compositions.
 * The audio context is created only on an explicit user-initiated activation.
 */
export const AUDIO_SETTINGS_KEY="maze-repropagation.audio.v1";
const MOTIFS=Object.freeze({
  adventure:{wave:"triangle",notes:[45,48,52,50,43,48,55,50],duration:.76,interval:1120,level:.07},
  hedge:{wave:"sine",notes:[69,74,76,71,79,74,72,76],duration:1.15,interval:1370,level:.055},
  marble_maze:{wave:"triangle",notes:[60,67,64,72,67,62,69,64],duration:.36,interval:870,level:.055},
  space:{wave:"sine",notes:[40,47,52,45,38,45,50,43],duration:2.85,interval:1980,level:.07}
});
export function audioPreferences(saved){
  let data={};
  try{data=typeof saved==="string"?JSON.parse(saved):saved??{}}catch{return {music:true,effects:true};}
  if(!data||typeof data!=="object"||Array.isArray(data))data={};
  return {music:data.music!==false,effects:data.effects!==false};
}
export function ambientEvent(theme,index){
  const m=MOTIFS[theme]??MOTIFS.marble_maze;
  const i=Number.isFinite(index)?Math.max(0,Math.floor(index)):0;
  return {midi:m.notes[i%m.notes.length],wave:m.wave,duration:m.duration,
    intervalMs:m.interval,level:m.level};
}
export function cueForTransition(previous,next){
  if(!previous||!next)return null;
  if(!previous.ended&&next.ended){
    if(next.won)return "win";
    if(/shadow/i.test(next.message??""))return "shadow";
    if(/hole/i.test(next.message??""))return "hole";
    return "loss";
  }
  if((next.keys?.length??0)>(previous.keys?.length??0))return "key";
  if((next.solvedRiddles?.length??0)>(previous.solvedRiddles?.length??0))return "riddleSolved";
  if(next.passageLatch&&next.passageLatch!==previous.passageLatch)return "passage";
  if(next.remaining-previous.remaining>10)return "timeBonus";
  if(previous.remaining-next.remaining>10)return "timePenalty";
  if((previous.boostUntil??0)<=0&&(next.boostUntil??0)>0)return "speed";
  if(next.message!==previous.message){
    if(/^Opened gate/.test(next.message??""))return "gate";
    if(next.pendingRiddle&&!previous.pendingRiddle)return "riddlePrompt";
  }
  return null;
}
const EFFECTS=Object.freeze({
  key:[60,67,76],gate:[47,59],passage:[71,64,57,76],
  riddlePrompt:[61,66],riddleSolved:[64,69,76],speed:[60,65,72],
  timeBonus:[60,64,69],timePenalty:[57,52,47],
  win:[60,64,67,72,76],loss:[55,50,43],hole:[55,47,38],shadow:[47,46,35]
});
export const effectNotes=name=>EFFECTS[name]?[...EFFECTS[name]]:[];
export const midiFrequency=midi=>440*Math.pow(2,(midi-69)/12);
export function createMazeAudio(createContext=()=>{
  const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;
  if(!Audio)throw Error("Browser audio unavailable");
  return new Audio();
}){
  let context=null,output=null,timer=null,enabled=false,desired=false,generation=0;
  let theme="marble_maze",beat=0,settings={music:true,effects:true};
  function voice(midi,delay,duration,level,wave){
    if(!context||context.state!=="running")return;
    const when=context.currentTime+Math.max(0,delay);
    const oscillator=context.createOscillator(),envelope=context.createGain();
    oscillator.type=wave;
    oscillator.frequency.setValueAtTime(midiFrequency(midi),when);
    envelope.gain.setValueAtTime(.0001,when);
    envelope.gain.exponentialRampToValueAtTime(level,when+.035);
    envelope.gain.exponentialRampToValueAtTime(.0001,when+duration);
    oscillator.connect(envelope);envelope.connect(output);
    oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();};
    oscillator.start(when);oscillator.stop(when+duration+.02);
  }
  function clearMusic(){if(timer!==null){clearInterval(timer);timer=null;}}
  function pulse(){
    if(!enabled||!settings.music)return;
    const event=ambientEvent(theme,beat++);
    voice(event.midi,0,event.duration,event.level,event.wave);
    if(theme==="space")voice(event.midi+7,.12,event.duration*.92,.033,"sine");
  }
  function startMusic(){
    clearMusic();
    if(!enabled||!settings.music)return;
    pulse();timer=setInterval(pulse,ambientEvent(theme,0).intervalMs);
  }
  async function activate(nextTheme=theme){
    theme=MOTIFS[nextTheme]?nextTheme:"marble_maze";
    desired=true;const request=++generation;
    try{
      if(!context){
        context=createContext();output=context.createGain();
        output.gain.value=.16;output.connect(context.destination);
      }
      if(context.state!=="running")await context.resume();
      if(request!==generation||!desired)return false;
      enabled=context.state==="running";startMusic();return enabled;
    }catch{
      enabled=false;desired=false;clearMusic();return false;
    }
  }
  function pause(){
    generation++;enabled=false;clearMusic();
    if(context?.state==="running")void context.suspend().catch(()=>{});
  }
  function deactivate(){desired=false;pause();}
  function setOptions(next){
    settings=audioPreferences(next);if(enabled)startMusic();return {...settings};
  }
  function playCue(name){
    if(!enabled||!settings.effects)return false;
    const notes=effectNotes(name);
    notes.forEach((midi,i)=>voice(midi,i*.11,.28+i*.03,.12-i*.009,
      name==="shadow"||name==="hole"?"sawtooth":"sine"));
    return notes.length>0;
  }
  return {activate,pause,deactivate,setOptions,playCue,
    noteTransition(before,after){return playCue(cueForTransition(before,after));},
    isActive(){return enabled&&context?.state==="running";},
    wantsAudio(){return desired;},
    options(){return {...settings};}};
}
