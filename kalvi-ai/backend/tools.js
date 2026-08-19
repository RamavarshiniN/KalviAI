const fs = require("fs");
const path = require("path");

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "mockData", file)));
}

// ---- 1. Permission map: which roles can use which tools ----
const PERMISSIONS = {
  student: ["get_own_attendance", "get_attendance_trend"],
  parent: ["get_child_attendance", "get_attendance_trend"],
  teacher: ["mark_attendance", "get_class_attendance", "get_attendance_trend"],
  principal: ["get_school_attendance_stats", "get_attendance_trend"],
  all: ["escalate_to_human"]
};

function canUse(role, toolName) {
  return PERMISSIONS[role]?.includes(toolName) || PERMISSIONS.all.includes(toolName);
}

// ---- 2. Tool schemas ----
const TOOL_DEFS = [
  {
    name: "get_own_attendance",
    description: "Get the logged-in student's own attendance percentage.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_child_attendance",
    description: "Get attendance percentage for the logged-in parent's child.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "mark_attendance",
    description: "Mark a student present or absent for today.",
    input_schema: {
      type: "object",
      properties: {
        studentName: { type: "string" },
        status: { type: "string", enum: ["present", "absent"] }
      },
      required: ["studentName", "status"]
    }
  },
  {
    name: "get_class_attendance",
    description: "Get attendance summary for the teacher's class.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_school_attendance_stats",
    description: "Get overall school-wide attendance analytics.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_attendance_trend",
    description: "Get a day-by-day attendance trend (as percentages) for the current user's scope: student sees their own daily record, parent sees their child's, teacher sees their class average per day, principal sees the school-wide average per day. Call this whenever the user asks to 'see', 'show', 'chart', 'visualize' a trend, history, or pattern in attendance.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "escalate_to_human",
    description: "Request a call/support from a teacher or school management. Only call this after the user confirms they want it.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", enum: ["teacher", "management"] },
        reason: { type: "string" }
      },
      required: ["target", "reason"]
    }
  }
];

// ---- 3. Helpers ----
function calcAttendance(studentId) {
  const records = loadJSON("attendance.json").filter(r => r.studentId === studentId);
  if (records.length === 0) return 0;
  const present = records.filter(r => r.status === "present").length;
  return Math.round((present / records.length) * 1000) / 10;
}

function getSortedDates(records) {
  return [...new Set(records.map(r => r.date))].sort();
}

// ---- 4. Execute tool, with permission guard ----
async function executeTool(role, userId, toolName, input) {
  if (!canUse(role, toolName)) {
    throw new Error(`Role '${role}' is not authorized to use '${toolName}'`);
  }

  const users = loadJSON("users.json");
  const students = loadJSON("students.json");
  const attendance = loadJSON("attendance.json");
  const currentUser = users.find(u => u.id === userId);

  switch (toolName) {
    case "get_own_attendance": {
      const pct = calcAttendance(userId);
      return { studentName: currentUser.name, attendance: pct };
    }

    case "get_child_attendance": {
      const childId = currentUser.childId;
      if (!childId) throw new Error("No child linked to this parent account");
      const child = students.find(s => s.id === childId);
      const pct = calcAttendance(childId);
      return { childName: child.name, attendance: pct };
    }

    case "mark_attendance": {
      const student = students.find(
        s => s.name.toLowerCase() === input.studentName.toLowerCase() && s.teacherId === userId
      );
      if (!student) throw new Error("Student not found in your class");
      const today = new Date().toISOString().split("T")[0];
      attendance.push({ studentId: student.id, date: today, status: input.status });
      fs.writeFileSync(
        path.join(__dirname, "mockData", "attendance.json"),
        JSON.stringify(attendance, null, 2)
      );
      return { confirmed: true, student: student.name, status: input.status, date: today };
    }

    case "get_class_attendance": {
      const classStudents = students.filter(s => s.teacherId === userId);
      const result = classStudents.map(s => ({ name: s.name, attendance: calcAttendance(s.id) }));
      return { class: classStudents[0]?.class || "N/A", students: result };
    }

    case "get_school_attendance_stats": {
      const all = students.map(s => calcAttendance(s.id));
      const avg = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : 0;
      return { totalStudents: students.length, averageAttendance: avg };
    }

    case "get_attendance_trend": {
      let scopeIds = [];
      let label = "";

      if (role === "student") {
        scopeIds = [userId];
        label = `${currentUser.name}'s daily attendance`;
      } else if (role === "parent") {
        if (!currentUser.childId) throw new Error("No child linked to this parent account");
        scopeIds = [currentUser.childId];
        label = `${students.find(s => s.id === currentUser.childId).name}'s daily attendance`;
      } else if (role === "teacher") {
        scopeIds = students.filter(s => s.teacherId === userId).map(s => s.id);
        label = "Class daily attendance average";
      } else if (role === "principal") {
        scopeIds = students.map(s => s.id);
        label = "School-wide daily attendance average";
      }

      const scopeRecords = attendance.filter(r => scopeIds.includes(r.studentId));
      const dates = getSortedDates(scopeRecords);

      const values = dates.map(date => {
        const dayRecords = scopeRecords.filter(r => r.date === date);
        const present = dayRecords.filter(r => r.status === "present").length;
        return dayRecords.length ? Math.round((present / dayRecords.length) * 100) : 0;
      });

      if (dates.length === 0) {
        return { chart: false, message: "Not enough attendance history yet to show a trend." };
      }

      return { chart: true, title: label, labels: dates, values };
    }

    case "escalate_to_human": {
      const ticket = {
        id: "TCK" + Date.now(),
        from: currentUser.name,
        role,
        target: input.target,
        reason: input.reason,
        confirmed: true
      };
      const ticketsPath = path.join(__dirname, "mockData", "tickets.json");
      const tickets = fs.existsSync(ticketsPath) ? JSON.parse(fs.readFileSync(ticketsPath)) : [];
      tickets.push(ticket);
      fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));
      return ticket;
    }

    default:
      throw new Error("Unknown tool");
  }
}

// ---- 5. Convert TOOL_DEFS into Gemini format (kept for reference/compat) ----
function toGeminiType(t) {
  return t.toUpperCase();
}
function convertSchema(schema) {
  const converted = { type: toGeminiType(schema.type) };
  if (schema.properties) {
    converted.properties = {};
    for (const key in schema.properties) {
      converted.properties[key] = convertSchema(schema.properties[key]);
      if (schema.properties[key].enum) converted.properties[key].enum = schema.properties[key].enum;
    }
  }
  if (schema.required) converted.required = schema.required;
  return converted;
}
function getGeminiTools(toolDefs) {
  return [{
    functionDeclarations: toolDefs.map(t => ({
      name: t.name,
      description: t.description,
      parameters: convertSchema(t.input_schema)
    }))
  }];
}

// ---- 6. Convert TOOL_DEFS into OpenAI/Groq format ----
function getOpenAITools(toolDefs) {
  return toolDefs.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }
  }));
}

module.exports = { TOOL_DEFS, canUse, executeTool, PERMISSIONS, getGeminiTools, getOpenAITools };