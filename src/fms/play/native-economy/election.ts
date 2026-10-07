/** HoldElection 845810 orchestration. Candidate collection, vote weight,
 * weighted winner, event creation and appointment are explicit native ports.
 * This does not claim that the browser's old term scheduler is the native one. */
import {f,iadd,int32} from './numeric';
export interface NativeElectionState {politicalSystem:number;leaderId:number;lastElectionTime:number;currentLeaderTerms:number}
export interface NativeElectionPerson {id:number}
export interface NativeElectionPorts<S,C,E> {
 getYearSince:(time:number)=>number;
 republicCandidates:(state:S)=>readonly (C|null)[]|null;
 federationCandidates:(state:S)=>readonly (C|null)[]|null;
 determineWinner:(state:S,candidates:readonly (C|null)[])=>C|null;
 voteWeight:(state:S,candidate:C|null)=>number;
 gameTime:()=>number;
 createEvent:(state:S,winnerId:number,candidateIds:number[],votePercentages:number[],time:number)=>E;
 recordGlobal:(event:E)=>void;
 recordState:(state:S,event:E,showPopup:false)=>void;
 getLeader:(state:S)=>C|null;
 appoint:(state:S,winner:C,kind:'election',previous:C|null)=>void;
}
function required<T>(value:T|null):T{if(value===null)throw Error('Missing reached native election input');return value;}
export function nativeHoldElection<S extends NativeElectionState,C extends NativeElectionPerson,E>(state:S|null,emergency:boolean,p:NativeElectionPorts<S,C,E>):void{
 const s=required(state);if(s.politicalSystem!==3&&s.politicalSystem!==2)return;
 if(!emergency&&!(f(s.lastElectionTime)<0)&&f(int32(p.getYearSince(f(s.lastElectionTime))))<8)return;
 // The polity is read again after the time callback, as in the source.
 const candidates=s.politicalSystem===3?required(p.republicCandidates(s)):s.politicalSystem===2?required(p.federationCandidates(s)):[];
 if(candidates.length===0)return;
 const winner=p.determineWinner(s,candidates);if(winner===null)return;
 const ids=candidates.map(c=>required(c).id),votes:number[]=[];let total=f(0);
 for(const c of candidates){const weight=f(p.voteWeight(s,c));votes.push(weight);total=f(total+weight);}
 if(total>0)for(let i=0;i<votes.length;i++)votes[i]=f(f(votes[i]/total)*f(100));
 const winnerId=winner.id,time=f(p.gameTime()),event=p.createEvent(s,winnerId,ids,votes,time);
 p.recordGlobal(event);p.recordState(s,event,false);
 // Event callbacks finish before the live leader ID and winner ID comparison.
 if(winner.id===s.leaderId)s.currentLeaderTerms=iadd(s.currentLeaderTerms,1);
 else{const previous=p.getLeader(s);s.currentLeaderTerms=1;p.appoint(s,winner,'election',previous);}
 s.lastElectionTime=f(p.gameTime());
}
