import type { Incident } from '../domain/incidents.ts';
import { timestamp } from '../domain/incidents.ts';
import { displaySlaKind } from '../domain/deadlineDisplay.ts';

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
