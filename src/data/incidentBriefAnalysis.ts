import type { Analysis } from '../domain/incidents.ts';
import { api } from './api.ts';

const retryDelays = [2_000, 4_000, 8_000, 15_000, 30_000, 30_000];

/** Watch a single open card while its server-side summary is being generated. */
export function watchIncidentBrief(sysId: string, revision: number, receive: (value: Analysis) => void) {
 const controller = new AbortController();
 let timer: ReturnType<typeof setTimeout> | undefined;
 let retries = 0;

 async function read() {
  let result: Analysis;
  try {
   result = await api.analysis(sysId, controller.signal);
  } catch {
   return; // Keep the current brief, including the local one on the first request.
  }
  if (controller.signal.aborted || result?.sysId !== sysId || result.revision !== revision) return;
  receive(result);
  if (result.summaryPending === true && retries < retryDelays.length) {
   timer = setTimeout(read, retryDelays[retries++]);
  }
 }

 void read();
 return () => {
  controller.abort();
  clearTimeout(timer);
 };
}
