import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newMaze,paintTile,primaryCell,changeCellDetails,transferTile} from "../src/maze-world.mjs";
import {startPlay,collectAt,tickPlayer,advanceShadows,movePlayer,dismissPhoto} from "../src/maze-play.mjs";
import {voiceAt,voiceEdit,voiceDataUrl,preferredVoiceMime,MAX_VOICE_DATA_URL_LENGTH} from "../src/maze-voice.mjs";
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
