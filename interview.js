import Anthropic from "@anthropic-ai/sdk";
import { allow, clip } from "../lib/store.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-5-5";
const LIMIT = Number(process.env.AI_HOURLY_LIMIT || 60);

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

function parseObj(t) {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Model did not return JSON");
  return JSON.parse(t.slice(a, b + 1));
}

async function ask(prompt, { fast = false, maxTokens = 2000 } = {}) {
  const msg = await client.messages.create({
    model: fast ? FAST_MODEL : MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
  return parseObj(text);
}

function cleanCfg(c = {}) {
  return {
    role: clip(c.role || "General internship", 120),
    company: clip(c.company, 120),
    year: clip(c.year || "Sophomore", 40),
    format: c.format === "recorded" ? "recorded" : "live",
    count: c.count === 3 ? 3 : 5,
    focus: clip(c.focus, 200),
    bg: clip(c.bg, 2500),
  };
}
const words = t => (String(t).trim().match(/\S+/g) || []).length;

function questionsPrompt(c, history) {
  return `You are the question writer for FirstRung, a mock-interview tool for college students and early-career people landing their first internship or job.

Write ${c.count} interview questions for this candidate.
Role: ${c.role}
Company: ${c.company || "not specified (assume a competitive, well-known employer in this field)"}
Candidate stage: ${c.year}
Format: ${c.format === "recorded" ? "one-way recorded video (HireVue style): 90-second answers, no follow-ups, so each question must be self-contained" : "live interview with a person"}
${c.focus ? "The candidate wants to drill: " + c.focus + ". Weight at least half the questions toward this." : ""}
Candidate's own experience (may be empty): """${c.bg}"""

Rules:
- Mix the types: at least one Motivation question (why this role/company), at least two Behavioral questions, at least one Role-specific question that a real ${c.role} interviewer would ask an intern candidate at this stage (keep technical depth fair for a ${c.year}).
- If the candidate gave experience, write at least one Experience question that names something specific from it.
- Sound like a real interviewer, not a textbook. Vary phrasing.
- Do NOT reuse or lightly reword any of these recently asked questions: ${JSON.stringify(history)}
- Also invent a short interviewer persona: a first name, title and team that fit the role and company.

Return only JSON:
{"persona":"Name, Title, Team at Company","questions":[{"q":"question text","type":"Motivation|Behavioral|Role-specific|Experience","tests":"what the interviewer is really checking, under 12 words"}]}`;
}

function followupPrompt(c, persona, q, answer) {
  return `You are ${persona || "an interviewer"} running a live ${c.role} interview with a ${c.year} candidate.
Question you asked: "${q}"
Their answer: """${answer}"""
Decide if a real interviewer would ask ONE short follow-up here. Ask one when the answer is vague, skips their own role, has no result or number, or raises something worth probing. Skip it when the answer is complete. Return only JSON: {"followup": "the question"} or {"followup": null}`;
}

function gradePrompt(c, answers) {
  const transcript = answers.map((a, k) => `Q${k + 1} [${a.type}] ${a.q}
Answer (${words(a.answer)} words, ${a.seconds}s${a.timedOut ? ", ran out of time" : ""}): ${a.answer}${a.followup ? `
Follow-up: ${a.followup}
Follow-up answer: ${a.followAnswer}` : ""}`).join("\n\n");
  return `You grade mock interviews for FirstRung. Students say chatbots are too reassuring, so be a candid, fair screener. Calibrate to how a real recruiter at a competitive firm would score a ${c.year} candidate for ${c.role}${c.company ? " at " + c.company : ""}.

Format: ${c.format === "recorded" ? "recorded one-way video, 90 seconds per answer (about 200-240 spoken words is a full answer; under 90 words is thin)" : "live interview"}.
Candidate's background notes: """${c.bg}"""

Scoring per answer, 1-5: 1 off-topic or empty; 2 generic, no specifics or outcome; 3 relevant with some specifics but weak result or unclear personal role; 4 clear STAR, specific, own actions, a result; 5 rare, memorable, quantified, tied to this role. Do not inflate. For behavioral answers rate STAR parts as strong, weak or missing; for non-story questions rate the parts that apply and use "n/a" for the rest.
If the background notes contain a stronger story than the one they used, say so in the fix.

Transcript:
${transcript}

Return only JSON:
{"overall": 0-100,
 "verdict": "Ready" | "Close" | "Not yet",
 "recruiter_read": "2-3 sentences: what a recruiter would honestly conclude after this interview",
 "strengths": ["specific strength", "specific strength"],
 "patterns": ["recurring issue across answers, with how to fix it", "another"],
 "answers": [{"score":1-5, "star":{"S":"strong|weak|missing|n/a","T":"...","A":"...","R":"..."}, "worked":"one specific thing that worked", "fix":"the single most important change, concrete", "better_opening":"a stronger first 1-2 sentences in the candidate's own voice, using only facts they gave"}],
 "next_focus": "3-6 word label of the skill to drill next"}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!client) return res.status(503).json({ error: "The AI interviewer isn't set up yet (missing ANTHROPIC_API_KEY)." });
  if (!(await allow(req, "ai", LIMIT))) return res.status(429).json({ error: "Too many requests right now. Wait a bit and try again." });

  const body = req.body || {};
  const c = cleanCfg(body.cfg);
  try {
    if (body.task === "questions") {
      const history = Array.isArray(body.history) ? body.history.slice(-40).map(h => clip(h, 300)) : [];
      const j = await ask(questionsPrompt(c, history), { maxTokens: 1500 });
      if (!Array.isArray(j.questions) || !j.questions.length) throw new Error("No questions");
      return res.json({ persona: clip(j.persona, 200), questions: j.questions.slice(0, c.count) });
    }
    if (body.task === "followup") {
      const j = await ask(followupPrompt(c, clip(body.persona, 200), clip(body.q, 600), clip(body.answer, 3000)), { fast: true, maxTokens: 300 });
      return res.json({ followup: typeof j.followup === "string" && j.followup.trim() ? j.followup.trim() : null });
    }
    if (body.task === "grade") {
      const answers = (Array.isArray(body.answers) ? body.answers : []).slice(0, 5).map(a => ({
        q: clip(a.q, 600), type: clip(a.type, 40), answer: clip(a.answer, 3000),
        seconds: Math.max(0, Math.min(3600, Number(a.seconds) || 0)), timedOut: !!a.timedOut,
        followup: a.followup ? clip(a.followup, 600) : null, followAnswer: clip(a.followAnswer, 3000),
      }));
      if (!answers.length) return res.status(400).json({ error: "No answers to score" });
      const j = await ask(gradePrompt(c, answers), { maxTokens: 4000 });
      return res.json(j);
    }
    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "The AI didn't respond properly. Try again." });
  }
}
