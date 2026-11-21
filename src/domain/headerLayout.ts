// The measured deck excludes the fixed summary on the left.
// Keep cards readable and use every available slot on wider displays.
export function headerCardCapacity(deckWidth:number):number {
 if(!Number.isFinite(deckWidth)||deckWidth<=0)return 1;
 return Math.max(1,Math.floor((deckWidth+12)/(200+12)));
}
