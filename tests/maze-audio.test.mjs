import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {audioPreferences,ambientEvent,cueForTransition,effectNotes,midiFrequency,
  createMazeAudio,shadowAcoustics} from "../src/maze-audio.mjs";

test("sound preferences reject malformed storage and keep independent controls",()=>{
  assert.deepEqual(audioPreferences(null),{music:true,effects:true,volume:1});
  assert.deepEqual(audioPreferences("{"),{music:true,effects:true,volume:1});
  assert.deepEqual(audioPreferences('{"music":false,"effects":true}'),{music:false,effects:true,volume:1});
});
test("four distinct composed soundscapes have bounded pitches, envelopes and timing",()=>{
  const themes=["adventure","hedge","marble_maze","space"];
  const motifs=themes.map(t=>Array.from({length:8},(_,i)=>ambientEvent(t,i)));
  assert.equal(new Set(motifs.map(m=>m.map(x=>x.midi).join(","))).size,4);
  for(const notes of motifs)for(const n of notes){
    assert.ok(n.midi>=35&&n.midi<=85);
    assert.ok(n.duration>.1&&n.duration<4);
    assert.ok(n.level>0&&n.level<.15);
    assert.ok(n.intervalMs>=800&&n.intervalMs<=2500);
  }
  assert.equal(ambientEvent("invalid",0).midi,ambientEvent("marble_maze",0).midi);
  assert.equal(midiFrequency(69),440);
});
test("event sounds fire only when run state changes",()=>{
  const s={ended:false,won:false,keys:[],solvedRiddles:[],remaining:300,
    boostUntil:0,passageLatch:null,message:"Find the exit."};
  const cases=[
    [{...s,keys:["A"]},"key"],[{...s,solvedRiddles:["2,3"]},"riddleSolved"],
    [{...s,passageLatch:"7,7"},"passage"],[{...s,remaining:330},"timeBonus"],
    [{...s,remaining:270},"timePenalty"],[{...s,boostUntil:25},"speed"],[{...s,slowUntil:12},"slow"],
    [{...s,message:"Opened gate A"},"gate"],
    [{...s,message:"Answer the riddle",pendingRiddle:{}},"riddlePrompt"],
    [{...s,ended:true,won:true},"win"],
    [{...s,ended:true,message:"A shadow caught you"},"shadow"],
    [{...s,ended:true,message:"Fell into a physical hole"},"hole"],
    [{...s,ended:true,message:"Time is up"},"loss"]
  ];
  for(const [next,wanted] of cases){
    assert.equal(cueForTransition(s,next),wanted);
    assert.equal(cueForTransition(next,next),null);
    assert.ok(effectNotes(wanted).length>0);
  }
  assert.deepEqual(effectNotes("nonexistent"),[]);
});
test("no AudioContext until explicit activation; transport pauses and respects mute",async()=>{
  let created=0,oscillators=0;
  const ctx={state:"suspended",currentTime:0,destination:{},
    createGain(){return {gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
      connect(){},disconnect(){}};},
    createOscillator(){oscillators++;return {frequency:{setValueAtTime(){}},
      connect(){},disconnect(){},start(){},stop(){}};},
    async resume(){this.state="running";},
    async suspend(){this.state="suspended";}
  };
  const audio=createMazeAudio(()=>{created++;return ctx;});
  audio.setOptions({music:false,effects:true,volume:1});
  assert.equal(created,0);
  assert.equal(audio.playCue("key"),false);
  assert.equal(created,0);
  assert.equal(await audio.activate("hedge"),true);
  assert.equal(audio.playCue("key"),true);
  assert.equal(oscillators,3);
  audio.setOptions({music:false,effects:false});
  assert.equal(audio.playCue("key"),false);
  audio.pause();assert.equal(audio.isActive(),false);
  assert.equal(audio.wantsAudio(),true);
  assert.equal(await audio.activate("hedge"),true);
  audio.deactivate();assert.equal(audio.wantsAudio(),false);
});
test("shadow proximity gives directional, distance-scaled warnings and respects pauses",()=>{
  const s={x:5,z:5,heading:0,shadows:[{x:5,z:7}]};
  const right=shadowAcoustics(s);
  assert.equal(right.pan,1);
  assert.equal(shadowAcoustics({...s,shadows:[{x:5,z:3}]}).pan,-1);
  assert.equal(shadowAcoustics({...s,shadows:[{x:7,z:5}]}).pan,0);
  const far=shadowAcoustics({...s,shadows:[{x:5,z:11}]});
  assert.ok(right.level>far.level&&right.interval<far.interval);
  for(const other of [{...s,pendingPhoto:{}},{...s,pendingRiddle:{}},
    {...s,ended:true},{...s,shadows:[]},{...s,shadows:[{x:NaN,z:4}]},
    {...s,shadows:[{x:5,z:14}]}])
    assert.equal(shadowAcoustics(other),null);
});
test("spatial sound is opt-in, rate-limited and respects volume and mute",async()=>{
  const gains=[],pans=[],oscillators=[];
  const ctx={state:"suspended",currentTime:0,destination:{},
    createGain(){
      const n={gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
        connect(){},disconnect(){}};gains.push(n);return n;
    },
    createStereoPanner(){return {pan:{setValueAtTime(v){pans.push(v);}},
      connect(){},disconnect(){}};},
    createOscillator(){
      const n={frequency:{setValueAtTime(){}},connect(){},disconnect(){},
        start(){},stop(){}};oscillators.push(n);return n;
    },
    async resume(){this.state="running";},
    async suspend(){this.state="suspended";}
  };
  const a=createMazeAudio(()=>ctx),s={x:2,z:2,heading:0,shadows:[{x:2,z:4}]};
  a.setOptions({music:false,effects:true,volume:.4});
  assert.equal(a.updateScene(s),false);
  assert.equal(await a.activate("hedge"),true);
  assert.ok(Math.abs(gains[0].gain.value-.064)<1e-9);
  assert.equal(a.updateScene(s),true);
  assert.deepEqual(pans,[1,1]);
  assert.equal(oscillators.length,2);
  assert.equal(a.updateScene(s),false);
  ctx.currentTime=3;
  assert.equal(a.updateScene(s),true);
  assert.equal(oscillators.length,4);
  assert.equal(a.updateScene({...s,pendingPhoto:{}}),false);
  assert.equal(a.updateScene(s),true);
  a.setOptions({music:false,effects:false,volume:0});
  assert.equal(gains[0].gain.value,0);
  assert.equal(a.updateScene(s),false);
  a.pause();assert.equal(a.updateScene(s),false);
  a.deactivate();
});
test("sound controls and offline resource are wired into the published application",async()=>{
  const page=await readFile(new URL("../index.html",import.meta.url),"utf8");
  const app=await readFile(new URL("../src/app.mjs",import.meta.url),"utf8");
  const sw=await readFile(new URL("../sw.js",import.meta.url),"utf8");
  for(const id of ["soundButton","audioDialog","musicOption","effectsOption",
    "audioToggleButton","audioStatus"])assert.ok(page.includes('id="'+id+'"'));
  assert.match(app,/audio\.noteTransition\(before,play\)/);
  assert.match(app,/initializeAudio\(\)/);
  assert.match(app,/audio\.updateScene\(play\)/);
  for(const id of ["volumeOption","volumeReadout"])
    assert.ok(page.includes('id="'+id+'"'));
  assert.match(sw,/\.\/src\/maze-audio\.mjs/);
});
