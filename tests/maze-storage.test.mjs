import test from "node:test";
import assert from "node:assert/strict";
import {newMaze,paintTile} from "../src/maze-world.mjs";
import {newLibrary,addMaze,openMaze,activeDocument} from "../src/maze-library.mjs";
import {parseLibraryBackup} from "../src/maze-backup.mjs";
import {saveMazeLocally,emergencyMazeExport} from "../src/maze-storage.mjs";
import {readFileSync} from "node:fs";

const collectionKey="maze.library",legacyKey="maze.legacy";
function memoryStorage(failKey=null){
  const map=new Map();
  return {map,setItem(key,value){
    if(key===failKey)throw new Error("Storage quota reached");
    map.set(key,value);
  }};
}
test("canonical collection commits before the optional legacy copy",()=>{
  const storage=memoryStorage();
  const original=newMaze("Precious document");
  original.opaqueOriginal={bytes:[1,"02",3]};
  const library=newLibrary(original,"id-one",10);
  const edited=paintTile(original,7,9,"wall");
  const result=saveMazeLocally(storage,library,edited,{collectionKey,legacyKey});
  assert.equal(result.recoverySaved,true);
  assert.deepEqual(JSON.parse(storage.map.get(collectionKey)),result.library);
  assert.deepEqual(JSON.parse(storage.map.get(legacyKey)),edited);
  assert.deepEqual(activeDocument(result.library).opaqueOriginal,original.opaqueOriginal);
  assert.deepEqual(activeDocument(library),original,"caller library remains untouched");
});
test("quota rejection leaves both previously saved copies untouched",()=>{
  const storage=memoryStorage(collectionKey);
  storage.map.set(collectionKey,"previous library");
  storage.map.set(legacyKey,"previous recovery");
  const library=newLibrary(newMaze(),"first");
  const edited=paintTile(activeDocument(library),4,4,"wall");
  assert.throws(()=>saveMazeLocally(storage,library,edited,{collectionKey,legacyKey}),/quota/);
  assert.equal(storage.map.get(collectionKey),"previous library");
  assert.equal(storage.map.get(legacyKey),"previous recovery");
});
test("legacy-copy failure does not invalidate a safely saved collection",()=>{
  const storage=memoryStorage(legacyKey);
  const library=newLibrary(newMaze(),"first");
  const edited=paintTile(activeDocument(library),4,5,"map");
  const result=saveMazeLocally(storage,library,edited,{collectionKey,legacyKey});
  assert.equal(result.recoverySaved,false);
  assert.equal(JSON.parse(storage.map.get(collectionKey)).entries[0].document.data.cells.at(-1).type,"map");
});
test("emergency rescue includes unsaved edits and every other maze",()=>{
  const base=newMaze("Other maze");
  base.extraMetadata={doNotLose:"me"};
  let library=newLibrary(base,"one");
  library=addMaze(library,newMaze("Active"),{id:"two"});
  const edited=paintTile(activeDocument(library),5,6,"gate","key");
  edited.repropagation={custom:"keep"};
  const rescue=emergencyMazeExport(library,edited);
  assert.equal(rescue.scope,"library");
  const recovered=parseLibraryBackup(rescue.content);
  assert.equal(recovered.entries.length,2);
  assert.deepEqual(activeDocument(recovered),edited);
  assert.deepEqual(recovered.entries[0].document.extraMetadata,base.extraMetadata);
  assert.equal(activeDocument(library).data.cells.length,2,"the original library is unchanged");
});
test("when a whole-library export is too large, rescue still exports the active maze",()=>{
  const huge=newMaze("Recover me");
  huge.customNotes="x".repeat(26*1024*1024);
  const library=newLibrary(huge,"one");
  const rescue=emergencyMazeExport(library,huge);
  assert.equal(rescue.scope,"maze");
  assert.equal(JSON.parse(rescue.content).customNotes,huge.customNotes);
});
test("failed saves expose a rescue control and warn before leaving",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(html,/id="rescueSaveButton"[^>]*hidden/);
  assert.match(app,/saveMazeLocally\(localStorage,library,maze/);
  assert.match(app,/emergencyMazeExport\(library,maze\)/);
  assert.match(app,/addEventListener\("beforeunload"/);
  assert.match(sw,/\.\/src\/maze-storage\.mjs/);
});
