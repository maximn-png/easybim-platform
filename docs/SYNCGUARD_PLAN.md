# Syncguard — Build Plan

## Status (2026-09-07)

| Phase | State |
|---|---|
| 0 · Publish Now | **code complete**, publish trigger not yet fired against a live model |
| 1 · Cloud GUID spike | **done** — GUIDs confirmed present; fields persisted |
| 2 · Job queue + agent protocol | **done** — agent half verified end to end over HTTP |
| 3 · pyRevit script | **done — green on two real coordination models.** `pyrevit run` opens a cloud-workshared model headlessly: no sign-in prompt, no hang, `OpenDocumentFile` succeeded first try (fallback never needed), `Close(false)` worked. Relinquish-all via `SetRelinquishOptions` left zero owned worksets across all four kinds on both models. Zero dialogs recorded — the no-dialog-handler call was right. The failure handler is real, not decorative: 23 and 245 events, auto-resolving two Spot Dimension errors. **Unproven:** neither callback was ever invoked (`lockWaitCalls: 0`, no open conflicts) — central was never locked and no conflict arose, which is exactly the looks-like-success failure mode; and the ribbon button is unverified because `pyrevit run` is UI-less and it needs a human click. |
| 4 · Tray agent | not started (ships with the script — see Phase 4) |
| 5 · UI | not started |
| 6 · Scheduling | not started |
| 7 · Pilot | not started |

Answers the probes produced, which supersede guesses elsewhere in this doc:

- **Cloud GUIDs are exposed.** `versions:autodesk.bim360:C4RModel` v1.4.0
  `extension.data` carries `projectGuid`, `modelGuid`, `revitProjectVersion`,
  `modelType` and `hasLinks`. They arrive on the folder-`contents` crawl the
  viewer already runs, so capturing them cost **zero extra ACC calls**.
- **`revitProjectVersion` beats `Project.rvtVersion`.** It is the model's own
  Revit version, straight from ACC. The plan previously said to pin runs to the
  project's Monday-sourced `rvtVersion`; use the model's value and fall back to
  the project's only when absent.
- **`modelType: 'multiuser'` gates the feature.** Non-cloud models can now be
  detected, so Syncguard hides rather than failing inside Revit.
- **Region is derivable**, not stored: `urn:adsk.wipprod:` → US,
  `urn:adsk.wipemea:` → EMEA.
- **Publish needs a 3-legged token — confirmed, not suspected.** The commands
  endpoint answers `401 USER_UNAUTHORIZED — "This endpoint only supports
  two-legged with impersonation and three-legged calls."` `data:write` *is*
  grantable to our app; the scope was never the problem. This also **removes the
  attribution risk**: publishing as the user is now the only option, so ACC
  records a real person.

## Repo split and working order

| Phase | Repo |
|---|---|
| 0, 1, 2, 5, 6 | **easybim-platform** (`apps/epm`) |
| 3, 4 | **EasyBIM.extension** — the pyRevit repo |
| 7 | both |

**Phase 4 lives with Phase 3, not in the monorepo.** The monorepo deploys to a
server; the tray agent is a Windows-workstation artifact that shells out to
`pyrevit run`. They version together and install as one unit, so a BIM engineer
installs one thing rather than two.

**Work order — Phase 3 first, Phase 4 last.** Not 3-and-4 together, because:

- **Phase 3 is independent and it is the last big unknown.** It needs no queue,
  no API, no auth — just a machine with Revit and the GUIDs Phase 1 captured. If
  `pyrevit run` turns out not to drive a Cloud Worksharing model, Phase 4 changes
  shape entirely. De-risk it before building anything on top.
- **Phase 5 partially blocks Phase 4.** The agent enrolls by redeeming a pairing
  code, and the only way to mint one today is to hand-seed the pending agent row
  in Mongo (which is how Phase 2 was tested). Phase 5 builds that UI. Phase 4
  also wants Phase 5's live console to debug against.

So: **3 → 5 → 6 → 4 → 7**.

## Context

Opening a coordination model just to sync-and-publish it costs a BIM engineer
15+ minutes of babysitting. Syncguard puts that behind one button on the
**Project Model — Coordination** card (`apps/epm/components/CoordinationModelViewer.tsx:238`)
and, later, behind a schedule.

**What the pipeline actually does:**

1. Open the cloud coordination model — Revit **auto-reloads links to latest on open**
   (no `ReloadLatest` call needed; the AR/ST/MH/EL chip in the UI is display-only).
2. **Sync with Central** — this is what *commits* the auto-reloaded link state into central.
3. **Publish** — this is what *exposes* it to ACC / Forma / the EPM viewer.

Step 3 needs no Revit at all. Steps 1–2 do. That split drives the whole plan.

## Confirmed decisions

| Decision | Rationale |
|---|---|
| Revit-side executor is a **pyRevit script**, not a new C# add-in | `pyrevit run` already launches Revit, plays a journal, runs a script, tears down. CLI confirmed installed at `C:\Program Files\pyRevit-Master\bin\pyrevit`. Deletes the C# toolchain, per-version compile, installer and code signing. |
| **Dialogs suppressed by default** | `pyrevit run` takes `--allowdialogs` as opt-*in*, so no `DialogBoxShowing` handler is needed to suppress. A record-only handler is still worth having to learn which dialog ids actually appear. |
| **Hard version guard inside Revit — safety requirement, not a nicety** | Because dialogs are suppressed, a Revit newer than the model would auto-dismiss the upgrade prompt and **silently, irreversibly upgrade a coordination model**. The script must refuse and touch nothing when `HOST_APP.app.VersionNumber != SYNCGUARD_EXPECTED_REVIT`. This is the one guard that stops a Phase 4 misconfiguration becoming unrecoverable. `revitVersion` is snapshotted at enqueue (so an ACC re-crawl cannot move the target mid-run), which means an upgrade between enqueue and execution correctly produces a clean refusal. |
| **Answer the cloud-open conflict prompt explicitly** (`IOpenFromCloudCallback`) | Headless with no callback, the journal picks — and two of the four answers are actively harmful: `DetachFromCentral` makes the model unsyncable, `KeepLocalChanges` would commit a crashed prior run's leftovers. Answer `DiscardLocalChangesAndOpenLatestVersion` for OutOfDate/Relinquished/Rollback, `Cancel` → `needs_attention` for VersionArchived. This state is exactly what a timed-out or crashed Syncguard run leaves behind, so it will be hit in practice. |
| **Bound the locked-central wait** (`ICentralLockedCallback`) | Revit's default on a locked central is to wait *indefinitely*, not raise — headless that is an unbounded hang, and plausibly the likeliest production failure. A deadline callback turns it into a prompt `CentralModelContentionException` → `failed`, retry later. |
| **Unresolvable failures return `Continue`, never `ProceedWithRollBack`** | A rollback returns a success-looking result having done nothing. Letting Revit raise instead is what keeps `success` meaningful. |
| Script runs on **IronPython** (no shebang) | Confirmed against the extension's own shebang census: `python3` appears only where a CPython library is needed (the openpyxl Excel tools), on `lib/` scaffolding, and on "Coming soon" stubs — while all ~36 files doing real Revit API work (Project Base Points, Coordination Graphics, Head Height Check, Level Sheets, Cable Trays, Power, `coordination_settings_ui.py`, `acc_issues_export.py`) carry no shebang and run IronPython. The team's actual rule is *CPython only when a CPython library demands it*. Syncguard is API work with a `FailuresProcessing` delegate, so it goes IronPython. This also keeps Phase 3 to ONE unknown: a pythonnet event-delegate failure would be indistinguishable from "the cloud model didn't open". The PR template's `#! python3` default does not apply to API-event code — the repo already departs from it 36 times. |
| Agent makes **outbound HTTPS only** | Claim / heartbeat / log / complete. No inbound ports, no VPN, no firewall tickets. Deployable on any office or home machine. |
| Runs as a **logon scheduled task**, not a Windows service | Session 0 isolation: a LocalSystem service cannot start an interactive Revit, and licensing + Autodesk tokens live in the user profile. |
| **Server owns the schedule** | Survives workstation reboots, stays visible in the UI. |
| Do **not** pass the model as `pyrevit run <model_file>` | That argument wants a local path. Open the cloud model inside the script via `ModelPathUtils.ConvertCloudGUIDsToCloudPath`. |
| Build on the pyRevit direction, **not** EverestPlugin | EverestPlugin is the retiring Everest C# codebase — its commands are all authoring tools and it contains zero worksharing code (no `SynchronizeWithCentral`, no `OpenAndActivateDocument`, no `ConvertCloudGUID` anywhere in `src`). |
| Syncguard does **not** block on the pyRevit port | The port's 9–10 days are UI, Excel and coordinate math. Syncguard needs no ribbon button, no XAML, no auth. Ships in parallel or first. |

## Two agent modes

Licensing follows the **target machine's Windows session**, not the browser click.
There is no way to pass the clicker's Revit licence or ACC identity to another
machine. So the target-computer dropdown carries the whole distinction:

**Mode A — personal agent (target = my own machine).** Default for *Run Now*.
No bot account, no extra Revit licence, no ACC membership admin, already signed in,
session already interactive. The sync lands in ACC history attributed to a real
person rather than a bot. This is the 80% case and the one that saves the time.

**Mode B — shared agent (target = an always-on workstation, e.g. `EB-WS-07`).**
Required for anything **scheduled** — a 07:00 run cannot depend on a personal laptop
being awake, off VPN and not mid-Revit-session. Needs a machine logged in as a real
BIM-team user whose licence it borrows (or a dedicated account with a Revit licence,
ACC project membership, and no MFA prompt).

Guardrails Mode A needs that Mode B does not:

- **Refuse, do not fight.** `pyrevit run` launches a *fresh* Revit instance. If the user
  already has Revit open on that model, that is a collision (model already opened /
  workset ownership). The agent pre-checks running `Revit.exe` and returns
  "Revit is open with this model — close it first" *before* queuing, not 8 minutes in.
- **It takes over their desktop** for several minutes and steals focus. The UI must say
  so up front ("this will open Revit on your computer for ~5 min").

## Sign-in state is a first-class heartbeat field

Autodesk tokens expire (inactivity, password change), and on an unattended machine the
next Revit launch then hangs on a sign-in prompt until timeout. So the heartbeat reports
**Revit sign-in state**, not just Online — the UI shows `EB-WS-07 · needs Autodesk sign-in`
ahead of time, in the same `needs_attention` banner already designed for the
missing-`Building`-parameter case, instead of discovering it as a 07:00 failure.

## Data model

Two new Mongoose models in `apps/epm/app/models/`, following the existing
`SyncRun.ts` precedent (TTL index, `trigger` enum, `triggeredBy` = Clerk userId).

**`SyncguardAgent`** → `epm_syncguard_agents`

```
agentId            string  uuid, generated at install
machineName        string  'EB-WS-07'
kind               enum    'personal' | 'shared'
ownerUserId        string  Clerk userId — who enrolled it (drives "my computer")
tokenHash          string  per-agent bearer token, hashed
revitVersions      [string]
autodeskSignedIn   boolean
autodeskUser       string?
revitRunning       boolean
openModels         [string]
currentRunId       ObjectId?
lastHeartbeatAt    Date
agentVersion       string
enabled            boolean
```

**`SyncguardRun`** → `epm_syncguard_runs`

```
projectId          ObjectId
modelUrn, modelName
agentId            string
trigger            enum    'manual' | 'schedule'
triggeredBy        string?  Clerk userId when manual
status             enum    queued | claimed | running | success | warning
                           | failed | needs_attention | cancelled | expired
steps              [{ key, label, status, startedAt, finishedAt, message }]
log                [{ at, level, text }]
startedAt, finishedAt, durationMs
publishJobId       string?  ACC publish command id
attentionReason    string?  "Missing required parameter 'Building' on Forma"
```

TTL ~90 days on `createdAt`, mirroring `SyncRun`.

Step keys for v1: `open-revit`, `open-model`, `sync-central`, `publish`.
(`qa-link-check` and `mep-maturity` are v2 — see Cut from v1.)

## API surface

**Dashboard-facing** (Clerk auth, same shape as
`app/api/projects/[id]/coordination-models/route.ts`):

```
POST   /api/projects/[id]/syncguard/publish        Phase 0 — server-side publish, no agent
POST   /api/projects/[id]/syncguard/runs           enqueue { agentId, modelUrn }
GET    /api/projects/[id]/syncguard/runs           run history for the card
GET    /api/projects/[id]/syncguard/runs/[runId]   one run + log (poll 2s, or SSE)
GET    /api/syncguard/agents                       agents visible to this user
PUT    /api/projects/[id]/syncguard/schedule       Phase 6
```

**Agent-facing** (per-agent bearer token, *not* Clerk):

```
POST   /api/syncguard/agent/heartbeat              → { hasWork: bool }
POST   /api/syncguard/agent/claim                  → a run, or 204
POST   /api/syncguard/agent/runs/[runId]/log
POST   /api/syncguard/agent/runs/[runId]/complete
```

**Enrollment**: the UI shows a short pairing code (TV-app style); the agent exchanges it
once for a bearer token bound to `ownerUserId`. Token stored hashed server-side.

## Phases

### Phase 0 — Server-side Publish Now (1 day) · no desktop footprint

The whole pipeline's step 3, standalone. Extend `lib/services/apsCoordination.ts` with an
ACC publish command (`POST /data/v1/projects/:id/commands`, `C4RModelPublish` /
`C4RModelGetPublishJob`), add a **Publish** action to the coordination card, poll the job.
Requires `data:write` on the APS token — today it is read-only
(`lib/services/apsViewer.ts:77`) — and possibly a 3-legged token.

**Deliverable:** button republishes the coordination model with no workstation involved.
**Ship this first and measure how much of the pain is staleness vs. sync.**

#### The Publish button

Lives in the coordination card's existing controls row, in the `ml-auto` group at
`CoordinationModelViewer.tsx:276` — immediately left of the current refresh action so the
two cloud operations sit together.

States:

| State | Trigger | UI |
|---|---|---|
| Idle | default | `Publish` with an upload icon |
| Publishing | click → `C4RModelPublish` accepted | spinner + `Publishing…`, disabled; poll `C4RModelGetPublishJob` every ~5s |
| Already in flight | `processingVersion != null` (`CoordinationModelViewer.tsx:268`) | disabled, tooltip "ACC is already translating v{n}" — reuse the existing amber badge, do not add a second indicator |
| Up to date | ACC reports nothing to publish | brief `Already up to date`, then back to Idle |
| Failed | command or job error | toast + back to Idle; do not blank the card |

On success, re-run the existing model fetch with `?refresh=1` so the Published date and
version number in the title row update without a page reload.

**Naming collision — fix this while you are in here.** The card's current
`Sync to platform` button (`CoordinationModelViewer.tsx:295`) is only an ACC re-crawl of
the folder tree; it syncs nothing in Revit. Once Syncguard lands there are three distinct
meanings of "sync" on one card: that re-crawl, Revit's Sync with Central, and the publish.
Rename the existing one to **Refresh from ACC** in Phase 0, before adding a second verb
users could confuse it with.

**Permissions:** publishing via the hub's 2-legged credentials acts as the *app*, not the
clicking user, so ACC records the app as publisher — unlike Mode A of the agent flow,
which attributes to a real person. Confirm that is acceptable for audit, and decide
whether the button should be role-gated, before Phase 0 ships.

### Phase 1 — Cloud GUID spike (½ day) · blocks Phase 3

`CoordinationModel` carries a derivative `urn` but no Revit cloud
`projectGuid`/`modelGuid`, which `ConvertCloudGUIDsToCloudPath` needs. Determine whether
they are reachable from the ACC item/version `extension.data`, and persist them on the
model snapshot. **If they are not obtainable, Phase 3 needs a different open strategy** —
resolve this before committing to Phases 2–5.

### Phase 2 — Job queue + agent protocol + enrollment (2 days)

Both models, all agent-facing routes, pairing-code enrollment, token hashing, claim
with a per-agent lock, stale-run expiry.

**Deliverable:** `curl` can enrol a fake agent, claim a queued run, stream logs, complete it.

### Phase 3 — The pyRevit script (1 day)

~30 lines: resolve cloud path → `OpenAndActivateDocument` → `SynchronizeWithCentral`
→ relinquish all → close → write result JSON. Add a `FailuresProcessing` handler for
sync-time warnings (dialog suppression is already free).

**Ships as three files, not one** — revised after review of the extension-side
plan. A shared core in `lib/easybim/syncguard.py` (everything touching
worksharing), a headless entry at `commands/syncguard_command.py` (pyRevit's own
sanctioned home for `pyrevit run` scripts), and a ribbon button that syncs the
already-open document.

**The button is fault isolation, not convenience.** It exercises the entire
sync/relinquish/failure-handler core interactively, with visible output, minus
the `pyrevit run` and cloud-open unknowns. "Button works, headless doesn't"
localises the fault to the runner or the cloud open — a far sharper signal than
one all-or-nothing headless attempt.

**Inputs arrive as env vars.** `pyrevit run` accepts only `--revit`, `--purge`,
`--allowdialogs`, `--import`, `--models` and `<model_file>` — there is no channel
for custom arguments. So: `SYNCGUARD_PROJECT_GUID`, `SYNCGUARD_MODEL_GUID`,
`SYNCGUARD_REGION`, `SYNCGUARD_EXPECTED_REVIT`, `SYNCGUARD_RESULT_JSON` (all
required), plus optional `SYNCGUARD_PROGRESS_NDJSON`, `SYNCGUARD_COMMENT`,
`SYNCGUARD_LOCK_WAIT_SEC`. Keeps test GUIDs out of the repo.

**Worksets: the enum member is `OpenAllWorksets`** (`OpenAll` does not exist).

**Test fixture that already exists** (from the Phase 1 spike — a real cloud model):
`projectGuid 43ae728e-848e-4050-b072-4b5cb0911e4b`,
`modelGuid e728886e-e1ac-4c27-a726-26f5ddc2c361`, region US, Revit 2025.
Prefer a coordination model for a realistic run, but these are known-good GUIDs
for a first "does it open at all" test.

Writes its result JSON to `SYNCGUARD_RESULT_JSON` and appends NDJSON progress events
to `SYNCGUARD_PROGRESS_NDJSON` — see Phase 4 for why stdout cannot serve as the
progress channel. Step keys are `open-model` and `sync-central` only: `open-revit`
belongs to the agent and `publish` to the platform.

**Deliverable:** `pyrevit run syncguard.py --revit=2025 --purge` syncs a real model end to
end, driven by hand.

### Phase 4 — The tray agent (2 days)

Logon scheduled task. Heartbeat (incl. `autodeskSignedIn`, `revitRunning`, `openModels`),
claim, shell out to `pyrevit run` with the model's own `revitVersion`, forward progress,
kill on timeout, report result. Pre-flight the "Revit already open" refusal.

**Progress does NOT come from stdout.** pyRevit's `print` goes to its own output
window, which is not captured when running headlessly, so a 45-minute sync would
show nothing until it finished. The script instead appends NDJSON events to a file
whose path the agent passes in `SYNCGUARD_PROGRESS_NDJSON` (the result JSON goes to
`SYNCGUARD_RESULT_JSON`); the agent tails it and forwards to
`/api/syncguard/agent/runs/[runId]/log`. Line kinds map 1:1 onto that endpoint so
the agent forwards rather than translates:

    {"t":"…","kind":"line","level":"info","text":"Revit 2025 started"}
    {"t":"…","kind":"step","key":"sync-central","status":"running"}

Each event is open-append-close rather than a held handle: events are rare, it
avoids a Windows locking fight with the tailing agent, and everything up to the
last event survives a `taskkill` — so a timeout can report *where* the run hung
instead of just that it did. The tail reader must skip a trailing line that fails
to parse (killed mid-write is exactly the case this file exists for).

**Time out on silence, not on total duration.** With a progress channel, "no new
event for ~10 min" catches a hang quickly and never kills a legitimately slow sync
of a large model. This matches the server-side watchdog, which already expires
claimed runs off `lastProgressAt` rather than `startedAt`.

**The open dominates, not the sync — measured, 2026-09-09.** On the two pilot
models:

| | TZE_CO-URS-R25 (v3) | TZE_C-CO-EAB-MAIN-R25 (v14) |
|---|---|---|
| resolve cloud path | 1.4s | 0.6s |
| **open (all worksets)** | **18.8s** | **6m 55s** |
| sync + relinquish | 11.1s | 23.6s |
| verify | 0.05s | 0.06s |
| total | 32s | 7m 20s |

So ~95% of wall clock is the open, and it is the part that scales with model size
and link count. **A timeout tuned on sync time would be badly wrong.**

**Timeouts must be phase-aware.** The script is blocked inside
`OpenDocumentFile` for the whole open and there is no progress callback for it, so
a large model emits nothing for many minutes — 7 on a merely *representative*
model, and the hub holds far bigger ones (Sheba's coordination model is at v235).
A flat ~10-minute silence window would kill a healthy run. The agent must allow a
long window (~40 min) between `open-model: running` and `open-model: done`, then
the tight window for everything after; those step transitions are the signal that
makes it possible.

Timeouts nest, innermost first, and must stay in this order:

    central-lock callback 300s  <  agent silence (open ~40 min / post-open ~10 min)  <  server stale-claim 45 min

so a locked central surfaces as a clean retryable `failed` instead of being killed
as a hang. The script emits a progress line from the lock callback on each
`ShouldWaitForLockAvailability` call — without it, a legitimate 5-minute lock wait
is indistinguishable from the start of a hang, and the console cannot explain why
the run is slow.

**Three `pyrevit run` gotchas found the hard way in Phase 3** — all Phase 4's to
honour:

- **The script path must be ABSOLUTE.** A relative path is copied verbatim into
  the journal's `ScriptSource`, Revit runs from its own temp cwd, and the script
  is silently never found: no error, no output, exit 0.
- **`%TEMP%` inside Revit is redirected** to the per-run folder that `--purge`
  deletes. Every output path the agent passes must be absolute and outside TEMP.
- **`SearchPaths` is empty**, so `lib/easybim` is not importable from a
  `commands/` script. Solved script-side with a `__file__`-relative bootstrap, so
  the agent needs no `--import` flag.

**Status mapping — three tiers, so `warning` keeps its meaning.** With 245
failure events on a representative model, letting any recorded warning set
`warning` would make almost every run a warning. Benign warnings go to `lines`
and leave the status `success`; auto-resolved *errors* set `warning` (the model
genuinely needed fixing, which a BIM manager wants to see); unresolvable errors
are `needs_attention`. This differs from the ownership sweep, which is suppressed
because it reads an unreliable cache — the distinction is signal reliability, not
severity.

**`steps[open-model].message` carries the model title, not an ACC version.** Revit
does not expose the ACC version number; the agent knows it at enqueue and should
substitute if a version string is wanted.

Two agent behaviours the Phase 3/4 seam requires:

- **No result file *and* no progress file ⇒ configuration fault, not `failed`.**
  If `SYNCGUARD_RESULT_JSON` is itself unset, the script has nowhere to write its
  verdict, so the absence of a result would otherwise be misread as a retryable
  failure that will in fact fail identically forever. Classify it as
  `needs_attention`. A missing result file *with* a populated progress file is a
  genuine crash and stays `failed`.
- **Result file written but the process never exits ⇒ kill after a grace period.**
  Revit can hang on teardown after a successful sync. The agent should honour the
  result file it can already read rather than waiting out the silence timeout and
  reporting a failure that did not happen.

**Deliverable:** button in EPM → Revit opens on the target machine → run completes green.

### Phase 5 — UI (2–3 days)

Syncguard button + status on the coordination card; the Automation page from the
screenshots (target-computer picker, step list, live console, run history);
`needs_attention` banner with **Resolve**.

**Deliverable:** the designed screens, wired to real runs.

### Phase 6 — Scheduling (1 day)

Server-side cron creates runs. Hourly / daily / weekly presets, next-3-runs preview,
auto-pause into `needs_attention` on repeated failure or lost sign-in.

**Deliverable:** an unattended 07:00 run on the shared agent.

### Phase 7 — Pilot (2 days)

One project, one shared agent, manual-only for the first week. Nobody trusts a scheduled
bot on a coordination model until it has been watched succeeding ~20 times.

**Total: ~11–13 working days. Phase 0 alone is 1 day and delivers standalone value.**

## Cut from v1

- The 2023–2027 Revit version picker — pin to the project's `rvtVersion`.
- "Before coordination meetings" schedule preset.
- Step 5 "QA — Shared Site link check" and step 6 "MEP maturity assessment" (separate agent).
- Multi-model selection — v1 targets the one coordination model the card already resolves.
- Scheduling itself until Phase 6: **v1 is Run Now + live log only.**

## Risks

| Risk | Mitigation |
|---|---|
| ~~Cloud `modelGuid`/`projectGuid` not exposed by ACC~~ | **Resolved** — both present on the C4R version extension |
| ~~ACC publish may need a 3-legged token~~ | **Confirmed required** — the 2-legged path is impossible, not merely discouraged |
| ~~Phase 0 publish attributed to the app~~ | **Resolved** — 3-legged is the only option, so it is attributed to the real user |
| ~~Three meanings of "sync" on one card~~ | **Done** — renamed to `Refresh from ACC` |
| `pyrevit run` + Revit Cloud Worksharing unverified together | Phase 3 is a hand-driven proof before Phase 4 automates it |
| Publish trigger never fired | `C4RModelPublish` is wired but unexercised; needs one run on a named test project |
| Autodesk token expiry on the shared agent | Heartbeat reports sign-in state; UI warns before the scheduled window |
| Revit hangs | Hard timeout + `taskkill` + `failed` status |
| Revit already open on the target (Mode A) | Pre-flight refusal, implemented in the enqueue route |
| ACC publish command *response* vocabulary | `commandStatus` strings are matched loosely; the Autodesk Product Help connector is still unauthorized, so the exact terminal words are unconfirmed |

## How to resume

> "I'm back on Syncguard. Read docs/SYNCGUARD_PLAN.md in easybim-platform."

Then name the phase. Related: `EverestPlugin/PYREVIT_PORT_PLAN.md` (the separate pyRevit
port — Syncguard does not depend on it).
