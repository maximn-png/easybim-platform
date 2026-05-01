# EasyBIM SmartNewsletter

> AI-powered Hebrew BIM newsletter generator — from 21 RSS feeds to a fully styled, ready-to-send email in under 5 minutes.

Built for **Maxim Naftaliyv, CEO of EasyBIM Innovative Engineering**, and Israeli BIM/AEC professionals. Reads the week's most important BIM news, selects the most relevant topics, writes professional Hebrew content in your voice, optionally generates AI images, and exports a polished HTML email.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Database Models](#database-models)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [RSS Feed Sources](#rss-feed-sources)
- [Writing Style System](#writing-style-system)
- [Newsletter Output](#newsletter-output)

---

## Overview

SmartNewsletter is a **Next.js 16 / React 19** full-stack application that automates the creation of weekly BIM industry newsletters. Instead of manually reading dozens of sources and writing summaries, the app:

1. Fetches articles from 21 curated BIM/AEC RSS feeds
2. Uses an LLM (Gemini 2.5 Pro or Cohere Command A) to pick the 7 most relevant topics for an Israeli BIM audience
3. Writes a professional Hebrew summary for each topic — in your personal writing style
4. Optionally generates editorial AI images with Google Imagen 4
5. Assembles a fully branded HTML email and saves it to your library

Everything happens through a 3-step wizard with a real-time progress stream. The whole process takes 1–5 minutes depending on whether images are enabled.

---

## Features

### Newsletter Generation
- **3-step wizard** — Select sources → Configure → Generate
- **Real-time progress** via Server-Sent Events (SSE): watch each step complete live
- **LLM choice**: Gemini 2.5 Pro (most capable) or Cohere Command A (faster)
- **Writing style selector**: Casual, Technical, Enthusiastic, or Professional tone
- **AI images**: Optional Imagen 4 image generation per topic — available with either text model
- **Configurable**: 3–30 days of articles, 3–7 topics per newsletter

### Your Personal Voice
- Upload your LinkedIn posts → AI extracts a writing style profile
- All content is generated to match your tone, vocabulary, and sentence patterns
- Defaults to Maxim's established BIM writing style if no profile is set
- Style profile persists across all future newsletters

### RSS Source Management
- 21 pre-configured feeds across 6 categories (BIM, AI+BIM, MEP, Infrastructure, Israel Gov, Construction)
- Toggle any source on/off per generation
- Add custom RSS feeds with name, URL, and category
- Delete sources you don't need

### Newsletter Library
- Dashboard shows all generated newsletters with date, status, and LLM used
- Edit any topic body directly in the browser after generation
- Live preview pane shows the final email HTML as you edit
- Export as HTML file or copy to clipboard for sending

### Settings
- Per-user API key storage (Gemini, Cohere) — encrypted with AES-256-GCM before saving
- Keys fall back to environment variables if not set per-user
- Test API key validity before generating
- Style profile management (upload, reset to default)

### Authentication
- Clerk-powered sign-up / sign-in
- All data is isolated per user (newsletters, RSS sources, style profile, API keys)

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | Next.js | 16.2.4 | App Router, SSR, API routes |
| UI | React | 19.2.4 | Component model |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| Auth | Clerk | 7.x | User authentication & session management |
| Database | MongoDB + Mongoose | 9.x | Document storage for newsletters, sources, profiles |
| LLM (text) | Google Gemini 2.5 Pro | via `@google/genai` | Topic selection & Hebrew content writing |
| LLM (text alt) | Cohere Command A | via REST API | Alternative text model |
| Image AI | Google Imagen 4 | via `@google/genai` | Editorial image generation per topic |
| RSS | rss-parser | 3.x | Fetch and parse RSS/Atom feeds |
| HTML parsing | html-to-text | 9.x | Strip HTML from RSS content snippets |
| Dates | date-fns | 4.x | Hebrew locale date formatting |
| Icons | lucide-react | latest | UI icons |
| Encryption | Node.js `crypto` | built-in | AES-256-GCM for API key storage |
| Language | TypeScript | 5.x | Type safety throughout |

---

## How It Works

The generation pipeline runs entirely on the server and streams progress events back to the browser via SSE.

```
┌─────────────────────────────────────────────────────────────────┐
│                    GENERATION PIPELINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1 — Fetch RSS                                             │
│  ─────────────────                                              │
│  Query active RssSource records for this user                   │
│  → fetchAllFeeds() calls all sources in parallel (10s timeout)  │
│  → Filters articles by date (last N days)                       │
│  → Strips HTML, deduplicates by URL, sorts newest-first         │
│  → Up to ~80 articles forwarded to the LLM                      │
│                                                                 │
│  Step 2 — Topic Selection                                       │
│  ────────────────────────                                       │
│  TOPIC_SELECTION_PROMPT fed to Gemini or Cohere                 │
│  → LLM picks exactly 7 topics most relevant for Israeli BIM     │
│  → Returns JSON: title, link, summary, imagePromptSuggestion    │
│  → Prioritises: AI+BIM, Revit, ISO 19650, MEP, infrastructure   │
│                                                                 │
│  Step 3 — Content Generation (parallel)                         │
│  ──────────────────────────────────────                         │
│  For each topic, CONTENT_GENERATION_PROMPT sent to LLM          │
│  → LLM writes Hebrew title (≤10 words) + body (5–10 sentences)  │
│  → Applies user's style profile + selected writing style tone   │
│  → Integrates BIM technical terms naturally in English          │
│  → Ends with a concrete, actionable takeaway                    │
│                                                                 │
│  Step 4 — Image Generation (parallel, optional)                 │
│  ──────────────────────────────────────────────                 │
│  If generateImages=true AND Gemini API key available:           │
│  → geminiGenerateImage() calls imagen-4.0-generate-001          │
│  → Returns base64-encoded PNG per topic                         │
│  → Failures are skipped; newsletter continues without images    │
│                                                                 │
│  Step 5 — Assemble & Save                                       │
│  ────────────────────────                                       │
│  buildNewsletterHtml() assembles RTL Hebrew email HTML          │
│  → EasyBIM branded header (navy/teal gradient)                  │
│  → Topic blocks with image (or gradient placeholder)            │
│  → Branded footer with contact details                          │
│  Newsletter document saved to MongoDB (topics + metadata only)  │
│  SSE event { done: true, newsletterId } sent to browser         │
│  Browser redirects to /newsletter/[id]                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Images stored once, HTML built on demand** — Images (base64 PNGs) are stored only in `topics[].imageBase64`. The `htmlOutput` is never persisted to MongoDB — it is assembled server-side at page-render time from the stored topics. This keeps documents well under MongoDB's 16MB BSON limit even with multiple high-resolution Imagen 4 outputs.

**API key resolution chain** — For each generation: ① decrypt per-user key from DB → ② fall back to environment variable → ③ throw a clear error if neither is set.

**Graceful degradation** — LLM failures per topic fall back to the original RSS title/summary. Image failures are silently skipped. RSS feed failures skip that source and continue with the rest. The newsletter always completes.

---

## Project Structure

```
smartnewsletter/
├── app/
│   ├── page.tsx                        # Landing page → redirects auth users to /dashboard
│   ├── layout.tsx                      # Root layout: Clerk provider, fonts, metadata
│   ├── dashboard/
│   │   └── page.tsx                    # Newsletter library (list, stats, create CTA)
│   ├── generate/
│   │   └── page.tsx                    # Generation wizard entry point
│   ├── newsletter/
│   │   └── [id]/page.tsx               # Newsletter viewer: edit topics, preview, export
│   ├── settings/
│   │   └── page.tsx                    # API keys, RSS sources, style profile
│   ├── sign-in/[[...sign-in]]/page.tsx # Clerk sign-in
│   ├── sign-up/[[...sign-up]]/page.tsx # Clerk sign-up
│   └── api/
│       ├── newsletter/
│       │   ├── generate/route.ts       # POST — SSE generation stream (max 300s)
│       │   ├── list/route.ts           # GET  — fetch newsletter library
│       │   └── [id]/route.ts           # GET / PATCH / DELETE single newsletter
│       ├── rss-sources/route.ts        # GET / POST / PATCH / DELETE RSS sources
│       ├── rss/fetch/route.ts          # GET  — preview articles from active sources
│       ├── settings/
│       │   ├── api-keys/route.ts       # GET / POST — manage encrypted API keys
│       │   └── test-key/route.ts       # POST — validate a Gemini or Cohere key
│       ├── images/generate/route.ts    # POST — on-demand Imagen 4 generation
│       └── style-profile/route.ts      # GET / POST / DELETE style profile
│
├── components/
│   ├── AppHeader.tsx                   # Shared nav bar (logo, links, user button)
│   ├── dashboard/
│   │   ├── NewsletterCard.tsx          # Single newsletter row/card in the list
│   │   └── StatsBar.tsx                # Summary stats (total, this week, provider breakdown)
│   ├── generate/
│   │   ├── GenerationWizard.tsx        # 3-step wizard state machine
│   │   ├── TopicSelector.tsx           # Step 1: RSS source multi-select
│   │   ├── LLMSelector.tsx             # Step 2: model, style, images, days, topic count
│   │   └── ProgressTracker.tsx         # Step 3: live SSE progress display
│   ├── newsletter/
│   │   ├── TopicBlock.tsx              # Editable topic card (inline body editor)
│   │   ├── NewsletterPreview.tsx       # iframe HTML preview
│   │   └── NewsletterExport.tsx        # Download HTML / copy to clipboard
│   └── settings/
│       ├── ApiKeyForm.tsx              # Gemini + Cohere key input with test button
│       ├── RssSourceManager.tsx        # Source table with toggle, add, delete
│       ├── SettingsClient.tsx          # Client wrapper for settings tabs
│       └── StyleProfileUploader.tsx    # LinkedIn post upload + style analysis
│
├── lib/
│   ├── constants/
│   │   ├── prompts.ts                  # All LLM prompts + writing style instructions
│   │   └── rssFeeds.ts                 # 21 default feeds, category colors & labels
│   ├── db/
│   │   └── mongoose.ts                 # Lazy MongoDB connection with caching
│   ├── models/
│   │   ├── Newsletter.ts               # Newsletter + TopicItem schema
│   │   ├── RssSource.ts                # RSS source schema
│   │   └── StyleProfile.ts             # Writing style + encrypted API keys schema
│   ├── services/
│   │   ├── newsletterService.ts        # Core generation engine + buildNewsletterHtml
│   │   ├── rssService.ts               # RSS fetching, parsing, dedup, sort
│   │   ├── geminiService.ts            # Gemini 2.5 Pro text + Imagen 4 image calls
│   │   └── cohereService.ts            # Cohere Command A text calls
│   └── utils/
│       └── encryption.ts               # AES-256-GCM encrypt/decrypt for API keys
│
└── public/
    ├── easybim_logo-b.png              # EasyBIM logo (dark)
    ├── easybim_logo-w.png              # EasyBIM logo (light)
    ├── easybim_icon-b.png              # EasyBIM icon (dark)
    └── easybim_icon-w.png              # EasyBIM icon (light)
```

---

## Database Models

### Newsletter

Stores the generated newsletter and its topic content. The HTML output is **not** stored — it is assembled at render time from `topics` to avoid MongoDB's 16MB BSON limit.

```typescript
{
  title:       string           // e.g. "BIM Newsletter — 25/04/2026"
  date:        Date             // Generation timestamp
  status:      'draft' | 'ready'
  llmProvider: 'cohere' | 'gemini'
  userId:      string           // Clerk user ID
  topics: [{
    title:        string        // Hebrew title (≤10 words)
    body:         string        // Hebrew body (5–10 sentences)
    sourceUrl:    string        // Link to original article
    sourceName:   string        // RSS feed display name
    imageBase64?: string        // Base64-encoded PNG from Imagen 4 (optional)
    imagePrompt?: string        // Prompt used to generate the image
  }]
  createdAt: Date               // Auto-managed by Mongoose timestamps
  updatedAt: Date
}
```

### RssSource

One document per feed per user. Auto-created with 21 defaults on first login.

```typescript
{
  name:         string          // Display name, e.g. "Autodesk AEC Blog"
  url:          string          // Feed URL
  category:     'bim' | 'ai-bim' | 'mep-coordination' | 'infrastructure' | 'israel-gov' | 'construction'
  isActive:     boolean         // Toggle in the RSS manager
  lastFetched?: Date
  userId:       string
}
```

### StyleProfile

One document per user. Stores their writing style notes and encrypted API keys.

```typescript
{
  userId:         string        // Unique per user
  styleNotes:     string        // Extracted writing style (3–5 sentences) or default
  linkedinPosts:  string[]      // Raw posts submitted for analysis
  cohereApiKey?:  string        // AES-256-GCM encrypted
  geminiApiKey?:  string        // AES-256-GCM encrypted
  updatedAt:      Date
}
```

---

## API Reference

All routes require a valid Clerk session. Unauthenticated requests return `401`.

### Newsletter

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/newsletter/generate` | Start generation — returns an SSE stream of progress events, then `{ done: true, newsletterId }` |
| `GET` | `/api/newsletter/list` | Fetch the user's newsletter library (newest first, max 50) |
| `GET` | `/api/newsletter/[id]` | Fetch a single newsletter by ID |
| `PATCH` | `/api/newsletter/[id]` | Edit a topic body: `{ topicIndex: number, body: string }` |
| `DELETE` | `/api/newsletter/[id]` | Permanently delete a newsletter |

**Generate request body:**

```json
{
  "llmProvider":     "gemini",
  "daysBack":        7,
  "topicCount":      7,
  "generateImages":  false,
  "writingStyle":    "professional",
  "activeSourceIds": ["..."]
}
```

**SSE stream events:**

```
data: {"step":1,"message":"Fetching articles from sources...","total":5}
data: {"step":2,"message":"Selecting 7 relevant topics from 54 articles...","total":5}
data: {"step":3,"message":"Writing Hebrew content for each topic...","total":5}
data: {"step":4,"message":"Generating images...","total":5}
data: {"step":5,"message":"Assembling final newsletter...","total":5}
data: {"done":true,"newsletterId":"6630a1f2..."}
```

### RSS Sources

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/rss-sources` | List all sources (auto-seeds 21 defaults if empty) |
| `POST` | `/api/rss-sources` | Add a source: `{ name, url, category }` |
| `PATCH` | `/api/rss-sources` | Toggle active: `{ id, isActive }` |
| `DELETE` | `/api/rss-sources?id=...` | Remove a source |

### Settings

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/settings/api-keys` | Check which keys are saved (presence only, not values) |
| `POST` | `/api/settings/api-keys` | Save a key: `{ provider: "gemini" \| "cohere", apiKey }` |
| `POST` | `/api/settings/test-key` | Validate a key: `{ provider, apiKey }` → `{ ok, logs }` |
| `GET` | `/api/style-profile` | Get style profile |
| `POST` | `/api/style-profile` | Analyze LinkedIn posts: `{ linkedinPosts: string[] }` |
| `DELETE` | `/api/style-profile` | Reset to default style |

---

## Environment Variables

Create a `.env.local` file inside the `smartnewsletter/` directory:

```bash
# ── MongoDB ───────────────────────────────────────────────────────
# Free cluster: https://cloud.mongodb.com
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority

# ── Clerk Auth ────────────────────────────────────────────────────
# Create an app: https://dashboard.clerk.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# ── Encryption ────────────────────────────────────────────────────
# 64-char hex string (32 bytes) for AES-256-GCM key storage
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_SECRET=<64-char-hex>

# ── AI API Keys (server-side fallbacks) ───────────────────────────
# Used when a user hasn't saved their own key via Settings.
# Gemini: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIza...
# Cohere: https://dashboard.cohere.com/api-keys
COHERE_API_KEY=...
```

> **Key resolution order**: per-user DB key (decrypted) → environment variable → error.

---

## Local Setup

### Prerequisites

- Node.js 20+
- MongoDB Atlas cluster (free M0 tier is enough)
- Clerk application (free tier)
- At least one AI API key (Gemini or Cohere)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/maximn-png/SmartNewsletter.git
cd SmartNewsletter/smartnewsletter

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your MongoDB URI, Clerk keys, ENCRYPTION_SECRET, and AI keys

# 4. Run the development server
npm run dev
# → http://localhost:3000
```

On first login the app automatically seeds your account with 21 default RSS sources. Go to **Settings** to save your API keys, then **Generate** to create your first newsletter.

---

## RSS Feed Sources

21 feeds pre-configured across 6 categories:

| Category | Feeds |
|----------|-------|
| **BIM** | BIM Pure · BIM Corner · Dynamo BIM Blog · Revizto Blog · Autodesk AEC Blog · Plannerly Blog · AEC Magazine · BIM Today |
| **AI + BIM** | archBIM.cloud · The Building Coder · ArchiLabs Blog · Autodesk Dev Blog · Autodesk Digital Builder |
| **MEP Coordination** | United-BIM Blog · ARKANCE Blog · Trimble MEP Blog · Solibri Articles |
| **Infrastructure** | Railway Gazette · buildingSMART News · ENR News · NBS Blog |
| **Israel Gov** | *(add your own regulatory/government feeds)* |
| **Construction** | *(add your own construction industry feeds)* |

All feeds are user-editable via Settings → RSS Sources. Any valid RSS or Atom feed URL can be added.

---

## Writing Style System

Content generation uses two layered style controls:

### 1. Personal Style Profile

Upload 3–10 of your LinkedIn posts and the AI extracts a 3–5 sentence style profile covering:
- Hebrew/English vocabulary balance and mixing patterns
- Tone and authority level
- Sentence structure tendencies
- Recurring professional phrases and themes
- How you typically close a section

This profile is injected into every `CONTENT_GENERATION_PROMPT`. If no profile has been uploaded, the app uses a default profile written for professional Israeli BIM communication.

### 2. Writing Style Tone (per newsletter)

Chosen in the generation wizard — applied on top of your personal profile:

| Style | Effect |
|-------|--------|
| **Casual** | Conversational and approachable — like talking to a colleague over coffee |
| **Technical** | Precise and detail-oriented — exact terminology, implementation specifics |
| **Enthusiastic** | High-energy and inspiring — emphasises impact and future opportunity |
| **Professional** | Formal, authoritative, structured — suited for executive communications *(default)* |

---

## Newsletter Output

Every generated newsletter is a fully self-contained HTML email file:

- **Language**: Hebrew body text with English BIM technical terms embedded naturally (e.g. *clash detection*, *BIM Execution Plan*, *ISO 19650*, *federated model*)
- **Direction**: Full RTL (`dir="rtl"`, `text-align: right`) throughout
- **Font**: [Heebo](https://fonts.google.com/specimen/Heebo) — designed for Hebrew, loaded from Google Fonts
- **Width**: 600px max — compatible with all major email clients
- **Header**: Navy-to-dark gradient with EasyBIM logo, Hebrew date, and "ניוזלטר BIM שבועי" headline
- **Topic blocks**: Imagen 4 image (or navy/teal gradient placeholder) · Hebrew title · Hebrew body · source attribution link
- **Dividers**: Teal-to-navy gradient lines between topics
- **Footer**: Maxim Naftaliyv · office@easybim.co.il · 03-6888477 · www.easybim.co.il · unsubscribe link

The HTML is assembled from the stored `topics` at page-render time — never written to the database — so the preview and export always reflect the latest edits.

---

## License

Private — EasyBIM Innovative Engineering. All rights reserved.
