import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractSelfPlanFromSource } from "../self/self-plan.js";

interface Args {
  source: string;
  out?: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sourcePath = resolve(args.source);
  const source = await readFile(sourcePath, "utf8");
  const repoRoot = resolve(import.meta.dirname, "../../../..");
  const plan = await extractSelfPlanFromSource(source, {
    sourceName: displayPath(sourcePath, repoRoot),
    uri: pathToFileURL(sourcePath).href,
  });
  const json = `${JSON.stringify(plan, null, 2)}\n`;

  if (args.out) {
    const outPath = resolve(args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, "utf8");
    console.log(outPath);
    return;
  }

  process.stdout.write(json);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    source: "../../examples/vibe-self.vibe",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--source") {
      args.source = requiredValue(argv, ++i, "--source");
    } else if (arg === "--out") {
      args.out = requiredValue(argv, ++i, "--out");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function toPortablePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function displayPath(path: string, root: string): string {
  const relativePath = relative(root, path);
  if (relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return toPortablePath(relativePath);
  }
  return toPortablePath(path);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`vibe self-plan: ${message}`);
  process.exit(1);
});
