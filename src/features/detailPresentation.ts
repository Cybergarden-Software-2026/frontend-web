import type { Analysis, ChangeEvent, Incident } from '../domain/incidents.ts';
import { incidentBrief, timestamp } from '../domain/incidents.ts';
import { displaySlaKind } from '../domain/deadlineDisplay.ts';

export function detailBrief(item: Incident, events: readonly ChangeEvent[], revision: number, analysis: Analysis | null) {
 if (analysis?.sysId === item.sysId && analysis.revision === revision && typeof analysis.summary === 'string') {
  const summary = analysis.summary.trim();
  // Older responses identify an AI-written summary with a prefix when routing used rules.
  const modelPrefix = 'Разбор ИИ.';
  const prefixed = summary.startsWith(modelPrefix);
  const text = prefixed ? summary.slice(modelPrefix.length).trim() : summary;
  if (text) return { text, generated: prefixed || analysis.provider === 'llm' };
 }
 // The detail's first page may contain history older than the global snapshot window.
 const history = events.filter(event => event.sysId === item.sysId && event.revision <= revision)
  .sort((a, b) => b.eventId - a.eventId);
 return { text: incidentBrief(item, history), generated: false };
}

export function detailDate(value: unknown): string {
 const time = timestamp(value);
 if (time === null) return 'Не указано';
 const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }).format(time);
 const clock = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(time);
 return `${date} в ${clock} МСК`;
}

export function detailSla(item: Incident, now: number) {
 const kind = displaySlaKind(item, now);
 const staticStates = { restored: ['Остановлен', '00:00:00'], closed: ['Остановлен', '00:00:00'], unknown: ['Срок не указан', '--:--:--'] };
 if (kind in staticStates) {
  const [label, value] = staticStates[kind as keyof typeof staticStates];
  return { kind, label, value };
 }
 const seconds = Math.floor(Math.abs((timestamp(item.deadline) ?? now) - now) / 1000);
 const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
 return { kind, label: kind === 'late' ? 'Просрочка' : 'До дедлайна', value: `${kind === 'late' ? '−' : ''}${time}` };
}
