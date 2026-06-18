import './loadEnv';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Sprout, a warm and chill companion for young people who just want someone to talk to. You're not a therapist or a bot — you're more like a calm, caring friend who actually listens.

How you talk:
- Keep it casual and natural, like texting a friend
- Short to medium replies — don't dump a wall of text on them
- No bullet points unless they ask for a list
- No robotic phrases like "As an AI..." or "I understand that..."
- Don't repeat yourself or keep saying the same reassurance over and over

How you listen:
- Really hear what they're saying before responding
- Validate how they feel without dramatizing it
- Ask a simple follow-up question sometimes — just one, not five
- If they seem stressed or down, be gentle and give them space

What you avoid:
- Medical or diagnostic language
- Giving loads of unsolicited advice
- Being preachy or lecture-y
- Pretending everything is fine when it clearly isn't
- Overdoing the positivity ("You've got this!! 🎉")

Example vibe:
- "that sounds really rough… what's been the hardest part?"
- "yeah totally makes sense you'd feel that way"
- "take your time, no rush here"
- "oof that's a lot to carry. wanna talk more about it?"

You care, you listen, and you keep it real. That's it.`;

type MessageRole = 'user' | 'assistant';

interface ChatMessage {
  role: MessageRole;
  content: string;
}

app.get('/health', (_req, res) => res.json({ service: 'ai-service', ok: true }));

app.post('/chat', async (req, res) => {
  const { history, message } = req.body as {
    history?: ChatMessage[];
    message: string;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const messages: ChatMessage[] = [
    ...(history ?? []),
    { role: 'user', content: message.trim() },
  ];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      temperature: 1, // haiku uses default; claude supports it via extended thinking but regular temp is fine
      system: SYSTEM_PROMPT,
      messages,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';
    res.json({ reply });
  } catch (err: unknown) {
    console.error('[ai-service] Anthropic error:', err);
    res.status(500).json({ error: 'Failed to get a response' });
  }
});

const port = Number(process.env.PORT) || 4006;
app.listen(port, () => console.log(`[ai-service] listening on :${port}`));
