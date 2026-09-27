/** The bridge reconstructs cancelled Worker replies as AbortError. Native
 * display cancellation has the same type. Do not infer cancellation from a
 * browser's localized error text, or hide unrelated failures after a click. */
export function atlasOperationFailureFeedback(failure: unknown): { error: string; status: string } {
  if (failure instanceof Error && failure.name === 'AbortError') return { error: '', status: '操作已取消；已经提交的草稿仍保留。' };
  return { error: failure instanceof Error ? failure.message : String(failure), status: '操作未完成，请查看原因。' };
}
