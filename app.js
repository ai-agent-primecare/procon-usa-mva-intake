/* Procon USA Law — MVA Intake Wizard
   Data-driven, single-question-per-screen wizard implementing the full
   MVA Check List intake (6-page paper form) as branching multiple-choice steps. */

(function(){

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
const state = {
  answers: {},   // id -> value (string | array | object)
  clients: [],   // [{name, role}]
  index: 0
};

/* Where the completed intake gets emailed. No third-party relay is used —
   the PDF is generated and downloaded locally, then a pre-filled email
   draft opens in the user's own mail client (mailto:). Nothing leaves the
   browser except through the user's own email account. */
const INTAKE_EMAIL = "ai-agent@rockwood-enterprise.com";

/* ---------------------------------------------------------
   HELPERS to build question objects
--------------------------------------------------------- */
function q(id, section, label, type, opts){
  return Object.assign({id, section, label, type}, opts||{});
}

/* ---------------------------------------------------------
   OCCUPANTS / CLIENTS BRANCHING (Section: "Occupants")
--------------------------------------------------------- */
const occupantsFlow = [
  q("numPeople","Occupants","How many people were in the car accident?","single",{
    options:["1","2","3","4","5","6","7","8"], required:true
  }),
  q("singleRole","Occupants","Is this person driver or passenger?","single",{
    options:["Driver","Passenger"], required:true,
    condition: s => s.answers.numPeople === "1"
  }),
  q("singleName","Occupants","Write the name","text",{
    required:true,
    labelFn: s => s.answers.singleRole === "Driver" ? "Driver Name" : "Passenger Name",
    condition: s => s.answers.numPeople === "1" && !!s.answers.singleRole
  }),
  q("allClients","Occupants","Is everyone our client?","single",{
    options:["Yes","No"], required:true,
    condition: s => s.answers.numPeople && s.answers.numPeople !== "1"
  }),
  q("clientNamesAll","Occupants","Write each person's name","names",{
    required:true,
    countFn: s => parseInt(s.answers.numPeople,10),
    condition: s => s.answers.allClients === "Yes"
  }),
  q("numClients","Occupants","How many of them will be clients?","single",{
    required:true,
    optionsFn: s => { const n = parseInt(s.answers.numPeople,10)||1; const arr=[]; for(let i=1;i<=n;i++) arr.push(String(i)); return arr; },
    condition: s => s.answers.allClients === "No"
  }),
  q("clientNamesPartial","Occupants","Write the name of each client","names",{
    required:true,
    countFn: s => parseInt(s.answers.numClients,10),
    condition: s => s.answers.allClients === "No" && !!s.answers.numClients
  })
];

/* ---------------------------------------------------------
   ACCIDENT INFO (asked right after occupants/client names)
--------------------------------------------------------- */
const accidentInfoFlow = [
  q("accidentDate","Accident Info","Day of accident (DOL)","date",{}),
  q("accidentTime","Accident Info","Time of accident","time12",{placeholder:"e.g. 2:30"}),
  q("accidentPlace","Accident Info","Place of accident","text",{}),
  q("policeCame","Accident Info","Did the police come to the scene?","single",{
    options:["Yes, state police","Yes, local police","No","Doesn't know"]
  }),
  q("policeReport","Accident Info","Did the police make a report?","single",{
    options:[
      "Yes, we have a copy",
      "Yes, we are waiting a copy from client",
      "Yes, but only exchange report",
      "No",
      "Client doesn't know"
    ]
  }),
  q("citation","Accident Info","Police gave a citation","single",{
    options:["Yes","No","Doesn't know"]
  }),
  q("citationType","Accident Info","What type of fine was it?","text",{
    condition: s => s.answers.citation === "Yes"
  }),
  q("carsInvolved","Accident Info","How many cars were involved in the accident?","single",{
    options:["1","2","3","4","5","6","7","8"]
  }),
  q("carPosition","Accident Info","What position was the car in line?","single",{
    options:["1","2","3","4","5","6","7","8"],
    condition: s => (parseInt(s.answers.carsInvolved,10)||0) >= 3
  }),
  q("impactsFelt","Accident Info","How many impacts did they feel?","single",{
    options:["1","2","3","4","5","6"],
    condition: s => (parseInt(s.answers.carsInvolved,10)||0) >= 3
  })
];

/* ---------------------------------------------------------
   BUILD FULL FLOW (recomputed live based on state)
--------------------------------------------------------- */
function computeClients(s){
  const n = parseInt(s.answers.numPeople,10);
  if(!n) return [];
  if(n === 1){
    if(!s.answers.singleName) return [];
    return [{name:s.answers.singleName, role:s.answers.singleRole||""}];
  }
  if(s.answers.allClients === "Yes"){
    const names = s.answers.clientNamesAll || [];
    return names.filter(Boolean).map(nm=>({name:nm, role:""}));
  }
  if(s.answers.allClients === "No"){
    const names = s.answers.clientNamesPartial || [];
    return names.filter(Boolean).map(nm=>({name:nm, role:""}));
  }
  return [];
}

function buildFlow(){
  state.clients = computeClients(state);
  return [
    ...occupantsFlow,
    ...accidentInfoFlow
  ];
}

function visibleFlow(){
  return buildFlow().filter(f => f.condition ? f.condition(state) : true);
}

/* ---------------------------------------------------------
   RENDERING
--------------------------------------------------------- */
const app = document.getElementById("app");
const progressBar = document.getElementById("progressBar");
const sectionLabel = document.getElementById("sectionLabel");

function currentLabel(f){
  if(f.labelFn) return f.labelFn(state);
  if(f.titlePrefix) return `${f.titlePrefix()}: ${f.label}`;
  return f.label;
}

function renderWelcome(){
  progressBar.style.width = "0%";
  sectionLabel.textContent = "";
  app.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card welcome-card";
  card.innerHTML = `
    <h2 class="question-title">MVA Intake — Procon USA Law</h2>
    <p>Answer each question by clicking a choice. Your progress is saved as you go, and you'll get a downloadable PDF summary at the end.</p>
    <div class="nav-row" style="justify-content:center;">
      <button class="btn btn-primary" id="startBtn">Start Intake</button>
    </div>
  `;
  app.appendChild(card);
  document.getElementById("startBtn").onclick = ()=>{ state.index = 0; render(); };
}

function render(){
  const flow = visibleFlow();
  if(state.index >= flow.length){
    renderReview();
    return;
  }
  const f = flow[state.index];
  progressBar.style.width = Math.round((state.index/(flow.length+1))*100) + "%";
  sectionLabel.textContent = f.section;

  app.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("h2");
  title.className = "question-title";
  title.textContent = currentLabel(f);
  card.appendChild(title);

  const body = document.createElement("div");
  card.appendChild(body);

  let currentVal = state.answers[f.id];

  if(f.type === "single"){
    const opts = f.optionsFn ? f.optionsFn(state) : f.options;
    const grid = document.createElement("div");
    grid.className = opts.length > 6 ? "options-list" : "options-grid";
    opts.forEach(opt=>{
      const btn = document.createElement("button");
      btn.className = "option-btn" + (currentVal===opt ? " selected":"");
      btn.textContent = opt;
      btn.onclick = ()=>{ state.answers[f.id] = opt; goNext(); };
      grid.appendChild(btn);
    });
    body.appendChild(grid);
    body.appendChild(navButtons(f, false));
  }
  else if(f.type === "multi"){
    const wrap = document.createElement("div");
    wrap.className = "options-list";
    const arr = Array.isArray(currentVal) ? currentVal.slice() : [];
    f.options.forEach(opt=>{
      const row = document.createElement("label");
      row.className = "check-row" + (arr.includes(opt) ? " selected":"");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = arr.includes(opt);
      cb.onchange = ()=>{
        const set = new Set(Array.isArray(state.answers[f.id])?state.answers[f.id]:[]);
        if(cb.checked) set.add(opt); else set.delete(opt);
        state.answers[f.id] = Array.from(set);
        row.classList.toggle("selected", cb.checked);
      };
      row.appendChild(cb);
      row.appendChild(document.createTextNode(opt));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
    body.appendChild(navButtons(f, true));
  }
  else if(f.type === "text" || f.type === "date"){
    const input = document.createElement("input");
    input.type = f.type === "date" ? "date" : "text";
    if(f.placeholder) input.placeholder = f.placeholder;
    input.value = currentVal || (f.defaultValueFn ? f.defaultValueFn(state) : "") || "";
    input.oninput = ()=>{ state.answers[f.id] = input.value; };
    input.onkeydown = (e)=>{ if(e.key==="Enter"){ goNext(); } };
    body.appendChild(input);
    setTimeout(()=>input.focus(), 30);
    body.appendChild(navButtons(f, true));
  }
  else if(f.type === "time12"){
    const match = /^(.*?)\s*(AM|PM)?$/i.exec((currentVal||"").trim());
    let hourPart = (match && match[1]) ? match[1].trim() : (currentVal||"");
    let period = (match && match[2]) ? match[2].toUpperCase() : "";

    const input = document.createElement("input");
    input.type = "text";
    if(f.placeholder) input.placeholder = f.placeholder;
    input.value = hourPart;
    const combine = ()=>{
      const h = input.value.trim();
      state.answers[f.id] = period ? (h ? `${h} ${period}` : period) : h;
    };
    input.oninput = ()=>{ combine(); };
    input.onkeydown = (e)=>{ if(e.key==="Enter"){ goNext(); } };
    body.appendChild(input);
    setTimeout(()=>input.focus(), 30);

    const ampmRow = document.createElement("div");
    ampmRow.className = "options-grid";
    ampmRow.style.marginTop = "10px";
    ["AM","PM"].forEach(p=>{
      const btn = document.createElement("button");
      btn.className = "option-btn" + (period===p ? " selected":"");
      btn.textContent = p;
      btn.onclick = ()=>{ period = p; combine(); goNext(); };
      ampmRow.appendChild(btn);
    });
    body.appendChild(ampmRow);
    body.appendChild(navButtons(f, true));
  }
  else if(f.type === "textarea"){
    const ta = document.createElement("textarea");
    ta.value = currentVal || "";
    ta.oninput = ()=>{ state.answers[f.id] = ta.value; };
    body.appendChild(ta);
    body.appendChild(navButtons(f, true));
  }
  else if(f.type === "names"){
    const count = f.countFn(state) || 0;
    const arr = Array.isArray(currentVal) ? currentVal.slice() : new Array(count).fill("");
    for(let i=0;i<count;i++){
      const wrap = document.createElement("div");
      wrap.className = "names-line";
      const lbl = document.createElement("label");
      lbl.className = "field-label";
      lbl.textContent = `Person ${i+1} name`;
      const input = document.createElement("input");
      input.type = "text";
      input.value = arr[i] || "";
      input.oninput = ()=>{
        const cur = Array.isArray(state.answers[f.id]) ? state.answers[f.id].slice() : new Array(count).fill("");
        cur[i] = input.value;
        state.answers[f.id] = cur;
      };
      wrap.appendChild(lbl);
      wrap.appendChild(input);
      body.appendChild(wrap);
    }
    body.appendChild(navButtons(f, true));
  }

  app.appendChild(card);
}

function navButtons(f, showNext){
  const row = document.createElement("div");
  row.className = "nav-row";
  const back = document.createElement("button");
  back.className = "btn btn-secondary";
  back.textContent = "← Back";
  back.disabled = state.index === 0;
  back.onclick = goBack;
  row.appendChild(back);

  if(showNext){
    const next = document.createElement("button");
    next.className = "btn btn-primary";
    next.textContent = "Continue →";
    next.onclick = goNext;
    row.appendChild(next);
  } else {
    const skip = document.createElement("button");
    skip.className = "btn btn-ghost";
    skip.textContent = f.required ? "" : "Skip →";
    if(!f.required){ skip.onclick = ()=>{ state.answers[f.id] = state.answers[f.id] || ""; goNext(); }; row.appendChild(skip); }
  }
  return row;
}

function goNext(){ state.index++; render(); }
function goBack(){ if(state.index>0){ state.index--; render(); } }

/* ---------------------------------------------------------
   REVIEW / EXPORT
--------------------------------------------------------- */
function groupBySection(flow){
  const groups = {};
  const order = [];
  flow.forEach(f=>{
    if(!groups[f.section]){ groups[f.section]=[]; order.push(f.section); }
    groups[f.section].push(f);
  });
  return {groups, order};
}

function fmtVal(v){
  if(Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if(!v) return "—";
  return v;
}

function renderReview(){
  progressBar.style.width = "100%";
  sectionLabel.textContent = "Review";
  const flow = visibleFlow();
  const {groups, order} = groupBySection(flow);

  app.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  card.style.maxWidth = "760px";

  const title = document.createElement("h2");
  title.className = "question-title";
  title.textContent = "Review & Export";
  card.appendChild(title);

  const sub = document.createElement("p");
  sub.className = "question-sub";
  sub.textContent = `Review the intake below, then download a PDF summary for the file — or click Email to download the PDF and open a pre-filled draft to ${INTAKE_EMAIL} (attach the PDF and hit Send).`;
  card.appendChild(sub);

  const reviewWrap = document.createElement("div");
  order.forEach(sec=>{
    const secDiv = document.createElement("div");
    secDiv.className = "review-section";
    const h3 = document.createElement("h3");
    h3.textContent = sec;
    secDiv.appendChild(h3);
    groups[sec].forEach(f=>{
      const val = state.answers[f.id];
      if(val === undefined) return;
      const item = document.createElement("div");
      item.className = "review-item";
      const l = document.createElement("span"); l.className="rlabel"; l.textContent = currentLabel(f);
      const v = document.createElement("span"); v.className="rval"; v.textContent = fmtVal(val);
      item.appendChild(l); item.appendChild(v);
      secDiv.appendChild(item);
    });
    reviewWrap.appendChild(secDiv);
  });
  card.appendChild(reviewWrap);

  const actions = document.createElement("div");
  actions.className = "export-actions";
  actions.innerHTML = `
    <button class="btn btn-primary" id="emailBtn">✉ Email to ${INTAKE_EMAIL}</button>
    <button class="btn btn-secondary" id="pdfBtn">⬇ Download PDF</button>
    <button class="btn btn-secondary" id="editBtn">← Edit Answers</button>
    <button class="btn btn-ghost" id="restartBtn">Start New Intake</button>
  `;
  card.appendChild(actions);

  const statusLine = document.createElement("p");
  statusLine.id = "sendStatus";
  statusLine.className = "footer-note";
  card.appendChild(statusLine);

  app.appendChild(card);

  document.getElementById("editBtn").onclick = ()=>{ state.index = Math.max(0, visibleFlow().length-1); render(); };
  document.getElementById("restartBtn").onclick = ()=>{
    if(confirm("Start a brand new intake? This clears all current answers.")){
      state.answers = {}; state.clients=[]; state.index = -1; renderWelcome();
    }
  };
  document.getElementById("pdfBtn").onclick = ()=> exportPDF(order, groups);
  document.getElementById("emailBtn").onclick = ()=> emailIntake(order, groups);
}

/* Builds the shared printable summary markup used by both the PDF export
   and the emailed PDF attachment. */
function buildSummaryHtml(order, groups){
  let html = `<div style="font-family:Georgia,serif;padding:10px;">
    <h1 style="color:#111;border-bottom:3px solid #d4af37;padding-bottom:8px;">Procon USA Law — MVA Intake Summary</h1>
    <p style="color:#666;font-size:12px;">Generated ${new Date().toLocaleString()}</p>`;
  order.forEach(sec=>{
    const rows = groups[sec].filter(f=>state.answers[f.id]!==undefined);
    if(!rows.length) return;
    html += `<h2 style="font-size:15px;color:#a8842a;border-bottom:1px solid #ddd;margin-top:20px;">${sec}</h2>`;
    rows.forEach(f=>{
      html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px dashed #eee;">
        <span style="color:#555;">${currentLabel(f)}</span>
        <strong>${fmtVal(state.answers[f.id])}</strong>
      </div>`;
    });
  });
  html += `</div>`;
  return html;
}

/* Plain-text version for the email body (in case the attachment doesn't
   render, or as a fallback for text-only clients). */
function buildSummaryText(order, groups){
  let lines = [`Procon USA Law — MVA Intake Summary`, `Generated ${new Date().toLocaleString()}`, ""];
  order.forEach(sec=>{
    const rows = groups[sec].filter(f=>state.answers[f.id]!==undefined);
    if(!rows.length) return;
    lines.push(`-- ${sec} --`);
    rows.forEach(f=>{
      lines.push(`${currentLabel(f)}: ${fmtVal(state.answers[f.id])}`);
    });
    lines.push("");
  });
  return lines.join("\n");
}

const PDF_OPT = {
  margin: 10,
  filename: 'procon-usa-mva-intake.pdf',
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { scale: 2 },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
};

function exportPDF(order, groups){
  const printDiv = document.createElement("div");
  printDiv.id = "printArea";
  printDiv.innerHTML = buildSummaryHtml(order, groups);
  document.body.appendChild(printDiv);

  html2pdf().set(PDF_OPT).from(printDiv).save().then(()=>{
    document.body.removeChild(printDiv);
  }).catch(()=>{
    window.print();
    document.body.removeChild(printDiv);
  });
}

function setStatus(msg, kind){
  const el = document.getElementById("sendStatus");
  if(!el) return;
  el.textContent = msg;
  el.style.color = kind === "error" ? "#b33" : kind === "ok" ? "#2a7a2a" : "";
}

function emailIntake(order, groups){
  const btn = document.getElementById("emailBtn");
  btn.disabled = true;
  btn.textContent = "Preparing…";
  setStatus("Downloading PDF…");

  const printDiv = document.createElement("div");
  printDiv.id = "printArea";
  printDiv.innerHTML = buildSummaryHtml(order, groups);
  document.body.appendChild(printDiv);

  html2pdf().set(PDF_OPT).from(printDiv).save().then(()=>{
    document.body.removeChild(printDiv);

    const clientNames = state.clients.map(c=>c.name).filter(Boolean).join(", ") || "Unnamed";
    const subject = `New MVA Intake — ${clientNames}`;
    const body =
      `MVA intake completed for: ${clientNames}\n\n` +
      `A PDF summary (procon-usa-mva-intake.pdf) was just downloaded to this computer — ` +
      `please attach it to this email before sending.\n\n` +
      `Sent from the Procon USA Law MVA Intake tool.`;
    const mailtoUrl = `mailto:${INTAKE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;

    btn.disabled = false;
    btn.textContent = "✉ Email to " + INTAKE_EMAIL;
    setStatus("PDF downloaded and email draft opened — attach the PDF and hit Send.", "ok");
  }).catch(err=>{
    btn.disabled = false;
    btn.textContent = "✉ Email to " + INTAKE_EMAIL;
    setStatus("Couldn't generate the PDF (" + err.message + "). Try Download PDF instead.", "error");
    if(document.getElementById("printArea")) document.body.removeChild(document.getElementById("printArea"));
  });
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
state.index = -1;
renderWelcome();

})();
