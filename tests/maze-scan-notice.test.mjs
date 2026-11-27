import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scanReviewWarning} from "../src/maze-scan-notice.mjs";

test("strongly observed grid still requires physical review",()=>{
  assert.match(scanReviewWarning({quality:"review",printedGrid:{
    status:"supported",columns:{cells:18},rows:{cells:18}
  }}),/tentatively agrees with 18 by 18.*does not verify exact wall positions/);
});
test("unresolved geometry is explicitly disclosed even for seemingly plausible guesses",()=>{
  const result=scanReviewWarning({quality:"review",
    printedGrid:{status:"unresolved",columns:null,rows:null}});
  assert.match(result,/not confidently registered on both axes/);
  assert.match(result,/wall, hole and marker remains a provisional guess/);
});
test("hard scanner refusal and improbable proposals are never hidden",()=>{
  for(const quality of ["grid-offset","grid-mismatch",
    "dense-perforations","low-contrast","too-many","very-few"]){
    const message="Scanner warning for "+quality+".";
    assert.equal(scanReviewWarning({quality,message,
      printedGrid:{status:"unresolved"}}),message+" ");
  }
});
test("status text is wired to the real Capture review and cached offline",()=>{
  const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(app,/const gridNotice=scanReviewWarning\(scanResult\)/);
  assert.match(app,/el\("scanStatus"\)\.textContent=gridNotice\+/);
  assert.match(sw,/src\/maze-scan-notice\.mjs/);
});
