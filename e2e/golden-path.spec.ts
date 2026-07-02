import { expect, test } from '@playwright/test';

/**
 * ゴールデンパス: 初回登録 → 観察記録の保存 → 記録一覧への反映。
 *
 * これが緑である限り「生徒が今日の観察を記録する」という本アプリの生命線は
 * 壊れていない。依存更新 (Dependabot) やリファクタのマージ判断はこれを信じて良い。
 *
 * Firebase Auth / Firestore はローカルエミュレータ (playwright.config.ts 参照)。
 * 本番プロジェクトには一切書き込まない。
 */

function todayId(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

test('新規生徒が登録して観察を保存すると一覧とグラフに反映される', async ({ page }) => {
  // ID はテスト実行ごとにユニークにして、リトライ時の「既に使われています」を避ける
  const studentId = `e2e-${Date.now()}`;

  await page.goto('/');

  // --- 初回登録 ---
  await page.getByRole('button', { name: '初回登録' }).click();
  await page.getByPlaceholder('先生から指示された ID').fill(studentId);
  await page.getByPlaceholder('例: 田中').fill('E2E 太郎');
  await page.getByPlaceholder('6 文字以上').fill('e2e-pass-123');
  await page.getByPlaceholder('もう一度入力').fill('e2e-pass-123');
  await page.getByRole('checkbox').check(); // プライバシーポリシー同意
  await page.getByRole('button', { name: '登録してログイン' }).click();

  // ログイン後のヘッダーが出るまで待つ
  await expect(page.getByText('E2E 太郎 さんの観察記録')).toBeVisible({ timeout: 15_000 });

  // --- 観察記録の入力 (A株: 草丈 12.5cm / 葉 6 枚) ---
  await page.getByPlaceholder('例: 12.5').first().fill('12.5');
  await page.getByPlaceholder('例: 6').first().fill('6');
  await page.getByRole('button', { name: '保存する' }).click();

  // 保存成功のトーストが出る
  await expect(page.getByText('の記録を保存しました')).toBeVisible({ timeout: 15_000 });

  // --- 記録一覧に今日の行が現れ、入力値が反映されている ---
  const list = page.locator('section', { hasText: '記録一覧' });
  await expect(list.getByRole('button', { name: `${todayId()} の記録を開く` })).toBeVisible();
  await expect(list.getByText('12.5')).toBeVisible();

  // --- グラフカードが「記録なし」表示から実グラフに切り替わっている ---
  await expect(page.getByText('平均値の推移')).toBeVisible();
});
