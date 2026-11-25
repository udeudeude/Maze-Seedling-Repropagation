/**
 * Head pose for the reconstructed first-person explorer.
 * Relative device orientation, not a geographic compass bearing.
 */
const RAD=Math.PI/180;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function multiply(a,b) {
  return {
    x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
    y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
    z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
    w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z
  };
}
export function shortestAngle(angle) {
  return Math.atan2(Math.sin(angle),Math.cos(angle));
}
/**
 * Map Z-X'-Y'' device rotations to an upright YXZ camera using quaternions.
 * Returns yaw/pitch in radians; invalid or vertical readings return null.
 */
export function orientationPose(sample,screenRotation=0) {
  if(!sample||![sample.alpha,sample.beta,sample.gamma,screenRotation]
    .every(Number.isFinite))return null;
  const x=sample.beta*RAD/2,y=sample.alpha*RAD/2,z=-sample.gamma*RAD/2;
  const c1=Math.cos(x),c2=Math.cos(y),c3=Math.cos(z);
  const s1=Math.sin(x),s2=Math.sin(y),s3=Math.sin(z);
  const device={
    x:s1*c2*c3+c1*s2*s3,
    y:c1*s2*c3-s1*c2*s3,
    z:c1*c2*s3-s1*s2*c3,
    w:c1*c2*c3+s1*s2*s3
  };
  const upright={x:-Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2};
  const angle=screenRotation*RAD/2;
  const screen={x:0,y:0,z:-Math.sin(angle),w:Math.cos(angle)};
  const q=multiply(multiply(device,upright),screen);
  // Rotate forward (0,0,-1) by the unit quaternion.
  const fx=-2*(q.w*q.y+q.z*q.x);
  const fy=2*(q.w*q.x-q.z*q.y);
  const fz=-1+2*(q.x*q.x+q.y*q.y);
  if(Math.hypot(fx,fz)<.06)return null;
  return {yaw:Math.atan2(fx,-fz),pitch:Math.asin(clamp(fy,-1,1))};
}
/** Recenter relative to the user's current physical direction. */
export function relativePose(pose,anchor,baseHeading=0) {
  if(!pose||!anchor||!Number.isFinite(baseHeading))return null;
  const turn=baseHeading+shortestAngle(pose.yaw-anchor.yaw);
  const full=Math.PI*2;
  return {heading:((turn%full)+full)%full,pitch:pose.pitch};
}
