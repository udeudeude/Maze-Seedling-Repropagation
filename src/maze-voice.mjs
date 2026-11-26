/** Short personal voice notes: bounded, local and stored outside original native fields. */
export const MAX_VOICE_DATA_URL_LENGTH=170000;
export const MAX_VOICE_BYTES=120000;
export const VOICE_SECONDS=15;
export function voiceDataUrl(value){
  if(typeof value!=="string"||value.length>MAX_VOICE_DATA_URL_LENGTH)return null;
  const match=/^data:(audio\/(?:mp4|webm));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match||match[2].length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(match[2]))return null;
  return value;
}
export function voiceAt(cell){
  return voiceDataUrl(cell?.type==="info"?cell.repropagation?.voice?.dataUrl:null);
}
export function voiceEdit(cell,dataUrl){
  if(dataUrl!==null&&!voiceDataUrl(dataUrl))
    throw new TypeError("Voice note must be a small MP4 or WebM audio data URL");
  const extension={...(cell?.repropagation??{})};
  const original=extension.voice;
  const note=original&&typeof original==="object"&&!Array.isArray(original)?{...original}:{};
  if(dataUrl===null)delete note.dataUrl;
  else note.dataUrl=dataUrl;
  if(Object.keys(note).length)extension.voice=note;
  else delete extension.voice;
  return {repropagation:extension};
}
export function preferredVoiceMime(Recorder=globalThis.MediaRecorder){
  if(!Recorder?.isTypeSupported)return null;
  for(const type of ["audio/mp4","audio/webm;codecs=opus","audio/webm"]){
    if(Recorder.isTypeSupported(type))return type;
  }
  return null;
}
/** MediaRecorder permissions, encoding and microphone ownership are scoped to one
 * session. A cancelled session can never overwrite previously saved audio. */
export function createVoiceRecorder({onStatus=()=>{},onReady=()=>{},onBusy=()=>{}}={}){
  let generation=0,active=null,requesting=false;
  const update=()=>onBusy({recording:!!active,requesting});
  const release=stream=>stream?.getTracks().forEach(track=>track.stop());
  function stop({discard=false}={}){
    if(discard)generation++;
    requesting=false;
    const session=active;
    active=null;
    if(!session){update();return;}
    session.discard ||= discard;
    clearTimeout(session.timer);
    try{
      if(session.recorder.state!=="inactive")session.recorder.stop();
    }catch(error){console.warn("Voice recorder could not stop",error);}
    release(session.stream);
    if(!session.discard)onStatus("Preparing your recording…");
    update();
  }
  async function start(){
    if(active||requesting)return;
    const mime=preferredVoiceMime();
    if(!mime||!globalThis.navigator?.mediaDevices?.getUserMedia){
      onStatus("This browser does not support microphone recording.");return;
    }
    const token=++generation;
    requesting=true;update();
    onStatus("Requesting microphone permission…");
    let stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(token!==generation){release(stream);return;}
      const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:32000});
      const session={token,recorder,stream,chunks:[],bytes:0,discard:false,tooLarge:false,timer:null};
      active=session;
      recorder.ondataavailable=event=>{
        if(!event.data?.size)return;
        session.bytes+=event.data.size;
        if(session.bytes>MAX_VOICE_BYTES){
          session.tooLarge=true;stop();
        }else session.chunks.push(event.data);
      };
      recorder.onerror=()=>{
        if(active===session)stop({discard:true});
        if(token===generation)onStatus("Recording failed. Please try again.");
      };
      recorder.onstop=async()=>{
        clearTimeout(session.timer);release(session.stream);
        if(session.discard||token!==generation)return;
        if(session.tooLarge||!session.bytes){
          onStatus(session.tooLarge?"Recording too large. Try a shorter message.":"No audio was recorded.");
          return;
        }
        try{
          const format=(recorder.mimeType||mime).split(";")[0];
          const blob=new Blob(session.chunks,{type:format});
          if(blob.size>MAX_VOICE_BYTES)throw new Error("Recording too large.");
          const url=await new Promise((resolve,reject)=>{
            const reader=new FileReader();
            reader.onload=()=>resolve(reader.result);
            reader.onerror=()=>reject(new Error("Could not read the recording."));
            reader.readAsDataURL(blob);
          });
          if(token!==generation)return;
          if(!voiceDataUrl(url))throw new Error("Unsupported audio. Try a shorter recording.");
          onReady(url);
          onStatus("Recording ready. Listen, then Save tile.");
        }catch(error){if(token===generation)onStatus(error.message);}
      };
      recorder.start(250);
      session.timer=setTimeout(()=>stop(),VOICE_SECONDS*1000);
      onStatus("Recording… Stop when finished (maximum "+VOICE_SECONDS+" seconds).");
      update();
    }catch(error){
      release(stream);
      if(token===generation)onStatus(error.name==="NotAllowedError"?
        "Microphone permission denied. Check your browser settings.":
        "Could not record audio: "+error.message);
    }finally{
      if(token===generation)requesting=false;
      update();
    }
  }
  return {start,stop,cancel:()=>stop({discard:true}),isBusy:()=>!!active||requesting};
}
