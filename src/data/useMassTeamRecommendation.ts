import { useEffect, useState } from 'react';
import type { Analysis } from '../domain/incidents';
import { recommendMassTeam } from '../domain/massTeamRecommendation';
import { api } from './api';

const CONCURRENT_ANALYSES = 4;

interface GroupAnalyses {
 memberKey: string;
 revision: number;
 analyses: Analysis[];
 loading: boolean;
}

export function useMassTeamRecommendation(
 incidentIds: readonly string[],
 teams: readonly string[],
 revision: number | undefined,
 enabled: boolean,
) {
 const memberKey = JSON.stringify([...new Set(incidentIds)].sort());
 const canLoad = enabled && incidentIds.length > 0 && revision !== undefined;
 const [result, setResult] = useState<GroupAnalyses | null>(null);

 useEffect(() => {
  if (!canLoad || revision === undefined) return;

  const controller = new AbortController();
  const ids: string[] = JSON.parse(memberKey);
  let next = 0;
  const analyses: Analysis[] = [];
  setResult(previous => ({
   memberKey,
   revision,
   loading: true,
   analyses: previous?.memberKey === memberKey && previous.revision === revision ? previous.analyses : [],
  }));

  async function load() {
   while (!controller.signal.aborted && next < ids.length) {
    const id = ids[next++];
    try {
     const analysis = await api.analysis(id, controller.signal);
     if (analysis.sysId === id) analyses.push(analysis);
    } catch {
     // A missing analysis should not delay access to the regular team directory.
    }
   }
  }

  void Promise.all(Array.from({ length: Math.min(CONCURRENT_ANALYSES, ids.length) }, load)).then(() => {
   if (!controller.signal.aborted) setResult({ memberKey, revision, analyses, loading: false });
  });
  return () => controller.abort();
 }, [canLoad, memberKey, revision]);

 const current = result?.memberKey === memberKey && result.revision === revision ? result : null;
 return {
  loading: canLoad && (current?.loading ?? true),
  recommendation: canLoad && current ? recommendMassTeam(incidentIds, teams, current.revision, current.analyses) : null,
 };
}
