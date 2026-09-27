import {RunnableLambda, RunnableSequence} from '@langchain/core/runnables';

export interface PromptDocument {id:string;text:string}
export interface CoachPromptContext {question:string;documents:PromptDocument[];maxDocuments?:number}

// LangChain is used as the deterministic context pipeline, not as a second model caller. This
// keeps retrieval bounded and makes later steps (reranking, tracing, or async jobs) composable
// without changing provider adapters or the portal contract.
const boundDocuments=RunnableLambda.from<CoachPromptContext,CoachPromptContext>(input=>({
 ...input,documents:input.documents.slice(0,input.maxDocuments??8),
}));
const serializePrompt=RunnableLambda.from<CoachPromptContext,string>(input=>JSON.stringify({
 question:input.question,documents:input.documents,
}));

export const coachPromptChain=RunnableSequence.from([boundDocuments,serializePrompt]);

export async function composeCoachPrompt(input:CoachPromptContext):Promise<string>{
 return coachPromptChain.invoke(input);
}
