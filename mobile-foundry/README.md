# Pocket Foundry

Pocket Foundry is the phone-resident background worker for Synthia's development environment.

It is deliberately additive. Source drops are never edited or deleted. Every job gets its own copied workspace, provenance manifest, hashes, build logs, generated files, tests, and packaged result.

## What it does in the background

1. Watches `/sdcard/Download/SynthiaInbox`.
2. Detects a new ZIP, folder, code file, document, or mixed project.
3. Copies it into an isolated job workspace.
4. Automatically extracts ZIP files safely.
5. Inventories and hashes the project.
6. Detects Node, Python, Android/Gradle, HTML, and mixed projects.
7. Builds a bounded context packet from the actual files.
8. Sends the packet to the configured coding agent, defaulting to Synthia/Trident.
9. Applies generated files only inside the copied workspace.
10. Installs/builds/tests when appropriate.
11. Packages the finished workspace into `~/.synthia-foundry/outbox`.
12. Keeps a job journal so the same drop is not repeatedly rebuilt.

The build prompt also asks the coding agent to produce `PRODUCT.md` and `RELEASE_CHECKLIST.md`, so a working build comes back with a sellable-product layer instead of just loose code.

## Android reality

Android 16 will not reliably allow a completely invisible forever-process. The dependable phone-only design is a Termux service plus wake lock, with Termux allowed to run in the background. Android may show a persistent notification. If the OS kills the process anyway, Termux:Boot restarts it after reboot and `foundryctl run-once` can process the inbox immediately.

Heavy builds can be delegated to the server/GitHub later while the phone remains the intake, control, and artifact terminal.

## Install

Unzip or clone this repository first. Then in Termux:

```bash
cd Synthia-server/mobile-foundry
bash install.sh
```

The installer explicitly creates the inbox and background service.

## Drop-to-build

Put a project in:

```
/sdcard/Download/SynthiaInbox/MyThing.zip
```

Optionally add:

```
/sdcard/Download/SynthiaInbox/MyThing.intent.txt
```

Example intent:

```
Turn this into a phone-first paid tool. Keep the existing visual identity.
Fix runtime blockers, add a first-run flow, add a simple offer page, and make
the build deployable. Do not delete supplied functionality.
```

Pocket Foundry copies `MyThing.zip`, extracts the copy, works inside the job directory, tests it, and emits a result ZIP into the outbox.

## Agent response contract

The coding model is asked to return exactly one bounded payload:

```text
<<<FOUNDRY_JSON>>>
{
  "summary": "what changed",
  "files": [
    {"path": "relative/path.ext", "content": "complete file contents"}
  ],
  "commands": ["npm test --if-present", "npm run build --if-present"]
}
<<<END_FOUNDRY_JSON>>>
```

Deletion is intentionally not part of the protocol. A model cannot request a delete operation through this worker.

## Controls

```bash
~/.synthia-foundry/bin/foundryctl status
~/.synthia-foundry/bin/foundryctl logs
~/.synthia-foundry/bin/foundryctl jobs
~/.synthia-foundry/bin/foundryctl outbox
~/.synthia-foundry/bin/foundryctl restart
~/.synthia-foundry/bin/foundryctl run-once
```

## Model routes

Default: `MODEL_MODE=trident`, which calls the configured Synthia server's `/trident/generate` code head.

You can also set `DEV_AGENT_CMD` to any local or authenticated CLI coding model. The worker sends the prompt over stdin and reads stdout. Secrets stay in `~/.synthia-foundry/config.env`, not in Git.

If the model route is unavailable, the job remains fully ingested and packaged as a prepared job rather than being discarded.

## Release safety

Autonomous work happens on a copy. Production publication, charging users, destructive repository changes, and deleting originals are outside this worker's automatic authority. Those can be added as explicit approval-gated release actions.
