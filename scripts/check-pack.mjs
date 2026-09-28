// Fails when the published package isn't exactly the build output plus README, LICENSE and package.json,
// or when a built JS file lacks the "use client" banner Next.js App Router needs. Run after `npm run build`.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EXPECTED = [
    "LICENSE",
    "README.md",
    "dist/index.cjs",
    "dist/index.d.cts",
    "dist/index.d.ts",
    "dist/index.js",
    "package.json",
];

const [pack] = JSON.parse(execSync("npm pack --dry-run --json --ignore-scripts", { encoding: "utf8" }));
const files = pack.files.map((file) => file.path.replaceAll("\\", "/")).sort();
const problems = [];

if (JSON.stringify(files) !== JSON.stringify(EXPECTED)) {
    problems.push(`published files are\n  ${files.join("\n  ")}\nexpected\n  ${EXPECTED.join("\n  ")}`);
}
for (const file of ["dist/index.js", "dist/index.cjs"]) {
    if (!readFileSync(file, "utf8").startsWith('"use client";')) {
        problems.push(`${file} does not start with the "use client" directive`);
    }
}

if (problems.length > 0) {
    console.error(`check:pack failed:\n${problems.join("\n")}`);
    process.exit(1);
}
console.log(`check:pack ok: ${files.length} files, "use client" banner present`);
