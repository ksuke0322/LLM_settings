# JavaScript / TypeScript のローカル適用方針と最小実行例

## 適用順

上位 `AGENTS.md` の安全境界と承認規則を最優先する。対象に最も近い `package.json`、`tsconfig.json`、Node 版、既存 runner の設定と、既存プロジェクトの記法・モジュール契約を確認してから変更する。これらの設定が不明なら、変換を推定で行わず、新しい型設定を追加せず、判断を保留して確認する。

`ecmascript-modern-syntax` の由来は `unknown` のまま保ち、Skill 本文はこの文書に合わせて書き換えない。人が適用を判断するときは、[Skill 台帳の routing 記録](skill-inventory.md)を明示的に参照する。台帳の記録は人向けの案内であり、loader による自動適用は確認されていない。

旧 Skill にある「既存プロジェクト規約より優先する」という無条件優先は、このローカル適用では採用しない。

## 記法とモジュール境界

プロジェクト設定と互換する場合は ECMAScript 2022 以降、アロー関数、`async` / `await` を既定にする。`this` の束縛や hoisting が必要な `function` 宣言、既存の CommonJS 契約は保つ。ESM への一律変換や `function` の一律禁止はしない。

`.mjs` は ESM、`.cjs` は CommonJS として扱う。`.js` のモジュール形式は最も近い `package.json` の `type` など対象環境の設定で確定する。近い設定がない、または不明なら ESM / CommonJS を推測せず、実行例は概念例として扱う。

TypeScript を使う既存設定がない場合、TDD / Web test Skill にある TypeScript 例は概念例である。型注釈の消去による実行は型検査を意味しない。`tsc` またはプロジェクト指定の型検査を別途実行できない環境では、型検査の結果を成功扱いしない。

## 確認した実行環境

このリポジトリの root と `bin/` には `package.json`、`tsconfig.json`、`.nvmrc`、`.node-version` がない。現在の実行 Node は `v22.12.0`。この版で ESM、CommonJS、および `--experimental-strip-types` を付けた TypeScript の3 fixtureを子 Node プロセスで実行確認する。

この環境では `tsc`（型検査器）と `tsx`（TypeScript の実行 loader）が見つからない。TypeScript fixture は `--experimental-strip-types` で実行するだけで、型検査はしていない。型検査には `tsc` またはプロジェクトが指定する型検査器を別途実行する。検証済みなのは Node `v22.12.0` のみである。別版で `node:test` または型消去機能が使えない場合は非対応 / 未確認として扱い、テスト成功に読み替えない。

`skills/playwright-skill/package.json` は独立した Skill 配下の設定で、Node `>=14.0.0` を宣言する。これは root や `bin/` の設定ではない。同 Skill の `setup` は `npm install` と Chromium の導入を行い、例では `/tmp` の一時スクリプトを使って OS による自動 cleanup を想定する。外部 Playwright Skill にある CommonJS の実行例は、依存導入・ブラウザー取得・一時ファイル cleanup を伴う条件付き例であり、そのまま実行しない。ローカルでの実行が必要な場合は、準備済み依存を明示指定する[ローカル Playwright runner の説明](playwright-local-runner.md)を参照する。

## 最小 fixture

以下の fixture は外部依存と通信を使わない。

`bin/fixtures/module-examples/esm.mjs`:

```js
export const message = "esm fixture: ok";
console.log(message);
```

`bin/fixtures/module-examples/commonjs.cjs`:

```js
const message = "commonjs fixture: ok";

module.exports = { message };
console.log(message);
```

`bin/fixtures/module-examples/typescript.ts`:

```ts
export {};

const message: string = "typescript fixture: ok";
console.log(message);
```

`export {}` が TypeScript fixture のモジュール境界を示す。近くの package 設定がない `.js` の形式を推測していない。

```sh
node --test bin/module-examples.test.mjs
node bin/fixtures/module-examples/esm.mjs
node bin/fixtures/module-examples/commonjs.cjs
node --experimental-strip-types bin/fixtures/module-examples/typescript.ts
```

テストは各 fixture を現在の `process.execPath` で起動し、期待する標準出力と終了コードを確認する。別プロセスから ESM の named import と CommonJS の `require` で `message` の公開値も検査するため、fixture の標準出力だけで module export 契約を確認したとは扱わない。各起動には timeout を設定している。
