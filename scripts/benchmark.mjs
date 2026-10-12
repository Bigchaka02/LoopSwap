import { createServer } from 'vite';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
const compiler = await createServer({ configFile:false, server:{ middlewareMode:true }, appType:'custom' });
try {
  const { ALICE } = await compiler.ssrLoadModule('/domain/seed.ts');
  const { benchmarkState } = await compiler.ssrLoadModule('/tests/fixtures/benchmark.ts');
  const { findMatches } = await compiler.ssrLoadModule('/domain/matching.ts');
  const now=1790780000,state=benchmarkState(now);
  const timings=[],runs=7;
  let result;
  for(let i=0;i<runs;i++){const begin=performance.now();result=findMatches(state,ALICE,[state.listings[0].id],now);timings.push(performance.now()-begin);}
  const sorted=timings.slice(1).sort((a,b)=>a-b);
  console.log(JSON.stringify({runtime:process.version,cpu:cpus()[0]?.model ?? 'not exposed by sandbox',cpuCount:cpus().length || 'not exposed by sandbox',memoryGiB:Number((totalmem()/1024**3).toFixed(1)),listings:state.listings.length,members:state.members.length,graph:'dense, three category wants on each synthetic added item; up to three active items/member',coldMs:Number(timings[0].toFixed(2)),warmMedianMs:Number(((sorted[2]+sorted[3])/2).toFixed(2)),slowestMs:Number(Math.max(...timings).toFixed(2)),runs,candidateCount:result.candidates.length,truncated:result.truncated,scope:'pure matcher CPU timing; excludes D1 read and HTTP overhead'},null,2));
} finally { await compiler.close(); }
