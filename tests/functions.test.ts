import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Cloud Functions の結合テスト。
 *
 * Functions / Auth / Firestore エミュレータに対して、アプリと同じ経路
 * (ID トークン付きの callable 呼び出し) で本物の関数を実行する。
 * firebase-admin / firebase-functions のメジャー更新が「型は通るが実行時に壊れる」
 * 形で入り込まないようにするための安全網。
 *
 * 実行: `npm run test:functions` (先に functions/ をビルドする)。
 */

const PROJECT_ID = 'plant-grow-test';
const CLASS_ID = 'class-fn-test';
const REGION = 'asia-northeast1';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}`;

type TestUser = { uid: string; idToken: string; email: string };

async function signUp(name: string, password = 'initial-pass-1'): Promise<TestUser> {
  const email = `${name}-${Date.now()}@${CLASS_ID}.invalid`;
  const res = await fetch(`${AUTH}/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: name, returnSecureToken: true }),
  });
  const json = (await res.json()) as { localId: string; idToken: string };
  if (!res.ok) throw new Error(`signUp failed: ${JSON.stringify(json)}`);
  return { uid: json.localId, idToken: json.idToken, email };
}

async function signIn(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${AUTH}/accounts:signInWithPassword?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return res.ok;
}

type CallResult = { ok: true; result: Record<string, unknown> } | { ok: false; status: string };

/** callable プロトコル ({data} を POST、{result} か {error} が返る) で関数を呼ぶ。 */
async function call(
  name: string,
  data: Record<string, unknown>,
  user?: TestUser
): Promise<CallResult> {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${user.idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const json = (await res.json()) as {
    result?: Record<string, unknown>;
    error?: { status: string };
  };
  if (json.error) return { ok: false, status: json.error.status };
  return { ok: true, result: json.result ?? {} };
}

let env: RulesTestEnvironment;
let teacher: TestUser;
let student: TestUser;
let outsider: TestUser;

/** Rules を通さずに Firestore を読み書きする (テストデータの仕込みと結果確認用)。 */
async function admin<T>(fn: (fs: ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>) => Promise<T>): Promise<T> {
  let out!: T;
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = await fn(ctx.firestore());
  });
  return out;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  await env.clearFirestore();
  [teacher, student, outsider] = await Promise.all([
    signUp('teacher'),
    signUp('student'),
    signUp('outsider'),
  ]);
  // 生徒は名簿に載っている (= 一度記録を保存した) 状態にする
  await admin(async (fs) => {
    await setDoc(doc(fs, 'classes', CLASS_ID, 'students', student.uid), {
      uid: student.uid,
      displayName: 'student',
      email: student.email,
    });
    const rec = (date: string, height: number, leafCount: number) =>
      setDoc(doc(fs, 'classes', CLASS_ID, 'students', student.uid, 'records', date), {
        date,
        strains: [{ id: 'A', name: 'A株', height, leafCount, memo: '', photos: [] }],
        averages: { height, leafCount },
        createdBy: student.uid,
        updatedBy: student.uid,
        updatedByName: 'student',
      });
    await rec('2026-04-20', 10, 4);
    await rec('2026-04-21', 12, 6);
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

describe('callable の認証', () => {
  it('未ログインの呼び出しは UNAUTHENTICATED', async () => {
    const res = await call('claimFirstTeacher', { classId: CLASS_ID });
    expect(res).toEqual({ ok: false, status: 'UNAUTHENTICATED' });
  });
});

describe('教員ロール (claimFirstTeacher / promoteTeacher / demoteTeacher)', () => {
  it('最初の 1 人だけが教員になれ、監査ログに残る', async () => {
    expect((await call('claimFirstTeacher', { classId: CLASS_ID }, teacher)).ok).toBe(true);

    const second = await call('claimFirstTeacher', { classId: CLASS_ID }, outsider);
    expect(second).toEqual({ ok: false, status: 'FAILED_PRECONDITION' });

    const { teacherExists, auditTypes } = await admin(async (fs) => ({
      teacherExists: (
        await getDoc(doc(fs, 'classes', CLASS_ID, 'teachers', teacher.uid))
      ).exists(),
      auditTypes: (await getDocs(collection(fs, 'classes', CLASS_ID, 'auditLog'))).docs.map(
        (d) => d.data().type as string
      ),
    }));
    expect(teacherExists).toBe(true);
    expect(auditTypes).toContain('first-teacher-claimed');
  });

  it('教員でない人は昇格させられない', async () => {
    const res = await call(
      'promoteTeacher',
      { classId: CLASS_ID, targetUid: student.uid },
      outsider
    );
    expect(res).toEqual({ ok: false, status: 'PERMISSION_DENIED' });
  });

  it('教員は名簿の生徒を昇格・解除でき、自分自身は解除できない', async () => {
    const args = { classId: CLASS_ID, targetUid: student.uid };
    expect((await call('promoteTeacher', args, teacher)).ok).toBe(true);
    expect(
      await admin(async (fs) =>
        (await getDoc(doc(fs, 'classes', CLASS_ID, 'teachers', student.uid))).exists()
      )
    ).toBe(true);

    expect((await call('demoteTeacher', args, teacher)).ok).toBe(true);
    expect(
      await admin(async (fs) =>
        (await getDoc(doc(fs, 'classes', CLASS_ID, 'teachers', student.uid))).exists()
      )
    ).toBe(false);

    const self = await call(
      'demoteTeacher',
      { classId: CLASS_ID, targetUid: teacher.uid },
      teacher
    );
    expect(self).toEqual({ ok: false, status: 'INVALID_ARGUMENT' });
  });
});

describe('resetStudentPassword', () => {
  it('教員が再発行すると新しいパスワードでログインでき、古いものは使えない', async () => {
    const res = await call(
      'resetStudentPassword',
      { classId: CLASS_ID, studentUid: student.uid, newPassword: 'new-pass-2' },
      teacher
    );
    expect(res.ok).toBe(true);
    expect(await signIn(student.email, 'new-pass-2')).toBe(true);
    expect(await signIn(student.email, 'initial-pass-1')).toBe(false);
  });

  it('生徒は他人のパスワードを再発行できない', async () => {
    const res = await call(
      'resetStudentPassword',
      { classId: CLASS_ID, studentUid: teacher.uid, newPassword: 'hijack-123' },
      student
    );
    expect(res).toEqual({ ok: false, status: 'PERMISSION_DENIED' });
  });
});

describe('getClassAverages', () => {
  it('クラスのメンバーには日付別の平均だけを返す', async () => {
    const res = await call('getClassAverages', { classId: CLASS_ID }, student);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.averages).toEqual([
      { date: '2026-04-20', height: 10, leafCount: 4, sampleSize: 1 },
      { date: '2026-04-21', height: 12, leafCount: 6, sampleSize: 1 },
    ]);
  });

  it('クラス外の人には返さない', async () => {
    const res = await call('getClassAverages', { classId: CLASS_ID }, outsider);
    expect(res).toEqual({ ok: false, status: 'PERMISSION_DENIED' });
  });
});

describe('保護者共有 (createParentShare / revokeParentShare)', () => {
  it('発行したスナップショットに記録が入り、取り消すと消える', async () => {
    const created = await call(
      'createParentShare',
      { classId: CLASS_ID, studentUid: student.uid },
      teacher
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const token = created.result.token as string;
    expect(token).toMatch(/^[a-zA-Z0-9]{32}$/);

    const share = await admin(async (fs) => (await getDoc(doc(fs, 'shares', token))).data());
    expect(share?.studentUid).toBe(student.uid);
    expect((share?.records as unknown[]).length).toBe(2);

    expect((await call('revokeParentShare', { token }, teacher)).ok).toBe(true);
    expect(
      await admin(async (fs) => (await getDoc(doc(fs, 'shares', token))).exists())
    ).toBe(false);
  });

  it('クラス外の人は発行できない', async () => {
    const res = await call(
      'createParentShare',
      { classId: CLASS_ID, studentUid: student.uid },
      outsider
    );
    expect(res).toEqual({ ok: false, status: 'PERMISSION_DENIED' });
  });
});

describe('setClassArchived', () => {
  it('教員以外は凍結できない', async () => {
    const res = await call('setClassArchived', { classId: CLASS_ID, archived: true }, student);
    expect(res).toEqual({ ok: false, status: 'PERMISSION_DENIED' });
  });

  it('教員が凍結・解除でき、クラスのメタ情報に反映される', async () => {
    const readArchived = () =>
      admin(async (fs) => (await getDoc(doc(fs, 'classes', CLASS_ID))).data()?.archived);

    expect((await call('setClassArchived', { classId: CLASS_ID, archived: true }, teacher)).ok).toBe(true);
    expect(await readArchived()).toBe(true);

    expect((await call('setClassArchived', { classId: CLASS_ID, archived: false }, teacher)).ok).toBe(true);
    expect(await readArchived()).toBe(false);
  });
});
