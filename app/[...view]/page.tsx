import { LoopSwapApp } from '../../components/loopswap-app';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ view: string[] }> }) {
  const { view } = await params;
  return <LoopSwapApp path={view} />;
}
