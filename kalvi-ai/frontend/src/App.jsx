import { useState } from "react";
import { marked } from "marked";
import "./App.css";

const LANGUAGES = [
  { code: "en", label: "English", speechCode: "en-IN" },
  { code: "hi", label: "Hindi", speechCode: "hi-IN" },
  { code: "ta", label: "Tamil", speechCode: "ta-IN" },
  { code: "te", label: "Telugu", speechCode: "te-IN" },
  { code: "mr", label: "Marathi", speechCode: "mr-IN" },
  { code: "bn", label: "Bengali", speechCode: "bn-IN" },
  { code: "gu", label: "Gujarati", speechCode: "gu-IN" },
  { code: "pa", label: "Punjabi", speechCode: "pa-IN" },
  { code: "kn", label: "Kannada", speechCode: "kn-IN" },
  { code: "ml", label: "Malayalam", speechCode: "ml-IN" },
  { code: "ur", label: "Urdu", speechCode: "ur-IN" }
];

const ROLES = [
  { id: "student", label: "Student (Rahul)", userId: "s1", icon: "🎒" },
  { id: "parent", label: "Parent (Rahul's Parent)", userId: "p1", icon: "👪" },
  { id: "teacher", label: "Teacher (Mrs. Kumar)", userId: "t1", icon: "🍎" },
  { id: "principal", label: "Principal (Mr. Sharma)", userId: "pr1", icon: "🏫" }
];

function TrendChart({ data }) {
  if (!data || !data.chart) return null;
  const { title, labels, values } = data;
  const width = 280;
  const height = 120;
  const barGap = 8;
  const barWidth = (width - barGap * (values.length - 1)) / values.length;

  return (
    <div className="trend-chart">
      <div className="trend-title">{title}</div>
      <svg width={width} height={height + 24} viewBox={`0 0 ${width} ${height + 24}`}>
        {values.map((v, i) => {
          const barHeight = (v / 100) * height;
          const x = i * (barWidth + barGap);
          const y = height - barHeight;
          const color = v >= 75 ? "#2ecc71" : v >= 50 ? "#f5a623" : "#e74c3c";
          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx="3" />
              <text x={x + barWidth / 2} y={height + 14} fontSize="9" textAnchor="middle" fill="#666">
                {labels[i].slice(5)}
              </text>
              <text x={x + barWidth / 2} y={y - 4} fontSize="9" textAnchor="middle" fill="#333">
                {v}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Avatar({ speaking, listening }) {
  return (
    <div className={`avatar ${speaking ? "speaking" : ""} ${listening ? "listening-face" : ""}`}>
      <div className="avatar-face">
        <div className="avatar-eyes">
          <span className="eye"></span><span className="eye"></span>
        </div>
        <div className="avatar-mouth"></div>
      </div>
    </div>
  );
}

function App() {
  const [selectedRole, setSelectedRole] = useState(ROLES[0]);
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  async function sendMessage(text) {
    if (!text.trim()) return;

    setMessages(prev => [...prev, { sender: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole.id,
          userId: selectedRole.userId,
          message: text,
          history,
          language: selectedLang.label
        })
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { sender: "bot", text: "Sorry, something went wrong." }]);
      } else {
        setMessages(prev => [
          ...prev,
          { sender: "bot", text: data.reply, chartData: data.chartData }
        ]);
        setHistory(data.history);

        if ("speechSynthesis" in window && data.reply) {
          const utter = new SpeechSynthesisUtterance(data.reply.replace(/[*_#]/g, ""));
          utter.onstart = () => setSpeaking(true);
          utter.onend = () => setSpeaking(false);
          speechSynthesis.speak(utter);
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { sender: "bot", text: "Could not reach the server." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleRoleChange(e) {
    const role = ROLES.find(r => r.id === e.target.value);
    setSelectedRole(role);
    setMessages([]);
    setHistory([]);
  }

  function handleEscalate(target) {
    sendMessage(
      `I am not satisfied. I want to talk to ${target === "teacher" ? "my child's teacher" : "school management"}.`
    );
  }

  function handleMicClick() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input isn't supported in this browser. Try Chrome.");
      return;
    }
    const recog = new SpeechRecognition();
    recog.lang = selectedLang.speechCode;
    recog.interimResults = true;
    recog.continuous = false;

    recog.onstart = () => setListening(true);
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);

    recog.onresult = e => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recog.start();
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <Avatar speaking={speaking} listening={listening} />
          <div className="header-text">
            <h1>Kalvi AI</h1>
            <span className="header-status">
              <span className="status-dot"></span>
              Online · {selectedRole.label.split(" (")[0]} Assistant
            </span>
          </div>
        </div>
        <div className="header-right">
          <select
            className="lang-select"
            value={selectedLang.code}
            onChange={e => setSelectedLang(LANGUAGES.find(l => l.code === e.target.value))}
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <select value={selectedRole.id} onChange={handleRoleChange}>
            {ROLES.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="chat-window">
        {messages.length === 0 && (
          <div className="empty-state">
            Try: "What is my attendance?" or "Show me my attendance trend"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.sender}`}>
            <div dangerouslySetInnerHTML={{ __html: marked.parse(m.text) }} />
            {m.chartData && <TrendChart data={m.chartData} />}
          </div>
        ))}
        {loading && (
          <div className="bubble bot typing">
            <span className="dot"></span><span className="dot"></span><span className="dot"></span>
          </div>
        )}
      </div>

      <div className="escalate-row">
        <button className="chip" onClick={() => handleEscalate("teacher")}>💬 Talk to Teacher</button>
        <button className="chip" onClick={() => handleEscalate("management")}>🏛️ Contact Management</button>
      </div>

      <form
        className="input-row"
        onSubmit={e => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <button
          type="button"
          className={`mic-btn ${listening ? "listening" : ""}`}
          onClick={handleMicClick}
          title="Speak"
        >
          🎤
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={listening ? "Listening..." : "Type your message..."}
        />
        <button type="submit" className="send-btn" title="Send">➤</button>
      </form>
    </div>
  );
}

export default App;