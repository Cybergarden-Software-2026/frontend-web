/** Some browser push operations can remain pending after an interrupted system prompt. */
export async function withPushDeadline<T>(operation: Promise<T>, limitMs: number, message: string): Promise<T> {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  return await Promise.race([operation, new Promise<never>((_, reject) => {
   timer = setTimeout(() => reject(new Error(message)), limitMs);
  })]);
 } finally {
  clearTimeout(timer);
 }
}

export async function waitForPushWorker(registration: ServiceWorkerRegistration, limitMs = 8000): Promise<void> {
 let interval: ReturnType<typeof setInterval> | undefined;
 try {
  await withPushDeadline(new Promise<void>(resolve => {
   if (registration.active?.state === 'activated') { resolve(); return; }
   // Wait for this registration. navigator.serviceWorker.ready never rejects
   // and can wait indefinitely when the page has no active matching worker.
   interval = setInterval(() => {
    if (registration.active?.state === 'activated') resolve();
   }, 100);
  }), limitMs, 'Модуль уведомлений ещё не запустился. Нажмите на колокольчик, чтобы повторить.');
 } finally {
  clearInterval(interval);
 }
}
