// Repository-level theme accessibility contract. This validates declared color
// tokens and preference fallbacks; it does not claim a complete WCAG audit.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const theme=fs.readFileSync(path.join(root,'apps/web/src/app/theme.css'),'utf8');

function tokens(selector){
 const start=theme.indexOf(selector);assert.notEqual(start,-1,'missing '+selector+' theme');
 const open=theme.indexOf('{',start),close=theme.indexOf('}',open);assert(open>start&&close>open,'malformed '+selector+' theme');
 return Object.fromEntries([...theme.slice(open+1,close).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(match=>[match[1],match[2]]));
}
function channel(value){value/=255;return value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4);}
function luminance(hex){const [r,g,b]=hex.slice(1).match(/../g).map(value=>channel(parseInt(value,16)));return .2126*r+.7152*g+.0722*b;}
function contrast(a,b){const [high,low]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (high+.05)/(low+.05);}

const themes={dark:tokens(':root,[data-theme="dark"]'),light:tokens('[data-theme="light"]')};
const pairs=[
 ['text','bg'],['text','panel'],['muted','bg'],['muted','panel'],
 ['purple','bg'],['purple','panel'],['orange','bg'],['danger','danger-bg'],
 ['success','success-bg'],['text','surface']
];
for(const [name,values] of Object.entries(themes))for(const [foreground,background] of pairs){
 assert(values[foreground],name+' missing --'+foreground);assert(values[background],name+' missing --'+background);
 const ratio=contrast(values[foreground],values[background]);
 assert(ratio>=4.5,`${name} ${foreground}/${background} contrast ${ratio.toFixed(2)} is below 4.5:1`);
 console.log(`PASS ${name} ${foreground}/${background} ${ratio.toFixed(2)}:1`);
}
assert.match(theme,/@media\(prefers-reduced-motion:reduce\)/,'reduced-motion preference contract');
assert.match(theme,/@media\(forced-colors:active\)/,'forced-colors preference contract');
assert.match(theme,/:focus-visible\{[^}]*outline:/,'visible focus contract');
console.log('PASS reduced motion, forced colors, and visible focus contracts');
