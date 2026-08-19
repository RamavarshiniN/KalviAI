require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const { getSystemPrompt } = require("./personas");
const { TOOL_DEFS, canUse, executeTool, getOpenAITools } = require("./tools");

const app = express();
app.use(cors());
app.use(express.json());

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

app.post("/chat", async (req, res) => {
  try {
    const { role, userId, message, history, language } = req.body;

    if (!role || !userId || !message) {
      return res.status(400).json({ error: "role, userId, and message are required" });
    }

    const allowedTools = TOOL_DEFS.filter(t => canUse(role, t.name));
    const systemPrompt = getSystemPrompt(role, language);
    const openAITools = getOpenAITools(allowedTools);

    let messages = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message }
    ];

    let completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages,
      tools: openAITools
    });

    let choice = completion.choices[0];
    let chartData = null;

    while (choice.finish_reason === "tool_calls") {
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        let result;
        try {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          result = await executeTool(role, userId, toolCall.function.name, args);

          if (toolCall.function.name === "get_attendance_trend" && result.chart) {
            chartData = result;
          }
        } catch (e) {
          result = { error: e.message };
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }

      completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages,
        tools: openAITools
      });
      choice = completion.choices[0];
    }

    const finalText = choice.message.content || "";
    messages.push({ role: "assistant", content: finalText });

    const historyToReturn = messages.filter(m => m.role !== "system");

    res.json({ reply: finalText, history: historyToReturn, chartData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

app.get("/", (req, res) => res.send("Kalvi AI backend is running"));

const PORT = 5000;
app.listen(PORT, () => console.log(`Kalvi AI backend running on http://localhost:${PORT}`));

module.exports = app;