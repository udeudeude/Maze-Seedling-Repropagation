import {parseMaze} from "./maze-document.mjs";

/**
 * Offline multi-maze collection. The active legacy autosave is retained as a
 * second recovery copy; these routines are pure and preserve all source keys.
 */
export const LIBRARY_STORAGE_KEY="seedling-repropagation.library.v1";

const clone=value=>JSON.parse(JSON.stringify(value));
const normalizeId=id=>typeof id==="string"&&id.length>0&&id.length<150?id:null;
export const makeMazeId=()=>globalThis.crypto?.randomUUID?.() ??
  "maze-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);

export function newLibrary(document,id=makeMazeId(),updated=Date.now()){
  const maze=parseMaze(document);
  if(!normalizeId(id))throw new TypeError("Invalid library ID");
  return {version:1,activeId:id,entries:[{
    id,name:maze.name||"Untitled maze",updated,document:maze
  }]};
}

export function readLibrary(saved,legacyDocument){
  if(!saved)return newLibrary(legacyDocument);
  const library=typeof saved==="string"?JSON.parse(saved):clone(saved);
  if(library?.version!==1||!Array.isArray(library.entries)||
      library.entries.length===0)throw new TypeError("Invalid saved maze library");
  const seen=new Set();
  for(const entry of library.entries){
    if(!normalizeId(entry?.id)||seen.has(entry.id))
      throw new TypeError("Invalid or duplicate maze ID");
    seen.add(entry.id);
    entry.document=parseMaze(entry.document);
    entry.name=entry.document.name||"Untitled maze";
    if(!Number.isFinite(entry.updated))entry.updated=0;
  }
  if(!seen.has(library.activeId))
    throw new Error("Active maze is missing from the saved collection");
  return library;
}

export function activeDocument(library){
  const found=library.entries.find(entry=>entry.id===library.activeId);
  if(!found)throw new Error("Active maze missing");
  return parseMaze(found.document);
}

export function saveActiveDocument(source,document,updated=Date.now()){
  const library=readLibrary(source,document);
  const maze=parseMaze(document);
  const entry=library.entries.find(item=>item.id===library.activeId);
  entry.document=maze;
  entry.name=maze.name||"Untitled maze";
  entry.updated=updated;
  return library;
}

export function addMaze(source,document,{id=makeMazeId(),updated=Date.now(),activate=true}={}){
  const library=readLibrary(source,document);
  const maze=parseMaze(document);
  if(!normalizeId(id)||library.entries.some(e=>e.id===id))
    throw new Error("A maze with this ID already exists");
  library.entries.push({id,name:maze.name||"Untitled maze",
    updated,document:maze});
  if(activate)library.activeId=id;
  return library;
}

export function openMaze(source,id){
  const library=readLibrary(source,activeDocument(source));
  if(!library.entries.some(item=>item.id===id))throw new RangeError("Unknown maze");
  library.activeId=id;
  return library;
}

export function duplicateMaze(source,id,{newId=makeMazeId(),updated=Date.now()}={}){
  const library=readLibrary(source,activeDocument(source));
  const original=library.entries.find(item=>item.id===id);
  if(!original)throw new RangeError("Unknown maze");
  const copy=parseMaze(original.document);
  copy.name=(copy.name||"Untitled maze")+" copy";
  return addMaze(library,copy,{id:newId,updated});
}

export function deleteMaze(source,id){
  const library=readLibrary(source,activeDocument(source));
  if(library.entries.length===1)throw new Error("Keep at least one maze");
  const at=library.entries.findIndex(item=>item.id===id);
  if(at<0)throw new RangeError("Unknown maze");
  library.entries.splice(at,1);
  if(library.activeId===id)library.activeId=library.entries[0].id;
  return library;
}

export function sortedMazes(library){
  return [...library.entries].sort((a,b)=>
    b.updated-a.updated||a.name.localeCompare(b.name));
}
