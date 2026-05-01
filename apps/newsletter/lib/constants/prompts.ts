export const DEFAULT_STYLE_PROFILE = `Writes in Hebrew with occasional English BIM technical terms embedded naturally. Direct and authoritative tone — never hedges. Shares practical insights from real projects (Metro M3, hospital projects, infrastructure). Uses short punchy sentences. Audience is Israeli engineers, architects, and BIM managers. Example phrases: "בפרויקט שאנחנו מנהלים", "אחת הטעויות הנפוצות ב-BIM", "לא מספיק לדעת Revit", "ה-clash detection לא מסתיים בלחיצה על כפתור". Ends sections with a concrete takeaway or call to action.`

export const TOPIC_SELECTION_PROMPT = (rssItems: string) => `You are an expert BIM content curator working for Maxim Naftaliyv, CEO of EasyBIM Innovative Engineering (Israel).
Maxim manages the Tel Aviv Metro M3 Line BIM workflows and works daily with Revit, Dynamo, Revizto, Autodesk Construction Cloud, ISO 19650, and MEP/systems coordination (clash detection, MEPFP workflows, Navisworks, Solibri, federated model management).

From the RSS news items below, select EXACTLY 7 topics most valuable for a BIM Director in Israel.

Prioritize:
1. AI in BIM/AEC (especially MCP, LLMs connected to Revit, agentic BIM)
2. Revit updates and new features
3. ISO 19650 changes and BEP/EIR/PIR workflows
4. MEP coordination workflows, clash detection techniques, MEPFP systems coordination
5. Navisworks, Solibri, Revizto updates and workflows
6. Infrastructure and metro/rail BIM projects
7. Practical BIM automation (Dynamo, APIs, scripts)
8. Autodesk Construction Cloud / Forma updates

Avoid: pure academic research, non-AEC topics, duplicate topics, marketing content with no practical insight.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing text:
[
  {
    "title": "original article title",
    "link": "url",
    "summary": "2-3 sentence summary in English",
    "feedName": "source name",
    "category": "category of this topic",
    "imagePromptSuggestion": "detailed English prompt for a professional editorial image, no people, BIM/AEC theme"
  }
]

RSS Items:
${rssItems}`

export const WRITING_STYLE_INSTRUCTIONS: Record<string, string> = {
  casual: 'Conversational and approachable — write as if talking to a colleague. Friendly, relatable, everyday language. Avoid stiff phrasing.',
  technical: 'Precise and detail-oriented. Lean into technical specifics, exact terminology, implementation details, and practical code/workflow references.',
  enthusiastic: 'High-energy and inspiring. Emphasize impact and opportunity. Show genuine excitement for the technology and what it enables.',
  professional: 'Formal, authoritative, and structured. Measured tone suited for executive and professional communications.',
}

export const CONTENT_GENERATION_PROMPT = (
  topicTitle: string,
  topicSummary: string,
  sourceUrl: string,
  category: string,
  styleProfile: string,
  writingStyle = 'professional'
) => `You are writing a section of a professional BIM newsletter in Israel for Maxim Naftaliyv.

Maxim's writing style:
${styleProfile}

Tone for this edition: ${WRITING_STYLE_INSTRUCTIONS[writingStyle] ?? WRITING_STYLE_INSTRUCTIONS.professional}

Write a newsletter section in Hebrew for this topic:
- Title: ${topicTitle}
- Summary: ${topicSummary}
- Source: ${sourceUrl}
- Category: ${category}

Requirements:
1. Hebrew title: short, direct, professional (max 10 words)
2. Hebrew body: 5–10 sentences maximum. Be practical — what does this mean for Israeli BIM and MEP professionals? No filler phrases, no "כפי שידוע לנו". End with one concrete actionable takeaway.
3. Naturally integrate English technical terms where appropriate (e.g., "clash detection", "BIM Execution Plan", "ISO 19650", "federated model", "MEP coordination")
4. Mirror Maxim's voice: confident, expert, occasionally references real project experience
5. Apply the specified tone throughout

Return ONLY valid JSON — no markdown, no preamble:
{
  "hebrewTitle": "...",
  "hebrewBody": "..."
}`

export const STYLE_ANALYSIS_PROMPT = (posts: string) => `Analyze the following LinkedIn posts written by a BIM professional in Israel.
Extract a concise writing style profile (3-5 sentences) describing:
- Language patterns (Hebrew/English mix ratio)
- Tone and authority level
- Typical sentence structure
- Recurring themes or vocabulary
- How sections typically end

Posts:
${posts}

Return ONLY a plain text style description — no headers, no bullet points, no JSON.`
