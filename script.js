"use strict";

const STATUSES = ["Present", "Absent", "Late", "On Leave"];
const $ = (id) => document.getElementById(id);

// ---------- Storage ----------
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
let students = load("sat_students", []);      // [{uid, name, sid, dept}]
let attendance = load("sat_attendance", {});  // { "YYYY-MM-DD": { uid: status } }

function save() {
  localStorage.setItem("sat_students", JSON.stringify(students));
  localStorage.setItem("sat_attendance", JSON.stringify(attendance));
}

// ---------- Helpers ----------
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function statusOn(uid, date) {
  return (attendance[date] && attendance[date][uid]) || null;
}
// Present and Late count as attended. On Leave days are excluded from the percentage.
function percentage(uid) {
  let attended = 0, counted = 0;
  for (const date in attendance) {
    const s = attendance[date][uid];
    if (!s || s === "On Leave") continue;
    counted++;
    if (s === "Present" || s === "Late") attended++;
  }
  return counted ? Math.round((attended / counted) * 100) : null;
}

// ---------- Student CRUD ----------
function setMsg(text, ok) {
  const m = $("formMsg");
  m.textContent = text;
  m.className = "msg" + (ok ? " ok" : "");
}
function resetForm() {
  $("studentForm").reset();
  $("editId").value = "";
  $("formTitle").textContent = "Add student";
  $("saveBtn").textContent = "Add student";
  $("cancelBtn").hidden = true;
}

$("studentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("name").value.trim();
  const sid = $("sid").value.trim();
  const dept = $("dept").value.trim();
  const editId = $("editId").value;

  if (!name || !sid || !dept) return setMsg("Enter name, student ID and department.");
  if (students.some((s) => s.sid.toLowerCase() === sid.toLowerCase() && s.uid !== editId))
    return setMsg("A student with this ID already exists.");

  if (editId) {
    const s = students.find((x) => x.uid === editId);
    Object.assign(s, { name, sid, dept });
    setMsg("Student updated.", true);
  } else {
    students.push({ uid: "u" + Date.now() + Math.random().toString(36).slice(2, 6), name, sid, dept });
    setMsg("Student added.", true);
  }
  save();
  resetForm();
  render();
});
$("cancelBtn").addEventListener("click", () => { resetForm(); setMsg(""); });

function editStudent(uid) {
  const s = students.find((x) => x.uid === uid);
  $("editId").value = uid;
  $("name").value = s.name;
  $("sid").value = s.sid;
  $("dept").value = s.dept;
  $("formTitle").textContent = "Edit student";
  $("saveBtn").textContent = "Save changes";
  $("cancelBtn").hidden = false;
  $("name").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function deleteStudent(uid) {
  const s = students.find((x) => x.uid === uid);
  if (!confirm("Delete " + s.name + " and all their attendance records?")) return;
  students = students.filter((x) => x.uid !== uid);
  for (const d in attendance) delete attendance[d][uid];
  save();
  render();
}

// ---------- Attendance ----------
// One status per student per date: marking again replaces the old entry, so no duplicates.
function mark(uid, status) {
  const date = $("attDate").value;
  if (!date) return alert("Pick an attendance date first.");
  attendance[date] = attendance[date] || {};
  attendance[date][uid] = status;
  save();
  render();
}

function showHistory(uid) {
  const s = students.find((x) => x.uid === uid);
  const dates = Object.keys(attendance).filter((d) => attendance[d][uid]).sort().reverse();
  $("historyTitle").textContent = "Attendance history: " + s.name;
  $("historyRows").innerHTML = dates.length
    ? dates.map((d) => `<tr><td>${d}</td><td>${esc(attendance[d][uid])}</td></tr>`).join("")
    : `<tr><td colspan="2">No attendance marked yet.</td></tr>`;
  $("historyPanel").hidden = false;
  $("historyPanel").scrollIntoView({ behavior: "smooth" });
}
$("closeHistory").addEventListener("click", () => { $("historyPanel").hidden = true; });

// ---------- Render ----------
function render() {
  const date = $("attDate").value;
  const q = $("search").value.trim().toLowerCase();
  const filter = $("statusFilter").value;
  const threshold = Number($("threshold").value) || 0;

  // Summary for the selected date
  let present = 0, absent = 0, attendedAll = 0, countedAll = 0;
  students.forEach((s) => {
    const st = statusOn(s.uid, date);
    if (st === "Present" || st === "Late") present++;
    if (st === "Absent") absent++;
    const p = percentage(s.uid);
    if (p !== null) { attendedAll += p; countedAll++; }
  });
  $("sTotal").textContent = students.length;
  $("sPresent").textContent = present;
  $("sAbsent").textContent = absent;
  $("sPct").textContent = (countedAll ? Math.round(attendedAll / countedAll) : 0) + "%";

  // Search and filter
  const list = students.filter((s) => {
    const st = statusOn(s.uid, date) || "Not marked";
    const text = (s.name + " " + s.sid + " " + s.dept).toLowerCase();
    return text.includes(q) && (!filter || st === filter);
  });

  $("rows").innerHTML = list.map((s) => {
    const st = statusOn(s.uid, date);
    const p = percentage(s.uid);
    const low = p !== null && p < threshold;
    const buttons = STATUSES.map((x) => {
      const cls = x === "On Leave" ? "Leave" : x;
      return `<button class="btn small ${st === x ? "on " + cls : ""}" data-act="mark" data-uid="${s.uid}" data-status="${x}">${x}</button>`;
    }).join("");
    return `<tr class="${low ? "low" : ""}">
      <td>${esc(s.name)}</td><td>${esc(s.sid)}</td><td>${esc(s.dept)}</td>
      <td><div class="marks">${buttons}</div></td>
      <td><span class="pct ${low ? "low" : ""}">${p === null ? "–" : p + "%"}</span>${low ? '<span class="tag">Low</span>' : ""}</td>
      <td><div class="marks">
        <button class="btn small" data-act="history" data-uid="${s.uid}">History</button>
        <button class="btn small" data-act="edit" data-uid="${s.uid}">Edit</button>
        <button class="btn small danger" data-act="delete" data-uid="${s.uid}">Delete</button>
      </div></td></tr>`;
  }).join("");

  $("empty").hidden = list.length > 0;
}

$("rows").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const { act, uid, status } = b.dataset;
  if (act === "mark") mark(uid, status);
  else if (act === "edit") editStudent(uid);
  else if (act === "delete") deleteStudent(uid);
  else if (act === "history") showHistory(uid);
});

["attDate", "search", "statusFilter", "threshold"].forEach((id) => {
  $(id).addEventListener("input", render);
});

$("attDate").value = today();
render();
