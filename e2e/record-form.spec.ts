import { expect, test, type Page } from '@playwright/test';

/**
 * 入力フォームの回帰テスト。どれも実際に授業で踏みやすい操作:
 *   - Wi-Fi が切れた状態で保存する
 *   - 株を消してから追加する / 翌日に同じ株を測る
 *   - 保存し忘れたまま別の日付を開く
 */

async function signUp(page: Page, name: string): Promise<void> {
  const studentId = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await page.goto('/');
  await page.getByRole('button', { name: '初回登録' }).click();
  await page.getByPlaceholder('先生から指示された ID').fill(studentId);
  await page.getByPlaceholder('例: 田中').fill(name);
  await page.getByPlaceholder('6 文字以上').fill('e2e-pass-123');
  await page.getByPlaceholder('もう一度入力').fill('e2e-pass-123');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '登録してログイン' }).click();
  await expect(page.getByText(`${name} さんの観察記録`)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'スキップ' }).click();
}

test('オフラインでも保存が完了し、端末保存のトーストが出る', async ({ page, context }) => {
  await signUp(page, 'オフライン 花子');

  // 遅延読み込みのカードが出揃ってから切断する (本番は Service Worker が配信するが、
  // テストの Vite dev サーバにはオフライン用キャッシュが無い)。
  await expect(page.getByRole('button', { name: '水やりを記録' })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText('● オフライン')).toBeVisible();

  await page.getByLabel('草丈 (cm)').first().fill('8.5');
  await page.getByRole('button', { name: '保存する' }).click();

  // 以前はサーバ応答を待ち続けて「保存中…」のまま固まっていた。
  await expect(page.getByText('の記録を端末に保存しました')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: '保存中…' })).toHaveCount(0);
  const list = page.locator('section', { hasText: '記録一覧' });
  await expect(list.getByText('8.5')).toBeVisible();
  // 取得できないカード (dev サーバではコメント欄) があっても、アプリ全体は落ちない。
  await expect(page.getByText('エラーが発生しました')).toHaveCount(0);

  // オフラインのままイベントのチップも固まらない
  await page.getByRole('button', { name: '水やりを記録' }).click();
  await expect(page.getByRole('button', { name: '肥料を記録' })).toBeEnabled();

  await context.setOffline(false);
});

test('株を消して追加しても id が重複せず、別の日に株構成が引き継がれる', async ({ page }) => {
  await signUp(page, '構成 次郎');

  // B株を削除 → 追加。旧実装では既存の C と重複する「C株」がもう 1 つできていた。
  await page.getByRole('button', { name: 'B株を削除' }).click();
  await page.getByRole('button', { name: '＋ 株を追加' }).click();
  const names = page.getByLabel('株名');
  await expect(names).toHaveCount(3);
  await expect(names.nth(2)).toHaveValue('B株');

  await names.nth(0).fill('窓際のトマト');
  await page.getByLabel('草丈 (cm)').first().fill('10');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('の記録を保存しました')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('未保存の変更があります')).toHaveCount(0);

  // 記録の無い日を開くと、株名は引き継がれ、測定値は空になる。
  await page.getByRole('button', { name: '昨日' }).click();
  await expect(page.getByLabel('株名').nth(0)).toHaveValue('窓際のトマト');
  await expect(page.getByLabel('株名')).toHaveCount(3);
  await expect(page.getByLabel('草丈 (cm)').first()).toHaveValue('');
});

test('未保存の入力があるまま日付を変えると確認が出る', async ({ page }) => {
  await signUp(page, '確認 三郎');

  await page.getByLabel('草丈 (cm)').first().fill('5');
  await expect(page.getByText('未保存の変更があります')).toBeVisible();

  // キャンセル → 日付も入力もそのまま
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: '昨日' }).click();
  await expect(page.getByLabel('草丈 (cm)').first()).toHaveValue('5');

  // OK → 移動して入力は破棄
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: '昨日' }).click();
  await expect(page.getByLabel('草丈 (cm)').first()).toHaveValue('');
  await expect(page.getByText('未保存の変更があります')).toHaveCount(0);
});
