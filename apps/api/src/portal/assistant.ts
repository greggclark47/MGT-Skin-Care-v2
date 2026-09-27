import {check} from './security';
import {screenInput} from './ai';

export const ASSISTANT_ROLES=['customer_care','onboarding','routine_guidance','product_referral'] as const;
export type AssistantRole=typeof ASSISTANT_ROLES[number];
type NextStep={label:string;path:string}|null;
type Guidance={role:AssistantRole;kind:'guidance'|'handoff';category:string;text:string;citations:[];next_step:NextStep};
type Reviewed={role:AssistantRole;kind:'reviewed_ai';category:'routine'|'product_education'};

const guidance=(role:AssistantRole,kind:Guidance['kind'],category:string,text:string,next_step:NextStep):Guidance=>
 ({role,kind,category,text,citations:[],next_step});
const onboardingText='Start with Skin Match, review your result and routine, then explore and save independent retailers. You can manage your saved profile and privacy choices in Account.';
const onboarding=(role:AssistantRole)=>guidance(role,'guidance','onboarding',onboardingText,{label:'Start Skin Match',path:'/skin-match'});

// Caller-selected roles only choose a bounded lane. The message cannot grant tools, alter
// entitlements, perform a transaction, or choose a provider. Risky topics take precedence.
export function routeAssistantRequest(roleInput:unknown,message:string):Guidance|Reviewed{
 check(typeof roleInput==='string'&&ASSISTANT_ROLES.includes(roleInput as AssistantRole),400,'assistant_role_invalid','Choose a supported help topic.');
 const role=roleInput as AssistantRole;
 const safety=screenInput(message);
 if(safety)return guidance(role,'handoff','safety',safety,null);

 if(/\b(subscription|membership|billing plan|mgt plan)\b/i.test(message))
  return guidance(role,'handoff','mgt_billing','I cannot verify an MGT charge or payment here. Review Plans & Billing for your account status. If it differs from your provider record, save a Portal Support request.',{label:'Review Plans & Billing',path:'/membership'});
 if(/\b(payment|pay|paid|charg(?:e|ed|es)|card|transaction|receipt|invoice|refund|shipping|delivery|tracking|checkout|purchased|bought|purchase confirmation|my order|order status|order confirmation|return (an? |my |the )?(order|item|product))\b/i.test(message))
  return guidance(role,'handoff','payment_help','I cannot verify a payment here. For a retailer purchase, use its confirmation and contact that retailer for charges, shipping, returns, or refunds. For an MGT plan, review Plans & Billing or save a Portal Support request.',{label:'Retailer purchase help',path:'/orders'});
 if(/\b(where (can|do) i (buy|shop|purchase)|shop for|which (store|retailer)|find (a|the) retailer|buy|purchase)\b/i.test(message))
  return guidance(role,'guidance','retailer_discovery','Explore the independent retailer links in Shop. Each retailer handles its own checkout, delivery, and returns; a listing does not establish an MGT partnership.',{label:'Explore retailers',path:'/shop'});
 if(/\b(sign[ -]?in|log[ -]?in|one[ -]?time code|verification code|delete my account|account deletion|export my data|data export|privacy request|merge (my )?profile|erase (my )?(data|account)|delete (my )?(data|(?:skin )?profile)|remove (my )?(data|(?:skin )?profile)|personal data|privacy settings|forget me)\b/i.test(message))
  return guidance(role,'handoff','account_help','Use Account to manage sign-in, data export, and deletion. If you need help with a portal record, save a Portal Support request; this assistant cannot change account data.',{label:'Open Account',path:'/account'});

 if(/\b(get started|first steps|start using|new here|onboard(?:ing)?)\b/i.test(message))
  return onboarding(role);

 if(role==='onboarding')return onboarding(role);
 if(role==='customer_care')return guidance(role,'handoff','portal_support','Use Portal Support to save a request and review any replies. A request is not submitted until you save the form; this assistant has not contacted a staff member.',{label:'Open Portal Support',path:'/support'});
 return {role,kind:'reviewed_ai',category:role==='routine_guidance'?'routine':'product_education'};
}
