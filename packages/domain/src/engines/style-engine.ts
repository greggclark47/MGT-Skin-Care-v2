// Creative, preference-based coordination. No photo analysis or inferred skin tone.
export const STYLE_OPTIONS = {
 palette: ['warm','cool','balanced'], contrast: ['soft','balanced','bold'],
 occasion: ['everyday','work','occasion'], expression: ['minimal','polished','expressive'],
 texture: ['not specified','straight','wavy','curly','coily','mixed textures'], effort: ['quick','unhurried'],
 hairGoal: ['keep my color','subtle change','statement change'],
 hairPresentation: ['not specified','loose hair','locs','braids or twists','wig or hairpiece','covered hair','shaved or no hair','skip hair suggestions'],
 makeup: ['color inspiration','no makeup'],
 clothing: ['open to options','trousers','skirts or dresses','my own garments'],
 coverage: ['not specified','covered arms and legs','covered arms, legs and neckline'],
 headwear: ['not specified','include my headwear','no added headwear'],
 climate: ['not specified','warm weather','cool weather','changing temperatures'],
 fastening: ['not specified','easy fastenings'],
 comfort: ['not specified','seated comfort','room to move'],
 sensory: ['not specified','simple textures and fewer accessories'],
} as const;
export type StyleOptionKey=keyof typeof STYLE_OPTIONS;
export type StyleProfile = {[K in StyleOptionKey]: (typeof STYLE_OPTIONS)[K][number]} & {personalNotes:string};
export const DEFAULT_STYLE:StyleProfile={palette:'balanced',contrast:'balanced',occasion:'everyday',expression:'minimal',texture:'not specified',effort:'quick',hairGoal:'keep my color',hairPresentation:'not specified',makeup:'color inspiration',clothing:'open to options',coverage:'not specified',headwear:'not specified',climate:'not specified',fastening:'not specified',comfort:'not specified',sensory:'not specified',personalNotes:''};
export function normalizeStyle(input:Partial<StyleProfile>|undefined):StyleProfile{return {...DEFAULT_STYLE,...input};}
export const STYLE_SECTIONS = [
 {id:'personal-color',title:'Personal Color',intro:'One palette to connect your makeup, hair and wardrobe.'},
 {id:'makeup',title:'Makeup Artist',intro:'Build a color story for lips, cheeks and eyes.'},
 {id:'haircare',title:'Haircare Artist',intro:'Organize a styling ritual around your texture and time.'},
 {id:'hair-color',title:'Hair Color',intro:'Explore a color direction to bring to your stylist.'},
 {id:'style',title:'Style Artist',intro:'Bring your beauty choices and outfit together.'},
 {id:'clothing',title:'Clothing & Style Advisor',intro:'Create a wearable outfit from your shared palette.'},
] as const;
export type StyleSection = (typeof STYLE_SECTIONS)[number]['id'];
export const STYLE_PALETTES={
 warm:[{name:'Ivory',hex:'#EEE2CD'},{name:'Cocoa',hex:'#644735'},{name:'Terracotta',hex:'#BB6750'},{name:'Olive',hex:'#7A8154'},{name:'Gold',hex:'#CBAB65'}],
 cool:[{name:'Pearl',hex:'#E5E3EA'},{name:'Ink',hex:'#343A56'},{name:'Berry',hex:'#A35478'},{name:'Lavender',hex:'#A59AC7'},{name:'Silver',hex:'#AEBACB'}],
 balanced:[{name:'Oat',hex:'#DCD1BF'},{name:'Espresso',hex:'#50433F'},{name:'Rosewood',hex:'#A66A76'},{name:'Teal',hex:'#527F80'},{name:'Champagne',hex:'#C7B18D'}],
};
export function stylePlan(input:StyleProfile){
 const p=normalizeStyle(input);
 const colors=STYLE_PALETTES[p.palette], [base,anchor,accent,secondary,metal]=colors;
 const outfit=p.occasion==='work'?['A relaxed shirt','Tailored trousers','A structured layer']:p.occasion==='occasion'?['A fluid top','Dress trousers or a flowing skirt','An occasion jacket']:['A comfortable tee or knit','Your favorite jeans or trousers','An easy overshirt'];
 const texture={'not specified':'Keep the hair shape you prefer; texture is optional',straight:'A smooth finish or a softly tucked shape',wavy:'Loose waves with a relaxed part',curly:'Defined curls with a shape you enjoy',coily:'A defined shape you enjoy','mixed textures':'Style different sections in the way you prefer'}[p.texture];
 const hair=p.hairGoal==='keep my color'?'Keep your current color; coordinate accessories with your palette.':p.palette==='warm'?'Explore chestnut or caramel inspiration.':p.palette==='cool'?'Explore cool brunette or muted pearl inspiration.':'Explore neutral brown or beige-toned inspiration.';
 const cards:Record<StyleSection,{title:string;text:string}[]>={
 'personal-color':[{title:'Your color direction',text:`You chose ${p.palette} colors. Use ${base.name} as a base, ${anchor.name} for depth and ${accent.name} as your accent.`},{title:'Try a comparison',text:'Compare the warm, cool and balanced swatches with pieces you already own in consistent daylight. Choose what you enjoy; screen swatches do not measure skin tone.'},{title:'Connect every segment',text:`Repeat ${accent.name} in makeup and a wardrobe detail; use ${metal.name} as an accessory color reference.`}],
 makeup:[{title:'Lips & cheeks',text:`Explore the ${accent.name.toLowerCase()} color family, with ${p.expression==='expressive'?'a defined lip as the focal point':'a sheer lip and softly blended cheek'}.`},{title:'Eyes',text:`Use ${anchor.name.toLowerCase()} as liner inspiration${p.contrast==='bold'?` and ${secondary.name.toLowerCase()} for an accent`:' with a softly blended edge'}.`},{title:'Finish',text:p.effort==='quick'?'Keep the look to one lip color and one eye detail.':'Layer the eye detail gradually, then balance the intensity of the lip.'},{title:'Shade selection',text:'These are creative color families, not product or foundation shade matches. Try actual shades before choosing a product.'}],
 haircare:[{title:'Your styling direction',text:texture+'.'},{title:'Time for your ritual',text:p.effort==='quick'?'Choose one familiar styling step and an easy finish you can repeat.':'Allow time to work in sections and refine your preferred shape.'},{title:'Coordinate the finish',text:`Choose a ${metal.name.toLowerCase()} clip or a ${secondary.name.toLowerCase()} scarf if accessories suit your style.`},{title:'Keep your care connected',text:'Keep using the cleansing and conditioning routine that works for you. This planner organizes styling preferences; it does not assess hair or scalp condition.'}],
 'hair-color':[{title:'Your direction',text:hair},{title:'Placement brief',text:p.hairGoal==='keep my color'?'No color change requested. Focus your appointment on shape and finish.':p.hairGoal==='subtle change'?'Ask about a subtle, blended accent while keeping your existing base.':'Bring a statement-color reference and discuss the upkeep before choosing a change.'},{title:'Your stylist brief',text:`Desired effect: ${p.contrast} contrast. Preferred upkeep: ${p.effort==='quick'?'simple':'time for a longer ritual'}. A stylist can assess your current color and color history; this is inspiration, not a dye formula.`}],
 style:[{title:'The complete look',text:`A ${p.expression} ${p.occasion==='occasion'?'occasion':p.occasion} look: ${base.name.toLowerCase()} base, ${anchor.name.toLowerCase()} depth, ${accent.name.toLowerCase()} beauty accent.`},{title:'Choose your focal point',text:p.expression==='expressive'?`Make ${secondary.name.toLowerCase()} your statement piece and keep the remaining accessories simple.`:'Let one detail lead: a lip color, an accessory or a textured layer.'},{title:'Balance the contrast',text:p.contrast==='soft'?'Keep adjacent pieces close in depth and blend transitions.':p.contrast==='bold'?`Pair ${base.name.toLowerCase()} with ${anchor.name.toLowerCase()} for a clear light-and-dark contrast.`:'Use a neutral base with one distinct accent.'},{title:'Hair direction',text:texture+'. '+hair}],
 clothing:[...outfit.map((piece,i)=>({title:piece,text:`Try ${[base,anchor,secondary][i].name.toLowerCase()} or a similar color already in your wardrobe.`})),{title:'The finishing detail',text:`Add ${metal.name.toLowerCase()} accessories${p.expression==='expressive'?` and a ${accent.name.toLowerCase()} accent`:'. Keep the finish simple'}. These are outfit ideas, with no size, fit or body-shape assumptions.`}],
 };
 // Explicit choices take priority over the starter look. Identity is never inferred.
 if(p.clothing==='trousers')cards.clothing[1]={title:'Your preferred trousers',text:`Use ${anchor.name.toLowerCase()} as a color reference for trousers in a fit you enjoy.`};
 if(p.clothing==='skirts or dresses')cards.clothing[1]={title:'Your preferred skirt or dress',text:`Choose a skirt or dress you enjoy in ${anchor.name.toLowerCase()} or ${secondary.name.toLowerCase()}. The top and layer are optional.`};
 if(p.clothing==='my own garments')cards.clothing= [{title:'Build around your own garments',text:'Start with clothing you choose, including garments meaningful to your culture, community or personal style. Keep the shapes and details you want.'},{title:'Optional color connection',text:`Use ${accent.name.toLowerCase()} in one detail only if it complements your chosen garments. Your existing colors can lead.`}];
 const needs:{title:string;text:string}[]=[];
 if(p.coverage!=='not specified')needs.push({title:'Your coverage choice',text:p.coverage==='covered arms and legs'?'Choose sleeves and full-length bottoms or a long dress; check coverage as you move.':'Choose sleeves, full-length bottoms or a long dress, and a neckline that provides your preferred coverage.'});
 if(p.headwear==='include my headwear')needs.push({title:'Include your headwear',text:'Build around the headwear you already choose. Keep its intended shape and meaning; coordinating colors are optional.'});
 if(p.headwear==='no added headwear')needs.push({title:'Headwear preference',text:'Keep this outfit free of additional headwear.'});
 if(p.climate!=='not specified')needs.push({title:'Weather preference',text:p.climate==='warm weather'?'Consider lighter layers in your preferred coverage.':p.climate==='cool weather'?'Add a warm outer layer that works with your chosen garments.':'Use removable layers so the outfit can adapt through the day.'});
 if(p.fastening==='easy fastenings')needs.push({title:'Dressing ease',text:'Look for pull-on options or larger, easy-to-reach closures that suit you. Check actual garments for ease of use.'});
 if(p.comfort!=='not specified')needs.push({title:'Comfort in your day',text:p.comfort==='seated comfort'?'Try the outfit while seated. Check waistband comfort, seam placement, pocket access and fabric gathering.':'Check reach and movement in your preferred fit; choose room where you want it.'});
 if(p.sensory!=='not specified')needs.push({title:'Texture & accessories',text:'Choose textures you find comfortable, check labels and seams, and leave out extra accessories. Comfort is personal.'});
 if(p.personalNotes.trim())needs.push({title:'Your own styling brief',text:p.personalNotes.trim()});
 cards.clothing.push(...needs);cards.style.push(...needs);
 const skipHair=['shaved or no hair','skip hair suggestions'].includes(p.hairPresentation);
 if(p.hairPresentation!=='not specified'&&p.hairPresentation!=='loose hair'){
  const direction=skipHair?'No hair styling or coloring steps are included for your selected preference.':p.hairPresentation==='covered hair'?'Keep your preferred hair covering and the styling underneath it as you choose. Visible hair styling is optional.':p.hairPresentation==='wig or hairpiece'?'Keep your chosen wig or hairpiece style. Check its material and maker’s instructions before any styling or color change.':`Build around your existing ${p.hairPresentation}; keep the arrangement and finish you prefer.`;
  cards.haircare=[{title:'Your hair preference',text:direction}];
  cards['hair-color']=[{title:'Your color preference',text:skipHair?'Hair color suggestions are turned off.':p.hairPresentation==='wig or hairpiece'?'Use palette colors as visual inspiration only; color changes depend on the hairpiece material.':'Keep your current look unless you want a change. Bring your hair history and chosen presentation to a stylist before deciding on color.'}];
  cards.style=cards.style.map(c=>c.title==='Hair direction'?{title:c.title,text:direction}:c);
 }
 if(p.headwear==='no added headwear'||p.sensory!=='not specified')cards.haircare=cards.haircare.filter(c=>c.title!=='Coordinate the finish');
 if(p.sensory!=='not specified')cards.clothing=cards.clothing.filter(c=>c.title!=='The finishing detail');
 if(p.sensory!=='not specified')cards.style=cards.style.map(c=>c.title==='Choose your focal point'?{title:c.title,text:'Let a comfortable garment shape or color lead; extra accessories are optional.'}:c);
 if(p.makeup==='no makeup'){
  cards.makeup=[{title:'Your makeup-free look',text:'No makeup steps are included. Your color story can live in clothing or other details you choose.'}];
  cards['personal-color'][2]={title:'Connect your segments',text:`Use ${accent.name} in a clothing detail if you like; makeup is optional and currently turned off.`};
  cards.style=cards.style.map(c=>c.title==='Choose your focal point'?{title:c.title,text:'Let a garment color or shape lead your look.'}:c.title==='The complete look'?{title:c.title,text:`A ${p.expression} look with a ${base.name.toLowerCase()} base and ${anchor.name.toLowerCase()} depth. Makeup-free, as requested.`}:c);
 }
 return {colors,cards,reason:`Based on your ${p.palette} palette, ${p.contrast} contrast, ${p.expression} style and ${p.occasion} setting. Your selected coverage, comfort and styling preferences take priority.`};
}
