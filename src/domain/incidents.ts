export const COORDINATOR_TEAM = 'КЦ ИТ Координаторы Массовых Инцидентов';
export const STATES = { Assigned: 'Назначен', WorkInProgress: 'Выполняется', Resolved: 'Завершён', Closed: 'Закрыт', Research: 'Исследование', Unknown: 'Неизвестный статус' } as const;
export type State = keyof typeof STATES;
export type Group = 'all' | 'critical' | 'coordinators' | 'high' | 'research' | 'resolved' | 'closed';
export const GROUPS = [
 { id: 'critical', title: 'Критические', hint: 'Наивысший приоритет · 4', icon: 'alert', tone: 'danger' },
 { id: 'coordinators', title: 'На координаторах', hint: 'Ожидают передачи команде', icon: 'people', tone: 'blue' },
 { id: 'high', title: 'Высокий приоритет', hint: 'Требуют особого внимания', icon: 'bolt', tone: 'warning' },
 { id: 'research', title: 'Исследование', hint: 'Исследование ситуации', icon: 'search', tone: 'purple' },
] as const;
export interface Incident {
 [key: string]: unknown;
 sysId: string; id: string; header: string; description: string; shortDescription?: string;
 productName: string; productId?: string; productMasterId?: string; service: string; serviceId?: string | null; scenarioName?: string;
 stateId: number | null; stateEnum: string; state: string; stateReason?: string | null;
 priorityId: number; priority: string; urgencyId: number | null; urgency: string; impactId: number | null; impact: string;
 assignedGroupName: string; assignedEmployee?: string; assignedEmployeeLogin?: string;
 submitDate: string; deadline: string | null; completionDate: string | null; lastAssignmentToTeamDateTime?: string | null;
 isNeedUp?: boolean | null; isDouble?: boolean; isMaster?: boolean; isEffect?: boolean; isReason?: boolean;
 solution?: string; serviceType?: string; receivingChannel?: string; initiatorName?: string; initiatorLogin?: string;
}
export interface ChangeEvent {
 eventId: number; revision: number; sysId: string; incidentId: string; header: string;
 types: string[]; fields: string[]; at: string;
 previous: Partial<Incident> | null; current: Incident | null;
}
export interface SourceHealth { path: string; readAt: string | null; error: string | null; }
export interface Snapshot {
 revision: number; serverTime: string; updatedAt: string; items: Incident[]; events: ChangeEvent[];
 source: SourceHealth; itsmUrlTemplate: string | null;
}
export interface Analysis {
 sysId: string; revision: number; generatedAt: string; provider: 'rules' | 'llm'; summary: string;
 facts: { label: string; value: string }[];
 attention: string[]; candidates: { team: string; evidenceIds: string[]; reason: string }[];
 missing: string[];
}
export function stateOf(item: Incident): State {
 if (Object.hasOwn(STATES,item.stateEnum)) return item.stateEnum as State;
 if (item.stateEnum || item.stateId == null) return 'Unknown';
 return ({ 0: 'Assigned', 2: 'WorkInProgress', 7: 'Resolved', 10: 'Closed', 20: 'Research' } as Record<number, State>)[item.stateId] ?? 'Unknown';
}
export function operational(item: Incident) { return ['Assigned','WorkInProgress'].includes(stateOf(item)); }
export function requiresAttention(item: Incident) { return operational(item) || stateOf(item) === 'Research'; }
export function restored(item: Incident) { return ['Resolved','Closed','Research'].includes(stateOf(item)); }
export function belongs(item: Incident, group: Group): boolean {
 switch (group) {
  case 'critical': return operational(item) && item.priorityId === 4;
  case 'coordinators': return requiresAttention(item) && item.assignedGroupName.trim() === COORDINATOR_TEAM;
  case 'high': return operational(item) && item.priorityId === 3;
  case 'research': return stateOf(item) === 'Research';
  case 'resolved': return stateOf(item) === 'Resolved';
  case 'closed': return stateOf(item) === 'Closed';
  default: return true;
 }
}
export function timestamp(value: unknown): number | null {
 if (typeof value !== 'string' || !value || value.startsWith('0001-')) return null;
 const ms = Date.parse(value); return Number.isFinite(ms) ? ms : null;
}
export type Sla = 'late' | 'soon' | 'normal' | 'restored' | 'closed' | 'research' | 'unknown';
export function slaKind(item: Incident, now = Date.now()): Sla {
 const state = stateOf(item);
 if (state === 'Closed') return 'closed';
 if (state === 'Resolved') return 'restored';
 if (state === 'Research') return 'research';
 const deadline = timestamp(item.deadline);
 if (deadline === null || !operational(item)) return 'unknown';
 return deadline <= now ? 'late' : deadline - now <= 30 * 60_000 ? 'soon' : 'normal';
}
export function counts(items: Incident[], now = Date.now()) {
 return { all: items.length, active: items.filter(operational).length, attention: items.filter(requiresAttention).length,
 critical: items.filter(i => belongs(i,'critical')).length, coordinators: items.filter(i => belongs(i,'coordinators')).length,
 high: items.filter(i => belongs(i,'high')).length, research: items.filter(i => belongs(i,'research')).length,
 resolved: items.filter(i => stateOf(i)==='Resolved').length, closed: items.filter(i => stateOf(i)==='Closed').length,
 overdue: items.filter(i => slaKind(i,now)==='late').length };
}
export function canonical(value: unknown): string {
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,v]) => JSON.stringify(key)+':'+canonical(v)).join(',') + '}';
 return JSON.stringify(value) ?? 'null';
}
export function parseIncidents(value: unknown): Incident[] {
 if (!Array.isArray(value)) throw new Error('Ожидается JSON-массив инцидентов в исходном формате МТС.');
 if (value.length > 20_000) throw new Error('Слишком большой снимок: максимум 20 000 записей.');
 const sysIds = new Set<string>(), ids = new Set<string>();
 for (const [index, item] of value.entries()) {
  if (!item || typeof item !== 'object' || typeof item.sysId !== 'string' || !item.sysId.trim() || typeof item.id !== 'string' || !item.id.trim()) throw new Error(`Запись ${index+1}: обязательны строковые sysId и id.`);
  if (sysIds.has(item.sysId) || ids.has(item.id)) throw new Error(`Повторяющийся идентификатор: ${item.id}.`);
  if (typeof item.header !== 'string' || typeof item.assignedGroupName !== 'string' || typeof item.priorityId !== 'number' || typeof item.stateId !== 'number') throw new Error(`Запись ${item.id}: некорректный формат основных полей.`);
  if (timestamp(item.submitDate) === null) throw new Error(`Запись ${item.id}: некорректная дата регистрации.`);
  if (item.deadline != null && timestamp(item.deadline) === null) throw new Error(`Запись ${item.id}: некорректный дедлайн.`);
  sysIds.add(item.sysId); ids.add(item.id);
 }
 return value as Incident[];
}
export function changedFields(before: Incident, after: Incident): string[] {
 return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key => canonical(before[key]) !== canonical(after[key]));
}
export function eventTypes(before: Incident | null, after: Incident | null): string[] {
 if (!after) return ['removed'];
 const types: string[] = [];
 if (!before) types.push('created');
 if (belongs(after,'critical') && (!before || !belongs(before,'critical'))) types.push('critical');
 if (belongs(after,'coordinators') && (!before || !belongs(before,'coordinators'))) types.push('assigned');
 if (before && stateOf(after) !== stateOf(before)) {
  if (stateOf(after)==='Resolved') types.push('resolved');
  else if (stateOf(after)==='Closed') types.push('closed');
  else if (stateOf(after)==='Research') types.push('research');
  else if (!operational(before) && operational(after)) types.push('reopened');
 }
 if (before && before.deadline !== after.deadline) types.push('deadline');
 if (before && before.assignedGroupName !== after.assignedGroupName) types.push('team');
 if (before && before.priorityId !== after.priorityId) types.push('priority');
 return types.length ? types : ['changed'];
}
export const EVENT_LABELS: Record<string,string> = { critical:'Критический инцидент', assigned:'Назначен координаторам', resolved:'Проблема устранена', closed:'Инцидент закрыт', reopened:'Возвращён в работу', research:'Начато исследование', deadline:'Изменён срок', team:'Изменена команда', priority:'Изменён приоритет', created:'Новый инцидент', removed:'Удалён из снимка', changed:'Обновлены данные' };
export function describeEvent(event: ChangeEvent): string {
 const details: string[] = [];
 if (event.fields.includes('assignedGroupName')) details.push(`Команда: ${event.previous?.assignedGroupName || 'не указана'} → ${event.current?.assignedGroupName || 'не указана'}`);
 if (event.fields.includes('priorityId')) details.push(`Приоритет: ${event.previous?.priorityId ?? '—'} → ${event.current?.priorityId ?? '—'}`);
 if (event.fields.includes('stateEnum')) details.push(`Статус: ${event.previous?.state || '—'} → ${event.current?.state || '—'}`);
 if (event.fields.includes('deadline')) details.push('Обновлён дедлайн решения');
 return details.join(' · ') || `${event.fields.length} изменённых полей`;
}
export function analyze(item: Incident, items: Incident[], revision: number, now = Date.now()): Analysis {
 const attention: string[] = [], missing: string[] = [];
 if (belongs(item,'critical')) attention.push('Наивысший приоритет: необходимо оперативное внимание.');
 if (belongs(item,'coordinators')) attention.push('Назначен координаторам: необходимо определить команду для передачи.');
 if (slaKind(item,now)==='late') attention.push('Срок решения истёк. Проверьте необходимость эскалации.');
 if (slaKind(item,now)==='soon') attention.push('До дедлайна осталось менее 30 минут.');
 if (stateOf(item)==='Resolved') attention.push('Проблема устранена, но инцидент ещё может вернуться в работу.');
 if (stateOf(item)==='Closed') attention.push('Вся работа с инцидентом завершена.');
 if (stateOf(item)==='Research') attention.push('Идёт исследование причин; прежний дедлайн нельзя автоматически считать SLA исследования.');
 if (item.isNeedUp) attention.push('После устранения проблемы требуется работа с последствиями.');
 if (!timestamp(item.deadline)) missing.push('Не указан срок решения.');
 if (!item.assignedEmployee) missing.push('Не указан персональный исполнитель.');
 const matches = items.filter(other => other.sysId!==item.sysId && ['Resolved','Closed'].includes(stateOf(other)) && timestamp(other.completionDate)!==null && Boolean(other.assignedGroupName.trim()) && other.assignedGroupName!==COORDINATOR_TEAM && other.assignedGroupName!=='AutoClosedMi' && ((Boolean(item.service.trim()) && other.service===item.service) || (Boolean(item.scenarioName) && other.scenarioName===item.scenarioName && other.productName===item.productName)));
 const teams = new Map<string,string[]>();
 for (const match of matches) teams.set(match.assignedGroupName,[...(teams.get(match.assignedGroupName)??[]),match.id]);
 const candidates = [...teams].sort((a,b)=>b[1].length-a[1].length).slice(0,3).map(([team,evidenceIds]) => ({ team,evidenceIds,reason:'Команда встречается в завершённых записях того же сервиса или сценария продукта. Совпадение не подтверждает зону ответственности.' }));
 if (!candidates.length) missing.push('В снимке недостаточно сопоставимых завершённых случаев для рекомендации команды.');
 return { sysId:item.sysId,revision,generatedAt:new Date(now).toISOString(),provider:'rules',
 summary:item.shortDescription || item.description?.slice(0,420) || item.header,
 facts:[{label:'Продукт',value:item.productName},{label:'Сервис',value:item.service},{label:'Команда',value:item.assignedGroupName},{label:'Статус',value:STATES[stateOf(item)]}], attention,candidates,missing };
}
