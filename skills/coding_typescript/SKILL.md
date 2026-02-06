---
name: ecmascript-modern-syntax
description: TypeScript / JavaScript のコードを記述・修正する際に適用する記法ルール。TypeScript / JavaScript のコードを記述・修正する際に参照する。ECMAScript 2022 以降の構文を優先し、アロー関数、分割代入、オプショナルチェイニング、Null 合体演算子、テンプレートリテラル、スプレッド / レスト構文、ES Modules（import/export）、async/await、Promise.all / allSettled、top-level await を積極的に使用する。function 宣言、CommonJS（require/module.exports）、then チェーン中心の記述は原則使用しない。
---

# ECMAScript の記法

- typescript, javascript を利用する場合、可能な限り ECMAScript 2022 以降の構文を優先的に用いること
- 以下の構文を積極的に使用すること：

| 機能                        | 使用例                                                   | 備考                                 |
| --------------------------- | -------------------------------------------------------- | ------------------------------------ |
| アロー関数                  | `const f = () => {}`                                     | `function` は使用禁止                |
| 分割代入                    | `const { a, b } = obj`                                   | ネストも可                           |
| オプショナルチェイニング    | `user?.profile?.name`                                    | 安全なアクセスに必須                 |
| Null合体演算子              | `value ?? 'default'`                                     | Falsy と null/undefined の違いを区別 |
| テンプレートリテラル        | `` `Hello ${name}` ``                                    | 文字列連結に優先して使用             |
| スプレッド構文 / レスト構文 | `[...arr]`, `{ ...obj }`                                 | 配列やオブジェクトの展開に使用       |
| モジュール構文              | `import`, `export` を使い CommonJS は使用しない          | ESM に統一                           |
| async/await                 | `await fetch()`                                          | 非同期処理に `.then()` より優先      |
| Promise.allSettled / all    | 並列非同期処理では `Promise.allSettled` を使用可能にする |
| Top-level await             | モジュール内での `await` を許可する（可能な場合）        |

