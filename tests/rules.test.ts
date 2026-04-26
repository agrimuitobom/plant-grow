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
