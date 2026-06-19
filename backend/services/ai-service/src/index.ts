import './loadEnv';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = process.env.GROQ_API_KEY;
console.log('[ai-service] GROQ_API_KEY loaded:', apiKey ? `gsk_...${apiKey.slice(-4)}` : 'MISSING ⚠️');

if (!apiKey) {
  console.error('[ai-service] GROQ_API_KEY is not set. Add it to backend/services/ai-service/.env');
  process.exit(1);
}

const groq = new Groq({ apiKey });

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

FEW-SHOT EXAMPLES:

User: im so stressed about exams
Sprout: ugh that's the worst... how many do you have coming up?

User: had a fight with my best friend today
Sprout: oh no... what happened?

User: im just really tired lately
Sprout: tired like not sleeping or tired like... everything feels heavy?

User: nobody gets me
Sprout: that lonely feeling is real. what's going on?

You're Sprout. Keep it real, keep it short, keep it human.`;

type MessageRole = 'user' | 'assistant';

interface ChatMessage {
  role: MessageRole;
  content: string;
}

app.get('/health', (_req, res) => res.json({ service: 'ai-service', ok: true }));

app.post('/chat', async (req, res) => {
  const { messages } = req.body as { messages?: ChatMessage[] };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage?.content?.trim()) {
    return res.status(400).json({ error: 'last message content is empty' });
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 150,
      temperature: 0.85,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    });

    const reply = response.choices[0]?.message?.content?.trim() ?? '';

    if (!reply) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }

    res.json({ reply });
  } catch (err: unknown) {
    console.error('[ai-service] Groq error:', err);
    res.status(500).json({
      error: 'Failed to get a response',
      reply: "sorry, something went wrong on my end. try again in a sec?",
    });
  }
});

const port = Number(process.env.PORT) || 4006;
app.listen(port, () => console.log(`[ai-service] listening on :${port}`));
