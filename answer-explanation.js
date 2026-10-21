// Hide editorial source annotations in player-facing explanations only.
export function answerExplanation(value){
 const lines=String(value??'').split(/\r?\n/);let source=false;
 return lines.filter(line=>{if(/^\s*(?:источники?|sources?)\s*:/iu.test(line)){source=true;return false;}if(source&&/^\s*(?:https?:\/\/\S+\s*)+$/iu.test(line))return false;if(line.trim())source=false;return true;}).join('\n').trim();
}
