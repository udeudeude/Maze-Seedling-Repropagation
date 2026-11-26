/**
 * Portable photos for authored Message tiles. Preserve original native fields.
 * Reject remote and active image formats, and bound data stored in maze JSON.
 */
export const MAX_PHOTO_DATA_URL_LENGTH=110000;
export function photoDataUrl(value) {
  if(typeof value!=="string"||value.length>MAX_PHOTO_DATA_URL_LENGTH||
    !value.startsWith("data:image/jpeg;base64,"))return null;
  const encoded=value.slice("data:image/jpeg;base64,".length);
  if(!encoded.length||encoded.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    return null;
  return value;
}
export function photoAt(cell) {
  return photoDataUrl(cell?.type==="info"?cell.repropagation?.photo?.dataUrl:null);
}
export function photoEdit(cell,dataUrl) {
  if(dataUrl!==null&&!photoDataUrl(dataUrl))
    throw new TypeError("Photo must be a small JPEG data URL");
  const extension={...(cell?.repropagation??{})};
  const original=extension.photo;
  const photo=original&&typeof original==="object"&&!Array.isArray(original)
    ?{...original}:{};
  if(dataUrl===null)delete photo.dataUrl;
  else photo.dataUrl=dataUrl;
  if(Object.keys(photo).length)extension.photo=photo;
  else delete extension.photo;
  return {repropagation:extension};
}
