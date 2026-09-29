const state = {
  patients: [],
  sessions: [],
  appointments: [],
  treatmentAssessments: [],
  selectedPatientId: null,
  view: "painel",
  authMode: "login"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const today = new Date().toISOString().slice(0, 10);

const patientDialog = $("#patientDialog");
const sessionDialog = $("#sessionDialog");
const appointmentDialog = $("#appointmentDialog");
const skinAssessmentDialog = $("#skinAssessmentDialog");
const passwordDialog = $("#passwordDialog");
const patientForm = $("#patientForm");
const sessionForm = $("#sessionForm");
const appointmentForm = $("#appointmentForm");
const skinAssessmentForm = $("#skinAssessmentForm");
const passwordForm = $("#passwordForm");
const authForm = $("#authForm");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Sem data";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function calculateAge(value) {
  if (!value) return "";
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return `${age} anos`;
}

function byDateDesc(a, b) {
  return String(b.date || "").localeCompare(String(a.date || ""));
}

function patientName(id) {
  if (!id) return "Sem paciente vinculado";
  return state.patients.find((patient) => patient.id === id)?.name || "Paciente removido";
}

function patientById(id) {
  return state.patients.find((patient) => patient.id === id);
}

function assessmentById(id) {
  return state.treatmentAssessments.find((assessment) => assessment.id === id);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    showAuth("login");
  }
  if (!response.ok) throw new Error(payload.error || "Nao foi possivel salvar.");
  return payload;
}

function showAuth(mode) {
  state.authMode = mode;
  document.body.classList.add("is-locked");
  $("#authScreen").hidden = false;
  $("#authPassword").value = "";
  $("#authPassword").autocomplete = mode === "setup" ? "new-password" : "current-password";
  $("#authEyebrow").textContent = mode === "setup" ? "Primeiro acesso" : "Seguranca";
  $("#authTitle").textContent = mode === "setup" ? "Crie a senha de acesso" : "Entrar na plataforma";
  $("#authText").textContent =
    mode === "setup"
      ? "Esta senha vai proteger os dados dos pacientes neste computador."
      : "Digite a senha para acessar os dados da clinica.";
  $("#authSubmit").textContent = mode === "setup" ? "Criar senha e entrar" : "Entrar";
  window.setTimeout(() => $("#authPassword").focus(), 50);
}

function hideAuth() {
  $("#authScreen").hidden = true;
  document.body.classList.remove("is-locked");
}

async function checkAuth() {
  const status = await api("/api/auth/status");
  if (!status.configured) {
    showAuth("setup");
    return;
  }
  if (!status.authenticated) {
    showAuth("login");
    return;
  }
  hideAuth();
  await loadState();
}

async function loadState() {
  const payload = await api("/api/state");
  state.patients = payload.patients || [];
  state.sessions = payload.sessions || [];
  state.appointments = payload.appointments || [];
  state.treatmentAssessments = payload.treatmentAssessments || [];
  if (!state.selectedPatientId && state.patients[0]) state.selectedPatientId = state.patients[0].id;
  if (state.selectedPatientId && !patientById(state.selectedPatientId)) {
    state.selectedPatientId = state.patients[0]?.id || null;
  }
  render();
}

function render() {
  renderMetrics();
  renderToday();
  renderUpcomingAppointments();
  renderPriorityPatients();
  renderPatients();
  renderPatientDetail();
  renderSchedule();
  renderTreatments();
  fillAppointmentPatients();
  fillTreatmentPatients();
}

function renderMetrics() {
  const active = state.patients.filter((patient) => patient.status === "ativo").length;
  const todayCount = state.appointments.filter((appointment) => appointment.date === today).length;
  const averagePain = state.patients.length
    ? (state.patients.reduce((sum, patient) => sum + Number(patient.pain || 0), 0) / state.patients.length).toFixed(1)
    : "0";
  const recentSessions = state.sessions.filter((session) => session.date >= addDays(today, -7)).length;
  const assessments = state.treatmentAssessments.length;

  $("#metricGrid").innerHTML = [
    ["Pacientes ativos", active],
    ["Atendimentos hoje", todayCount],
    ["Dor media", averagePain],
    ["Evolucoes em 7 dias", recentSessions],
    ["Avaliacoes de limpeza", assessments]
  ]
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function renderToday() {
  const appointments = state.appointments
    .filter((appointment) => appointment.date === today)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));

  $("#todayAppointments").innerHTML = appointments.length
    ? appointments.map(renderMiniAppointment).join("")
    : `<div class="empty-state">Nenhum atendimento marcado para hoje.</div>`;
}

function renderMiniAppointment(appointment) {
  return `
    <article class="mini-card">
      <div class="appointment-row">
        <div>
          <strong>${escapeHtml(appointment.time)} · ${escapeHtml(patientName(appointment.patientId))}</strong>
          <span class="meta">${escapeHtml(appointment.treatment || "Fisioterapia")} · ${escapeHtml(appointment.therapist || "Sem terapeuta")} · ${escapeHtml(appointment.room || "Sem sala")}</span>
        </div>
        ${statusPill(appointment.status)}
      </div>
    </article>
  `;
}

function appointmentDateTime(appointment) {
  return `${appointment.date || ""} ${appointment.time || "00:00"}`;
}

function renderUpcomingAppointments() {
  const upcoming = state.appointments
    .filter((appointment) => appointment.date > today || (appointment.date === today && appointment.time))
    .filter((appointment) => appointment.status !== "cancelado")
    .sort((a, b) => appointmentDateTime(a).localeCompare(appointmentDateTime(b)))
    .slice(0, 18);

  const root = $("#upcomingAppointments");
  if (!root) return;

  if (!upcoming.length) {
    root.innerHTML = `<div class="empty-state">Nenhum agendamento futuro cadastrado.</div>`;
    return;
  }

  const grouped = upcoming.reduce((groups, appointment) => {
    const key = appointment.date || "Sem data";
    if (!groups[key]) groups[key] = [];
    groups[key].push(appointment);
    return groups;
  }, {});

  root.innerHTML = Object.entries(grouped)
    .map(([date, appointments]) => {
      const countLabel = appointments.length === 1 ? "1 horario" : `${appointments.length} horarios`;
      return `
        <section class="upcoming-day">
          <div class="upcoming-date">
            <strong>${escapeHtml(date === "Sem data" ? date : formatDate(date))}</strong>
            <span>${countLabel}</span>
          </div>
          <div class="stack">
            ${appointments.map(renderUpcomingAppointment).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderUpcomingAppointment(appointment) {
  return `
    <article class="mini-card upcoming-card">
      <div>
        <strong>${escapeHtml(appointment.time || "--:--")} · ${escapeHtml(patientName(appointment.patientId))}</strong>
        <span class="meta">${escapeHtml(appointment.treatment || "Fisioterapia")} · ${escapeHtml(appointment.therapist || "Sem terapeuta")} · ${escapeHtml(appointment.room || "Sem sala")}</span>
      </div>
      ${statusPill(appointment.status)}
    </article>
  `;
}

function renderPriorityPatients() {
  const patients = [...state.patients]
    .filter((patient) => patient.status === "ativo")
    .sort((a, b) => Number(b.pain || 0) - Number(a.pain || 0))
    .slice(0, 4);

  $("#priorityPatients").innerHTML = patients.length
    ? patients
        .map(
          (patient) => `
            <button class="mini-card patient-card" type="button" data-select-patient="${patient.id}">
              <div class="status-row">
                <strong>${escapeHtml(patient.name)}</strong>
                <span>Dor ${Number(patient.pain || 0)}/10</span>
              </div>
              <p class="meta">${escapeHtml(patient.condition || "Sem diagnostico informado")}</p>
              <div class="progress-shell" aria-label="Dor atual">
                <div class="progress-bar" style="width:${Math.min(100, Number(patient.pain || 0) * 10)}%"></div>
              </div>
            </button>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhum paciente ativo cadastrado.</div>`;
}

function renderPatients() {
  const term = $("#searchInput").value.trim().toLowerCase();
  const status = $("#statusFilter").value;
  const patients = state.patients.filter((patient) => {
    const haystack = [patient.name, patient.condition, patient.therapist, patient.phone].join(" ").toLowerCase();
    const matchesTerm = !term || haystack.includes(term);
    const matchesStatus = status === "todos" || patient.status === status;
    return matchesTerm && matchesStatus;
  });

  $("#patientList").innerHTML = patients.length
    ? patients.map(renderPatientCard).join("")
    : `<div class="empty-state">Nenhum paciente encontrado com estes filtros.</div>`;
}

function renderPatientCard(patient) {
  const selected = patient.id === state.selectedPatientId ? " is-selected" : "";
  return `
    <button class="patient-card${selected}" type="button" data-select-patient="${patient.id}">
      <div class="status-row">
        <div>
          <strong>${escapeHtml(patient.name)}</strong>
          <span class="meta">${escapeHtml(patient.condition || "Sem diagnostico")}</span>
        </div>
        ${statusPill(patient.status)}
      </div>
      <div class="status-row meta">
        <span>${escapeHtml(patient.therapist || "Sem terapeuta")}</span>
        <span>Dor ${Number(patient.pain || 0)}/10</span>
      </div>
    </button>
  `;
}

function renderPatientDetail() {
  const patient = patientById(state.selectedPatientId);
  const root = $("#patientDetail");

  if (!patient) {
    root.innerHTML = `<div class="empty-state">Selecione ou cadastre um paciente para ver os detalhes.</div>`;
    return;
  }

  const sessions = state.sessions.filter((session) => session.patientId === patient.id).sort(byDateDesc);
  const appointments = state.appointments
    .filter((appointment) => appointment.patientId === patient.id)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, 4);
  const skinAssessments = state.treatmentAssessments
    .filter((assessment) => assessment.patientId === patient.id)
    .sort(byDateDesc);

  root.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>${escapeHtml(patient.name)}</h2>
        <p class="muted">${escapeHtml(patient.condition || "Sem diagnostico informado")}</p>
      </div>
      <div class="item-actions">
        <button class="button ghost" type="button" data-edit-patient="${patient.id}">Editar</button>
        <button class="button ghost" type="button" data-new-skin-assessment="${patient.id}">Avaliar limpeza de pele</button>
        <button class="button primary" type="button" data-new-session="${patient.id}">Nova evolucao</button>
      </div>
    </div>

    <div class="detail-grid">
      ${detailField("Status", statusPill(patient.status), true)}
      ${detailField("Idade", escapeHtml(calculateAge(patient.birthDate) || "Nao informada"))}
      ${detailField("Telefone", escapeHtml(patient.phone || "Nao informado"))}
      ${detailField("Terapeuta", escapeHtml(patient.therapist || "Nao informado"))}
      ${detailField("Frequencia", escapeHtml(patient.frequency || "Nao informada"))}
      ${detailField("Inicio", escapeHtml(formatDate(patient.startedAt)))}
    </div>

    <section>
      <h3>Plano terapeutico</h3>
      <p class="muted">${escapeHtml(patient.goals || "Nenhum objetivo registrado.")}</p>
      <div class="progress-shell" aria-label="Dor atual">
        <div class="progress-bar" style="width:${Math.min(100, Number(patient.pain || 0) * 10)}%"></div>
      </div>
      <p class="meta">Dor atual: ${Number(patient.pain || 0)}/10</p>
    </section>

    <section>
      <div class="panel-head">
        <h3>Tratamentos esteticos</h3>
        <button class="button ghost" type="button" data-new-skin-assessment="${patient.id}">Nova avaliacao</button>
      </div>
      <div class="timeline">
        ${
          skinAssessments.length
            ? skinAssessments.map(renderSkinAssessment).join("")
            : `<div class="empty-state">Nenhuma avaliacao de limpeza de pele registrada.</div>`
        }
      </div>
    </section>

    <section>
      <div class="panel-head">
        <h3>Evolucoes</h3>
      </div>
      <div class="timeline">
        ${
          sessions.length
            ? sessions.map(renderSession).join("")
            : `<div class="empty-state">Ainda nao ha evolucoes registradas.</div>`
        }
      </div>
    </section>

    <section>
      <div class="panel-head">
        <h3>Proximos horarios</h3>
        <button class="button ghost" type="button" data-new-appointment="${patient.id}">Agendar</button>
      </div>
      <div class="stack">
        ${
          appointments.length
            ? appointments.map(renderMiniAppointment).join("")
            : `<div class="empty-state">Nenhum horario registrado para este paciente.</div>`
        }
      </div>
    </section>

    <div class="dialog-actions">
      <button class="button danger" type="button" data-delete-patient="${patient.id}">Excluir paciente</button>
    </div>
  `;
}

function detailField(label, value, raw = false) {
  return `
    <div class="detail-field">
      <span>${label}</span>
      <strong>${raw ? value : value}</strong>
    </div>
  `;
}

function renderSession(session) {
  return `
    <article class="timeline-item">
      <div class="status-row">
        <strong>${escapeHtml(formatDate(session.date))} · ${escapeHtml(session.type)}</strong>
        <span class="meta">Dor ${Number(session.pain || 0)}/10</span>
      </div>
      <p>${escapeHtml(session.summary)}</p>
      <p class="meta">${escapeHtml(session.plan || "Sem conduta registrada.")}</p>
      <button class="button ghost" type="button" data-delete-session="${session.id}">Remover</button>
    </article>
  `;
}

function renderSkinAssessment(assessment) {
  const procedures = [
    ...(assessment.plan?.indicatedProcedures || []),
    assessment.plan?.otherProcedure
  ].filter(Boolean);
  const conditions = [
    ...(assessment.skin?.observedConditions || []),
    assessment.skin?.otherConditions
  ].filter(Boolean);

  return `
    <article class="timeline-item">
      <div class="status-row">
        <strong>${escapeHtml(formatDate(assessment.date))} · ${escapeHtml(assessment.treatment)}</strong>
        <span class="meta">${escapeHtml(assessment.plan?.recommendedFrequency || "Sem frequencia")}</span>
      </div>
      <p>${escapeHtml(assessment.plan?.diagnosis || "Sem diagnostico estetico registrado.")}</p>
      <p class="meta">Procedimento: ${escapeHtml(procedures.join(", ") || "Nao informado")}</p>
      <p class="meta">Condicoes: ${escapeHtml(conditions.join(", ") || "Nao informadas")}</p>
      <div class="item-actions">
        <button class="button ghost" type="button" data-print-skin-assessment="${assessment.id}">Imprimir</button>
        <button class="button ghost" type="button" data-delete-skin-assessment="${assessment.id}">Remover</button>
      </div>
    </article>
  `;
}

function renderTreatments() {
  const treatmentFilter = $("#treatmentFilter")?.value || "todos";
  const patientFilter = $("#treatmentPatientFilter")?.value || "todos";
  const assessments = state.treatmentAssessments
    .filter((assessment) => treatmentFilter === "todos" || assessment.treatment === treatmentFilter)
    .filter((assessment) => patientFilter === "todos" || assessment.patientId === patientFilter)
    .sort(byDateDesc);

  $("#treatmentList").innerHTML = assessments.length
    ? assessments
        .map(
          (assessment) => `
            <article class="schedule-card">
              <div class="time-block">${escapeHtml(formatDate(assessment.date))}</div>
              <div>
                <strong>${escapeHtml(patientName(assessment.patientId))}</strong>
                <p class="meta">${escapeHtml(assessment.treatment)} · ${escapeHtml(assessment.plan?.recommendedFrequency || "Sem frequencia")}</p>
                <p class="muted">${escapeHtml(assessment.plan?.objective || assessment.plan?.diagnosis || "Sem objetivo registrado.")}</p>
              </div>
              <div class="stack">
                <button class="button ghost" type="button" data-select-patient="${assessment.patientId}">Ver paciente</button>
                <button class="button ghost" type="button" data-print-skin-assessment="${assessment.id}">Imprimir</button>
                <button class="button ghost" type="button" data-delete-skin-assessment="${assessment.id}">Remover</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhuma avaliacao encontrada.</div>`;
}

function renderSchedule() {
  const selectedDate = $("#agendaDate").value || today;
  const status = $("#agendaStatus").value;
  const appointments = state.appointments
    .filter((appointment) => appointment.date === selectedDate)
    .filter((appointment) => status === "todos" || appointment.status === status)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));

  $("#scheduleList").innerHTML = appointments.length
    ? appointments.map(renderScheduleCard).join("")
    : `<div class="empty-state">Nenhum horario encontrado para esta data.</div>`;
}

function renderScheduleCard(appointment) {
  return `
    <article class="schedule-card">
      <div class="time-block">${escapeHtml(appointment.time)}</div>
      <div>
        <strong>${escapeHtml(patientName(appointment.patientId))}</strong>
        <p class="meta">${escapeHtml(appointment.treatment || "Fisioterapia")} · ${escapeHtml(appointment.therapist || "Sem terapeuta")} · ${escapeHtml(appointment.duration)} min · ${escapeHtml(appointment.room || "Sem sala")}</p>
        <p class="muted">${escapeHtml(appointment.notes || "Sem observacoes.")}</p>
      </div>
      <div class="stack">
        ${statusPill(appointment.status)}
        <select data-update-appointment="${appointment.id}" aria-label="Alterar status de ${escapeHtml(patientName(appointment.patientId))}">
          ${["agendado", "confirmado", "realizado", "cancelado"]
            .map((status) => `<option value="${status}" ${appointment.status === status ? "selected" : ""}>${capitalize(status)}</option>`)
            .join("")}
        </select>
        <button class="button ghost" type="button" data-delete-appointment="${appointment.id}">Remover</button>
      </div>
    </article>
  `;
}

function statusPill(status) {
  const normalized = status || "ativo";
  return `<span class="status-pill status-${escapeHtml(normalized)}">${escapeHtml(capitalize(normalized))}</span>`;
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fillAppointmentPatients() {
  const select = appointmentForm.elements.patientId;
  const current = select.value;
  select.innerHTML = state.patients
    .map((patient) => `<option value="${patient.id}">${escapeHtml(patient.name)}</option>`)
    .join("");
  if (current) select.value = current;
}

function fillTreatmentPatients() {
  const select = $("#treatmentPatientFilter");
  if (!select) return;
  const current = select.value || "todos";
  select.innerHTML = [
    `<option value="todos">Todos os pacientes</option>`,
    ...state.patients.map((patient) => `<option value="${patient.id}">${escapeHtml(patient.name)}</option>`)
  ].join("");
  select.value = state.patients.some((patient) => patient.id === current) ? current : "todos";

  const assessmentPatient = $("#skinAssessmentPatient");
  if (assessmentPatient) {
    const selected = assessmentPatient.value;
    assessmentPatient.innerHTML = state.patients
      .map((patient) => `<option value="${patient.id}">${escapeHtml(patient.name)}</option>`)
      .join("");
    if (selected) assessmentPatient.value = selected;
  }
}

function switchView(view) {
  state.view = view;
  $$(".view").forEach((element) => element.classList.toggle("is-visible", element.id === `view-${view}`));
  $$("[data-view-link]").forEach((link) => link.classList.toggle("is-active", link.dataset.viewLink === view));
}

function openPatientDialog(patient = null) {
  patientForm.reset();
  $("#patientDialogTitle").textContent = patient ? "Editar paciente" : "Novo paciente";
  const values = patient || { status: "ativo", pain: 0, startedAt: today };
  for (const [key, value] of Object.entries(values)) {
    if (patientForm.elements[key]) patientForm.elements[key].value = value ?? "";
  }
  patientDialog.showModal();
}

function openSessionDialog(patientId) {
  sessionForm.reset();
  sessionForm.elements.patientId.value = patientId;
  sessionForm.elements.date.value = today;
  sessionDialog.showModal();
}

function openAppointmentDialog(patientId = "") {
  appointmentForm.reset();
  fillAppointmentPatients();
  appointmentForm.elements.date.value = $("#agendaDate").value || today;
  appointmentForm.elements.time.value = "08:00";
  appointmentForm.elements.duration.value = "50";
  if (patientId) appointmentForm.elements.patientId.value = patientId;
  appointmentDialog.showModal();
}

function formToObject(form) {
  const data = {};
  const formData = new FormData(form);
  for (const [key, value] of formData.entries()) {
    if (Object.hasOwn(data, key)) {
      data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    } else {
      data[key] = value;
    }
  }
  return data;
}

function setupSignaturePads() {
  $$("[data-signature-pad]").forEach((canvas) => {
    const context = canvas.getContext("2d");
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#142327";
    canvas.dataset.empty = "true";
    let drawing = false;

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    };

    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const current = point(event);
      context.beginPath();
      context.moveTo(current.x, current.y);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      const current = point(event);
      context.lineTo(current.x, current.y);
      context.stroke();
      canvas.dataset.empty = "false";
    });

    const stop = () => {
      drawing = false;
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("pointerleave", stop);
  });
}

function clearSignature(name) {
  const canvas = $(`[data-signature-pad="${name}"]`);
  if (!canvas) return;
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  canvas.dataset.empty = "true";
  if (skinAssessmentForm.elements[name]) skinAssessmentForm.elements[name].value = "";
}

function resetSignatures() {
  clearSignature("clientSignature");
  clearSignature("professionalSignature");
}

function captureSignatures() {
  $$("[data-signature-pad]").forEach((canvas) => {
    const inputName = canvas.dataset.signaturePad;
    const input = skinAssessmentForm.elements[inputName];
    if (input) input.value = canvas.dataset.empty === "false" ? canvas.toDataURL("image/png") : "";
  });
}

function printableValue(value) {
  return escapeHtml(value || "-");
}

function listText(items, fallback = "-") {
  const values = (items || []).filter(Boolean);
  return escapeHtml(values.length ? values.join(", ") : fallback);
}

function yesNoText(item) {
  if (!item?.answer && !item?.details) return "-";
  return escapeHtml([item.answer, item.details].filter(Boolean).join(" - "));
}

function printField(label, value) {
  return `<div class="print-field"><span>${label}</span><strong>${value}</strong></div>`;
}

function printSignature(label, image) {
  const content = image
    ? `<img src="${image}" alt="${label}">`
    : `<div class="print-empty-signature"></div>`;
  return `<div class="print-signature">${content}<span>${label}</span></div>`;
}

function printSkinAssessment(assessment) {
  const patient = patientById(assessment.patientId) || {};
  const printWindow = window.open("", "_blank", "width=900,height=1100");
  if (!printWindow) {
    showToast("Permita pop-ups para imprimir a ficha.");
    return;
  }

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Ficha de limpeza de pele - ${escapeHtml(patient.name || "Paciente")}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; color: #111; font-family: Arial, sans-serif; font-size: 13px; }
          header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
          h1 { margin: 0; font-size: 20px; text-transform: uppercase; }
          h2 { margin: 16px 0 8px; padding: 8px 10px; border-radius: 6px; color: white; background: #08b99f; font-size: 17px; }
          .brand { display: flex; align-items: center; gap: 12px; color: #11bfd3; font-size: 22px; font-weight: 700; }
          .print-logo { width: 118px; height: 76px; object-fit: contain; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .print-field { min-height: 42px; border: 1px solid #222; border-radius: 6px; padding: 7px 9px; }
          .print-field.wide { grid-column: 1 / -1; }
          .print-field span { display: block; color: #555; font-size: 11px; text-transform: uppercase; }
          .print-field strong { display: block; margin-top: 4px; white-space: pre-wrap; font-weight: 600; }
          .term { margin: 28px 0 16px; line-height: 1.45; text-align: center; }
          .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
          .print-signature { border: 1px solid #222; border-radius: 6px; padding: 8px; min-height: 92px; display: grid; align-content: end; }
          .print-signature img { max-width: 100%; max-height: 58px; object-fit: contain; margin: 0 auto 6px; display: block; }
          .print-empty-signature { height: 58px; border-bottom: 1px solid #222; margin-bottom: 6px; }
          .print-signature span { font-size: 12px; }
          @media print {
            body { padding: 14mm; }
            h2 { break-after: avoid; }
            .print-field, .print-signature { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <div class="brand"><img class="print-logo" src="/logo-sistema-v2.png" alt="Dra. Paula Moura Fisioterapeuta"><span>Ana Paula Fisioterapeuta</span></div>
            <div>Ficha digital da plataforma</div>
          </div>
          <h1>Ficha de avaliacao - limpeza de pele</h1>
        </header>

        <h2>Identificacao pessoal</h2>
        <div class="grid grid-3">
          ${printField("Nome", printableValue(patient.name))}
          ${printField("Data de nascimento", printableValue(formatDate(patient.birthDate)))}
          ${printField("Idade", printableValue(calculateAge(patient.birthDate)))}
          ${printField("Sexo", printableValue(assessment.sex))}
          ${printField("Profissao", printableValue(patient.occupation))}
          ${printField("Telefone", printableValue(patient.phone))}
          ${printField("Data da avaliacao", printableValue(formatDate(assessment.date)))}
        </div>

        <h2>Historico de saude</h2>
        <div class="grid">
          ${printField("Possui alguma doenca?", yesNoText(assessment.health?.disease))}
          ${printField("Medicamentos continuos", yesNoText(assessment.health?.medication))}
          ${printField("Alergias", yesNoText(assessment.health?.allergy))}
          ${printField("Gestante", printableValue(assessment.health?.pregnant))}
          ${printField("Procedimentos esteticos faciais", yesNoText(assessment.health?.previousFacialProcedure))}
        </div>

        <h2>Habitos e rotina de cuidados</h2>
        <div class="grid">
          ${printField("Usa protetor solar diariamente?", printableValue(assessment.habits?.sunscreen))}
          ${printField("Frequencia de limpeza facial", printableValue(assessment.habits?.cleaningFrequency))}
          ${printField("Produtos que utiliza em casa", printableValue(assessment.habits?.homeProducts))}
        </div>

        <h2>Avaliacao da pele</h2>
        <div class="grid">
          ${printField("Tipo de pele", listText(assessment.skin?.skinTypes))}
          ${printField("Fototipo", printableValue(assessment.skin?.phototype))}
          ${printField("Condicoes observadas", listText(assessment.skin?.observedConditions))}
          ${printField("Outros", printableValue(assessment.skin?.otherConditions))}
        </div>

        <h2>Plano do tratamento</h2>
        <div class="grid">
          ${printField("Diagnostico estetico", printableValue(assessment.plan?.diagnosis))}
          ${printField("Objetivo do tratamento", printableValue(assessment.plan?.objective))}
          ${printField("Procedimento indicado", listText([...(assessment.plan?.indicatedProcedures || []), assessment.plan?.otherProcedure]))}
          ${printField("Frequencia recomendada", printableValue(assessment.plan?.recommendedFrequency))}
          ${printField("Orientacoes ao cliente", printableValue(assessment.plan?.clientGuidance))}
        </div>

        <p class="term">Declaro que fui devidamente avaliado(a), orientado(a) sobre o procedimento de limpeza de pele, seus beneficios, possiveis efeitos, cuidados recomendados e contraindicações, autorizando a realizacao do atendimento.</p>

        <div class="signatures">
          ${printSignature("Assinatura do cliente", assessment.signatures?.client)}
          ${printSignature("Assinatura do profissional", assessment.signatures?.professional)}
        </div>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 300);
}

function openSkinAssessmentDialog(patientId = "") {
  skinAssessmentForm.reset();
  resetSignatures();
  fillTreatmentPatients();
  const selectedPatientId = patientId || state.selectedPatientId || state.patients[0]?.id || "";
  const patientSelect = $("#skinAssessmentPatient");
  if (patientSelect) patientSelect.value = selectedPatientId;
  if (skinAssessmentForm.elements.patientId) skinAssessmentForm.elements.patientId.value = selectedPatientId;
  if (skinAssessmentForm.elements.date) skinAssessmentForm.elements.date.value = today;
  skinAssessmentDialog.showModal();
}

patientForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  try {
    const body = formToObject(patientForm);
    const id = body.id;
    const saved = await api(id ? `/api/patients/${id}` : "/api/patients", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    state.selectedPatientId = saved.id;
    patientDialog.close();
    await loadState();
    switchView("pacientes");
    showToast("Paciente salvo.");
  } catch (error) {
    showToast(error.message);
  }
});

sessionForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  try {
    await api("/api/sessions", { method: "POST", body: JSON.stringify(formToObject(sessionForm)) });
    sessionDialog.close();
    await loadState();
    showToast("Evolucao registrada.");
  } catch (error) {
    showToast(error.message);
  }
});

appointmentForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  try {
    await api("/api/appointments", { method: "POST", body: JSON.stringify(formToObject(appointmentForm)) });
    appointmentDialog.close();
    await loadState();
    showToast("Agendamento salvo.");
  } catch (error) {
    showToast(error.message);
  }
});

skinAssessmentForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  try {
    captureSignatures();
    await api("/api/treatment-assessments", {
      method: "POST",
      body: JSON.stringify(formToObject(skinAssessmentForm))
    });
    skinAssessmentDialog.close();
    await loadState();
    switchView("tratamentos");
    showToast("Avaliacao de limpeza de pele salva.");
  } catch (error) {
    showToast(error.message);
  }
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const password = $("#authPassword").value;
    const path = state.authMode === "setup" ? "/api/auth/setup" : "/api/auth/login";
    await api(path, { method: "POST", body: JSON.stringify({ password }) });
    hideAuth();
    await loadState();
    showToast(state.authMode === "setup" ? "Senha criada." : "Acesso liberado.");
  } catch (error) {
    showToast(error.message);
  }
});

passwordForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  try {
    await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(formToObject(passwordForm))
    });
    passwordDialog.close();
    passwordForm.reset();
    showAuth("login");
    showToast("Senha alterada. Entre novamente.");
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("click", async (event) => {
  const selectPatient = event.target.closest("[data-select-patient]");
  if (selectPatient) {
    state.selectedPatientId = selectPatient.dataset.selectPatient;
    switchView("pacientes");
    render();
    return;
  }

  const editPatient = event.target.closest("[data-edit-patient]");
  if (editPatient) {
    openPatientDialog(patientById(editPatient.dataset.editPatient));
    return;
  }

  const newSession = event.target.closest("[data-new-session]");
  if (newSession) {
    openSessionDialog(newSession.dataset.newSession);
    return;
  }

  const newAppointment = event.target.closest("[data-new-appointment]");
  if (newAppointment) {
    openAppointmentDialog(newAppointment.dataset.newAppointment);
    return;
  }

  const newSkinAssessment = event.target.closest("[data-new-skin-assessment]");
  if (newSkinAssessment) {
    openSkinAssessmentDialog(newSkinAssessment.dataset.newSkinAssessment);
    return;
  }

  const clearSignatureButton = event.target.closest("[data-clear-signature]");
  if (clearSignatureButton) {
    clearSignature(clearSignatureButton.dataset.clearSignature);
    return;
  }

  const printSkinAssessmentButton = event.target.closest("[data-print-skin-assessment]");
  if (printSkinAssessmentButton) {
    const assessment = assessmentById(printSkinAssessmentButton.dataset.printSkinAssessment);
    if (assessment) printSkinAssessment(assessment);
    return;
  }

  const deletePatient = event.target.closest("[data-delete-patient]");
  if (deletePatient && confirm("Excluir este paciente e todos os registros vinculados?")) {
    await api(`/api/patients/${deletePatient.dataset.deletePatient}`, { method: "DELETE" });
    await loadState();
    showToast("Paciente excluido.");
    return;
  }

  const deleteSession = event.target.closest("[data-delete-session]");
  if (deleteSession && confirm("Remover esta evolucao?")) {
    await api(`/api/sessions/${deleteSession.dataset.deleteSession}`, { method: "DELETE" });
    await loadState();
    showToast("Evolucao removida.");
    return;
  }

  const deleteAppointment = event.target.closest("[data-delete-appointment]");
  if (deleteAppointment && confirm("Remover este agendamento?")) {
    await api(`/api/appointments/${deleteAppointment.dataset.deleteAppointment}`, { method: "DELETE" });
    await loadState();
    showToast("Agendamento removido.");
    return;
  }

  const deleteSkinAssessment = event.target.closest("[data-delete-skin-assessment]");
  if (deleteSkinAssessment && confirm("Remover esta avaliacao de limpeza de pele?")) {
    await api(`/api/treatment-assessments/${deleteSkinAssessment.dataset.deleteSkinAssessment}`, { method: "DELETE" });
    await loadState();
    showToast("Avaliacao removida.");
  }
});

document.addEventListener("change", async (event) => {
  const appointmentStatus = event.target.closest("[data-update-appointment]");
  if (!appointmentStatus) return;
  const appointment = state.appointments.find((item) => item.id === appointmentStatus.dataset.updateAppointment);
  if (!appointment) return;
  await api(`/api/appointments/${appointment.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...appointment, status: appointmentStatus.value })
  });
  await loadState();
  showToast("Status atualizado.");
});

$$("[data-view-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    switchView(link.dataset.viewLink);
  });
});

$$("[data-view-link-button]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewLinkButton));
});

$("#newPatientButton").addEventListener("click", () => openPatientDialog());
$("#refreshButton").addEventListener("click", () => loadState().then(() => showToast("Dados atualizados.")));
$("#logoutButton").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  showAuth("login");
  showToast("Voce saiu da plataforma.");
});
$("#changePasswordButton").addEventListener("click", () => {
  passwordForm.reset();
  passwordDialog.showModal();
});
$("#quickAppointmentButton").addEventListener("click", () => openAppointmentDialog(state.selectedPatientId));
$("#newAppointmentButton").addEventListener("click", () => openAppointmentDialog(state.selectedPatientId));
$("#newSkinAssessmentButton").addEventListener("click", () => openSkinAssessmentDialog(state.selectedPatientId));
$("#searchInput").addEventListener("input", renderPatients);
$("#statusFilter").addEventListener("change", renderPatients);
$("#agendaDate").addEventListener("change", renderSchedule);
$("#agendaStatus").addEventListener("change", renderSchedule);
$("#treatmentFilter").addEventListener("change", renderTreatments);
$("#treatmentPatientFilter").addEventListener("change", renderTreatments);
$("#skinAssessmentPatient").addEventListener("change", (event) => {
  if (skinAssessmentForm.elements.patientId) skinAssessmentForm.elements.patientId.value = event.target.value;
});

$("#agendaDate").value = today;
setupSignaturePads();
checkAuth().catch((error) => {
  showAuth("login");
  showToast(error.message);
});
