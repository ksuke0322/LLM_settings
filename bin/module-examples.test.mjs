import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const fixtureDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "module-examples",
);

const examples = [
  {
    name: "ESM の .mjs fixture を実行できる",
    file: "esm.mjs",
    flags: [],
    expected: "esm fixture: ok\n",
  },
  {
    name: "CommonJS の .cjs fixture を実行できる",
    file: "commonjs.cjs",
    flags: [],
    expected: "commonjs fixture: ok\n",
  },
  {
    name: "型注釈を含む TypeScript fixture を型消去で実行できる",
    file: "typescript.ts",
    flags: ["--experimental-strip-types"],
    expected: "typescript fixture: ok\n",
  },
];

for (const example of examples) {
  test(example.name, { timeout: 10_000 }, () => {
    const result = spawnSync(
      process.execPath,
      [...example.flags, path.join(fixtureDirectory, example.file)],
      {
        cwd: path.resolve(fixtureDirectory, "../.."),
        encoding: "utf8",
        timeout: 5_000,
      },
    );

    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, example.expected);
  });
}

test("ESM fixture の named export を import できる", { timeout: 10_000 }, () => {
  const fixtureUrl = pathToFileURL(path.join(fixtureDirectory, "esm.mjs")).href;
  const script = [
    "import assert from 'node:assert/strict';",
    `import { message } from ${JSON.stringify(fixtureUrl)};`,
    "assert.equal(message, 'esm fixture: ok');",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: path.resolve(fixtureDirectory, "../.."),
    encoding: "utf8",
    timeout: 5_000,
  });

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "esm fixture: ok\n");
});

test("CommonJS fixture の message を require できる", { timeout: 10_000 }, () => {
  const fixturePath = path.join(fixtureDirectory, "commonjs.cjs");
  const script = [
    "const assert = require('node:assert/strict');",
    `const { message } = require(${JSON.stringify(fixturePath)});`,
    "assert.equal(message, 'commonjs fixture: ok');",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--eval", script], {
    cwd: path.resolve(fixtureDirectory, "../.."),
    encoding: "utf8",
    timeout: 5_000,
  });

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "commonjs fixture: ok\n");
});
