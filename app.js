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
   the Word document is generated and downloaded locally in the browser
   (via the docx library, which runs entirely client-side), then a
   pre-filled email draft opens in the user's own mail client (mailto:).
   Nothing leaves the browser except through the user's own email account. */
const INTAKE_EMAIL = "ai-agent@rockwood-enterprise.com";

/* ---------------------------------------------------------
   HELPERS to build question objects
--------------------------------------------------------- */
function q(id, section, label, type, opts){
  return Object.assign({id, section, label, type}, opts||{});
}

/* ---------------------------------------------------------
   CONTACT (the very first questions asked, before anything else)
--------------------------------------------------------- */
const contactFlow = [
  q("contact","Client Information","Contact","single",{
    options:["Altman Nussbaum Shunnarah","Procon"]
  }),
  q("contactBestTime","Client Information","When is the best time to contact?","text",{
    condition: s => s.answers.contact === "Altman Nussbaum Shunnarah"
  })
];

/* ---------------------------------------------------------
   KIND OF ACCIDENT (determines which accident-specific section
   is shown later)
--------------------------------------------------------- */
const kindOfAccidentFlow = [
  q("kindOfAccident","Kind of Accident","Kind of Accident","single",{
    options:[
      "Car",
      "Truck",
      "Motorcycle/E-Scooter/E-Bike",
      "Pedestrian",
      "Bicycle Rider",
      "Taxi/Rideshare (Lyft/Uber)"
    ],
    required:true
  })
];

/* Helper predicates used to gate each accident-specific section so only
   the one matching the answer above is shown. "Truck" follows the exact
   same sequence as "Car" — both route into the Auto Accident Info flow. */
function isAutoKind(s){
  return s.answers.kindOfAccident === "Car" ||
         s.answers.kindOfAccident === "Truck" ||
         s.answers.kindOfAccident === "Taxi/Rideshare (Lyft/Uber)";
}
function isMotorcycleKind(s){ return s.answers.kindOfAccident === "Motorcycle/E-Scooter/E-Bike"; }
function isPedestrianKind(s){ return s.answers.kindOfAccident === "Pedestrian"; }
function isBicycleKind(s){ return s.answers.kindOfAccident === "Bicycle Rider"; }

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
   AUTO ACCIDENT INFO (asked right after Occupants, before Client
   Information — only for "Car" / "Truck" / "Taxi/Rideshare" kinds)
--------------------------------------------------------- */
const accidentInfoFlow = [
  q("accidentDate","Auto Accident Info","Day of accident (DOL)","date",{
    condition: isAutoKind
  }),
  q("accidentTime","Auto Accident Info","Time of accident","time12",{placeholder:"e.g. 2:30",
    condition: isAutoKind
  }),
  q("accidentPlace","Auto Accident Info","Place of accident","text",{
    condition: isAutoKind
  }),
  q("policeCame","Auto Accident Info","Did the police come to the scene?","single",{
    options:["Yes, state police","Yes, local police","No","Doesn't know"],
    condition: isAutoKind
  }),
  q("policeReport","Auto Accident Info","Did the police make a report?","single",{
    options:[
      "Yes, we have a copy",
      "Yes, we are waiting a copy from client",
      "Yes, but only exchange report",
      "No",
      "Client doesn't know"
    ],
    condition: isAutoKind
  }),
  q("citation","Auto Accident Info","Police gave a citation","single",{
    options:["Yes","No","Doesn't know"],
    condition: isAutoKind
  }),
  q("citationType","Auto Accident Info","What type of fine was it?","text",{
    condition: s => isAutoKind(s) && s.answers.citation === "Yes"
  }),
  q("carsInvolved","Auto Accident Info","How many cars were involved in the accident?","single",{
    options:["1","2","3","4","5","6","7","8"],
    condition: isAutoKind
  }),
  q("carPosition","Auto Accident Info","What position were you in line?","single",{
    optionsFn: s => { const n = parseInt(s.answers.carsInvolved,10)||0; const arr=[]; for(let i=1;i<=n;i++) arr.push(String(i)); return arr; },
    condition: s => isAutoKind(s) && (parseInt(s.answers.carsInvolved,10)||0) >= 3
  }),
  q("impactsFelt","Auto Accident Info","How many impacts did they feel?","single",{
    options:["1","2","3","4","5","6"],
    condition: s => isAutoKind(s) && (parseInt(s.answers.carsInvolved,10)||0) >= 3
  }),
  q("airbagOpened","Auto Accident Info","Did the airbag open?","single",{
    options:["Yes","No","Doesn't know"],
    condition: isAutoKind
  }),
  q("witness","Auto Accident Info","Was there a witness?","single",{
    options:["Yes","No"],
    condition: isAutoKind
  }),
  q("witnessName","Auto Accident Info","What is the person's name?","text",{
    condition: s => isAutoKind(s) && s.answers.witness === "Yes"
  }),
  q("carUseReason","Auto Accident Info","Reason client was using the car","single",{
    options:["Private","Commercial","Uber/Lyft","Going to work","Going home","Other"],
    condition: isAutoKind
  }),
  q("carUseReasonOther","Auto Accident Info","Please specify","text",{
    condition: s => isAutoKind(s) && s.answers.carUseReason === "Other"
  }),
  q("accidentFacts","Auto Accident Info","Facts of the accident","textarea",{
    placeholder:"Explain what happened in the accident...",
    condition: isAutoKind
  })
];

/* ---------------------------------------------------------
   MOTORCYCLE ACCIDENT (only for "Motorcycle/E-Scooter/E-Bike")
--------------------------------------------------------- */
const motorcycleFlow = [
  q("motorcycleFacts","Motorcycle Accident","Facts of the Motorcycle/E-Scooter/E-Bike accident","textarea",{
    placeholder:"Explain what happened in the accident...",
    condition: isMotorcycleKind
  })
];

/* ---------------------------------------------------------
   PEDESTRIAN ACCIDENT (only for "Pedestrian")
--------------------------------------------------------- */
const pedestrianFlow = [
  q("pedestrianFacts","Pedestrian Accident","Facts of the Pedestrian accident","textarea",{
    placeholder:"Explain what happened in the accident...",
    condition: isPedestrianKind
  })
];

/* ---------------------------------------------------------
   BICYCLE RIDER ACCIDENT (only for "Bicycle Rider")
--------------------------------------------------------- */
const bicycleFlow = [
  q("bicycleFacts","Bicycle Rider Accident","Facts of the Bicycle Rider accident","textarea",{
    placeholder:"Explain what happened in the accident...",
    condition: isBicycleKind
  })
];

/* ---------------------------------------------------------
   CLIENT INFORMATION (shown for every kind of accident, right after
   the accident-details section). "Contact" and "When is the best
   time to contact?" live in contactFlow instead — they open the intake.
--------------------------------------------------------- */
const clientInfoFlow = [
  q("language","Client Information","Language","single",{
    options:["Portuguese","English","Spanish","English/Spanish","English/Portuguese","Other"]
  }),
  q("languageOther","Client Information","Please specify the language","text",{
    condition: s => s.answers.language === "Other"
  }),
  q("needTranslator","Client Information","Need translator","single",{
    options:["Yes","No"]
  }),
  q("clientIs","Client Information","Client is the:","single",{
    options:["Driver","Passenger"]
  }),
  q("pipApplication","Client Information","PIP Application","single",{
    options:["Yes","No"]
  }),
  q("clientPosition","Client Information","Client position inside the car","carseat",{
    options:["Driver","Front Passenger","Rear Driver Side","Rear Middle","Rear Passenger Side"]
  }),
  q("lostWorkDay","Client Information","Lost day of work","single",{
    options:["Yes","No"]
  }),
  q("employment","Client Information","Employment","text",{}),
  q("fullName","Client Information","Full name","text",{}),
  q("address","Client Information","Address","text",{}),
  q("phone","Client Information","Phone","text",{}),
  q("dob","Client Information","Date of birth","date",{}),
  q("ssn","Client Information","SSN","text",{}),
  q("email","Client Information","E-mail","text",{}),
  q("dlNumber","Client Information","Driver's License Number","text",{}),
  q("dlState","Client Information","Driver's License State","text",{}),
  q("priorAccidents","Client Information","Any previous accident with a vehicle","single",{
    options:["None in less than 5 years","Yes, more than 5 years","Yes, less than 5 years"]
  }),
  q("healthInsuranceType","Client Information","Type of Health Insurance","single",{
    options:["Private","Masshealth","No Insurance"]
  }),
  q("healthInsuranceName","Client Information","Health Insurance Name","text",{
    condition: s => s.answers.healthInsuranceType === "Private"
  }),
  q("injuries","Client Information","Injuries","textarea",{
    placeholder:"Describe the injuries..."
  }),
  q("ambulance","Client Information","Ambulance","single",{
    options:["Yes","No"]
  }),
  q("er","Client Information","ER","single",{
    options:["Yes","No"]
  }),
  q("erHospital","Client Information","Which hospital?","text",{
    condition: s => s.answers.er === "Yes"
  }),
  q("clinic","Client Information","Clinic","text",{})
];

/* ---------------------------------------------------------
   DOCUMENTS OR INFORMATION BROUGHT BY OUR CLIENT (right after
   Client Information, before Vehicle Information)
--------------------------------------------------------- */
const documentsFlow = [
  q("docDriversLicense","Documents or information brought by our client","Valid Driver's License","single",{options:["Yes","No"]}),
  q("docDriversLicenseOrigin","Documents or information brought by our client","Valid Driver's License from country of origin","single",{options:["Yes","No"]}),
  q("docPassport","Documents or information brought by our client","Passport","single",{options:["Yes","No"]}),
  q("docPoliceReport","Documents or information brought by our client","Police Report","single",{options:["Yes","No"]}),
  q("docPoliceExchangeForm","Documents or information brought by our client","Police Exchange Form","single",{options:["Yes","No"]}),
  q("docMedicalBills","Documents or information brought by our client","Medical Bills","single",{options:["Yes","No"]}),
  q("docHospitalDischarge","Documents or information brought by our client","Hospital Discharge","single",{options:["Yes","No"]}),
  q("docMasshealthCard","Documents or information brought by our client","Masshealth Insurance Card","single",{options:["Yes","No"]}),
  q("docPrivateInsuranceCard","Documents or information brought by our client","Private Health Insurance Card","single",{options:["Yes","No"]}),
  q("docAccidentPhotos","Documents or information brought by our client","Accident Photos","single",{options:["Yes","No"]}),
  q("docTowReceipt","Documents or information brought by our client","Tow Receipt","single",{options:["Yes","No"]})
];

/* ---------------------------------------------------------
   VEHICLE INFORMATION (right after Documents — final section)
--------------------------------------------------------- */
function isVehiclePrivate(s){ return s.answers.vehicleInsuranceKind === "Private"; }
function isVehicleCommercial(s){ return s.answers.vehicleInsuranceKind === "Commercial"; }

const vehicleInfoFlow = [
  q("vehiclePriorAccident","Vehicle Information","Has the vehicle suffered prior accident","single",{options:["Yes","No"]}),
  q("vehicleFinanced","Vehicle Information","Is the vehicle financed","single",{options:["Yes","No"]}),
  q("vehicleTowed","Vehicle Information","Was vehicle towed","single",{options:["Yes","No"]}),
  q("vehicleLocation","Vehicle Information","Where is the vehicle","text",{}),
  q("vehicleOwner","Vehicle Information","The owner of the car is the","text",{}),
  q("ownerSameHouse","Vehicle Information","Does the owner of vehicle live in the same house as driver","single",{options:["Yes","No"]}),
  q("vehicleCity","Vehicle Information","What city does the vehicle sleep in?","text",{}),
  q("vehicleInsuranceKind","Vehicle Information","What kind of insurance does the vehicle have","single",{options:["Private","Commercial"]}),
  q("driverIncludedInsurance","Vehicle Information","Is the driver included on the insurance","single",{
    options:["Yes","No"], condition: isVehiclePrivate
  }),
  q("driverHoursPerWeek","Vehicle Information","How many hours does the driver use the vehicle per week","text",{
    condition: s => isVehiclePrivate(s) && s.answers.driverIncludedInsurance === "No"
  }),
  q("driverIsEmployee","Vehicle Information","Is the driver an employee","single",{
    options:["Yes","No"], condition: isVehicleCommercial
  }),
  q("contactedInsuranceCompany","Vehicle Information","Was contact made with Insurance company","single",{
    options:["Yes","No"], condition: isVehicleCommercial
  }),
  q("whatWasSaid","Vehicle Information","What was said","text",{
    condition: isVehicleCommercial
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
  /* Section order (as specified by Procon):
       1. Contact + best time to contact  (contactFlow)
       2. Kind of Accident
       3. Occupants
       4. Accident details for whichever kind was chosen
          (Auto Accident Info / Motorcycle / Pedestrian / Bicycle)
       5. Client Information (language → clinic)
       6. Documents or information brought by our client
       7. Vehicle Information                                        */
  return [
    ...contactFlow,
    ...kindOfAccidentFlow,
    ...occupantsFlow,
    ...accidentInfoFlow,
    ...motorcycleFlow,
    ...pedestrianFlow,
    ...bicycleFlow,
    ...clientInfoFlow,
    ...documentsFlow,
    ...vehicleInfoFlow
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

/* Formats raw digits typed into a date field as MM-DD-YYYY, stripping
   anything that isn't a digit and inserting dashes as the user types. */
function formatMDY(raw){
  const digits = String(raw||"").replace(/\D/g,"").slice(0,8);
  let out = digits.slice(0,2);
  if(digits.length > 2) out += "-" + digits.slice(2,4);
  if(digits.length > 4) out += "-" + digits.slice(4,8);
  return out;
}

function renderWelcome(){
  progressBar.style.width = "0%";
  sectionLabel.textContent = "";
  app.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card welcome-card";
  card.innerHTML = `
    <h2 class="question-title">MVA Intake — Procon USA Law</h2>
    <p>Answer each question by clicking a choice. Your progress is saved as you go, and you'll get a downloadable Word document summary at the end.</p>
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
    input.type = "text";
    if(f.type === "date"){
      input.placeholder = "MM-DD-YYYY";
      input.setAttribute("inputmode","numeric");
      input.maxLength = 10;
    } else if(f.placeholder){
      input.placeholder = f.placeholder;
    }
    input.value = currentVal || (f.defaultValueFn ? f.defaultValueFn(state) : "") || "";
    input.oninput = ()=>{
      if(f.type === "date"){
        input.value = formatMDY(input.value);
      }
      state.answers[f.id] = input.value;
    };
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
    if(f.placeholder) ta.placeholder = f.placeholder;
    ta.value = currentVal || "";
    ta.oninput = ()=>{ state.answers[f.id] = ta.value; };
    body.appendChild(ta);
    body.appendChild(navButtons(f, true));
  }
  else if(f.type === "carseat"){
    // Visual car-seat picker: a simple top-down car outline with a button
    // positioned over each seat, so the client's position can be chosen by
    // clicking the actual seat instead of a plain text list.
    const wrap = document.createElement("div");
    wrap.className = "car-diagram";
    wrap.innerHTML = `
      <svg class="car-svg" viewBox="0 0 220 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="14" y="10" width="192" height="320" rx="46" fill="#f7f6f2" stroke="#d4af37" stroke-width="3"/>
        <rect x="14" y="10" width="192" height="70" rx="34" fill="#ece9e2"/>
        <text x="110" y="30" text-anchor="middle" font-size="12" letter-spacing="2" fill="#a8842a">FRONT</text>
        <line x1="110" y1="90" x2="110" y2="300" stroke="#e7e7ea" stroke-width="2" stroke-dasharray="4 5"/>
      </svg>
    `;
    const seatDefs = [
      {label:"Driver", top:"27%", left:"25%"},
      {label:"Front Passenger", top:"27%", left:"75%"},
      {label:"Rear Driver Side", top:"72%", left:"18%"},
      {label:"Rear Middle", top:"78%", left:"50%"},
      {label:"Rear Passenger Side", top:"72%", left:"82%"}
    ];
    seatDefs.forEach(seat=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seat-btn" + (currentVal===seat.label ? " selected":"");
      btn.style.top = seat.top;
      btn.style.left = seat.left;
      btn.textContent = seat.label;
      btn.onclick = ()=>{ state.answers[f.id] = seat.label; goNext(); };
      wrap.appendChild(btn);
    });
    body.appendChild(wrap);
    body.appendChild(navButtons(f, false));
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
  sub.textContent = `Review the intake below, then download a Word document summary for the file — or click Email to download the Word document and open a pre-filled draft to ${INTAKE_EMAIL} (attach the document and hit Send).`;
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
      const l = document.createElement("span"); l.className="rlabel"; l.textContent = currentLabel(f) + ":";
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
    <button class="btn btn-secondary" id="docxBtn">⬇ Download Word Document</button>
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
  document.getElementById("docxBtn").onclick = ()=> exportDocx(order, groups);
  document.getElementById("emailBtn").onclick = ()=> emailIntake(order, groups);
}

/* ---------------------------------------------------------
   CAR-SEAT DIAGRAM (canvas-drawn image, embedded into the exported
   Word document) — mirrors the on-screen picker's seat positions and
   highlight styling using the same renamed seat labels.
--------------------------------------------------------- */
function roundRectPath(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function wrapCanvasText(ctx, text, cx, cy, maxWidth, lineHeight){
  const words = String(text).split(" ");
  const lines = [];
  let cur = "";
  words.forEach(w=>{
    const test = cur ? cur+" "+w : w;
    if(ctx.measureText(test).width > maxWidth && cur){ lines.push(cur); cur = w; }
    else cur = test;
  });
  if(cur) lines.push(cur);
  const startY = cy - ((lines.length-1)*lineHeight)/2 + 3;
  lines.forEach((ln,i)=> ctx.fillText(ln, cx, startY + i*lineHeight));
}
function buildCarSeatDiagramCanvas(selected){
  const W = 220, H = 340, scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = W*scale;
  canvas.height = H*scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,W,H);

  roundRectPath(ctx, 14,10,192,320,46);
  ctx.fillStyle = "#f7f6f2"; ctx.fill();
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 3; ctx.stroke();

  roundRectPath(ctx, 14,10,192,70,34);
  ctx.fillStyle = "#ece9e2"; ctx.fill();

  ctx.fillStyle = "#a8842a";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("FRONT", 110, 34);

  ctx.strokeStyle = "#e7e7ea"; ctx.lineWidth = 2; ctx.setLineDash([4,5]);
  ctx.beginPath(); ctx.moveTo(110,90); ctx.lineTo(110,300); ctx.stroke();
  ctx.setLineDash([]);

  const seats = [
    {label:"Driver", x:55, y:92},
    {label:"Front Passenger", x:165, y:92},
    {label:"Rear Driver Side", x:40, y:246},
    {label:"Rear Middle", x:110, y:266},
    {label:"Rear Passenger Side", x:180, y:246}
  ];
  seats.forEach(s=>{
    const isSel = s.label === selected;
    roundRectPath(ctx, s.x-36, s.y-16, 72, 32, 6);
    ctx.fillStyle = isSel ? "#0b0b0c" : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = isSel ? "#d4af37" : "#c9c9c9";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = isSel ? "#d4af37" : "#333333";
    ctx.font = "bold 8.5px Arial";
    ctx.textAlign = "center";
    wrapCanvasText(ctx, s.label, s.x, s.y, 66, 10);
  });

  return canvas;
}
function canvasToPngBytes(canvas){
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ---------------------------------------------------------
   WORD DOCUMENT EXPORT (via the docx library, loaded from CDN as
   window.docx — runs entirely client-side, no data leaves the browser)
--------------------------------------------------------- */
const CELL_BORDER = { style: "single", size: 2, color: "DDDDDD" };
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function qaCell(f){
  const docx = window.docx;
  return new docx.TableCell({
    width: { size: 50, type: docx.WidthType.PERCENTAGE },
    borders: CELL_BORDERS,
    margins: { top:80, bottom:80, left:100, right:100 },
    children: [ new docx.Paragraph({
      children: [
        new docx.TextRun({ text: currentLabel(f) + ": ", bold: true, size: 20, color: "555555" }),
        new docx.TextRun({ text: fmtVal(state.answers[f.id]), size: 20, color: "111111" })
      ]
    }) ]
  });
}
function emptyCell(){
  const docx = window.docx;
  return new docx.TableCell({
    width: { size: 50, type: docx.WidthType.PERCENTAGE },
    borders: CELL_BORDERS,
    children: [ new docx.Paragraph({ children: [] }) ]
  });
}

/* Builds the ordered list of docx content blocks (paragraphs/tables/images)
   for the full intake summary. Every answer is kept directly beside its
   question (bold label immediately followed by the value on the same
   line) rather than pushed off to a separate column — per Procon's
   request that answers stay close to the question instead of drifting to
   the right side of the page. The Documents section renders as a
   two-column table since every question there is a short Yes/No answer. */
function buildDocxChildren(order, groups){
  const docx = window.docx;
  const children = [];

  children.push(new docx.Paragraph({
    children: [ new docx.TextRun({ text: "Procon USA Law — MVA Intake Summary", bold: true, size: 32, color: "111111" }) ],
    border: { bottom: { style: "single", size: 18, color: "D4AF37", space: 6 } },
    spacing: { after: 120 }
  }));
  children.push(new docx.Paragraph({
    children: [ new docx.TextRun({ text: "Generated " + new Date().toLocaleString(), size: 18, color: "666666" }) ],
    spacing: { after: 200 }
  }));

  order.forEach(sec=>{
    const rows = groups[sec].filter(f=>state.answers[f.id]!==undefined);
    if(!rows.length) return;

    children.push(new docx.Paragraph({
      children: [ new docx.TextRun({ text: sec, bold: true, size: 24, color: "A8842A" }) ],
      border: { bottom: { style: "single", size: 6, color: "DDDDDD", space: 4 } },
      spacing: { before: 240, after: 120 }
    }));

    if(sec === "Documents or information brought by our client"){
      const tableRows = [];
      for(let i=0;i<rows.length;i+=2){
        const left = rows[i];
        const right = rows[i+1];
        tableRows.push(new docx.TableRow({
          children: [ qaCell(left), right ? qaCell(right) : emptyCell() ]
        }));
      }
      children.push(new docx.Table({
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: tableRows
      }));
    } else {
      rows.forEach(f=>{
        children.push(new docx.Paragraph({
          children: [
            new docx.TextRun({ text: currentLabel(f) + ": ", bold: true, size: 20, color: "555555" }),
            new docx.TextRun({ text: fmtVal(state.answers[f.id]), size: 20, color: "111111" })
          ],
          spacing: { after: 60 }
        }));
      });

      if(sec === "Client Information" && state.answers.clientPosition){
        const hasClientPositionRow = rows.some(fld=>fld.id==="clientPosition");
        if(hasClientPositionRow){
          const imgBytes = canvasToPngBytes(buildCarSeatDiagramCanvas(state.answers.clientPosition));
          children.push(new docx.Paragraph({
            children: [ new docx.TextRun({ text: "Client position inside the car:", italics: true, size: 18, color: "555555" }) ],
            spacing: { before: 100, after: 60 }
          }));
          children.push(new docx.Paragraph({
            children: [ new docx.ImageRun({ data: imgBytes, type: "png", transformation: { width: 170, height: 263 } }) ]
          }));
        }
      }
    }
  });

  return children;
}

function buildDocxBlob(order, groups){
  const docx = window.docx;
  const doc = new docx.Document({
    sections: [{ properties: {}, children: buildDocxChildren(order, groups) }]
  });
  return docx.Packer.toBlob(doc);
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

function setStatus(msg, kind){
  const el = document.getElementById("sendStatus");
  if(!el) return;
  el.textContent = msg;
  el.style.color = kind === "error" ? "#b33" : kind === "ok" ? "#2a7a2a" : "";
}

function exportDocx(order, groups){
  const btn = document.getElementById("docxBtn");
  if(btn){ btn.disabled = true; btn.textContent = "Preparing…"; }
  buildDocxBlob(order, groups).then(blob=>{
    downloadBlob(blob, "procon-usa-mva-intake.docx");
    if(btn){ btn.disabled = false; btn.textContent = "⬇ Download Word Document"; }
  }).catch(err=>{
    if(btn){ btn.disabled = false; btn.textContent = "⬇ Download Word Document"; }
    setStatus("Couldn't generate the Word document (" + err.message + ").", "error");
  });
}

function emailIntake(order, groups){
  const btn = document.getElementById("emailBtn");
  btn.disabled = true;
  btn.textContent = "Preparing…";
  setStatus("Generating Word document…");

  buildDocxBlob(order, groups).then(blob=>{
    downloadBlob(blob, "procon-usa-mva-intake.docx");

    const clientNames = state.clients.map(c=>c.name).filter(Boolean).join(", ") || "Unnamed";
    const subject = `New MVA Intake — ${clientNames}`;
    const body =
      `MVA intake completed for: ${clientNames}\n\n` +
      `A Word document summary (procon-usa-mva-intake.docx) was just downloaded to this computer — ` +
      `please attach it to this email before sending.\n\n` +
      `Sent from the Procon USA Law MVA Intake tool.`;
    const mailtoUrl = `mailto:${INTAKE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    /* Trigger the mail client via a real <a> click instead of assigning
       window.location.href directly — more reliably opens the OS mail
       handler across browsers than a raw location navigation, which some
       browsers silently swallow or show a blank interstitial for. */
    const a = document.createElement("a");
    a.href = mailtoUrl;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    btn.disabled = false;
    btn.textContent = "✉ Email to " + INTAKE_EMAIL;
    setStatus("Word document downloaded and email draft opened — attach it and hit Send.", "ok");
  }).catch(err=>{
    btn.disabled = false;
    btn.textContent = "✉ Email to " + INTAKE_EMAIL;
    setStatus("Couldn't generate the Word document (" + err.message + "). Try Download Word Document instead.", "error");
  });
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
state.index = -1;
renderWelcome();

})();
