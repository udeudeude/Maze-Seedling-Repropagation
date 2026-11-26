import {parseMaze,serializeMaze} from "./maze-document.mjs";
import {activeDocument,makeMazeId,readLibrary} from "./maze-library.mjs";

/** Separate, versioned, local library backup; never an invented native format. */
export const BACKUP_FORMAT="maze-repropagation-library-backup";
export const MAX_BACKUP_BYTES=25*1024*1024;
export const MAX_BACKUP_ENTRIES=500;
function validLibrary(source){
  const library=readLibrary(source,activeDocument(source));
  if(library.entries.length>MAX_BACKUP_ENTRIES)
    throw new RangeError("Too many mazes in this backup");
  return library;
}
export function createLibraryBackup(source,when=new Date()){
  if(!(when instanceof Date)||Number.isNaN(when.valueOf()))
    throw new TypeError("Invalid backup date");
  return JSON.stringify({format:BACKUP_FORMAT,version:1,
    exportedAt:when.toISOString(),library:validLibrary(source)},null,2);
}
export function parseLibraryBackup(text){
  if(typeof text!=="string"||!text.trim())
    throw new TypeError("Choose a nonempty maze library backup");
  if(text.length>MAX_BACKUP_BYTES)
    throw new RangeError("Backup exceeds the 25 megabyte limit");
  const backup=JSON.parse(text);
  if(backup?.format!==BACKUP_FORMAT||backup.version!==1)
    throw new TypeError("Not a supported library backup. Use Import maze for single-maze JSON.");
  if(!Array.isArray(backup.library?.entries)||
      backup.library.entries.length>MAX_BACKUP_ENTRIES)
    throw new TypeError("Invalid maze backup entries");
  return validLibrary(backup.library);
}
/** Validate fully, then merge without touching any existing document or active ID. */
export function mergeLibraryBackup(current,incoming,{idFactory=makeMazeId}={}){
  const target=validLibrary(current);
  const source=typeof incoming==="string"?parseLibraryBackup(incoming):validLibrary(incoming);
  const fingerprints=new Set(target.entries.map(entry=>serializeMaze(entry.document,0)));
  const ids=new Set(target.entries.map(entry=>entry.id));
  let added=0,skipped=0;
  for(const entry of source.entries){
    const fingerprint=serializeMaze(entry.document,0);
    if(fingerprints.has(fingerprint)){skipped++;continue;}
    if(target.entries.length>=MAX_BACKUP_ENTRIES)
      throw new RangeError("Too many mazes; restore a smaller backup");
    let id=null;
    for(let attempt=0;attempt<30;attempt++){
      const next=idFactory();
      if(typeof next==="string"&&next.length>0&&next.length<150&&!ids.has(next)){
        id=next;break;
      }
    }
    if(!id)throw new Error("Could not create a unique maze identifier");
    target.entries.push({...entry,id,document:parseMaze(entry.document)});
    fingerprints.add(fingerprint);ids.add(id);added++;
  }
  return {library:target,added,skipped,total:source.entries.length};
}
export function libraryBackupFileName(date=new Date()){
  if(!(date instanceof Date)||Number.isNaN(date.valueOf()))
    throw new TypeError("Invalid backup date");
  return "maze-library-backup-"+date.toISOString().slice(0,10)+".json";
}
export function mazeFileName(name){
  const slug=String(name??"").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")
    .slice(0,48).replace(/-+$/g,"")||"my-maze";
  return slug+".maze.json";
}
export function canShareMaze(nav,file){
  try{return !!(file&&typeof nav?.share==="function"&&
    typeof nav?.canShare==="function"&&nav.canShare({files:[file]}));}
  catch{return false;}
}
