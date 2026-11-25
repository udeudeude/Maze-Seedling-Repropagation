import test from "node:test";
import assert from "node:assert/strict";
import {newMaze,paintTile,primaryCell} from "../src/maze-world.mjs";
import {newLibrary,readLibrary,activeDocument,saveActiveDocument,
  addMaze,openMaze,duplicateMaze,deleteMaze,sortedMazes}
  from "../src/maze-library.mjs";

test("migrate one existing locally saved maze without losing unknown original keys",()=>{
  const source=newMaze("Legacy maze","space");
  source.customBinaryMetadata={preserve:["1","2","3"]};
  const library=readLibrary(null,source);
  assert.equal(library.entries.length,1);
  assert.deepEqual(activeDocument(library).customBinaryMetadata,
    source.customBinaryMetadata);
  assert.equal(activeDocument(library).name,"Legacy maze");
});

test("create, switch and edit separate documents without sharing cell state",()=>{
  const first=newMaze("First");
  let library=newLibrary(first,"a",100);
  library=addMaze(library,newMaze("Second"),{id:"b",updated:200});
  assert.equal(library.activeId,"b");
  let second=paintTile(activeDocument(library),5,6,"wall");
  library=saveActiveDocument(library,second,300);
  library=openMaze(library,"a");
  assert.equal(primaryCell(activeDocument(library),5,6),null);
  library=openMaze(library,"b");
  assert.equal(primaryCell(activeDocument(library),5,6).cell.type,"wall");
  assert.equal(sortedMazes(library)[0].name,"Second");
});

test("duplicate creates a separately editable named maze",()=>{
  const source=newLibrary(newMaze("Gallery"),"original");
  const copied=duplicateMaze(source,"original",{newId:"copy",updated:2});
  assert.equal(copied.entries.length,2);
  assert.equal(activeDocument(copied).name,"Gallery copy");
  assert.equal(source.entries.length,1);
  assert.notEqual(copied.entries[0].document,copied.entries[1].document);
});

test("removing an active maze selects surviving design and forbids final removal",()=>{
  let library=newLibrary(newMaze("One"),"one");
  library=addMaze(library,newMaze("Two"),{id:"two"});
  library=deleteMaze(library,"two");
  assert.equal(library.activeId,"one");
  assert.equal(library.entries.length,1);
  assert.throws(()=>deleteMaze(library,"one"),/at least one/);
});

test("corrupt library cannot silently replace known good local maze",()=>{
  const original=newMaze();
  assert.throws(()=>readLibrary("{broken",original),SyntaxError);
  assert.throws(()=>readLibrary({version:1,activeId:"x",entries:[
    {id:"x",document:original},{id:"x",document:original}]},original),/duplicate/);
  const valid=newLibrary(original,"unique");
  assert.deepEqual(readLibrary(JSON.stringify(valid),original),valid);
});

test("name changes and metadata survive JSON round trips",()=>{
  const maze=newMaze();
  maze.custom="important";
  const original=newLibrary(maze,"first",100);
  const modified={...maze,name:"Changed"};
  const library=saveActiveDocument(original,modified,250);
  const decoded=readLibrary(JSON.stringify(library),maze);
  assert.equal(activeDocument(decoded).custom,"important");
  assert.equal(sortedMazes(decoded)[0].updated,250);
  assert.equal(original.entries[0].name,"My Maze");
});
