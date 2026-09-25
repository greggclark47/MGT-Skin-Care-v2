// Fixed policy checks v1.2; expected-output agreement, not cosmetic efficacy or model accuracy.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {classify,ingredientAllowed,estimateRunOut,shouldNudge,checkCitations,scanBlockedTerms}=require('../../domain/dist');
const base={skin_type:'dry',concerns:['hydration'],sensitivity:'none',age_band:'26_35',current_routine:'basic',desired_outcome:'glow',budget_range:'between_25_50',ingredient_avoidances:[]};
const cases=[
 ['classification: hydration is capped at one',()=>classify(base).profile_vector.hydration_need,1],
 ['classification: high sensitivity limits tolerance to 0.15',()=>classify({...base,sensitivity:'high'}).profile_vector.sensitivity_ceiling,0.15],
 ['ingredient safety: explicit avoidance overrides eligibility',()=>{const p=classify(base);return ingredientAllowed('ceramides',p.profile_vector,p.avoid_flags,['ceramides']);},false],
 ['ingredient safety: below-threshold salicylic acid is excluded',()=>{const p=classify({...base,sensitivity:'high'});return ingredientAllowed('salicylic_acid',p.profile_vector,p.avoid_flags,[]);},false],
 ['replenishment: 30 ml at 1 ml/day lasts exactly 30 days',()=>estimateRunOut({size_ml:30,frequency_per_week:7,ml_per_use:1,purchased_at:'2026-01-01T00:00:00.000Z'},new Date('2026-01-21T00:00:00.000Z')),{estimated_runout_at:'2026-01-31T00:00:00.000Z',days_remaining:10,confidence:'catalog_default'}],
 ['replenishment: five-day boundary nudges',()=>shouldNudge({days_remaining:5}),true],
 ['replenishment: expired estimate does not nudge',()=>shouldNudge({days_remaining:-1}),false],
 ['grounding: retrieved citation is accepted',()=>checkCitations({citedKnowledgeIds:['k1'],retrievedKnowledgeIds:['k1']}).passed,true],
 ['grounding: invented citation is rejected',()=>checkCitations({citedKnowledgeIds:['k2'],retrievedKnowledgeIds:['k1']}).passed,false],
 ['claims: prohibited cure claim is rejected',()=>scanBlockedTerms('This cures disease.').passed,false],
];
for(const [id,compute,expected] of cases)test('accuracy fixed case: '+id,()=>assert.deepEqual(compute(),expected));
test('accuracy metric: fixed set contains ten independently specified cases; required agreement is 100%',()=>{
 let matched=0;for(const [,compute,expected] of cases){try{assert.deepEqual(compute(),expected);matched++;}catch{}}
 assert.equal(cases.length,10);assert.equal(matched/cases.length,1);
 console.log('Expected-output agreement: '+matched+'/'+cases.length+'; threshold 100%. Live generated output remains unverified.');
});
