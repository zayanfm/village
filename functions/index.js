/**
 * functions/index.js — UniGarden Firebase Cloud Functions
 *
 * TELEGRAM BOT WEBHOOK
 * ────────────────────
 * Endpoint: POST /telegramWebhook
 *
 * FLOW
 * ────
 * 1. Youth taps "Connect via Bot" in the app → opens t.me/youth_connector_bot?start=auth
 * 2. Bot sends a "Share Phone Number" keyboard button
 * 3. Youth taps → Telegram sends a `contact` update to this webhook
 * 4. Webhook looks up youth_profiles where phoneNumber == contact.phone_number
 *    MATCH   → saves telegramChatId to the profile doc
 *    NO MATCH → bot replies asking them to register with their worker first
 * 5. Any subsequent text message from a linked chatId is PDPA-scrubbed
 *    (strips NRIC, phone numbers, real names) and appended to the
 *    youth_profiles/{id}/sessions subcollection as a raw message log.
 *
 * WEBHOOK REGISTRATION (one-time, run in terminal after deploying):
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *        -d "url=https://<region>-univillage-6063f.cloudfunctions.net/telegramWebhook"
 *
 * LOCAL TESTING:
 *   firebase emulators:start --only functions
 *   ngrok http 5001
 *   Register ngrok URL as webhook
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

// Secret accessed at runtime — never baked into the function bundle.
// Set via: firebase functions:secrets:set TELEGRAM_BOT_TOKEN
const BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');

const YOUTH_PROFILES = 'youth_profiles';

/* ─── PDPA scrubber (mirrors EphemeralDataScrubContext.js) ────────── */

const PHONE_RE  = /\b[689]\d{7}\b/g;
const NRIC_RE   = /\b[STFGstfg]\d{7}[A-Z]\b/g;
// WhatsApp / Telegram header name patterns
const WA_HEAD   = /^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\s*[-–]\s*/i;
const TG_HEAD   = /^[‎]?\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\]\s*/i;

function scrubText(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(NRIC_RE,  '[NRIC_REDACTED]')
    .replace(PHONE_RE, '[PHONE_REDACTED]')
    .replace(WA_HEAD,  '')
    .replace(TG_HEAD,  '');
}

/* ─── Telegram API helper ────────────────────────────────────────── */

async function tgCall(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/* ─── Firestore helpers ──────────────────────────────────────────── */

/** Find a youth profile by normalised phone number digits. */
async function findProfileByPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  const snap = await db
    .collection(YOUTH_PROFILES)
    .where('phoneNumber', '==', digits)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/** Find a youth profile that already has this Telegram chatId. */
async function findProfileByChatId(chatId) {
  const snap = await db
    .collection(YOUTH_PROFILES)
    .where('telegramChatId', '==', String(chatId))
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/* ─── Update handlers ───────────────────────────────────────────── */

/**
 * Handle a shared contact update (phone-number → chatId linking).
 * Called when the youth taps "Share Phone Number" in the bot.
 */
async function handleContact(token, update) {
  const contact = update.message.contact;
  const chatId  = update.message.chat.id;

  // Normalise: strip country code prefix if present
  const rawPhone = contact.phone_number.replace(/^\+65/, '').replace(/\D/g, '');

  const profile = await findProfileByPhone(rawPhone);

  if (!profile) {
    await tgCall(token, 'sendMessage', {
      chat_id: chatId,
      text:
        "We couldn't find a registered profile for this number. " +
        'Please ask your youth worker to register you first, then try again. 🌱',
    });
    return;
  }

  // Save the Telegram chatId to the profile so future messages are linked.
  await db.collection(YOUTH_PROFILES).doc(profile.id).update({
    telegramChatId: String(chatId),
    telegramLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await tgCall(token, 'sendMessage', {
    chat_id: chatId,
    text:
      `✅ You're now linked to your UniGarden space, ${profile.name ?? 'friend'}! ` +
      'Any messages you send here will be securely shared with your youth worker.',
  });
}

/**
 * Handle an incoming text message from a linked youth.
 * Scrubs PII then appends to youth_profiles/{id}/sessions.
 */
async function handleTextMessage(token, update) {
  const chatId = update.message.chat.id;
  const text   = update.message.text ?? '';

  const profile = await findProfileByChatId(chatId);

  if (!profile) {
    // Not yet linked — prompt them to share contact
    await tgCall(token, 'sendMessage', {
      chat_id: chatId,
      reply_markup: {
        keyboard: [[{ text: '📱 Share My Phone Number', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
      text:
        "Hi! To connect to your UniGarden space, please share your phone number below. " +
        'It will be matched to your profile by your youth worker. 🌱',
    });
    return;
  }

  // PDPA scrub before any data touches Firestore.
  const cleanText = scrubText(text);

  await db
    .collection(YOUTH_PROFILES)
    .doc(profile.id)
    .collection('sessions')
    .add({
      source: 'telegram_bot',
      rawMessage: cleanText,         // already scrubbed — no PII stored
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  await tgCall(token, 'sendMessage', {
    chat_id: chatId,
    text: '✓ Message received by your care team. 🌱',
  });
}

/**
 * Handle the /start command.
 * If start=auth, prompt the user to share their contact immediately.
 */
async function handleStart(token, update) {
  const chatId = update.message.chat.id;
  await tgCall(token, 'sendMessage', {
    chat_id: chatId,
    text:
      'Welcome to UniGarden 🌱\n\n' +
      'To link this chat to your care space, share your phone number below.',
    reply_markup: {
      keyboard: [[{ text: '📱 Share My Phone Number', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

/* ─── Cloud Function export ─────────────────────────────────────── */

exports.telegramWebhook = onRequest(
  { secrets: [BOT_TOKEN], region: 'asia-southeast1' },
  async (req, res) => {
    // Telegram always POSTs; ignore anything else.
    if (req.method !== 'POST') {
      res.status(200).send('ok');
      return;
    }

    const token  = BOT_TOKEN.value();
    const update = req.body;

    try {
      const msg = update.message;
      if (!msg) { res.status(200).send('ok'); return; }

      if (msg.contact) {
        await handleContact(token, update);
      } else if (msg.text?.startsWith('/start')) {
        await handleStart(token, update);
      } else if (msg.text) {
        await handleTextMessage(token, update);
      }
    } catch (err) {
      console.error('[telegramWebhook] error:', err);
    }

    // Always 200 so Telegram doesn't retry.
    res.status(200).send('ok');
  }
);
