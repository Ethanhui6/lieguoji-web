import { describe, expect, it } from 'vitest';
import { atlasOperationFailureFeedback } from './atlas-operation-feedback';

describe('atlas operation failure feedback', () => {
  it('shows readable cancellation for a real default AbortController rejection without an overriding alert', () => {
    const controller = new AbortController(); controller.abort();
    let failure: unknown;
    try { controller.signal.throwIfAborted(); } catch (error) { failure = error; }
    const feedback = atlasOperationFailureFeedback(failure);
    expect(feedback.error).toBe(''); expect(feedback.status).toContain('取消'); expect(feedback.status).toContain('已经提交的草稿仍保留');
  });

  it('recognizes the structured AbortError rebuilt by the bridge independently of its browser message', () => {
    const error = new Error('signal is aborted without reason'); error.name = 'AbortError';
    const feedback = atlasOperationFailureFeedback(error);
    expect(feedback.error || feedback.status).toBe('操作已取消；已经提交的草稿仍保留。');
  });

  it.each(['signal is aborted without reason', '取消时恢复已保存地图失败', 'Atlas 完整根 CAS 冲突，未覆盖。'])('preserves a real failure even if its text mentions cancellation: %s', message => {
    expect(atlasOperationFailureFeedback(new Error(message))).toEqual({ error: message, status: '操作未完成，请查看原因。' });
  });

  it('does not treat a string or an untyped error-shaped value as an acknowledged cancellation', () => {
    expect(atlasOperationFailureFeedback('AbortError').error).toBe('AbortError');
    expect(atlasOperationFailureFeedback({ name: 'AbortError', message: 'cancelled' }).status).toBe('操作未完成，请查看原因。');
  });
});
