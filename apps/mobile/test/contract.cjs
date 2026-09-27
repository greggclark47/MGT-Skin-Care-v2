const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=JSON.parse(read('app.json')).expo;
const entry=read('App.tsx');
const screen=read('src/screens/SkinMatchScreen.tsx');
const step=read('src/components/SkinMatchStep.tsx');

test('mobile app has a reproducible Expo identity and API configuration seam',()=>{
 assert.equal(app.name,'MGT Skin Care');
 assert.equal(app.slug,'mgt-skin-care');
 assert.equal(app.scheme,'mgtskincare');
 assert.equal(app.orientation,'portrait');
 assert.match(entry,/process\.env\.EXPO_PUBLIC_API_URL/);
 assert.match(entry,/new ApiClient\(/);
});

test('mobile Skin Match consumes shared questionnaire and profile contracts',()=>{
 assert.match(screen,/CORE_STEPS/);
 assert.match(screen,/progress\(answers\)/);
 assert.match(screen,/toProfileInput\(answers\)/);
 assert.match(entry,/completeSkinMatch\(input\)/);
 assert.doesNotMatch(entry,/OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY/);
});

test('mobile controls preserve the shared accessibility and tap-target contract',()=>{
 assert.match(step,/TAP_TARGET_MIN/);
 assert.match(step,/accessibilityRole=\{\(step\.multi \? 'checkbox' : 'radio'\)/);
 assert.match(step,/accessibilityState=\{\{ checked: selected, disabled: blocked \}\}/);
 assert.match(step,/testID=\{`choice-\$\{choice\.value\}`\}/);
 assert.match(screen,/accessibilityRole="progressbar"/);
});

