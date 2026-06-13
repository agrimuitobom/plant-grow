/**
 * 観察値の妥当性チェック。フォーム入力欄の下にインライン警告を出すために使う。
 *
 * 警告メッセージを返した場合でも保存自体はブロックしない方針:
 *  - 入力ミス (12 と 1200 の打ち間違い等) を先生に気付かせるのが主目的
 *  - 本当に育っているケースは滅多にないが、上限ギリギリで実在する植物もあるため
 *  - 「本当ですか?」と一言添えて再確認を促すだけ
 */

// 学校栽培で扱う植物の常識的な上限。トマト・ナス・キュウリ・アサガオ・ヒマワリ等を想定。
// 巨大ヒマワリでも 3m 未満が普通。これを超えたら桁間違いの可能性が高い。
export const HEIGHT_MAX_CM = 300;
// 樹木でない一般的な観察植物の葉枚数。これを超えるのは桁間違いか、極端に育ったケース。
export const LEAF_COUNT_MAX = 200;

/** 草丈の妥当性。問題なしなら null、警告ありならメッセージを返す。 */
export function validateHeight(value: number | ''): string | null {
  if (value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return '草丈はマイナスにはなりません。';
  if (value > HEIGHT_MAX_CM) {
    return `草丈 ${value}cm は大きすぎる気がします。本当ですか?`;
  }
  return null;
}

/** 葉枚数の妥当性。問題なしなら null、警告ありならメッセージを返す。 */
export function validateLeafCount(value: number | ''): string | null {
  if (value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return '葉枚数はマイナスにはなりません。';
  if (!Number.isInteger(value)) return '葉枚数は整数で入力してください。';
  if (value > LEAF_COUNT_MAX) {
    return `葉枚数 ${value} 枚は多すぎる気がします。本当ですか?`;
  }
  return null;
}
