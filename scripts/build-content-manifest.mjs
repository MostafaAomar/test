import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const years = ["First Year", "Second Year", "Third Year", "Fourth Year"];

async function collectJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await collectJsonFiles(absolutePath)));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".json") &&
      entry.name.toLowerCase() !== "myowndic.json"
    ) {
      paths.push(absolutePath);
    }
  }

  return paths;
}

const manifest = { version: 1, years: {} };
for (const yearName of years) {
  const files = await collectJsonFiles(join(projectRoot, yearName));
  manifest.years[yearName] = [];

  for (const absolutePath of files) {
    const bytes = await readFile(absolutePath);
    const parsed = JSON.parse(bytes.toString("utf8"));
    const subject = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!subject || !Array.isArray(subject.questions)) {
      throw new Error(`${absolutePath} does not contain a questions array.`);
    }
    manifest.years[yearName].push({
      path: relative(projectRoot, absolutePath).split(sep).join("/"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.byteLength,
    });
  }
}

await writeFile(
  join(projectRoot, "content-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(
  `Updated content-manifest.json with ${Object.values(manifest.years).flat().length} subject files.`,
);
