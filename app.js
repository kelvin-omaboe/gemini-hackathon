// Shared application logic for all pages.

const CONFIG = {
  GEMINI_API_KEY: "AIzaSyA-YcNaD0wFGvfV5ae3KV0bEmkK6Lc0Jw8",
  GEMINI_MODEL: "gemini-2.5-flash",
  MAPS_API_KEY: "AIzaSyBW4fX4-dnf9uYqYiIslNEA0u0JP7mWtB8",
  ENABLE_FIREBASE: true,
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyArqi_wzD5yKBadWEhinKAdIJ-kzJoISg0",
  authDomain: "gemini-hackathon-39efc.firebaseapp.com",
  projectId: "gemini-hackathon-39efc",
  storageBucket: "gemini-hackathon-39efc.firebasestorage.app",
  messagingSenderId: "1034256913868",
  appId: "1:1034256913868:web:6025c7a938b67dd799b969",
  measurementId: "G-92SXF4WB8N"
  },
};

const STORAGE_KEYS = {
  sessionId: "symptom_session_id",
  chats: "symptom_chats",
  points: "symptom_points",
  level: "symptom_level",
  badges: "symptom_badges",
  learnedTips: "symptom_learned_tips",
};

const HEALTH_TIPS = [
  "Drink clean water regularly and keep a refill bottle with you.",
  "Rest is part of healing. Try to sleep early and reduce stress.",
  "Wash hands with soap, especially before meals and after the toilet.",
  "Keep mosquito nets in good condition to prevent bites at night.",
  "Eat a mix of grains, vegetables, and protein when available.",
];

const GREETING_WORDS = new Set([
  "hi",
  "hello",
  "hey",
  "yo",
  "hiya",
  "howdy",
  "greetings",
  "sup",
  "hola",
  "bonjour",
  "salaam",
]);

const GREETING_FILLERS = new Set(["there", "africense", "afrisense", "assistant", "friend"]);

const memoryStore = new Map();

function storageGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return memoryStore.get(key) ?? null;
  }
}

function storageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    memoryStore.set(key, value);
  }
}

function storageClear() {
  try {
    localStorage.clear();
  } catch (error) {
    memoryStore.clear();
  }
}

const state = {
  sessionId: null,
  chats: [],
  points: 0,
  level: 1,
  badges: [],
  learnedTips: [],
  firebase: {
    enabled: false,
    db: null,
  },
  maps: {
    loaded: false,
    map: null,
    service: null,
    markers: [],
    userMarker: null,
  },
};

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function getStored(key, fallback) {
  const value = storageGetItem(key);
  if (value === null) {
    return fallback;
  }
  return safeJsonParse(value, fallback);
}

function setStored(key, value) {
  storageSetItem(key, JSON.stringify(value));
}

function generateId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessage(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGreetingOnly(text) {
  const cleaned = normalizeMessage(text);
  if (!cleaned) return false;
  const greetingPhrases = new Set([
    "good morning",
    "good afternoon",
    "good evening",
  ]);
  if (greetingPhrases.has(cleaned)) return true;

  const words = cleaned.split(" ");
  if (words.length > 4) return false;
  return words.every((word) => GREETING_WORDS.has(word) || GREETING_FILLERS.has(word));
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function buildGreetingReply() {
  const timeGreeting = getTimeGreeting();
  return `${timeGreeting}! I'm AfriSense. How are you feeling today? Share any symptoms, when they started, and anything you've tried.`;
}

function initSession() {
  const existingId = storageGetItem(STORAGE_KEYS.sessionId);
  state.sessionId = existingId || generateId();
  if (!existingId) {
    storageSetItem(STORAGE_KEYS.sessionId, state.sessionId);
  }

  const chats = getStored(STORAGE_KEYS.chats, []);
  state.chats = Array.isArray(chats) ? chats : [];

  const points = Number(getStored(STORAGE_KEYS.points, 0));
  state.points = Number.isFinite(points) ? points : 0;

  const level = Number(getStored(STORAGE_KEYS.level, 1));
  state.level = Number.isFinite(level) ? level : 1;

  const badges = getStored(STORAGE_KEYS.badges, []);
  state.badges = Array.isArray(badges) ? badges : [];

  const learnedTips = getStored(STORAGE_KEYS.learnedTips, []);
  state.learnedTips = Array.isArray(learnedTips) ? learnedTips : [];
}

function persistSession() {
  setStored(STORAGE_KEYS.chats, state.chats);
  setStored(STORAGE_KEYS.points, state.points);
  setStored(STORAGE_KEYS.level, state.level);
  setStored(STORAGE_KEYS.badges, state.badges);
  setStored(STORAGE_KEYS.learnedTips, state.learnedTips);
}

function calculateLevel(points) {
  return Math.max(1, Math.floor(points / 100) + 1);
}

function awardPoints(amount, reason) {
  state.points += amount;
  const newLevel = calculateLevel(state.points);
  if (newLevel !== state.level) {
    state.level = newLevel;
  }
  persistSession();
  renderGamification();
  logEvent(`Points +${amount} (${reason})`);
}

function unlockBadge(badge) {
  if (!state.badges.includes(badge)) {
    state.badges.push(badge);
    persistSession();
    renderGamification();
    logEvent(`Badge unlocked: ${badge}`);
  }
}

function logEvent(message) {
  const feed = document.querySelector("[data-event-feed]");
  if (!feed) return;
  const item = document.createElement("p");
  item.className = "text-xs text-stone-600";
  item.textContent = message;
  feed.prepend(item);
}

async function initFirebase() {
  if (!CONFIG.ENABLE_FIREBASE) {
    return;
  }

  try {
    const [{ initializeApp }, { getFirestore, doc, setDoc }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
    ]);

    const app = initializeApp(CONFIG.FIREBASE_CONFIG);
    state.firebase.db = getFirestore(app);
    state.firebase.enabled = true;

    await setDoc(
      doc(state.firebase.db, "sessions", state.sessionId),
      {
        createdAt: new Date().toISOString(),
        points: state.points,
        level: state.level,
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("Firebase init failed", error);
    state.firebase.enabled = false;
  }
}

async function syncSessionToFirestore() {
  if (!state.firebase.enabled || !state.firebase.db) return;
  const { doc, setDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"
  );

  await setDoc(
    doc(state.firebase.db, "sessions", state.sessionId),
    {
      points: state.points,
      level: state.level,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

async function saveChatToFirestore(chat) {
  if (!state.firebase.enabled || !state.firebase.db) return;
  const { collection, doc, setDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"
  );
  const chatRef = doc(collection(state.firebase.db, "chats", state.sessionId, "items"), chat.chatId);
  await setDoc(chatRef, chat, { merge: true });
}

function getActiveChatId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("chatId");
}

function setActiveChatId(chatId) {
  const url = new URL(window.location.href);
  url.searchParams.set("chatId", chatId);
  window.history.replaceState({}, "", url);
}

function createChat() {
  const chatId = generateId();
  const newChat = {
    chatId,
    title: "New Symptom Check",
    timestamp: new Date().toISOString(),
    messages: [],
    analysis: null,
  };
  state.chats.unshift(newChat);
  persistSession();
  return newChat;
}

function findChat(chatId) {
  return state.chats.find((chat) => chat.chatId === chatId);
}

function updateChat(chat) {
  const index = state.chats.findIndex((item) => item.chatId === chat.chatId);
  if (index !== -1) {
    state.chats[index] = chat;
  } else {
    state.chats.unshift(chat);
  }
  persistSession();
  saveChatToFirestore(chat);
}

function addMessage(chat, role, text, analysis) {
  const entry = {
    role,
    text,
    analysis: analysis || null,
    timestamp: new Date().toISOString(),
  };
  chat.messages.push(entry);
  chat.timestamp = entry.timestamp;
  if (role === "user" && chat.messages.length === 1) {
    chat.title = text.slice(0, 48);
  }
  if (analysis) {
    chat.analysis = analysis;
  }
  updateChat(chat);
}

function buildPrompt(userText, history) {
  const historySnippet = history
    .slice(-4)
    .map((item) => `${item.role.toUpperCase()}: ${item.text}`)
    .join("\n");

  return `You are a culturally-aware symptom guidance assistant for African communities.

STRICT RULES:
- Never diagnose diseases.
- Never prescribe or recommend medication.
- Only suggest POSSIBLE causes.
- Use simple, non-technical language.
- Always include a medical disclaimer.
- Provide next steps that fit low-resource African settings.
- Assign a risk level: Low, Medium, or Urgent.
- Always ask 2 to 4 short follow-up questions.
- Be warm, calm, and reassuring; acknowledge feelings briefly.
- Act like a supportive health guide with the communication style of a doctor or nurse, but never claim to be a doctor, nurse, or medical professional.
- Offer brief reassurance and clear, actionable feedback.

Return ONLY valid JSON with this exact structure:
{
  "summary": "short simple summary of what the person shared",
  "possible_causes": ["cause 1", "cause 2"],
  "risk_level": "Low|Medium|Urgent",
  "next_steps": ["action 1", "action 2"],
  "red_flags": ["warning sign 1", "warning sign 2"],
  "follow_up_questions": ["question 1", "question 2"],
  "disclaimer": "short medical disclaimer"
}

Conversation so far:
${historySnippet}

User message: ${userText}`;
}

function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

async function callGemini(userText, history) {
  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY.includes("YOUR_")) {
    throw new Error("Missing Gemini API key.");
  }

  const prompt = buildPrompt(userText, history);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": CONFIG.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 350,
        },
      }),
      signal: controller.signal,
    }
  ).finally(() => window.clearTimeout(timeout));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini error: ${errorText}`);
  }

  const data = await response.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "{\"summary\":\"No response\",\"possible_causes\":[],\"risk_level\":\"Medium\",\"next_steps\":[\"Try again\"],\"red_flags\":[],\"follow_up_questions\":[\"Can you describe when the symptoms started?\",\"Have you eaten or drunk anything unusual today?\"],\"disclaimer\":\"This is not medical advice.\"}";
  const jsonString = extractJson(text);
  if (!jsonString) {
    throw new Error("Could not parse Gemini response.");
  }
  return safeJsonParse(jsonString, null);
}

function createMessageBubble(message, alignment) {
  const wrapper = document.createElement("div");
  wrapper.className = `flex ${alignment} chat-bubble`;

  const bubble = document.createElement("div");
  bubble.className =
    alignment === "justify-end"
      ? "max-w-[80%] rounded-2xl bg-stone-800 text-white px-4 py-3 shadow"
      : "max-w-[80%] rounded-2xl bg-white px-4 py-3 shadow";

  const text = document.createElement("p");
  text.className = "text-sm leading-relaxed";
  text.textContent = message;

  bubble.appendChild(text);
  wrapper.appendChild(bubble);
  return wrapper;
}

function createAssistantBubble(analysis) {
  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-start chat-bubble";

  const bubble = document.createElement("div");
  bubble.className = "max-w-[85%] rounded-2xl bg-white px-4 py-4 shadow";

  const summary = document.createElement("p");
  summary.className = "text-sm font-semibold text-stone-800";
  summary.textContent = analysis.summary;

  const causes = document.createElement("ul");
  causes.className = "mt-3 text-sm text-stone-700 list-disc list-inside";
  analysis.possible_causes.forEach((cause) => {
    const li = document.createElement("li");
    li.textContent = cause;
    causes.appendChild(li);
  });

  const nextSteps = document.createElement("ul");
  nextSteps.className = "mt-3 text-sm text-stone-700 list-disc list-inside";
  analysis.next_steps.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    nextSteps.appendChild(li);
  });

  const disclaimer = document.createElement("p");
  disclaimer.className = "mt-3 text-xs text-stone-500";
  disclaimer.textContent = analysis.disclaimer;

  bubble.appendChild(summary);

  if (analysis.possible_causes.length) {
    const label = document.createElement("p");
    label.className = "mt-3 text-xs uppercase tracking-widest text-stone-500";
    label.textContent = "Possible causes";
    bubble.appendChild(label);
    bubble.appendChild(causes);
  }

  if (analysis.next_steps.length) {
    const label = document.createElement("p");
    label.className = "mt-3 text-xs uppercase tracking-widest text-stone-500";
    label.textContent = "What you can do next";
    bubble.appendChild(label);
    bubble.appendChild(nextSteps);
  }

  if (analysis.red_flags.length) {
    const label = document.createElement("p");
    label.className = "mt-3 text-xs uppercase tracking-widest text-stone-500";
    label.textContent = "Emergency signs";
    bubble.appendChild(label);
    const redList = document.createElement("ul");
    redList.className = "text-sm text-stone-700 list-disc list-inside";
    analysis.red_flags.forEach((flag) => {
      const li = document.createElement("li");
      li.textContent = flag;
      redList.appendChild(li);
    });
    bubble.appendChild(redList);
  }

  if (analysis.follow_up_questions && analysis.follow_up_questions.length) {
    const followCard = document.createElement("div");
    followCard.className = "followup-card";

    const label = document.createElement("p");
    label.className = "text-xs uppercase tracking-widest text-stone-600";
    label.textContent = "Follow-up questions";
    followCard.appendChild(label);

    const questionList = document.createElement("ul");
    questionList.className = "mt-2 text-sm text-stone-700 list-disc list-inside";
    analysis.follow_up_questions.forEach((question) => {
      const li = document.createElement("li");
      li.textContent = question;
      questionList.appendChild(li);
    });
    followCard.appendChild(questionList);
    bubble.appendChild(followCard);
  }

  bubble.appendChild(disclaimer);
  wrapper.appendChild(bubble);
  return wrapper;
}

function renderRiskIndicator(analysis) {
  const riskTarget = document.querySelector("[data-risk-indicator]");
  if (!riskTarget) return;

  let riskClass = "risk-medium";
  if (analysis.risk_level === "Low") riskClass = "risk-low";
  if (analysis.risk_level === "Urgent") riskClass = "risk-urgent";

  riskTarget.innerHTML = "";
  const badge = document.createElement("span");
  badge.className = `risk-pill ${riskClass}`;
  badge.textContent = `Risk: ${analysis.risk_level}`;
  riskTarget.appendChild(badge);
}

function renderNextSteps(analysis) {
  const target = document.querySelector("[data-next-steps]");
  if (!target) return;
  target.innerHTML = "";
  analysis.next_steps.forEach((step) => {
    const li = document.createElement("li");
    li.className = "text-sm text-stone-700";
    li.textContent = step;
    target.appendChild(li);
  });
}

function renderGamification() {
  const pointsEl = document.querySelector("[data-points]");
  const levelEl = document.querySelector("[data-level]");
  const badgesEl = document.querySelector("[data-badges]");
  const progressEl = document.querySelector("[data-progress]");
  const nextLevelEl = document.querySelector("[data-next-level]");

  if (!pointsEl || !levelEl || !badgesEl || !progressEl || !nextLevelEl) return;

  pointsEl.textContent = state.points;
  levelEl.textContent = `Level ${state.level}`;

  const nextLevelPoints = state.level * 100;
  const progress = Math.min(100, Math.round((state.points / nextLevelPoints) * 100));
  progressEl.style.width = `${progress}%`;
  nextLevelEl.textContent = `${nextLevelPoints - state.points} points to level up`;

  badgesEl.innerHTML = "";
  if (state.badges.length === 0) {
    const empty = document.createElement("span");
    empty.className = "text-xs text-stone-500";
    empty.textContent = "Earn badges by checking symptoms and learning tips.";
    badgesEl.appendChild(empty);
  } else {
    state.badges.forEach((badge) => {
      const chip = document.createElement("span");
      chip.className = "badge-chip rounded-full px-3 py-1 text-xs";
      chip.textContent = badge;
      badgesEl.appendChild(chip);
    });
  }
}

function getRandomTip() {
  const index = Math.floor(Math.random() * HEALTH_TIPS.length);
  return HEALTH_TIPS[index];
}

function renderTip() {
  const tipTarget = document.querySelector("[data-health-tip]");
  if (!tipTarget) return;
  const tip = getRandomTip();
  tipTarget.textContent = tip;
  tipTarget.dataset.tipValue = tip;
}

function setupTipButton() {
  const button = document.querySelector("[data-tip-action]");
  if (!button) return;
  button.addEventListener("click", () => {
    const tipTarget = document.querySelector("[data-health-tip]");
    if (!tipTarget) return;
    const tip = tipTarget.dataset.tipValue;
    if (!tip) return;

    if (!state.learnedTips.includes(tip)) {
      state.learnedTips.push(tip);
      awardPoints(5, "Learned a health tip");
      unlockBadge("Health Learner");
    }
  });
}

function renderMessages(chat) {
  const container = document.querySelector("[data-chat-messages]");
  if (!container) return;
  container.innerHTML = "";

  chat.messages.forEach((message) => {
    if (message.role === "user") {
      container.appendChild(createMessageBubble(message.text, "justify-end"));
    } else if (message.analysis) {
      container.appendChild(createAssistantBubble(message.analysis));
    } else {
      container.appendChild(createMessageBubble(message.text, "justify-start"));
    }
  });

  container.scrollTop = container.scrollHeight;
  updateChatScrollbar(container);
}

function updateChatScrollbar(container) {
  const trackPadding = 24;
  const maxScroll = container.scrollHeight - container.clientHeight;
  if (maxScroll <= 0) {
    container.style.setProperty("--scroll-thumb-size", "0px");
    container.style.setProperty("--scroll-thumb-offset", "12px");
    return;
  }

  const trackHeight = Math.max(0, container.clientHeight - trackPadding);
  const thumbHeight = Math.max(36, Math.round(trackHeight * (container.clientHeight / container.scrollHeight)));
  const maxThumbTravel = Math.max(0, trackHeight - thumbHeight);
  const scrollRatio = container.scrollTop / maxScroll;
  const thumbOffset = 12 + Math.round(maxThumbTravel * scrollRatio);

  container.style.setProperty("--scroll-thumb-size", `${thumbHeight}px`);
  container.style.setProperty("--scroll-thumb-offset", `${thumbOffset}px`);
}

function renderChatMetadata(chat) {
  if (chat.analysis) {
    renderRiskIndicator(chat.analysis);
    renderNextSteps(chat.analysis);
  }
}

async function handleSendMessage(chat, input, sendButton) {
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  addMessage(chat, "user", text);
  renderMessages(chat);

  if (isGreetingOnly(text)) {
    addMessage(chat, "assistant", buildGreetingReply());
    renderMessages(chat);
    return;
  }

  sendButton.disabled = true;
  sendButton.textContent = "Thinking...";

  try {
    const analysis = await callGemini(text, chat.messages);

    if (!analysis || !analysis.summary) {
      throw new Error("Gemini returned empty response.");
    }

    addMessage(chat, "assistant", analysis.summary, {
      summary: analysis.summary,
      possible_causes: analysis.possible_causes || [],
      risk_level: analysis.risk_level || "Medium",
      next_steps: analysis.next_steps || [],
      red_flags: analysis.red_flags || [],
      follow_up_questions: analysis.follow_up_questions || [],
      disclaimer: analysis.disclaimer || "This is not medical advice.",
    });

    renderMessages(chat);
    renderChatMetadata(chat);

    awardPoints(20, "Completed a symptom check");
    unlockBadge("First Check");

    if (analysis.risk_level === "Urgent") {
      unlockBadge("Safety First");
    }

    syncSessionToFirestore().catch((error) => {
      console.warn("Firestore sync failed", error);
    });
  } catch (error) {
    console.error(error);
    addMessage(
      chat,
      "assistant",
      "I could not reach the health assistant right now. Please try again.",
      {
        summary: "Temporary issue",
        possible_causes: [],
        risk_level: "Medium",
        next_steps: ["Check your connection and try again."],
        red_flags: ["If you feel very unwell, visit a clinic immediately."],
        follow_up_questions: [
          "Are your symptoms getting worse or staying the same?",
          "Do you have a fever or trouble breathing?",
        ],
        disclaimer: "This is not medical advice.",
      }
    );
    renderMessages(chat);
    renderChatMetadata(chat);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Send";
  }
}

function setupChatPage() {
  const input = document.querySelector("[data-chat-input]");
  const sendButton = document.querySelector("[data-send-button]");
  const newChatButton = document.querySelector("[data-new-chat]");
  const urgentButton = document.querySelector("[data-urgent-action]");
  const chatContainer = document.querySelector("[data-chat-messages]");

  if (!input || !sendButton) return;

  const triggerButtonEffect = (button) => {
    button.classList.add("button-pressed");
    window.setTimeout(() => button.classList.remove("button-pressed"), 160);
  };

  let activeChatId = getActiveChatId();
  let chat = activeChatId ? findChat(activeChatId) : null;

  if (!chat) {
    chat = createChat();
    setActiveChatId(chat.chatId);
  }

  renderMessages(chat);
  renderChatMetadata(chat);
  renderGamification();
  renderTip();
  setupTipButton();
  setupManualCareSearch();
  initCareMapPanel();

  if (chatContainer) {
    chatContainer.addEventListener("scroll", () => updateChatScrollbar(chatContainer));
    window.addEventListener("resize", () => updateChatScrollbar(chatContainer));
  }

  const handleSend = () => handleSendMessage(chat, input, sendButton);

  sendButton.addEventListener("click", (event) => {
    event.preventDefault();
    triggerButtonEffect(sendButton);
    handleSend();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      triggerButtonEffect(sendButton);
      handleSend();
    }
  });

  if (newChatButton) {
    newChatButton.addEventListener("click", () => {
      const newChat = createChat();
      setActiveChatId(newChat.chatId);
      renderMessages(newChat);
      renderChatMetadata(newChat);
      input.focus();
    });
  }

  if (urgentButton) {
    urgentButton.addEventListener("click", () => {
      awardPoints(30, "Chose to seek urgent care");
      unlockBadge("Care Seeker");
      showNearestCare();
    });
  }
}

function renderHistoryPage() {
  const list = document.querySelector("[data-history-list]");
  if (!list) return;

  list.innerHTML = "";

  if (state.chats.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-stone-600";
    empty.textContent = "No chats yet. Start a symptom check to see history.";
    list.appendChild(empty);
    return;
  }

  state.chats.forEach((chat) => {
    const card = document.createElement("div");
    card.className = "glass-card rounded-3xl p-4 flex flex-col gap-3";

    const title = document.createElement("p");
    title.className = "text-sm font-semibold";
    title.textContent = chat.title || "Symptom Check";

    const timestamp = document.createElement("p");
    timestamp.className = "text-xs text-stone-500";
    timestamp.textContent = new Date(chat.timestamp).toLocaleString();

    const risk = document.createElement("p");
    risk.className = "text-xs text-stone-600";
    risk.textContent = chat.analysis ? `Risk: ${chat.analysis.risk_level}` : "Risk: Not set";

    const link = document.createElement("a");
    link.href = `chat.html?chatId=${chat.chatId}`;
    link.className = "button-outline text-center rounded-full px-4 py-2 text-sm";
    link.textContent = "Open chat";

    card.appendChild(title);
    card.appendChild(timestamp);
    card.appendChild(risk);
    card.appendChild(link);
    list.appendChild(card);
  });

  renderGamification();
  renderTip();
  setupTipButton();
}

function setupResetButton() {
  const button = document.querySelector("[data-reset-session]");
  if (!button) return;
  button.addEventListener("click", () => {
    storageClear();
    window.location.reload();
  });
}

function initNavigationHighlight() {
  const links = document.querySelectorAll("[data-nav-link]");
  const current = window.location.pathname.split("/").pop();
  links.forEach((link) => {
    if (link.getAttribute("href") === current) {
      link.classList.add("is-active");
    }
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => null);
  }
}

let mapsLoaderPromise = null;

function isMapsKeyReady() {
  return CONFIG.MAPS_API_KEY && !CONFIG.MAPS_API_KEY.includes("YOUR_");
}

function loadGoogleMaps() {
  if (mapsLoaderPromise) return mapsLoaderPromise;

  mapsLoaderPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      state.maps.loaded = true;
      resolve(window.google.maps);
      return;
    }

    if (!isMapsKeyReady()) {
      reject(new Error("Missing Google Maps API key."));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";
    script.onload = () => {
      state.maps.loaded = true;
      resolve(window.google.maps);
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(script);
  });

  return mapsLoaderPromise;
}

function clearMapMarkers() {
  state.maps.markers.forEach((marker) => marker.setMap(null));
  state.maps.markers = [];
}

function normalizeLatLng(location) {
  if (location && typeof location.lat === "function") {
    return { lat: location.lat(), lng: location.lng() };
  }
  return location;
}

function ensureMap(location) {
  const mapEl = document.querySelector("[data-care-map]");
  if (!mapEl) return;
  const center = normalizeLatLng(location) || { lat: 5.6037, lng: -0.187 };

  if (!state.maps.map) {
    state.maps.map = new google.maps.Map(mapEl, {
      center,
      zoom: 13,
      mapTypeControl: false,
      fullscreenControl: false,
    });
  } else {
    state.maps.map.setCenter(center);
  }
}

function updateUserMarker(location) {
  if (!state.maps.map || !location) return;
  if (state.maps.userMarker) {
    state.maps.userMarker.setMap(null);
  }
  state.maps.userMarker = new google.maps.Marker({
    map: state.maps.map,
    position: location,
    title: "Search center",
  });
}

function performNearbySearch(location) {
  if (!state.maps.map) return;
  if (!state.maps.service) {
    state.maps.service = new google.maps.places.PlacesService(state.maps.map);
  }
  clearMapMarkers();

  const request = {
    location,
    radius: 8000,
    keyword: "clinic hospital pharmacy health center",
  };

  state.maps.service.nearbySearch(request, (results, searchStatus) => {
    const status = document.querySelector("[data-care-status]");
    if (
      searchStatus !== google.maps.places.PlacesServiceStatus.OK ||
      !results ||
      results.length === 0
    ) {
      if (status) {
        status.textContent =
          "No nearby clinics, hospitals, or pharmacies were found. Try another area.";
      }
      renderCareList([]);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    results.slice(0, 8).forEach((place) => {
      if (!place.geometry || !place.geometry.location) return;
      const marker = new google.maps.Marker({
        map: state.maps.map,
        position: place.geometry.location,
        title: place.name,
      });
      state.maps.markers.push(marker);
      bounds.extend(place.geometry.location);
    });

    bounds.extend(location);
    state.maps.map.fitBounds(bounds);
    if (status) {
      status.textContent = "Nearest care locations shown below.";
    }
    renderCareList(results);
  });
}

function renderCareList(places) {
  const list = document.querySelector("[data-care-list]");
  if (!list) return;
  list.innerHTML = "";

  if (places === null) {
    const item = document.createElement("li");
    item.className = "care-item text-sm text-stone-600";
    item.textContent = "Nearby clinics, hospitals, and pharmacies will appear here.";
    list.appendChild(item);
    return;
  }

  if (!places || places.length === 0) {
    const item = document.createElement("li");
    item.className = "care-item text-sm text-stone-600";
    item.textContent =
      "No nearby clinics, hospitals, or pharmacies were found. Try zooming the map or searching again.";
    list.appendChild(item);
    return;
  }

  places.slice(0, 5).forEach((place) => {
    const item = document.createElement("li");
    item.className = "care-item text-sm text-stone-700";
    const name = place.name || "Clinic";
    const vicinity = place.vicinity ? ` · ${place.vicinity}` : "";
    item.textContent = `${name}${vicinity}`;
    list.appendChild(item);
  });
}

async function showNearestCare() {
  const panel = document.querySelector("[data-care-panel]");
  const status = document.querySelector("[data-care-status]");
  const mapEl = document.querySelector("[data-care-map]");

  if (!panel || !status || !mapEl) return;
  panel.classList.remove("hidden");
  status.textContent = "Getting your location…";

  if (!navigator.geolocation) {
    status.textContent = "Location is not available in this browser.";
    return;
  }

  try {
    await loadGoogleMaps();
  } catch (error) {
    console.error(error);
    status.textContent = "Google Maps is not available yet. Add your Maps API key.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      status.textContent = "Finding nearby clinics, hospitals, and pharmacies…";
      ensureMap(location);
      updateUserMarker(location);
      performNearbySearch(location);
    },
    (error) => {
      console.warn("Geolocation error", error);
      status.textContent =
        "We could not access your location. Allow location in your browser or enter your town below. Location works on HTTPS or localhost.";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function setupManualCareSearch() {
  const input = document.querySelector("[data-care-input]");
  const button = document.querySelector("[data-care-search]");
  const panel = document.querySelector("[data-care-panel]");
  const status = document.querySelector("[data-care-status]");

  if (!input || !button) return;

  const triggerSearch = async () => {
    const query = input.value.trim();
    if (!query) return;
    if (panel) panel.classList.remove("hidden");
    if (status) status.textContent = "Searching for nearby care…";

    try {
      await loadGoogleMaps();
    } catch (error) {
      console.error(error);
      if (status) status.textContent = "Google Maps is not available yet. Add your Maps API key.";
      return;
    }

    ensureMap(null);
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, geocodeStatus) => {
      if (geocodeStatus !== "OK" || !results || results.length === 0) {
        if (status) status.textContent = "We could not find that location. Try a nearby town.";
        return;
      }

      const location = results[0].geometry.location;
      ensureMap(location);
      updateUserMarker(location);
      performNearbySearch(location);
    });
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    triggerSearch();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      triggerSearch();
    }
  });
}

function initCareMapPanel() {
  const panel = document.querySelector("[data-care-panel]");
  const status = document.querySelector("[data-care-status]");
  if (!panel) return;
  panel.classList.remove("hidden");
  renderCareList(null);

  if (!isMapsKeyReady()) {
    if (status) {
      status.textContent = "Add your Google Maps API key to enable the map.";
    }
    return;
  }

  loadGoogleMaps()
    .then(() => {
      ensureMap(null);
      if (status) {
        status.textContent = "Getting your location…";
      }
      showNearestCare();
    })
    .catch((error) => {
      console.error(error);
      if (status) {
        status.textContent = "Google Maps failed to load. Check your key and network.";
      }
    });
}

async function initApp() {
  initSession();
  initNavigationHighlight();
  registerServiceWorker();

  const page = document.body.dataset.page;
  if (page === "chat") {
    setupChatPage();
  }
  if (page === "history") {
    renderHistoryPage();
  }
  setupResetButton();
  renderGamification();

  // Initialize Firebase in the background so UI still works if it hangs or fails.
  initFirebase().catch((error) => {
    console.warn("Firebase init failed", error);
  });
}

document.addEventListener("DOMContentLoaded", initApp);
