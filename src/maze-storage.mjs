import {serializeMaze} from "./maze-document.mjs";
import {saveActiveDocument} from "./maze-library.mjs";
import {createLibraryBackup,libraryBackupFileName,mazeFileName} from "./maze-backup.mjs";

/**
 * The collection is the authoritative save. Writing its complete replacement
 * first makes failed quota writes non-destructive: an outdated legacy recovery
 * document can never masquerade as a newer successful library save.
 */
export function saveMazeLocally(storage,source,document,{libraryKey,legacyKey}={}) {
  if(!storage||typeof storage.setItem!=="function"||
     !libraryKey||!legacyKey||libraryKey===legacyKey)
    throw new TypeError("Two distinct storage keys are required");
  const library=saveActiveDocument(source,document);
  storage.setItem(libraryKey,JSON.stringify(library));
  // Historical compatibility copy is best effort. The collection was already
  // committed; a full quota must not report a false failure.
  let recoverySaved=true;
  try{storage.setItem(legacyKey,serializeMaze(document));}
  catch{recoverySaved=false;}
  return {library,recoverySaved};
}

/**
 * Always allow an external rescue of the in-memory document even when local
 * storage rejects writes. Prefer the entire current library, including unsaved
 * edits, but fall back to the original single-maze JSON if backup bounds fail.
 */
export function emergencyMazeExport(library,document) {
  const active=saveActiveDocument(library,document);
  try{
    return {content:createLibraryBackup(active),filename:libraryBackupFileName(),
      title:"Rescue all mazes",scope:"library"};
  }catch{
    return {content:serializeMaze(document),filename:mazeFileName(document.name),
      title:"Rescue unsaved maze",scope:"maze"};
  }
}
