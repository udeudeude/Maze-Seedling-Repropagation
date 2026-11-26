import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newMaze,paintTile,primaryCell,changeCellDetails,transferTile} from "../src/maze-world.mjs";
import {startPlay,collectAt,tickPlayer,advanceShadows,movePlayer,dismissPhoto} from "../src/maze-play.mjs";
import {voiceAt,voiceEdit,voiceDataUrl,preferredVoiceMime,createVoiceRecorder,MAX_VOICE_DATA_URL_LENGTH} from "../src/maze-voice.mjs";
const mp4="data:audio/mp4;base64,AAAA",webm="data:audio/webm;base64,AQID";
const photo="data:image/jpeg;base64,/9j/4AAQ";
test("voice URLs must be bounded, local, correctly encoded audio",()=>{
  assert.equal(voiceDataUrl(mp4),mp4);
  assert.equal(voiceDataUrl(webm),webm);
  for(const bad of ["https://example.test/a.mp4","data:text/html;base64,PGgxPg==",
    "data:audio/wav;base64,AAAA","data:audio/mp4;base64,abc",
    "data:audio/mp4;base64,"+"A".repeat(MAX_VOICE_DATA_URL_LENGTH)])
    assert.equal(voiceDataUrl(bad),null);
  assert.equal(voiceAt({type:"wall",repropagation:{voice:{dataUrl:mp4}}}),null);
  assert.throws(()=>voiceEdit({}, "https://example.test/a"),TypeError);
});
test("format detection adapts to Safari or WebM recording availability",()=>{
  assert.equal(preferredVoiceMime({isTypeSupported:t=>t==="audio/mp4"}),"audio/mp4");
  assert.equal(preferredVoiceMime({isTypeSupported:t=>t==="audio/webm;codecs=opus"}),"audio/webm;codecs=opus");
  assert.equal(preferredVoiceMime({isTypeSupported:()=>false}),null);
  assert.equal(preferredVoiceMime(null),null);
});
test("voice edit is reversible, portable and preserves native/unknown metadata",()=>{
  let maze=paintTile(newMaze(),3,4,"info");
  const original=primaryCell(maze,3,4).cell;
  original.audioPath="native/audio";original.repropagation={other:42,photo:{dataUrl:photo},voice:{unknown:true}};
  maze=changeCellDetails(maze,3,4,voiceEdit(original,mp4));
  const edited=primaryCell(maze,3,4).cell;
  assert.equal(voiceAt(edited),mp4);
  assert.equal(edited.audioPath,"native/audio");
  assert.equal(edited.repropagation.photo.dataUrl,photo);
  assert.equal(edited.repropagation.voice.unknown,true);
  assert.equal(voiceAt(primaryCell(transferTile(maze,3,4,6,4,{copy:true}),6,4).cell),mp4);
  assert.equal(voiceAt(primaryCell(JSON.parse(JSON.stringify(maze)),3,4).cell),mp4);
  const removed=primaryCell(changeCellDetails(maze,3,4,voiceEdit(edited,null)),3,4).cell;
  assert.equal(voiceAt(removed),null);
  assert.equal(removed.repropagation.voice.unknown,true);
  assert.equal(removed.audioPath,"native/audio");
  assert.equal(voiceAt(original),null);
});
test("voice-only and combined photo and voice pause navigation until dismissed",()=>{
  const maze=paintTile(newMaze(),2,2,"info");
  maze.data.cells.find(c=>c.type==="info").repropagation={voice:{dataUrl:mp4}};
  const original=JSON.stringify(maze);
  let state=collectAt(maze,{...startPlay(maze),x:2.5,z:2.5});
  assert.deepEqual(state.pendingPhoto,{key:"2,2",url:null,caption:"",voiceUrl:mp4});
  assert.equal(tickPlayer(state,3),state);
  assert.equal(advanceShadows(maze,state,3),state);
  assert.equal(movePlayer(maze,state,1),state);
  state=dismissPhoto(state);
  assert.equal(state.pendingPhoto,null);
  assert.equal(collectAt(maze,state).pendingPhoto,null);
  maze.data.cells.find(c=>c.type==="info").repropagation.photo={dataUrl:photo};
  const combined=collectAt(maze,{...startPlay(maze),x:2.5,z:2.5});
  assert.equal(combined.pendingPhoto.url,photo);
  assert.equal(combined.pendingPhoto.voiceUrl,mp4);
  assert.notEqual(JSON.stringify(maze),original);
});
test("record, stop, cancel, preview, save and playback are wired in UI",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  for(const id of ["tileVoiceEditor","recordVoiceButton","stopVoiceButton","removeTileVoiceButton",
    "tileVoicePreview","playVoiceAudio","tileVoiceStatus"])
    assert.match(html,new RegExp('id="'+id+'"'));
  for(const text of ["voiceEdit(","voiceAt(","createVoiceRecorder(","voiceRecorder.cancel()",
    "playVoiceAudio","voiceRecorder.stop()"])
    assert.ok(app.includes(text),text);
});

test("recording stays busy through asynchronous encoding, then releases mic",async()=>{
  const old={navigator:Object.getOwnPropertyDescriptor(globalThis,"navigator"),
    media:globalThis.MediaRecorder,reader:globalThis.FileReader};
  const streams=[];
  class FakeRecorder{
    static isTypeSupported(type){return type==="audio/mp4";}
    constructor(stream,options){this.mimeType=options.mimeType;this.state="inactive";}
    start(){this.state="recording";}
    stop(){
      this.state="inactive";
      queueMicrotask(()=>{
        this.ondataavailable({data:new Blob(["sample"],{type:"audio/mp4"})});
        this.onstop();
      });
    }
  }
  class FakeReader{
    readAsDataURL(blob){this.result=mp4;queueMicrotask(()=>this.onload());}
  }
  try{
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{
      mediaDevices:{getUserMedia:async()=>{
        const track={stopped:0,stop(){this.stopped++;}};
        const stream={getTracks:()=>[track]};
        streams.push(track);return stream;
      }}
    }});
    globalThis.MediaRecorder=FakeRecorder;globalThis.FileReader=FakeReader;
    const ready=[],statuses=[];
    const controller=createVoiceRecorder({onReady:v=>ready.push(v),onStatus:v=>statuses.push(v)});
    await controller.start();
    assert.equal(controller.isRecording(),true);
    controller.stop();
    assert.equal(controller.isRecording(),false);
    assert.equal(controller.isBusy(),true,"Save must stay disabled until FileReader finishes");
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(controller.isBusy(),false);
    assert.deepEqual(ready,[mp4]);
    assert.ok(streams[0].stopped>=1);
    await controller.start();
    controller.stop();
    controller.cancel();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(ready,[mp4],"Cancelled encoding cannot overwrite a saved note");
    assert.equal(controller.isBusy(),false);
    assert.ok(statuses.some(v=>v.includes("ready")));
  }finally{
    if(old.navigator)Object.defineProperty(globalThis,"navigator",old.navigator);
    else delete globalThis.navigator;
    if(old.media===undefined)delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder=old.media;
    if(old.reader===undefined)delete globalThis.FileReader;
    else globalThis.FileReader=old.reader;
  }
});
test("cancelled pending microphone permission cannot later start recording",async()=>{
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator");
  const oldMedia=globalThis.MediaRecorder;
  let resolvePermission,stops=0,constructions=0;
  class FakeRecorder {
    static isTypeSupported(type){return type==="audio/mp4";}
    constructor(){constructions++;}
  }
  try{
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{
      mediaDevices:{getUserMedia:()=>new Promise(resolve=>{resolvePermission=resolve;})}
    }});
    globalThis.MediaRecorder=FakeRecorder;
    const controller=createVoiceRecorder();
    const request=controller.start();
    assert.equal(controller.isBusy(),true);
    controller.cancel();
    assert.equal(controller.isBusy(),false);
    resolvePermission({getTracks:()=>[{stop(){stops++;}}]});
    await request;
    assert.equal(stops,1);
    assert.equal(constructions,0);
    assert.equal(controller.isBusy(),false);
  }finally{
    if(oldNavigator)Object.defineProperty(globalThis,"navigator",oldNavigator);
    else delete globalThis.navigator;
    if(oldMedia===undefined)delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder=oldMedia;
  }
});
