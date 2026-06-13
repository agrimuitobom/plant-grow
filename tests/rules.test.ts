import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'plant-grow-test';
const CLASS_ID = 'class-test';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

// 認証付きクライアントを返すヘルパ。
// "auth/google" を sign_in_provider に入れて、Rules の `firebase.sign_in_provider != 'anonymous'` を満たす。
function asUser(uid: string, email = `${uid}@school.test`) {
  return env
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' } as never,
    })
    .firestore();
}

function asAnon() {
  return env.unauthenticatedContext().firestore();
}

// 教員ロール seed 用に Rules をバイパスして書き込む。
async function seedTeacher(uid: string, displayName = 'T先生') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'classes', CLASS_ID, 'teachers', uid), {
      uid,
      displayName,
      email: `${uid}@school.test`,
    });
  });
}

// 生徒の名簿 + レコードを seed する。
async function seedStudent(
  uid: string,
  records: { date: string; data?: Record<string, unknown> }[] = []
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'classes', CLASS_ID, 'students', uid), {
      uid,
      displayName: `${uid} さん`,
      email: `${uid}@school.test`,
    });
    for (const r of records) {
      await setDoc(doc(fs, 'classes', CLASS_ID, 'students', uid, 'records', r.date), {
        date: r.date,
        strains: [{ id: 'A', name: 'A株', height: 10, leafCount: 5 }],
        averages: { height: 10, leafCount: 5 },
        createdBy: uid,
        updatedBy: uid,
        ...(r.data ?? {}),
      });
    }
  });
}

const VALID_RECORD = {
  date: '2026-04-20',
  strains: [
    { id: 'A', name: 'A株', height: 10, leafCount: 5, memo: '', photoPath: null, photoUrl: null },
  ],
  averages: { height: 10, leafCount: 5 },
  createdBy: 'student-a',
  updatedBy: 'student-a',
  updatedByName: 'A',
};

describe('records: ownership', () => {
  it('owner can read and write their own record', async () => {
    const fs = asUser('student-a');
    await assertSucceeds(
      setDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-20'), VALID_RECORD)
    );
    await assertSucceeds(
      getDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-20'))
    );
  });

  it("another student cannot read or write someone else's record", async () => {
    await seedStudent('student-a', [{ date: '2026-04-20' }]);
    const fs = asUser('student-b');
    await assertFails(
      getDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-20'))
    );
    await assertFails(
      setDoc(
        doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-21'),
        { ...VALID_RECORD, date: '2026-04-21' }
      )
    );
  });

  it('anonymous (unauthenticated) is denied everywhere', async () => {
    await seedStudent('student-a', [{ date: '2026-04-20' }]);
    const fs = asAnon();
    await assertFails(
      getDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-20'))
    );
  });

  it('rejects record writes that violate the schema', async () => {
    const fs = asUser('student-a');
    // strains 空 (size > 0 必須)
    await assertFails(
      setDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-20'), {
        ...VALID_RECORD,
        strains: [],
      })
    );
    // doc id が不正な日付フォーマット
    await assertFails(
      setDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', 'not-a-date'), VALID_RECORD)
    );
    // createdBy が path uid と不一致
    await assertFails(
      setDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-20'), {
        ...VALID_RECORD,
        createdBy: 'someone-else',
      })
    );
  });
});

describe('teacher access', () => {
  it('teacher in same class can read any student record', async () => {
    await seedTeacher('teacher-1');
    await seedStudent('student-a', [{ date: '2026-04-20' }]);
    const fs = asUser('teacher-1');
    await assertSucceeds(
      getDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-20'))
    );
  });

  it('teacher cannot write to another student record', async () => {
    await seedTeacher('teacher-1');
    await seedStudent('student-a');
    const fs = asUser('teacher-1');
    await assertFails(
      setDoc(
        doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'records', '2026-04-20'),
        { ...VALID_RECORD, createdBy: 'teacher-1', updatedBy: 'teacher-1' }
      )
    );
  });

  it('teacher can list the roster', async () => {
    await seedTeacher('teacher-1');
    await seedStudent('student-a');
    await seedStudent('student-b');
    const fs = asUser('teacher-1');
    await assertSucceeds(getDocs(collection(fs, 'classes', CLASS_ID, 'students')));
  });

  it('non-teacher cannot list the roster', async () => {
    await seedStudent('student-a');
    await seedStudent('student-b');
    const fs = asUser('student-a');
    await assertFails(getDocs(collection(fs, 'classes', CLASS_ID, 'students')));
  });
});

describe('teacher role management', () => {
  it('existing teacher can promote another user to teacher', async () => {
    await seedTeacher('teacher-1');
    const fs = asUser('teacher-1');
    await assertSucceeds(
      setDoc(doc(fs, 'classes', CLASS_ID, 'teachers', 'teacher-2'), {
        uid: 'teacher-2',
        displayName: 'T2',
      })
    );
  });

  it('non-teacher cannot create a teacher doc', async () => {
    const fs = asUser('student-a');
    await assertFails(
      setDoc(doc(fs, 'classes', CLASS_ID, 'teachers', 'student-a'), {
        uid: 'student-a',
        displayName: 'self-promo',
      })
    );
  });

  it('teacher cannot remove themselves', async () => {
    await seedTeacher('teacher-1');
    const fs = asUser('teacher-1');
    await assertFails(
      deleteDoc(doc(fs, 'classes', CLASS_ID, 'teachers', 'teacher-1'))
    );
  });

  it('teacher can remove a different teacher', async () => {
    await seedTeacher('teacher-1');
    await seedTeacher('teacher-2');
    const fs = asUser('teacher-1');
    await assertSucceeds(
      deleteDoc(doc(fs, 'classes', CLASS_ID, 'teachers', 'teacher-2'))
    );
  });
});

describe('history subcollection', () => {
  const HISTORY_PAYLOAD = {
    ...VALID_RECORD,
    snapshotAt: new Date('2026-04-19T00:00:00Z'),
    snapshotBy: 'student-a',
    snapshotByName: 'A',
  };

  it('owner can create a history snapshot', async () => {
    const fs = asUser('student-a');
    await assertSucceeds(
      setDoc(
        doc(
          fs,
          'classes',
          CLASS_ID,
          'students',
          'student-a',
          'records',
          '2026-04-20',
          'history',
          'snap-1'
        ),
        HISTORY_PAYLOAD
      )
    );
  });

  it("another student cannot create / read someone else's history", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(
        doc(
          fs,
          'classes',
          CLASS_ID,
          'students',
          'student-a',
          'records',
          '2026-04-20',
          'history',
          'snap-1'
        ),
        HISTORY_PAYLOAD
      );
    });
    const fs = asUser('student-b');
    await assertFails(
      getDoc(
        doc(
          fs,
          'classes',
          CLASS_ID,
          'students',
          'student-a',
          'records',
          '2026-04-20',
          'history',
          'snap-1'
        )
      )
    );
    await assertFails(
      setDoc(
        doc(
          fs,
          'classes',
          CLASS_ID,
          'students',
          'student-a',
          'records',
          '2026-04-20',
          'history',
          'snap-2'
        ),
        HISTORY_PAYLOAD
      )
    );
  });

  it('teacher can read history but cannot write', async () => {
    await seedTeacher('teacher-1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(
        doc(
          fs,
          'classes',
          CLASS_ID,
          'students',
          'student-a',
          'records',
          '2026-04-20',
          'history',
          'snap-1'
        ),
        HISTORY_PAYLOAD
      );
    });
    const fs = asUser('teacher-1');
    await assertSucceeds(
      getDoc(
        doc(
          fs,
          'classes',
          CLASS_ID,
          'students',
          'student-a',
          'records',
          '2026-04-20',
          'history',
          'snap-1'
        )
      )
    );
    await assertFails(
      setDoc(
        doc(
          fs,
          'classes',
          CLASS_ID,
          'students',
          'student-a',
          'records',
          '2026-04-20',
          'history',
          'snap-2'
        ),
        HISTORY_PAYLOAD
      )
    );
  });
});

describe('comments subcollection', () => {
  const commentRef = (fs: ReturnType<typeof asUser>, commentId: string) =>
    doc(
      fs,
      'classes',
      CLASS_ID,
      'students',
      'student-a',
      'records',
      '2026-04-20',
      'comments',
      commentId
    );

  const buildComment = (createdBy: string, text = 'よく観察できているね') => ({
    text,
    createdBy,
    createdByName: 'T先生',
  });

  it('teacher can create a comment with own uid as author', async () => {
    await seedTeacher('teacher-1');
    const fs = asUser('teacher-1');
    await assertSucceeds(setDoc(commentRef(fs, 'c1'), buildComment('teacher-1')));
  });

  it('non-teacher cannot create a comment (even student on own record)', async () => {
    const fs = asUser('student-a');
    await assertFails(setDoc(commentRef(fs, 'c1'), buildComment('student-a')));
  });

  it('student can read comments on their own records', async () => {
    await seedTeacher('teacher-1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(commentRef(fs as never, 'c1'), buildComment('teacher-1'));
    });
    const fs = asUser('student-a');
    await assertSucceeds(getDoc(commentRef(fs, 'c1')));
  });

  it("another student cannot read someone else's comments", async () => {
    await seedTeacher('teacher-1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(commentRef(fs as never, 'c1'), buildComment('teacher-1'));
    });
    const fs = asUser('student-b');
    await assertFails(getDoc(commentRef(fs, 'c1')));
  });

  it('teacher cannot update another teacher comment', async () => {
    await seedTeacher('teacher-1');
    await seedTeacher('teacher-2');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(commentRef(fs as never, 'c1'), buildComment('teacher-1'));
    });
    const fs = asUser('teacher-2');
    await assertFails(
      setDoc(commentRef(fs, 'c1'), buildComment('teacher-1', 'modified by other teacher'))
    );
  });

  it('teacher can update own comment', async () => {
    await seedTeacher('teacher-1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(commentRef(fs as never, 'c1'), buildComment('teacher-1'));
    });
    const fs = asUser('teacher-1');
    await assertSucceeds(
      setDoc(commentRef(fs, 'c1'), buildComment('teacher-1', '更新後の内容'))
    );
  });

  it('teacher cannot delete another teacher comment', async () => {
    await seedTeacher('teacher-1');
    await seedTeacher('teacher-2');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(commentRef(fs as never, 'c1'), buildComment('teacher-1'));
    });
    const fs = asUser('teacher-2');
    await assertFails(deleteDoc(commentRef(fs, 'c1')));
  });

  it('rejects empty or too-long comment text', async () => {
    await seedTeacher('teacher-1');
    const fs = asUser('teacher-1');
    await assertFails(
      setDoc(commentRef(fs, 'c1'), { ...buildComment('teacher-1'), text: '' })
    );
    await assertFails(
      setDoc(commentRef(fs, 'c2'), { ...buildComment('teacher-1'), text: 'x'.repeat(1001) })
    );
  });
});

describe('passwordResets audit log', () => {
  const seedLog = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(doc(fs, 'classes', CLASS_ID, 'passwordResets', 'log-1'), {
        studentUid: 'student-a',
        resetBy: 'teacher-1',
        resetByName: 'T先生',
        at: new Date(),
      });
    });
  };

  it('teacher can read password reset logs in their class', async () => {
    await seedTeacher('teacher-1');
    await seedLog();
    const fs = asUser('teacher-1');
    await assertSucceeds(
      getDoc(doc(fs, 'classes', CLASS_ID, 'passwordResets', 'log-1'))
    );
  });

  it('student cannot read password reset logs', async () => {
    await seedLog();
    const fs = asUser('student-a');
    await assertFails(
      getDoc(doc(fs, 'classes', CLASS_ID, 'passwordResets', 'log-1'))
    );
  });

  it('teacher cannot write password reset logs from client', async () => {
    await seedTeacher('teacher-1');
    const fs = asUser('teacher-1');
    await assertFails(
      setDoc(doc(fs, 'classes', CLASS_ID, 'passwordResets', 'log-2'), {
        studentUid: 'student-a',
        resetBy: 'teacher-1',
        resetByName: 'T先生',
        at: new Date(),
      })
    );
  });
});

describe('events subcollection', () => {
  const eventRef = (fs: ReturnType<typeof asUser>, eventId: string) =>
    doc(fs, 'classes', CLASS_ID, 'students', 'student-a', 'events', eventId);

  const buildEvent = (createdBy: string, type = 'water', date = '2026-04-20') => ({
    date,
    type,
    createdBy,
    createdByName: createdBy,
  });

  it('owner can create an event of a known type', async () => {
    const fs = asUser('student-a');
    await assertSucceeds(setDoc(eventRef(fs, 'e1'), buildEvent('student-a', 'water')));
    await assertSucceeds(
      setDoc(eventRef(fs, 'e2'), buildEvent('student-a', 'weather-rain'))
    );
  });

  it('rejects unknown event types', async () => {
    const fs = asUser('student-a');
    await assertFails(
      setDoc(eventRef(fs, 'e1'), buildEvent('student-a', 'snowfall' as never))
    );
  });

  it('rejects malformed date field', async () => {
    const fs = asUser('student-a');
    await assertFails(
      setDoc(eventRef(fs, 'e1'), buildEvent('student-a', 'water', 'not-a-date'))
    );
  });

  it("another student cannot create or read someone else's event", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(eventRef(fs as never, 'e1'), buildEvent('student-a'));
    });
    const fs = asUser('student-b');
    await assertFails(getDoc(eventRef(fs, 'e1')));
    await assertFails(setDoc(eventRef(fs, 'e2'), buildEvent('student-b')));
  });

  it('teacher can read events but cannot create/update/delete', async () => {
    await seedTeacher('teacher-1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(eventRef(fs as never, 'e1'), buildEvent('student-a'));
    });
    const fs = asUser('teacher-1');
    await assertSucceeds(getDoc(eventRef(fs, 'e1')));
    await assertFails(setDoc(eventRef(fs, 'e2'), buildEvent('teacher-1')));
    await assertFails(deleteDoc(eventRef(fs, 'e1')));
  });

  it('owner can delete their own event', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(eventRef(fs as never, 'e1'), buildEvent('student-a'));
    });
    const fs = asUser('student-a');
    await assertSucceeds(deleteDoc(eventRef(fs, 'e1')));
  });

  it('rejects updates (append-only)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(eventRef(fs as never, 'e1'), buildEvent('student-a', 'water'));
    });
    const fs = asUser('student-a');
    await assertFails(
      setDoc(eventRef(fs, 'e1'), buildEvent('student-a', 'fertilizer'))
    );
  });
});

describe('parent share snapshots (shares/{token})', () => {
  const seedShare = async (token: string, expiresAt: Date) => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      await setDoc(doc(fs, 'shares', token), {
        classId: CLASS_ID,
        studentUid: 'student-a',
        studentDisplayName: 'Aさん',
        records: [],
        events: [],
        expiresAt,
        createdBy: 'student-a',
      });
    });
  };

  it('anyone (even unauthenticated) can read a non-expired share by token', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await seedShare('t1', future);
    const fs = asAnon();
    await assertSucceeds(getDoc(doc(fs, 'shares', 't1')));
  });

  it('expired shares are unreadable even by signed-in users', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    await seedShare('t2', past);
    const fs = asUser('student-a');
    await assertFails(getDoc(doc(fs, 'shares', 't2')));
  });

  it('no client can write to shares (only Cloud Function via Admin SDK)', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const fs = asUser('student-a');
    await assertFails(
      setDoc(doc(fs, 'shares', 't3'), {
        classId: CLASS_ID,
        studentUid: 'student-a',
        studentDisplayName: 'Aさん',
        records: [],
        events: [],
        expiresAt: future,
        createdBy: 'student-a',
      })
    );
  });

  it('no client (even teacher) can delete a share', async () => {
    await seedTeacher('teacher-1');
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await seedShare('t4', future);
    const fs = asUser('teacher-1');
    await assertFails(deleteDoc(doc(fs, 'shares', 't4')));
  });
});

describe('roster (students/{uid})', () => {
  it('student can upsert only their own roster doc with uid+displayName', async () => {
    const fs = asUser('student-a');
    await assertSucceeds(
      setDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a'), {
        uid: 'student-a',
        displayName: 'A さん',
      })
    );
    await assertFails(
      setDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-b'), {
        uid: 'student-b',
        displayName: 'B さん',
      })
    );
  });

  it('roster write rejects mismatched uid field', async () => {
    const fs = asUser('student-a');
    await assertFails(
      setDoc(doc(fs, 'classes', CLASS_ID, 'students', 'student-a'), {
        uid: 'someone-else',
        displayName: 'spoof',
      })
    );
  });
});
