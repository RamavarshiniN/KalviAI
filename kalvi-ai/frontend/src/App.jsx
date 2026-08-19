import { useState } from "react";
import { marked } from "marked";
import "./App.css";

const ROLES = [
  { id: "student", label: "Student (Rahul)", userId: "s1" },
  { id: "parent", label: "Parent (Rahul's Parent)", userId: "p1" },
  { id: "teacher", label: "Teacher (Mrs. Kumar)", userId: "t1" },
  { id: "principal", label: "Principal (Mr. Sharma)", userId: "pr1" }
];

function App() {
  const [selectedRole, setSelectedRole] = useState(ROLES[0]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  async function sendMessage(text) {
    if (!text.trim()) return;

    const userMsg = { sender: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole.id,
          userId: selectedRole.userId,
          message: text,
          history
        })
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { sender: "bot", text: "Sorry, something went wrong." }]);
      } else {
        setMessages(prev => [...prev, { sender: "bot", text: data.reply }]);
        setHistory(data.history);
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
    sendMessage(`I am not satisfied. I want to talk to ${target === "teacher" ? "my child's teacher" : "school management"}.`);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Kalvi AI</h1>
        <select value={selectedRole.id} onChange={handleRoleChange}>
          {ROLES.map(r => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </header>

      <div className="chat-window">
        {messages.length === 0 && (
          <div className="empty-state">
            Say hello, or ask something like "What is my attendance?"
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`bubble ${m.sender}`}
            dangerouslySetInnerHTML={{ __html: marked.parse(m.text) }}
          />
        ))}
        {loading && <div className="bubble bot">Typing...</div>}
      </div>

      <div className="escalate-row">
        <button onClick={() => handleEscalate("teacher")}>Talk to Teacher</button>
        <button onClick={() => handleEscalate("management")}>Contact School Management</button>
      </div>

      <form
        className="input-row"
        onSubmit={e => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;