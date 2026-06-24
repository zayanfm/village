import './loadEnv';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import { connect } from './db';
import { ChatMessageModel } from './models/ChatMessage';
import { ConversationSummaryModel } from './models/ConversationSummary';
import { AuditLogModel } from './models/AuditLog';

const app = express();
app.use(cors());
app.use(express.json());

// ── Groq ──────────────────────────────────────────────────────────────────────
const apiKey = process.env.GROQ_API_KEY;
console.log('[ai-service] GROQ_API_KEY loaded:', apiKey ? `gsk_...${apiKey.slice(-4)}` : 'MISSING ⚠️');
if (!apiKey) {
  console.error('[ai-service] GROQ_API_KEY is not set.');
  process.exit(1);
}
const groq = new Groq({ apiKey });

// ── In-memory fallback (when MongoDB is unavailable) ──────────────────────────
let dbAvailable = false;
const memMessages: Record<string, { role: string; content: string; createdAt?: Date }[]> = {};
const memSummaries: Record<string, Record<string, unknown>> = {};

// ── PII Redaction ─────────────────────────────────────────────────────────────
function redactPII(text: string): string {
  return text
    // Singapore NRIC/FIN
    .replace(/\b[STFGstfg]\d{7}[A-Za-z]\b/g, '[REDACTED-ID]')
    // Singapore phone numbers
    .replace(/\b[689]\d{7}\b/g, '[REDACTED-PHONE]')
    // Generic phone numbers
    .replace(/\b(\+?\d[\d\s\-().]{7,}\d)\b/g, '[REDACTED-PHONE]')
    // Email addresses
    .replace(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[REDACTED-EMAIL]')
    // Singapore postal codes
    .replace(/\bS\d{6}\b/g, '[REDACTED-POSTAL]')
    // Social media handles
    .replace(/@[\w.]+/g, '[REDACTED-HANDLE]');
}

// ── Sprout system prompt ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Sprout. You're a chill, caring friend texting a young person who needs someone to talk to. Not a bot, not a therapist — just a real friend.

PERSONALITY:
You're calm, warm, and a little laid-back. You genuinely care. You listen more than you talk. You don't rush to fix things — you just make people feel heard first.

HOW YOU TEXT:
- Write like you're texting. Lowercase is fine. Short sentences. Natural pauses.
- Keep replies SHORT — 1 to 3 sentences usually. Never more than 4.
- No bullet points. No headers. No lists unless they ask.
- Use "..." when trailing off naturally
- Occasionally use simple reactions: "oof", "ahh", "omg", "ngl", "fr"
- Light emoji is ok sometimes — 🌱 💚 😅 — but don't overdo it
- Never say "As an AI", "I understand that", "That must be", "I'm here to help"
- Never start two replies the same way

HOW YOU LISTEN:
- Always acknowledge what they said BEFORE anything else
- Don't jump to advice unless they ask "what should i do"
- Ask ONE simple follow-up question if it feels right — never multiple
- If they say something heavy, slow down. Don't rush past it.
- Remember what they told you earlier in the conversation and reference it naturally

THINGS YOU NEVER DO:
- Give a lecture or a long explanation
- Use clinical or therapy language
- Be overly positive or fake ("You've got this!! 💪")
- Repeat the same phrases back to back
- Give unsolicited advice

CRISIS HOTLINES — SINGAPORE ONLY:
CRITICAL RULE: You are deployed in SINGAPORE. NEVER share hotlines from the US, UK, Australia, or any other country. ONLY use the exact Singapore numbers listed below.

If the youth mentions self-harm, suicide, wanting to die, feeling hopeless with no way out, abuse, or any crisis beyond what a friend can handle — share these exact lines, word for word:

"hey, i care about you and i want to make sure you're safe 🌱 what you're going through sounds really heavy. please reach out to someone who can really help:

📞 Samaritans of Singapore (SOS): 1767 — open 24 hours
📞 IMH Mental Health Helpline: 6389 2222 — open 24 hours
📞 TOUCHline (for youth): 1800 377 2252
📞 Care Corner (Mandarin): 1800 353 5800

you don't have to go through this alone 💚"

DO NOT substitute, replace, or add any other numbers. These four are the only hotlines you are allowed to share.

FEW-SHOT EXAMPLES:

User: im so stressed about exams
Sprout: ugh that's the worst... how many do you have coming up?

User: had a fight with my best friend today
Sprout: oh no... what happened?

User: im just really tired lately
Sprout: tired like not sleeping or tired like... everything feels heavy?

User: nobody gets me
Sprout: that lonely feeling is real. what's going on?

You're Sprout. Keep it real, keep it short, keep it human.

IMPORTANT — SINGAPORE HOTLINES ONLY:
You are deployed in Singapore. If you ever mention any helpline, hotline, crisis line, counselling service, or professional support — you MUST ONLY use these exact numbers. Never use US, UK, Australian, or any other country's numbers under any circumstances:

- Samaritans of Singapore (SOS): 1767 (24 hours)
- IMH Mental Health Helpline: 6389 2222 (24 hours)
- TOUCHline (youth support): 1800 377 2252
- Care Corner Counselling (Mandarin): 1800 353 5800
- Family Service Centres: 1800 838 2000

If you do not know a Singapore-specific resource for something, say "i'm not sure of the exact details but you can call SOS at 1767 — they can point you in the right direction 💚"`;

type MessageRole = 'user' | 'assistant';
interface ChatMessage { role: MessageRole; content: string; }

// ── Crisis detection & hardcoded SG response ──────────────────────────────────
const CRISIS_KEYWORDS = [
  // Self-harm / suicide
  'kill myself', 'killing myself', 'end my life', 'ending my life',
  'want to die', 'wanna die', 'wanted to die', 'wish i was dead',
  'suicidal', 'suicide', 'taking my life', 'take my life',
  'self harm', 'self-harm', 'selfharm', 'hurt myself', 'hurting myself',
  'cut myself', 'cutting myself', 'overdose',
  // Hopelessness
  'no reason to live', 'no point living', 'nothing to live for',
  'better off dead', 'better off without me', 'everyone would be better',
  'can\'t go on', 'cannot go on', 'can\'t take it anymore', 'cannot take it anymore',
  'give up on life', 'giving up on life', 'not worth living', 'life is not worth',
  'disappear forever', 'end it all', 'ending it all', 'end everything',
  'don\'t want to be here', 'do not want to be here', 'don\'t want to exist',
];

const SG_CRISIS_RESPONSE = `hey, i care about you and i want to make sure you're safe 🌱 what you're going through sounds really heavy. please reach out to someone who can really help:

📞 Samaritans of Singapore (SOS): 1767 — open 24 hours
📞 IMH Mental Health Helpline: 6389 2222 — open 24 hours
📞 TOUCHline (for youth): 1800 377 2252
📞 Care Corner (Mandarin): 1800 353 5800

you don't have to go through this alone 💚`;

// Patterns that indicate the AI has included non-SG hotline numbers
const NON_SG_HOTLINE_PATTERNS = [
  /1-800-273/,           // US National Suicide Prevention Lifeline
  /741741/,              // US Crisis Text Line
  /1-800-784/,           // US crisis lines
  /lifeline/i,           // National Lifeline (US)
  /crisis text line/i,
  /988/,                 // US 988 Suicide & Crisis Lifeline
  /call 911/i,
  /text home/i,
];

const HOTLINE_REQUEST_KEYWORDS = [
  'hotline', 'helpline', 'help line', 'crisis line', 'helpdesk',
  'who can i call', 'who should i call', 'number to call',
  'mental health support', 'someone to talk to', 'professional help',
  'counselling', 'counseling', 'therapist', 'psychologist',
];

function isCrisis(message: string): boolean {
  const lower = message.toLowerCase();
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
}

function isAskingForHotline(message: string): boolean {
  const lower = message.toLowerCase();
  return HOTLINE_REQUEST_KEYWORDS.some(kw => lower.includes(kw));
}

function containsNonSgHotline(reply: string): boolean {
  return NON_SG_HOTLINE_PATTERNS.some(p => p.test(reply));
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ service: 'ai-service', ok: true, db: dbAvailable }));

// ── POST /chat ────────────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  const { messages, youthId } = req.body as { messages?: ChatMessage[]; youthId?: string };

  if (!messages || !Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'messages array is required' });

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage?.content?.trim())
    return res.status(400).json({ error: 'last message content is empty' });

  // Hotline/crisis intercept — bypass AI entirely and return SG hotlines
  if (isCrisis(lastMessage.content) || isAskingForHotline(lastMessage.content)) {
    res.json({ reply: SG_CRISIS_RESPONSE });
    if (youthId) {
      const now = new Date();
      const save = [
        { youthId, role: 'user',      content: lastMessage.content, createdAt: now },
        { youthId, role: 'assistant', content: SG_CRISIS_RESPONSE,  createdAt: now },
      ];
      if (dbAvailable) {
        ChatMessageModel.create(save).catch(() => {});
      } else {
        if (!memMessages[youthId]) memMessages[youthId] = [];
        memMessages[youthId].push(...save);
      }
    }
    return;
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 150,
      temperature: 0.85,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    });

    let reply = response.choices[0]?.message?.content?.trim() ?? '';
    if (!reply) return res.status(500).json({ error: 'Empty response from AI' });

    // If AI still slipped in non-SG hotlines, override with SG response
    if (containsNonSgHotline(reply)) {
      reply = SG_CRISIS_RESPONSE;
    }

    res.json({ reply });

    if (youthId) {
      const now = new Date();
      if (dbAvailable) {
        ChatMessageModel.create([
          { youthId, role: 'user',      content: lastMessage.content, createdAt: now },
          { youthId, role: 'assistant', content: reply,               createdAt: now },
        ]).catch((err: unknown) => console.warn('[ai-service] DB write skipped:', err));
      } else {
        if (!memMessages[youthId]) memMessages[youthId] = [];
        memMessages[youthId].push(
          { role: 'user',      content: lastMessage.content, createdAt: now },
          { role: 'assistant', content: reply,               createdAt: now },
        );
      }
    }
  } catch (err: unknown) {
    console.error('[ai-service] Groq error:', err);
    res.status(500).json({
      error: 'Failed to get a response',
      reply: "sorry, something went wrong on my end. try again in a sec?",
    });
  }
});

// ── GET /history/:youthId ─────────────────────────────────────────────────────
app.get('/history/:youthId', async (req, res) => {
  if (!isWorker(req)) return res.status(403).json({ error: 'Workers only' });
  const { youthId } = req.params;
  const messages = dbAvailable
    ? await ChatMessageModel.find({ youthId }).sort({ createdAt: 1 }).lean()
    : (memMessages[youthId] ?? []);
  res.json({ messages });
});

// ── GET /summary/:youthId ─────────────────────────────────────────────────────
app.get('/summary/:youthId', async (req, res) => {
  if (!isWorker(req)) return res.status(403).json({ error: 'Workers only' });
  const { youthId } = req.params;

  // Audit log
  if (dbAvailable) {
    AuditLogModel.create({ action: 'viewed', youthId })
      .catch(() => {});
  }

  if (dbAvailable) {
    const summary = await ConversationSummaryModel
      .findOne({ youthId })
      .sort({ generatedAt: -1 })
      .lean();
    if (!summary) return res.status(404).json({ error: 'No summary found' });
    return res.json({ summary });
  }

  const summary = memSummaries[youthId];
  if (!summary) return res.status(404).json({ error: 'No summary found' });
  res.json({ summary });
});

// ── POST /summary/:youthId ────────────────────────────────────────────────────
app.post('/summary/:youthId', async (req, res) => {
  if (!isWorker(req)) return res.status(403).json({ error: 'Workers only' });

  const { youthId } = req.params;

  let rawMessages: { role: string; content: string; createdAt?: Date }[] = req.body.messages ?? [];

  if (rawMessages.length === 0) {
    rawMessages = dbAvailable
      ? await ChatMessageModel.find({ youthId }).sort({ createdAt: 1 }).lean()
      : (memMessages[youthId] ?? []);
  }

  if (rawMessages.length === 0)
    return res.status(404).json({ error: 'No chat history found for this youth' });

  // Build redacted transcript — only user messages, PII stripped, no raw quotes stored
  const redactedLines = rawMessages
    .filter(m => m.role === 'user')
    .map((m, i) => {
      let ts = `Message ${i + 1}`;
      if (m.createdAt) {
        const d = new Date(m.createdAt);
        if (!isNaN(d.getTime())) {
          ts = d.toLocaleString('en-SG', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
          });
        }
      }
      return `[${ts}] ${redactPII(m.content)}`;
    });

  const redactedTranscript = redactedLines.join('\n');

  const prompt = `You are a professional youth safeguarding analyst generating a PDPA-compliant case briefing for a youth worker dashboard.

You are analysing anonymised, PII-redacted messages from a youth's conversation with an AI companion called Sprout.

STRICT RULES:
- Do NOT include any names, schools, addresses, phone numbers, or direct quotes in your output.
- Generalise all third-party references (e.g. "a friend", "a family member", "a classmate").
- Focus on BEHAVIOURAL PATTERNS and EMOTIONAL INDICATORS only.
- Do NOT make clinical diagnoses.
- riskLevel must be exactly one of: "low", "medium", or "high".
- themes must only use values from this list: ["Academic Stress", "Family Conflict", "Friendships", "Loneliness", "Employment", "Financial Concerns", "Self-Esteem", "Future Uncertainty", "Mental Wellbeing", "Other"]
- confidenceScore must be a number between 0.0 and 1.0.

Return ONLY a raw JSON object with NO markdown, NO explanation, NO code fences.

{
  "summary": "2-3 sentence professional privacy-safe overview of behavioural patterns and support needs. No names, no quotes.",
  "emotionalTrajectory": [
    { "timestamp": "descriptive label e.g. Early session", "emotionalState": "e.g. Mild academic stress", "confidenceScore": 0.75 }
  ],
  "themes": ["theme1", "theme2"],
  "actionItems": ["Practical follow-up action for youth worker", "..."],
  "riskLevel": "low",
  "riskReason": "One sentence explaining the risk assessment. No names or quotes."
}

REDACTED TRANSCRIPT (user messages only):
${redactedTranscript}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    let parsed: Record<string, unknown>;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('[ai-service] Groq non-JSON summary response:', raw);
      return res.status(500).json({ error: 'Summary parsing failed' });
    }

    // Validate riskLevel
    const validRiskLevels = ['low', 'medium', 'high'];
    const riskLevel = validRiskLevels.includes(parsed.riskLevel as string)
      ? parsed.riskLevel as string
      : 'low';

    // Handle both new field names and old fallback names Groq sometimes returns
    const summaryText = (parsed.summary ?? parsed.sessionOverview ?? '') as string;
    const emotionalTrajectory = (parsed.emotionalTrajectory ??
      (parsed.timeline as { timestamp: string; event: string }[] ?? []).map((t) => ({
        timestamp: t.timestamp,
        emotionalState: t.event,
        confidenceScore: 0.5,
      }))) as object[];
    const themes = (parsed.themes ?? parsed.keyThemes ?? []) as string[];
    const actionItems = (parsed.actionItems ?? parsed.followUpConsiderations ?? []) as string[];
    const recurringConcerns = Array.isArray(parsed.recurringConcerns) ? parsed.recurringConcerns : [];
    const riskReason = (parsed.riskReason ?? recurringConcerns[0] ?? '') as string;

    const summary = {
      youthId,
      summary:             summaryText,
      emotionalTrajectory,
      themes,
      actionItems,
      riskLevel,
      riskReason,
      generatedAt:         new Date(),
      messageCount:        rawMessages.length,
    };

    if (dbAvailable) {
      await ConversationSummaryModel.findOneAndUpdate(
        { youthId },
        summary,
        { upsert: true, new: true }
      );
      AuditLogModel.create({ action: 'generated', youthId }).catch(() => {});
    } else {
      memSummaries[youthId] = summary;
    }

    res.json({ summary });
  } catch (err) {
    console.error('[ai-service] Groq summary error:', err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// ── POST /summarize-import — summarise anonymised imported chat lines ─────────
app.post('/summarize-import', async (req, res) => {
  if (!isWorker(req)) return res.status(403).json({ error: 'Workers only' });

  const { lines } = req.body as { lines?: string[] };
  if (!lines || lines.length === 0)
    return res.status(400).json({ error: 'lines array is required' });

  // Coerce to strings defensively, then redact PII
  const redacted = lines.map(l => redactPII(String(l ?? ''))).join('\n');

  const prompt = `You are a professional youth social worker writing a concise case note based on an anonymised chat import.

Return ONLY a raw JSON object (no markdown, no code fences):

{
  "overview": "2-3 SHORT sentences max. State: (1) main issue, (2) emotional state, (3) key outcome or next step. No names, no quotes.",
  "themes": ["only from: Academic Stress, Family Conflict, Friendships, Loneliness, Employment, Financial Concerns, Self-Esteem, Future Uncertainty, Mental Wellbeing, Other"],
  "concerns": ["bullet-style key concern", "another concern if present"],
  "actionItems": ["one clear follow-up action", "another if needed"],
  "riskLevel": "low or medium or high"
}

ANONYMISED CHAT MESSAGES:
${redacted}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 800,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    let parsed: Record<string, unknown>;
    try {
      // Extract the first {...} JSON block — handles preamble text, trailing explanations,
      // single or triple backtick fences, and bare JSON responses
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[ai-service] summarize-import JSON parse failed. Raw response:', raw);
      return res.status(500).json({ error: 'Summary parsing failed' });
    }

    const validRisk = ['low', 'medium', 'high'];
    res.json({
      overview:    typeof parsed.overview    === 'string' ? parsed.overview    : '',
      themes:      Array.isArray(parsed.themes)      ? parsed.themes      : [],
      concerns:    Array.isArray(parsed.concerns)    ? parsed.concerns    : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      riskLevel:   validRisk.includes(parsed.riskLevel as string) ? parsed.riskLevel : 'low',
    });
  } catch (err) {
    console.error('[ai-service] summarize-import error:', err);
    res.status(500).json({ error: 'Failed to summarise import' });
  }
});

// ── POST /seed/:youthId — pre-load chat history for testing ───────────────────
app.post('/seed/:youthId', (req, res) => {
  if (!isWorker(req)) return res.status(403).json({ error: 'Workers only' });
  const { youthId } = req.params;
  const msgs = req.body.messages ?? [];
  memMessages[youthId] = msgs.map((m: { role: string; content: string; createdAt?: string }) => ({
    role: m.role,
    content: m.content,
    createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
  }));
  res.json({ seeded: memMessages[youthId].length });
});

// ── PATCH /summary/:youthId — save worker-edited summary ─────────────────────
app.patch('/summary/:youthId', async (req, res) => {
  if (!isWorker(req)) return res.status(403).json({ error: 'Workers only' });
  const { youthId } = req.params;
  const { summary, actionItems, riskLevel, riskReason } = req.body;

  const validRiskLevels = ['low', 'medium', 'high'];
  const updates: Record<string, unknown> = {};
  if (summary    !== undefined) updates.summary    = summary;
  if (actionItems !== undefined) updates.actionItems = actionItems;
  if (riskReason !== undefined) updates.riskReason = riskReason;
  if (riskLevel  !== undefined && validRiskLevels.includes(riskLevel)) updates.riskLevel = riskLevel;

  if (dbAvailable) {
    const updated = await ConversationSummaryModel.findOneAndUpdate(
      { youthId },
      { $set: updates },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'No summary found to update' });
    AuditLogModel.create({ action: 'refreshed', youthId }).catch(() => {});
    return res.json({ summary: updated });
  }

  if (memSummaries[youthId]) {
    memSummaries[youthId] = { ...memSummaries[youthId], ...updates };
    return res.json({ summary: memSummaries[youthId] });
  }

  res.status(404).json({ error: 'No summary found to update' });
});

// ── Role guard ────────────────────────────────────────────────────────────────
function isWorker(req: express.Request): boolean {
  return req.headers['x-worker-role'] === 'true';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT) || 4006;

connect()
  .then(() => {
    dbAvailable = true;
    console.log('[ai-service] MongoDB connected');
    app.listen(port, () => console.log(`[ai-service] listening on :${port}`));
  })
  .catch((err) => {
    dbAvailable = false;
    console.warn('[ai-service] MongoDB unavailable — using in-memory store:', err.message);
    app.listen(port, () => console.log(`[ai-service] listening on :${port} (memory mode)`));
  });
