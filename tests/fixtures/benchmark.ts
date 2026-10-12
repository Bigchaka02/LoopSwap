import { createSeed, fixtureId } from '../../domain/seed';
/** Dense 250-item fixture for measurements only; never included in app startup. */
export function benchmarkState(now: number) {
  const state=createSeed(now),categories=state.categories.map(c=>c.id);
  const main=structuredClone(state.listings[0]);state.listings=state.listings.slice(0,3);
  for(let n=3;n<250;n++) {
    const ownerId=fixtureId(2000+Math.floor((n-3)/3));
    if(!state.members.some(m=>m.id===ownerId))state.members.push({...structuredClone(state.members[0]),id:ownerId,name:`Benchmark member ${n}`,role:'member'});
    const categoryId=categories[n%categories.length];
    state.listings.push({...structuredClone(main),id:fixtureId(3000+n),ownerId,title:`Benchmark item ${n}`,categoryId,catalogId:null,photo:null,wants:[0,2,4].map((offset,k)=>({id:fixtureId(5000+n*3+k),mode:'category',categoryId:categories[(n+offset)%categories.length],minCondition:1,priority:2,version:1}))});
  }
  state.listings[0].wants=[...state.listings[0].wants,...categories.slice(0,4).map((categoryId,n)=>({id:fixtureId(9000+n),mode:'category' as const,categoryId,minCondition:1,priority:2,version:1}))];
  return state;
}
