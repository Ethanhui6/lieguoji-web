type WorkerTaskScheduler = {
  postTask(callback: () => void, options: { priority: 'background' }): Promise<unknown>;
};

/** Worker-only cooperative boundary. A posted task, or the existing timer
 * fallback, lets pending input run; a resolved Promise would not do that.
 * Cancellation belongs to each caller's existing before/after guards. In
 * particular, a late abort must not cancel already durable verification. */
export async function yieldAtlasWorkerTask(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: WorkerTaskScheduler }).scheduler;
  if (typeof scheduler?.postTask === 'function') {
    // Invoke as a method: native postTask requires its scheduler receiver.
    // A scheduling failure is a real failure, never a silent timer retry.
    await scheduler.postTask(() => {}, { priority: 'background' });
  } else {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}
