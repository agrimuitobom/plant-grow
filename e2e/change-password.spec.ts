import { expect, test } from '@playwright/test';

/**
 * 本人によるパスワード変更。
 * 「変更できた」だけでなく、ログアウト後に新しいパスワードで入れて
 * 古いパスワードでは入れないところまで確かめる。
 */
test('生徒が自分でパスワードを変え、新しいパスワードでログインし直せる', async ({ page }) => {
  const studentId = `pw-${Date.now()}`;
  const oldPassword = 'old-pass-123';
  const newPassword = 'new-pass-456';

  await page.goto('/');
  await page.getByRole('button', { name: '初回登録' }).click();
  await page.getByPlaceholder('先生から指示された ID').fill(studentId);
  await page.getByPlaceholder('例: 田中').fill('PW 花子');
  await page.getByPlaceholder('6 文字以上').fill(oldPassword);
  await page.getByPlaceholder('もう一度入力').fill(oldPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '登録してログイン' }).click();
  await expect(page.getByText('PW 花子 さんの観察記録')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'スキップ' }).click();

  // --- 今のパスワードを間違えると変更されない ---
  await page.getByRole('button', { name: 'パスワードを変える' }).click();
  const dialog = page.getByRole('dialog', { name: 'パスワードを変える' });
  await dialog.getByLabel('今のパスワード').fill('wrong-password');
  await dialog.getByLabel('新しいパスワード (6 文字以上)').fill(newPassword);
  await dialog.getByLabel('新しいパスワード (もう一度)').fill(newPassword);
  await dialog.getByRole('button', { name: '変更する' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('今のパスワードが違います。');

  // --- 正しく入れると変更できる ---
  await dialog.getByLabel('今のパスワード').fill(oldPassword);
  await dialog.getByRole('button', { name: '変更する' }).click();
  await expect(page.getByText('パスワードを変更しました')).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toBeHidden();

  // --- ログアウトして、古いパスワードでは入れず新しいパスワードで入れる ---
  await page.getByRole('button', { name: 'ログアウト' }).click();
  const submit = page.locator('button[type="submit"]');
  await page.getByPlaceholder('先生から指示された ID').fill(studentId);
  await page.locator('input[type="password"]').first().fill(oldPassword);
  await submit.click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });

  await page.locator('input[type="password"]').first().fill(newPassword);
  await submit.click();
  await expect(page.getByText('PW 花子 さんの観察記録')).toBeVisible({ timeout: 15_000 });
});
