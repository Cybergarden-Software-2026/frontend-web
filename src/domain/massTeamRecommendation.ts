import type { Analysis } from './incidents.ts';

export interface MassTeamRecommendation {
 team: string;
 support: number;
 total: number;
}

export function recommendMassTeam(
 incidentIds: readonly string[],
 teams: readonly string[],
 revision: number,
 analyses: readonly Analysis[],
): MassTeamRecommendation | null {
 const members = new Set(incidentIds);
 const directory = new Set(teams);
 const counted = new Set<string>();
 let team: string | undefined;

 for (const analysis of analyses) {
  if (analysis.provider !== 'llm' || analysis.revision !== revision || !members.has(analysis.sysId)) continue;
  const [candidate] = analysis.candidates;
  if (analysis.candidates.length !== 1 || !candidate.evidenceIds.length || !directory.has(candidate.team)) continue;
  if (team !== undefined && team !== candidate.team) return null;
  team = candidate.team;
  counted.add(analysis.sysId);
 }

 return team === undefined ? null : { team, support: counted.size, total: members.size };
}
