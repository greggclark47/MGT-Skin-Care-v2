const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {runEvalSuite}=require('@mgt/domain');

const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'golden-cases.json'),'utf8'));
const cases=fixture.cases;

test('reviewed output golden set covers the five enabled portal task types',()=>{
 assert.equal(fixture.version,'2026-09-22.1');
 assert.deepEqual(cases.map(item=>item.task_type).sort(),['care_coach','operator_analysis','product_explanation','routine_builder','skin_match']);
 assert(cases.every(item=>item.review_status==='approved'&&item.reviewer_role));
});

test('reviewed output golden set passes safety, grounding, and phrase checks',()=>{
 for(const item of cases){
  assert(item.output_text.length>=40,item.id);
  for(const phrase of item.required_phrases)assert(item.output_text.toLowerCase().includes(phrase),`${item.id}: missing ${phrase}`);
 }
 const result=runEvalSuite(cases);
 assert.equal(result.pass_rate,1,JSON.stringify(result.results));
 assert.equal(result.unsupported_claim_rate,0,JSON.stringify(result.results));
 console.log(`Reviewed output agreement: ${cases.length}/${cases.length}; blocked-claim and citation checks passed.`);
});
