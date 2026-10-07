/** WarManagerV2.LeaveAllWars 686540: principal departure ends the war with
 * reason 2. A supporting participant is removed; its side can keep fighting.
 * A removed participant is NOT a destroyed participant. */
export function nativeLeaveWarDisposition(w:{primaryAttackerId:number;primaryDefenderId:number;participants:readonly {stateId:number;side:0|1|2}[]},stateId:number){
 const member=w.participants.find(p=>p.stateId===stateId);
 if(!member||member.side===2)return 'absent' as const;
 if(stateId===w.primaryAttackerId||stateId===w.primaryDefenderId)return 'end' as const;
 return w.participants.some(p=>p.stateId!==stateId&&p.side===member.side)?'remove-and-continue' as const:'remove-and-end' as const;
}
