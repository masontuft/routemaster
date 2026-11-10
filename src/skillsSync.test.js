import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github", "workflows", "skills-sync.yml");
const secret = "skills-token-should-stay-secret";

function shellFromWorkflow(source) {
    const lines = source.split("\n");
    const start = lines.findIndex((line) => {
        return line.trim() === "run: |";
    });
    if (start < 0) {
        throw new Error("The workflow has no run block.");
    }
    const body = [];
    const runIndent = lines[start].indexOf("run:");
    for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim() === "") {
            body.push("");
            continue;
        }
        const indent = line.length - line.trimStart().length;
        if (indent <= runIndent) {
            break;
        }
        body.push(line);
    }
    const indented = body.filter((line) => {
        return line.trim() !== "";
    });
    const pad = indented.reduce((smallest, line) => {
        const indent = line.length - line.trimStart().length;
        return Math.min(smallest, indent);
    }, 1000);
    const script = body.map((line) => {
        if (line.trim() === "") {
            return "";
        }
        return line.slice(pad);
    }).join("\n");
    return `${script}\n`;
}

function runGit(args, cwd, env) {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
    }
    return result.stdout.trim();
}

function scriptEnv(home, mockBin, extra) {
    return {
        HOME: home,
        PATH: `${mockBin}:${process.env.PATH}`,
        SKILLS_TOKEN: secret,
        DEFAULT_BRANCH: "main",
        GH_REPO: "masontuft/routemaster",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@example.com",
        GIT_TERMINAL_PROMPT: "0",
        ...extra,
    };
}

function writeMockGh(mockBin) {
    mkdirSync(mockBin, { recursive: true });
    const file = path.join(mockBin, "gh");
    writeFileSync(file, [
        "#!/bin/sh",
        "printf '%s\\n' \"$*\" >> \"$GH_LOG\"",
        "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"list\" ]; then",
        "    if [ -n \"${GH_EXISTING:-}\" ]; then",
        "        printf '%s\\n' \"$GH_EXISTING\"",
        "    fi",
        "    exit 0",
        "fi",
        "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"create\" ]; then",
        "    exit 0",
        "fi",
        "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"edit\" ]; then",
        "    exit 0",
        "fi",
        "echo \"unexpected gh: $*\" >&2",
        "exit 1",
        "",
    ].join("\n"));
    chmodSync(file, 0o755);
}

function prepareHome(home) {
    mkdirSync(home, { recursive: true });
    const env = {
        HOME: home,
        PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: "1",
    };
    runGit(["config", "--global", "user.email", "test@example.com"], home, env);
    runGit(["config", "--global", "user.name", "test"], home, env);
    runGit(["config", "--global", "init.defaultBranch", "main"], home, env);
    runGit(["config", "--global", "protocol.file.allow", "always"], home, env);
}

function runScript(scriptFile, cwd, env) {
    return spawnSync("bash", [scriptFile], { cwd, env, encoding: "utf8" });
}

function assertSecretHidden(result) {
    const combined = `${result.stdout}\n${result.stderr}`;
    assert.ok(!combined.includes(secret), combined);
}

test("the workflow matches the skills sync contract", () => {
    const source = readFileSync(workflowPath, "utf8");
    const parsed = spawnSync("python3", ["-c", [
        "import json, sys, yaml",
        "data = yaml.safe_load(sys.stdin)",
        "trigger = data.get('on', data.get(True))",
        "print(json.dumps({",
        "    'cron': trigger['schedule'][0]['cron'],",
        "    'dispatch': 'workflow_dispatch' in trigger,",
        "    'group': data['concurrency']['group'],",
        "    'cancel': data['concurrency']['cancel-in-progress'],",
        "    'contents': data['permissions']['contents'],",
        "    'pulls': data['permissions']['pull-requests'],",
        "}))",
    ].join("\n")], { input: source, encoding: "utf8" });
    assert.strictEqual(parsed.status, 0, parsed.stderr);
    const workflow = JSON.parse(parsed.stdout);
    assert.deepStrictEqual(workflow, {
        cron: "0 15 * * 1",
        dispatch: true,
        group: "skills-sync",
        cancel: false,
        contents: "write",
        pulls: "write",
    });

    const script = shellFromWorkflow(source);
    assert.match(script, /git ls-files -s -- skills/);
    assert.match(script, /160000/);
    assert.match(script, /credential\.useHttpPath true/);
    assert.match(script, /credential\.https:\/\/github\.com\/masontuft\/Skills\.git\.helper/);
    assert.match(script, /trap cleanup EXIT/);
    assert.match(script, /HEAD \^origin\/main/);
    assert.match(script, /git checkout --force -B skills-sync origin\/skills-sync/);
    assert.match(script, /git push origin HEAD:skills-sync/);
    assert.match(script, /SKILLS_TOKEN/);
    assert.doesNotMatch(script, /echo "\$SKILLS_TOKEN"|echo "\$\{SKILLS_TOKEN\}"/);
});

test("eslint ignores skills and still lints this repo", async () => {
    const eslint = new ESLint({ cwd: root });
    assert.strictEqual(await eslint.isPathIgnored("skills/example.js"), true);
    assert.strictEqual(await eslint.isPathIgnored("skills/nested/example.js"), true);
    assert.strictEqual(await eslint.isPathIgnored("src/server.js"), false);
});

test("skills is still a copied tree, and gitignore does not block the submodule", () => {
    const listed = spawnSync("git", ["ls-files", "-s", "--", "skills"], {
        cwd: root,
        encoding: "utf8",
    });
    assert.strictEqual(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /skills\/coding-style-preferences\/SKILL.md/);
    assert.doesNotMatch(listed.stdout, /^160000/m);

    const ignored = readFileSync(path.join(root, ".gitignore"), "utf8").split("\n");
    for (const line of ignored) {
        const trimmed = line.trim();
        assert.notStrictEqual(trimmed, "skills");
        assert.notStrictEqual(trimmed, "skills/");
        assert.notStrictEqual(trimmed, "/skills/");
        assert.notStrictEqual(trimmed, "skills/**");
    }

    const claude = readFileSync(path.join(root, "CLAUDE.md"), "utf8");
    assert.match(claude, /AGENTS\.md/);
    const agents = readFileSync(path.join(root, "AGENTS.md"), "utf8");
    assert.match(agents, /git submodule update --init --remote skills/);
    const modules = readFileSync(path.join(root, ".gitmodules"), "utf8");
    assert.match(modules, /path = skills/);
    assert.match(modules, /url = https:\/\/github\.com\/masontuft\/Skills\.git/);
    assert.match(modules, /branch = main/);
});

test("the sync script skips, refuses a side commit, and bumps Skills main", { timeout: 120000 }, () => {
    const source = readFileSync(workflowPath, "utf8");
    const directory = mkdtempSync(path.join(tmpdir(), "skills-sync-"));
    try {
        const scriptFile = path.join(directory, "skills-sync.sh");
        writeFileSync(scriptFile, shellFromWorkflow(source));
        chmodSync(scriptFile, 0o755);
        const mockBin = path.join(directory, "bin");
        writeMockGh(mockBin);
        const home = path.join(directory, "home");
        prepareHome(home);
        const env = scriptEnv(home, mockBin, { GH_LOG: path.join(directory, "gh.log") });
        writeFileSync(env.GH_LOG, "");

        const empty = path.join(directory, "empty");
        mkdirSync(empty);
        runGit(["init", "-b", "main"], empty, env);
        const skipped = runScript(scriptFile, empty, env);
        assert.strictEqual(skipped.status, 0, `${skipped.stdout}\n${skipped.stderr}`);
        assert.match(skipped.stdout, /No \.gitmodules file/);
        assertSecretHidden(skipped);

        const configured = path.join(directory, "configured");
        mkdirSync(configured);
        runGit(["init", "-b", "main"], configured, env);
        writeFileSync(path.join(configured, ".gitmodules"), [
            "[submodule \"skills\"]",
            "\tpath = skills",
            "\turl = https://github.com/masontuft/Skills.git",
            "\tbranch = main",
            "",
        ].join("\n"));
        runGit(["add", ".gitmodules"], configured, env);
        runGit(["commit", "-m", "gitmodules only"], configured, env);
        const noLink = runScript(scriptFile, configured, env);
        assert.strictEqual(noLink.status, 0, `${noLink.stdout}\n${noLink.stderr}`);
        assert.match(noLink.stdout, /not a 160000 gitlink/);
        assertSecretHidden(noLink);

        const bumped = buildSuperproject(directory, env, "main");
        writeFileSync(env.GH_LOG, "");
        const first = runScript(scriptFile, bumped.checkout, env);
        assert.strictEqual(first.status, 0, `${first.stdout}\n${first.stderr}`);
        assertSecretHidden(first);
        assert.match(readFileSync(env.GH_LOG, "utf8"), /pr create/);
        const skillsMain = runGit(["rev-parse", "main"], bumped.skills, env);
        assert.strictEqual(runGit(["rev-parse", "HEAD:skills"], bumped.checkout, env), skillsMain);
        assert.notStrictEqual(
            runGit(["rev-parse", "main"], bumped.checkout, env),
            runGit(["rev-parse", "skills-sync"], bumped.checkout, env),
        );

        writeFileSync(env.GH_LOG, "");
        const again = runScript(scriptFile, bumped.checkout, env);
        assert.strictEqual(again.status, 0, `${again.stdout}\n${again.stderr}`);
        assert.match(again.stdout, /already at Skills main/);
        assert.strictEqual(readFileSync(env.GH_LOG, "utf8"), "");
        assertSecretHidden(again);

        writeFileSync(path.join(bumped.skills, "README.md"), "second\n");
        runGit(["add", "README.md"], bumped.skills, env);
        runGit(["commit", "-m", "second"], bumped.skills, env);
        writeFileSync(env.GH_LOG, "");
        const updated = runScript(scriptFile, bumped.checkout, { ...env, GH_EXISTING: "7" });
        assert.strictEqual(updated.status, 0, `${updated.stdout}\n${updated.stderr}`);
        assertSecretHidden(updated);
        const log = readFileSync(env.GH_LOG, "utf8");
        assert.match(log, /pr edit/);
        assert.match(log, /\b7\b/);
        assert.doesNotMatch(log, /pr create/);
        assert.strictEqual(
            runGit(["rev-parse", "HEAD:skills"], bumped.checkout, env),
            runGit(["rev-parse", "main"], bumped.skills, env),
        );

        const diverged = buildSuperproject(directory, env, "side");
        writeFileSync(env.GH_LOG, "");
        const before = runGit(["rev-parse", "HEAD"], diverged.checkout, env);
        const refused = runScript(scriptFile, diverged.checkout, env);
        assert.strictEqual(refused.status, 0, `${refused.stdout}\n${refused.stderr}`);
        assert.match(refused.stdout, /Not bumping/);
        assert.strictEqual(runGit(["rev-parse", "HEAD"], diverged.checkout, env), before);
        assert.strictEqual(readFileSync(env.GH_LOG, "utf8"), "");
        assertSecretHidden(refused);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

function buildSuperproject(directory, env, advance) {
    const skills = path.join(directory, `skills-${advance}`);
    const bare = path.join(directory, `origin-${advance}.git`);
    const working = path.join(directory, `working-${advance}`);
    const checkout = path.join(directory, `checkout-${advance}`);
    mkdirSync(skills);
    runGit(["init", "-b", "main"], skills, env);
    writeFileSync(path.join(skills, "README.md"), "one\n");
    runGit(["add", "README.md"], skills, env);
    runGit(["commit", "-m", "one"], skills, env);
    runGit(["init", "--bare", "-b", "main", bare], directory, env);
    runGit(["init", "-b", "main", working], directory, env);
    runGit(["remote", "add", "origin", bare], working, env);
    runGit(["submodule", "add", "-b", "main", skills, "skills"], working, env);
    runGit(["commit", "-m", "add skills"], working, env);
    runGit(["push", "-u", "origin", "main"], working, env);
    if (advance === "main") {
        writeFileSync(path.join(skills, "README.md"), "later\n");
        runGit(["add", "README.md"], skills, env);
        runGit(["commit", "-m", "later"], skills, env);
    } else {
        runGit(["checkout", "-b", "side"], skills, env);
        writeFileSync(path.join(skills, "README.md"), "side\n");
        runGit(["add", "README.md"], skills, env);
        runGit(["commit", "-m", "side"], skills, env);
        runGit(["-C", path.join(working, "skills"), "fetch", skills, "side"], directory, env);
        runGit(["-C", path.join(working, "skills"), "checkout", "--detach", "FETCH_HEAD"], directory, env);
        runGit(["add", "skills"], working, env);
        runGit(["commit", "-m", "pin side"], working, env);
        runGit(["push", "origin", "main"], working, env);
    }
    runGit(["clone", bare, checkout], directory, env);
    return { skills, checkout };
}
