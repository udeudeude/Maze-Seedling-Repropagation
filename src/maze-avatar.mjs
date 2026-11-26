/**
 * Independently authored selfie player identities. The recovered native
 * data.player_avatars object is opaque and must never be repurposed here.
 * Selfies are voluntary, embedded JPEGs, never network or asset URLs.
 */
import {parseMaze} from "./maze-document.mjs";
import {photoDataUrl} from "./maze-media.mjs";

export const MAX_AVATAR_NAME_LENGTH=48;
function cleanName(value) {
  return typeof value==="string"?value.replace(/[\u0000-\u001f\u007f]/g," ")
    .replace(/\s+/g," ").trim():"";
}
function plainObject(value) {
  return !!value&&typeof value==="object"&&!Array.isArray(value);
}
export function avatarAt(maze) {
  const authored=maze?.repropagation?.playerAvatar;
  return {name:cleanName(authored?.name).slice(0,MAX_AVATAR_NAME_LENGTH),
    dataUrl:photoDataUrl(authored?.dataUrl)};
}
export function avatarEdit(source,{name="",dataUrl=null}={}) {
  const label=cleanName(name);
  if(label.length>MAX_AVATAR_NAME_LENGTH)throw new RangeError("Player name is too long");
  if(dataUrl!==null&&!photoDataUrl(dataUrl))
    throw new TypeError("Selfie must be a small embedded JPEG");
  const next=parseMaze(source);
  const extension=plainObject(next.repropagation)?{...next.repropagation}:{};
  const previous=plainObject(extension.playerAvatar)?{...extension.playerAvatar}:{};
  if(label)previous.name=label;
  else delete previous.name;
  if(dataUrl)previous.dataUrl=dataUrl;
  else delete previous.dataUrl;
  if(Object.keys(previous).length)extension.playerAvatar=previous;
  else delete extension.playerAvatar;
  if(Object.keys(extension).length)next.repropagation=extension;
  else delete next.repropagation;
  return next;
}
/** A portrait-oriented crop favors the upper half so faces stay in frame. */
export function avatarCropRect(width,height) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
    throw new RangeError("Valid portrait dimensions are required");
  const size=Math.min(width,height);
  return {x:(width-size)/2,y:Math.max(0,(height-size)*.35),size};
}
