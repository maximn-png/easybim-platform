# 🦁👑 Agent Kingdom — Strategy & Roadmap · EasyBIM

> **North star:** a kingdom of specialized agents, each owning one clear job, that quietly run EasyBIM's recurring work with a human in the loop.
> **Reality check (this doc):** the metaphor is aspirational. Today only 2 of the cast are live. This page is the honest map of what exists, what earns its place next, and what we should *not* build yet.

Source of truth for *running* status is [`README.md`](./README.md). This doc is the **strategy layer**: priorities, sequencing, and the per-animal verdict.

Visual vision board: [Agent Kingdom (Artifact)](https://claude.ai/code/artifact/7db700c4-cb78-48c8-86c5-e3d8f4d3ca3d)

---

## 1. Status at a glance

| Animal | Job | House | Status | Verdict |
|--------|-----|-------|--------|---------|
| 🦚 Peacock | LinkedIn / content | Content | **LIVE** | Keep improving (more channels) |
| 🐿️ Squirrel | Price-quote setup + index | Treasury | **LIVE** | Deepen (draft-from-past) before anything new |
| 🦁 Lion | Orchestrator / CEO | Crown | Not built | **Reframe** → control tower first, router later |
| 🐕 Dog | Collections / contracts | Treasury | Not built | **Build next** — cleanest money-loop agent |
| 🐜 Ant | Finance / cashflow | Treasury | Not built | Build after Dog (needs accounting data source) |
| 🐆 Tiger | Sales | Treasury | Not built | Gated on a real lead/CRM source |
| 🦉 Owl | Data / analytics | Clients | Not built | Medium — absorbs Eagle |
| 🦅 Eagle | Strategy / big-picture | Crown | Not built | **Merge into Owl** — too fuzzy to stand alone |
| 🐬 Dolphin | Client retention | Clients | Not built | Defer — needs defined signals |
| 🐙 Octopus | Technical support | Clients | Not built | Defer — needs a real support channel |
| 🐝 Bee | HR & onboarding | Hive | Not built | Planned — gated on a staff data source (start with onboarding) |
| 🦦 Otter | Culture & fun | Hive | Not built | **Near-term** — cheapest to be wrong, best delight-per-effort |
| 🐘 Elephant | People development | Hive | Not built | Later — low frequency at small-team size |

**Two animals live, both earning their keep.** The rest is a wishlist until it survives the test in §3.

> **The Hive is the newest house** — people & culture. The kingdom was built entirely outward-facing (marketing, money, clients); the Hive is the internal, employee-facing side that was missing. It shares a lightweight "team" data source (a Monday staff board / sheet), *not* the money spine.

---

## 2. Strategic principles

These are the rules the roadmap is built on. When a new idea conflicts with one, the principle wins.

1. **Depth over breadth.** A 3rd mediocre animal is worth less than making Squirrel or Peacock excellent. We do not "collect animals." Each new agent must clear a real ROI bar (§3).
2. **Every agent automates *existing* recurring manual work** with a clear data source (Monday board / Drive / Gmail) and a human-in-the-loop approval so mistakes are cheap. No agent invented to fill a slot in the metaphor.
3. **The Lion is a control tower, not a mandatory orchestrator.** An LLM router only earns its place when one request could belong to several agents, or agents hand work to each other. Until then, orchestration is over-engineering. What we *do* need at 3+ agents is operational visibility.
4. **Declarative agents, shared core.** Adding an animal should be *config + tools*, not copy-pasted routes. The shared `agent-core` is the real scaling lever — more than any single agent.
5. **Tiered models.** Routing/classification → Haiku; drafting → Sonnet; hard reasoning → Opus. Deterministic work (Squirrel's sync) uses no LLM at all. Cost scales with agent count; the model choice must too.
6. **Trust is a feature.** Runs are logged, guidance is remembered, and a failing scheduled pass must be *loud*. Silent breakage is the fastest way to lose confidence in the kingdom.

---

## 3. The ROI test (every new animal must pass)

Before building an animal, it must answer **yes** to all of these:

- **Recurring pain?** Does it automate work a human does repeatedly today?
- **Data source exists?** Is there a concrete Monday board / Drive folder / inbox it reads and writes?
- **Cheap to be wrong?** Is there a human approval step, or is the action easily reversible?
- **Shares a spine?** Does it reuse an existing data layer (quotes/money/content) rather than needing a brand-new one?

Animals that fail today are marked *Defer* or *Merge* below — not cancelled, just not yet.

---

## 4. Roadmap

### Phase A — Now (deepen + build the scaffolding)
The point of Phase A is to make the *next* five agents cheap to build, and to squeeze the value already sitting in the two live ones.

1. **Squirrel: draft-from-past quotes.** Retrieve similar historical quotes (by usage type / area / client) from the content cache and compose a draft `ToQuote` / doc. The content cache was built precisely as this feature's data layer — highest value-per-effort in the whole kingdom.
2. **Extract `agent-core`.** Make `AgentDefinition` declarative: triggers, cron schedules, webhook handlers, passes, guidance injection, and chat tools become *config*, not ad-hoc route files. Trigger condition ("once a 2nd animal lands") already fired.
3. **Lion as control tower.** Kingdom-wide ops view + alerting: which agents ran today, aggregate token cost (already persisted per run, never surfaced), and a loud signal when a scheduled pass errors.

### Phase B — Next (close the money loop)
Squirrel owns the *front* of the money spine (quote → contract → invoice → payment). Extend backward down that spine, sharing one "deals/money" data layer.

4. **🐕 Dog — collections / contracts.** Cleanest to scope: watch overdue invoices and contract milestones, chase persistently, never forget an open debt. Clear trigger (invoice overdue), clear action (reminder + escalation), human approves tone.
5. **🐜 Ant — finance / cashflow.** After Dog. Needs an accounting/invoice data source; strong ROI once that source is wired.
6. **🐆 Tiger — sales.** Gated: only build when there's a real lead/CRM source on Monday. High value, but no data source = no agent.

### Phase B′ — The Hive (people & culture, in parallel)
The kingdom was all outward-facing; this is the internal house. These share a lightweight "team" data source (a Monday staff board / sheet), not the money spine.

- **🦦 Otter — culture & fun.** *Near-term morale win.* Birthdays, work anniversaries, kudos, team-event ideas. The **only** new animal that's genuinely cheap to be wrong (a misfired birthday note is harmless), so it can ship early as a showcase that makes the team love the kingdom. Data source: a small team board of names + dates.
- **🐝 Bee — HR & onboarding.** Start narrow with onboarding — the repo already has an `ONBOARDING.md` seed — then expand to leave/policies once a real staff board exists.
- **🐘 Elephant — people development.** *Later.* Mentorship/growth reminders, 1:1 and review prep. Lowest frequency at current team size — fold "growth nudges" into Bee until the team is bigger.

### Phase C — Later (insight, then reconsider the rest)
7. **🦉 Owl — analytics.** Cross-board insights over the money + content spines. Absorbs 🦅 Eagle's "big picture" job — one analytics animal, not two.
8. **Reconsider 🐬 Dolphin / 🐙 Octopus** against §3. Each is *Defer* until a concrete data source or channel exists (retention signals / support inbox). Do not build on the strength of the metaphor alone.

### The Lion, over time
- **v1 (Phase A):** control tower — ops, cost, alerting. No LLM needed.
- **v2 (only if earned):** chat router — a single "ask the kingdom" entry point that dispatches to the right animal. Justified only once cross-agent handoffs are real (e.g. Squirrel closes a quote → Dog starts watching the contract).

---

## 5. Shared infrastructure (`agent-core`)

What the declarative core must own so animals are data, not plumbing:

- **Agent contract:** `triggers` (cron / webhook), `passes`, `chatTools`, `presentation`, `guidance` — declared in one place per animal.
- **Runtime:** tiered model selection per pass; today everything is `claude-opus-4-8` @ 16k (`lib/core/agentRuntime.ts`).
- **Integrations:** Monday (typed mirror/formula/relation columns — see the `display_value` gotcha), Google Drive/Sheets/Docs, Gmail (future), all shared and cross-agent.
- **Memory:** per-agent `AgentGuidance` (already shared), plus domain caches like Squirrel's `QuoteRecord` / `QuoteContent` as the pattern for future spines.
- **Observability:** `AgentRun` cost/status → the Lion control tower.

---

## 6. The cast (vision / brand narrative)

> The Hebrew narrative below is the *brand* layer — the kingdom's story, kept intact. It describes the aspirational cast, not what's built. See §1 for real status.

כל חיה נושאת **תכונת ליבה אחת ברורה** — כך שברגע ששומעים את שם החיה, כבר יודעים מי אחראי על מה.
ההיררכיה: **האריה מנתב, שאר החיות מתמחות.** כל סוכן מדווח לאריה.

### 👑 בית הכתר — הנהגה ואסטרטגיה

**🦁 אריה — מנכ״ל / אורקסטרטור** · תכונת ליבה: הנהגה
מלך הג׳ונגל. לא מבצע את העבודה בעצמו — מנתב משימות, קובע סדרי עדיפויות ומקבל את ההחלטות הגדולות. כל החצר מדווחת אליו.

**🦅 נשר — אסטרטגיה / ראייה רחבה** · תכונת ליבה: ראייה מגובה
רואה את כל השדה מלמעלה. מזהה מגמות והזדמנויות מרחוק, חושב לטווח ארוך.

### 🦚 בית התוכן — שיווק ונוכחות

**🦚 טווס — תוכן / לינקדאין** · תכונת ליבה: נוכחות וזוהר
יודע להציג, לבלוט ולמשוך תשומת לב. גורם ל־EasyBIM להיראות מצוין בפיד והופך כל פוסט לאירוע.

### 🐆 בית האוצר — מכירות וכספים

**🐆 נמר — מכירות** · תכונת ליבה: מהירות
הזריז ביותר בחצר. קופץ על ליד חם תוך שניות, רודף עד הסגירה.

**🐜 נמלה — כספים** · תכונת ליבה: סדר וחיסכון
סופרת כל גרגר, מסודרת ומתכננת קדימה. בדיוק מה שתזרים ותקציבים צריכים.

**🐕 כלב — גבייה / חוזים** · תכונת ליבה: נאמנות והתמדה
עקבי ונאמן. רודף אחרי מה שמגיע, שומר על החוזים ולא שוכח אף חוב פתוח עד שייסגר.

### 🐬 בית הלקוחות — שירות, תפעול ותובנות

**🐬 דולפין — שימור לקוחות** · תכונת ליבה: אינטליגנציה חברתית
חברותי, חכם ואמפתי. בונה קשר ארוך־טווח, מקשיב ושומר על הלקוח מרוצה.

**🐙 תמנון — תמיכה טכנית** · תכונת ליבה: ריבוי משימות
שמונה זרועות. מטפל בכמה פניות במקביל ופותר בעיות מורכבות בלי לאבד אף חוט.

**🦉 ינשוף — דאטה / אנליטיקס** · תכונת ליבה: חוכמה
חכם ושקט, רואה גם בחושך של הנתונים. מנתח בלי רעש ומחזיר תובנות שמכוונות את כל החצר.

### 🐝 בית הכוורת — אנשים ותרבות

**🐝 דבורה — משאבי אנוש וקליטה** · תכונת ליבה: חריצות ותיאום
מנהלת את הכוורת. קולטת עובדים חדשים, עוקבת אחרי חופשות ונהלים — הדבק שמחזיק את הצוות.

**🦦 לוטרה — תרבות וכיף** · תכונת ליבה: שובבות וחברותיות
החיה שאוהבת לשחק. ימי הולדת, ציוני דרך, מחמאות ורעיונות לגיבוש — הרוח הטובה של המשרד.

**🐘 פיל — פיתוח אנשים** · תכונת ליבה: זיכרון וחוכמה
לעולם לא שוכח. זוכר את היעדים של כל אחד, מזכיר למידה ומכין שיחות משוב וקידום.

---

## 7. Summary table (the vision cast)

| חיה | סוכן | תכונת ליבה | בית |
|-----|------|------------|-----|
| 🦁 אריה | מנכ״ל / אורקסטרטור | הנהגה | הכתר |
| 🦅 נשר | אסטרטגיה | ראייה מגובה | הכתר |
| 🦚 טווס | תוכן / לינקדאין | נוכחות | התוכן |
| 🐆 נמר | מכירות | מהירות | האוצר |
| 🐜 נמלה | כספים | סדר וחיסכון | האוצר |
| 🐕 כלב | גבייה / חוזים | נאמנות והתמדה | האוצר |
| 🐬 דולפין | שימור לקוחות | אינטליגנציה חברתית | הלקוחות |
| 🐙 תמנון | תמיכה טכנית | ריבוי משימות | הלקוחות |
| 🦉 ינשוף | דאטה / אנליטיקס | חוכמה | הלקוחות |
| 🐝 דבורה | משאבי אנוש וקליטה | חריצות ותיאום | הכוורת |
| 🦦 לוטרה | תרבות וכיף | שובבות וחברותיות | הכוורת |
| 🐘 פיל | פיתוח אנשים | זיכרון וחוכמה | הכוורת |
