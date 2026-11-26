import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {newMaze,paintTile} from "../src/maze-world.mjs";
import {newLibrary,addMaze,activeDocument} from "../src/maze-library.mjs";
import {createLibraryBackup,parseLibraryBackup,mergeLibraryBackup,
  libraryBackupFileName,mazeFileName,canShareMaze,BACKUP_FORMAT,MAX_BACKUP_BYTES}
  from "../src/maze-backup.mjs";

test("whole-library backup preserves documents, original metadata, voice and photos",()=>{
  const first=newMaze("The Lost Maze","adventure");
  first.opaqueOriginal={coordinates:["01","000"]};
  first.data.cells.push({position:["4","0","4"],type:"info",
    repropagation:{photo:{dataUrl:"data:image/jpeg;base64,dGVzdA=="},
      voice:{dataUrl:"data:audio/mp4;base64,dGVzdA=="}}});
  const second=paintTile(newMaze("Other","space"),4,8,"wall");
  const collection=addMaze(newLibrary(first,"first",100),second,{id:"second",updated:200});
  const before=JSON.stringify(collection);
  const json=createLibraryBackup(collection,new Date("2026-11-25T23:00:00Z"));
  assert.equal(JSON.parse(json).format,BACKUP_FORMAT);
  assert.deepEqual(parseLibraryBackup(json),collection);
  assert.deepEqual(parseLibraryBackup(json).entries[0].document.data.cells[2],first.data.cells[2]);
  assert.equal(JSON.stringify(collection),before,"Creating backup does not mutate storage");
});

test("restore merges additively, never changes active ID, skips duplicates and remaps conflicting IDs",()=>{
  const current=newLibrary(newMaze("Original"),"collision",999);
  const incoming=addMaze(newLibrary(activeDocument(current),"different",100),
    newMaze("Another","hedge"),{id:"collision",updated:200});
  const before=JSON.stringify(current);
  const result=mergeLibraryBackup(current,createLibraryBackup(incoming),
    {idFactory:()=>"restored"});
  assert.equal(result.added,1);assert.equal(result.skipped,1);
  assert.equal(result.library.activeId,"collision");
  assert.deepEqual(activeDocument(result.library),activeDocument(current));
  assert.equal(result.library.entries[1].id,"restored");
  assert.equal(result.library.entries[1].updated,200);
  assert.equal(JSON.stringify(current),before);
  assert.equal(mergeLibraryBackup(result.library,incoming).added,0);
});

test("ID exhaustion and malformed formats never alter the original library",()=>{
  const saved=newLibrary(newMaze("A"),"same");
  const other=newLibrary(newMaze("B"),"same");
  assert.throws(()=>mergeLibraryBackup(saved,other,{idFactory:()=>"same"}),/unique/);
  assert.equal(saved.entries.length,1);
  for(const invalid of [
    JSON.stringify(newMaze()),
    JSON.stringify({format:BACKUP_FORMAT,version:2,library:saved}),
    JSON.stringify({format:BACKUP_FORMAT,version:1,library:{...saved,activeId:"missing"}}),
    JSON.stringify({format:BACKUP_FORMAT,version:1,
      library:{...saved,entries:[saved.entries[0],saved.entries[0]]}})
  ])assert.throws(()=>parseLibraryBackup(invalid));
  assert.throws(()=>parseLibraryBackup("not-json"),SyntaxError);
  assert.throws(()=>parseLibraryBackup("x".repeat(MAX_BACKUP_BYTES+1)),/25 megabyte/);
});

test("safe portable filenames and explicit native share capability",()=>{
  assert.equal(libraryBackupFileName(new Date("2026-11-25T23:00:00Z")),
    "maze-library-backup-2026-11-25.json");
  assert.equal(mazeFileName("../../École/<bad>"),"ecole-bad.maze.json");
  assert.equal(mazeFileName(""),"my-maze.maze.json");
  assert.throws(()=>libraryBackupFileName(new Date("invalid")));
  const file={name:"maze.json"};
  assert.equal(canShareMaze({share(){},canShare({files}){return files[0]===file;}},file),true);
  assert.equal(canShareMaze({share(){}},file),false);
  assert.equal(canShareMaze({share(){},canShare(){throw Error("unsupported");}},file),false);
});

test("file transfer UI routes validated backups without overwriting the active maze",async()=>{
  const [page,app,sw]=await Promise.all([
    readFile(new URL("../index.html",import.meta.url),"utf8"),
    readFile(new URL("../src/app.mjs",import.meta.url),"utf8"),
    readFile(new URL("../sw.js",import.meta.url),"utf8")]);
  for(const id of ["exportButton","backupButton","restoreBackupButton",
    "restoreBackupInput","transferStatus"])
    assert.ok(page.includes('id="'+id+'"'),"Missing "+id);
  assert.match(app,/navigator\.share\(\{files:\[file\],title\}\)/);
  assert.match(app,/canShareMaze\(navigator,file\)/);
  assert.match(app,/parseLibraryBackup\(await file\.text\(\)\)/);
  assert.match(app,/mergeLibraryBackup\(library,incoming\)/);
  assert.match(app,/localStorage\.setItem\(LIBRARY_STORAGE_KEY,JSON\.stringify\(result\.library\)\)/);
  assert.match(sw,/\.\/src\/maze-backup\.mjs/);
});
