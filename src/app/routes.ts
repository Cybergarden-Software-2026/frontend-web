export type Page = 'incidents' | 'events' | 'teams' | 'analytics' | 'settings' | 'problems';
export interface AppRoute { page: Page; incidentId: string | null; }
const pages: Page[] = ['incidents', 'events', 'teams', 'analytics', 'settings', 'problems'];
function pageOrDefault(value: string | null): Page {
 return pages.includes(value as Page) ? value as Page : 'incidents';
}
export function readRoute(hash: string): AppRoute {
 const [path, query = ''] = hash.replace(/^#/, '').split('?');
 const params = new URLSearchParams(query);
 if (path.startsWith('incident/')) {
  let incidentId: string | null = null;
  try { incidentId = decodeURIComponent(path.slice('incident/'.length)) || null; } catch {}
  return { page: pageOrDefault(params.get('from')), incidentId };
 }
 // Existing links to #incidents?incident=... remain valid.
 return { page: pageOrDefault(path), incidentId: params.get('incident') || null };
}
export function incidentHash(id: string, from: Page): string {
 return `#incident/${encodeURIComponent(id)}?from=${from}`;
}
export const backLabels: Record<Page, string> = {
 incidents: 'Назад к инцидентам', events: 'Назад к событиям', teams: 'Назад к командам',
 analytics: 'Назад к аналитике', settings: 'Назад к настройкам', problems: 'Назад к массовым сбоям',
};
