# Prepared Playwright local runner

This runner executes one explicitly selected, self-contained `.mjs` or `.cjs` script with the current Node executable. It does not infer the module type of `.js` files, invoke `npm` or `npx`, call an external `run.js`, install dependencies, or download a browser.

## Prepare Playwright separately

Initial preparation and later dependency updates each require separate approval. If the package or browser is not prepared, record the package and version, package root, browser installation path, any network access, and exact preparation command, then stop. This runner does not perform that preparation. Rerun the same explicit CLI command only after the separately approved preparation has completed and been verified.

Pass `--prepared-root` as the prepared `node_modules/playwright` package directory itself. The package must have a `package.json` whose name is `playwright`; `chromium.executablePath()` must point to an existing executable file. Missing package or browser preparation is reported as a nonzero result with a reason code.

## CLI

```sh
node bin/run-playwright-local.mjs \
  --script /absolute/path/to/task.mjs \
  --prepared-root /absolute/path/to/node_modules/playwright \
  --output-dir /absolute/path/to/artifacts \
  --artifact screenshot.png \
  --artifact trace.zip
```

`--script` and `--prepared-root` are required. `--output-dir` and repeated `--artifact` options are optional; when artifacts are named, an output directory is required. Artifact values must be basenames. Only explicitly named regular, non-symlink files are copied. Copying is exclusive, so an existing output is kept and reported as an export error. Unnamed files are discarded with the run directory.

## Export API

```js
import { runPlaywrightLocal } from "../bin/run-playwright-local.mjs";

const result = await runPlaywrightLocal({
  scriptPath: "/absolute/path/to/task.mjs",
  preparedRoot: "/absolute/path/to/node_modules/playwright",
  outputDir: "/absolute/path/to/artifacts",
  artifactBasenames: ["screenshot.png"],
});

if (result.exitCode !== 0) {
  console.error(result.reason, result.message ?? "");
}
```

The returned `runDir` names the temporary directory that was used. It has been removed when the call returns unless `cleanupError` is present, in which case removal failed and the directory may remain. `artifactErrors` lists individual requested files that could not be exported. A child script's nonzero exit code is preserved even when artifact export also fails.

## Run and cleanup behavior

Each call creates a new directory under the operating system temporary directory, copies the selected script there, and links only the supplied Playwright package at `node_modules/playwright`. The runner starts `process.execPath` directly with that copied script and sets the child working directory and `PLAYWRIGHT_OUTPUT_DIR` to the new directory. Relative script outputs therefore stay inside that run directory.

The runner removes only the directory it created, after a normal exit, a nonzero exit, a start error, or a handled `SIGINT`/`SIGTERM`. The CLI forwards those signals to its child and waits for it to stop before cleanup. If an arbitrary selected script ignores a signal, the CLI may continue waiting; the runner does not guarantee forced shutdown or impose a timeout. A hard kill of the runner cannot guarantee cleanup. The runner never scans for or deletes older temporary directories.

The temporary directory is a lifecycle boundary, not a security sandbox. The selected script is arbitrary code and may read environment variables, access other files, or use the network with the runner's permissions. The child inherits the current environment, including variables such as `NODE_OPTIONS` and `NODE_PATH`; the runner does not filter loader-related or other inherited variables. Invoke this local CLI explicitly when you want to use it; external Skills and loaders do not automatically switch to or select this runner. Use only scripts and prepared package roots you trust.

## Reason codes

- `PLAYWRIGHT_NOT_PREPARED`: package root is missing or cannot be resolved.
- `BROWSER_NOT_PREPARED`: Playwright's Chromium executable path is missing or unusable.
- `SCRIPT_NOT_FOUND`: the selected script is not a regular file.
- `CHILD_START_FAILED`: Node could not start the selected script.
- `SCRIPT_EXITED_NONZERO`: the script returned a nonzero exit code; that code is retained.
- `SCRIPT_SIGNALLED`: the script ended from a signal; the CLI returns the corresponding nonzero status.
- `ARTIFACT_EXPORT_FAILED`: a successful script run had one or more requested artifacts that could not be copied.
- `CLEANUP_FAILED`: removing this run's temporary directory failed.
- `RUNNER_FAILED`: another setup or runner error occurred.
