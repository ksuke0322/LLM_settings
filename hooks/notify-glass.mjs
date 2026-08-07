import { spawnSync } from "node:child_process";

if (process.platform === "darwin") {
  spawnSync("afplay", ["/System/Library/Sounds/Glass.aiff"], {
    stdio: "ignore",
    timeout: 2_000,
  });
}
