import { describe, expect, it } from 'vitest';
import { countUnreadComments } from './comments';
import type { CommentDoc } from '../types';

function comment(
  createdBy: string,
  createdAtMs: number,
  overrides: Partial<CommentDoc> = {}
): CommentDoc {
  return {
    id: `${createdBy}-${createdAtMs}`,
    text: 'x',
    createdBy,
    createdByName: createdBy,
    createdAt: { toMillis: () => createdAtMs } as never,
    ...overrides,
  };
}

const ts = (ms: number) => ({ toMillis: () => ms });

describe('countUnreadComments', () => {
  it('counts comments authored by others after lastReadAt', () => {
    const comments = [
      comment('teacher-1', 1000),
      comment('teacher-1', 2000),
      comment('teacher-2', 3000),
    ];
    expect(countUnreadComments(comments, 'student-a', ts(1500))).toBe(2);
  });

  it('excludes comments authored by the viewer themselves', () => {
    const comments = [
      comment('student-a', 2000), // 自分の (UI 上で見えないがロジック上は除外)
      comment('teacher-1', 2000),
    ];
    expect(countUnreadComments(comments, 'student-a', ts(1000))).toBe(1);
  });

  it('returns 0 when lastReadAt is after every comment', () => {
    const comments = [comment('teacher-1', 1000), comment('teacher-1', 2000)];
    expect(countUnreadComments(comments, 'student-a', ts(9999))).toBe(0);
  });

  it('treats null/undefined lastReadAt as "never read" (count all others)', () => {
    const comments = [comment('teacher-1', 1000), comment('student-a', 2000)];
    expect(countUnreadComments(comments, 'student-a', null)).toBe(1);
    expect(countUnreadComments(comments, 'student-a', undefined)).toBe(1);
  });

  it('ignores comments without a usable createdAt (treats as ms=0)', () => {
    const c = {
      id: 'no-ts',
      text: 'x',
      createdBy: 'teacher-1',
      createdByName: 'T',
    } as CommentDoc;
    expect(countUnreadComments([c], 'student-a', ts(0))).toBe(0);
  });
});
