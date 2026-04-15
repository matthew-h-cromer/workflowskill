import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const skillMd = join(__dirname, "SKILL.md");
export const weldableToolkitPrompt = join(__dirname, "toolkits", "weldable", "prompt.md");
