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

const MAX_CLIENTS  = 8;   // matches the highest "how many people" option
const MAX_VEHICLES = 8;   // matches the highest "cars involved" option

/* ---------------------------------------------------------
   HELPERS to build question objects
--------------------------------------------------------- */
function q(id, section, label, type, opts){
  return Object.assign({id, section, label, type}, opts||{});
}

/* A question's section can be dynamic (e.g. "Client Information — Maria
   Souza"), so everything that needs a section name goes through here
   rather than reading f.section directly. */
function sectionOf(f){
  return f.sectionFn ? f.sectionFn(state) : f.section;
}

/* Converts the ISO value a native <input type="date"> produces
   (YYYY-MM-DD) into the MM-DD-YYYY format Procon asked for. */
function isoToMDY(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||"").trim());
  return m ? (m[2] + "-" + m[3] + "-" + m[1]) : iso;
}

/* Formats raw digits typed into a plain date field as MM-DD-YYYY,
   stripping anything that isn't a digit and inserting dashes as you type. */
function formatMDY(raw){
  const digits = String(raw||"").replace(/\D/g,"").slice(0,8);
  let out = digits.slice(0,2);
  if(digits.length > 2) out += "-" + digits.slice(2,4);
  if(digits.length > 4) out += "-" + digits.slice(4,8);
  return out;
}

/* ---------------------------------------------------------
   KIND OF INTAKE — the very first question. "Full" runs the complete
   questionnaire; "Basic" runs a short 14-question version.
--------------------------------------------------------- */
const kindOfIntakeFlow = [
  q("kindOfIntake","Kind of Intake","Kind of Intake","single",{
    options:["Full","Basic"], required:true
  })
];
function isFullIntake(s){ return s.answers.kindOfIntake === "Full"; }
function isBasicIntake(s){ return s.answers.kindOfIntake === "Basic"; }

/* ---------------------------------------------------------
   BASIC INTAKE — only the short list of questions, repeated once per
   client. A single "How many clients?" question drives the repetition.
--------------------------------------------------------- */
function basicClientCount(s){ return parseInt(s.answers.basicNumClients,10) || 0; }
function basicClientName(s, n){
  const nm = s.answers["b" + n + "_clientName"];
  return (nm && String(nm).trim()) ? String(nm).trim() : ("Client " + n);
}

const basicFlow = [
  q("basicNumClients","Basic Intake","How many clients?","single",{
    options:["1","2","3","4","5","6","7","8"], required:true
  })
];
for(let n = 1; n <= MAX_CLIENTS; n++){
  const id    = k => "b" + n + "_" + k;
  const shown = s => basicClientCount(s) >= n;
  const sec   = s => "Basic Intake — " + basicClientName(s, n);
  const base  = { sectionFn: sec, condition: shown };
  const with_ = extra => Object.assign({}, base, extra);

  basicFlow.push(
    q(id("clientName"),      "Basic Intake","Client name","text",       with_({})),
    q(id("phone"),           "Basic Intake","Phone Number","text",      with_({})),
    q(id("bestTime"),        "Basic Intake","Best time to call","text", with_({})),
    q(id("email"),           "Basic Intake","E-mail","text",            with_({})),
    q(id("address"),         "Basic Intake","Address","text",           with_({})),
    q(id("dob"),             "Basic Intake","Date of birth","date",     with_({})),
    q(id("amb"),             "Basic Intake","Amb","single",             with_({options:["Yes","No"]})),
    q(id("er"),              "Basic Intake","ER","single",              with_({options:["Yes","No"]})),
    q(id("erHospital"),      "Basic Intake","What hospital?","text",    with_({
      condition: s => shown(s) && s.answers[id("er")] === "Yes"
    })),
    q(id("clinic"),          "Basic Intake","Clinic","text",            with_({})),
    q(id("accidentDate"),    "Basic Intake","Date of Accident","datepicker", with_({})),
    q(id("accidentLocation"),"Basic Intake","Location of Accident","text",   with_({})),
    q(id("briefDescription"),"Basic Intake","Brief description","textarea",  with_({
      placeholder:"Briefly describe what happened..."
    })),
    q(id("contactedInsurance"),"Basic Intake","Contacted the Insurance Company","single", with_({options:["Yes","No"]})),
    q(id("claim"),           "Basic Intake","Claim","text",             with_({}))
  );
}

/* ---------------------------------------------------------
   KIND OF ACCIDENT — opens the Full intake, right after Kind of Intake.
   (The old "Contact" question and its "When is the best time to
   contact?" follow-up were removed at Procon's request.)
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

/* Works out the list of clients from the Occupants answers. Everything
   that repeats per client (Client Information, Documents) keys off this. */
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
function clientCount(s){ return computeClients(s).length; }

/* The name shown in this client's section headers ("Client Information —
   Jessica Schilling"). The client's own "Full name" answer wins once it has
   been filled in, since that is the definitive spelling on file; until then
   it falls back to the name typed in Occupants, and finally to "Client N". */
function clientName(s, n){
  const full = s.answers["c" + n + "_fullName"];
  if(full && String(full).trim()) return String(full).trim();
  const c = computeClients(s)[n-1];
  return (c && c.name && String(c.name).trim()) ? String(c.name).trim() : ("Client " + n);
}

/* ---------------------------------------------------------
   AUTO ACCIDENT INFO (asked right after Occupants, before Client
   Information — only for "Car" / "Truck" / "Taxi/Rideshare" kinds)
--------------------------------------------------------- */
const accidentInfoFlow = [
  q("accidentDate","Auto Accident Info","Day of accident (DOL)","datepicker",{
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

const motorcycleFlow = [
  q("motorcycleFacts","Motorcycle Accident","Facts of the Motorcycle/E-Scooter/E-Bike accident","textarea",{
    placeholder:"Explain what happened in the accident...",
    condition: isMotorcycleKind
  })
];
const pedestrianFlow = [
  q("pedestrianFacts","Pedestrian Accident","Facts of the Pedestrian accident","textarea",{
    placeholder:"Explain what happened in the accident...",
    condition: isPedestrianKind
  })
];
const bicycleFlow = [
  q("bicycleFacts","Bicycle Rider Accident","Facts of the Bicycle Rider accident","textarea",{
    placeholder:"Explain what happened in the accident...",
    condition: isBicycleKind
  })
];

/* ---------------------------------------------------------
   CLIENT INFORMATION + DOCUMENTS — both repeat once per client named in
   the Occupants section. The client's name is carried into the section
   header ("Client Information — Jessica Schilling") so whoever is filling
   the form always knows which client the current questions belong to, and
   the exported document keeps each client's answers in their own block.
--------------------------------------------------------- */
/* One combined list: client 1's Client Information, then client 1's
   Documents, then client 2's, and so on — so everything about a given
   client stays together both on screen and in the exported document. */
const perClientFlow = [];

for(let n = 1; n <= MAX_CLIENTS; n++){
  const clientInfoFlow = [];
  const documentsFlow  = [];
  const id    = k => "c" + n + "_" + k;
  const shown = s => clientCount(s) >= n;
  const infoSec = s => "Client Information — " + clientName(s, n);
  const docsSec = s => "Documents or information brought by our client — " + clientName(s, n);

  const info = extra => Object.assign({ sectionFn: infoSec, condition: shown }, extra);

  clientInfoFlow.push(
    q(id("language"),"Client Information","Language","single", info({
      options:["Portuguese","English","Spanish","English/Spanish","English/Portuguese","Other"]
    })),
    q(id("languageOther"),"Client Information","Please specify the language","text", info({
      condition: s => shown(s) && s.answers[id("language")] === "Other"
    })),
    q(id("needTranslator"),"Client Information","Need translator","single", info({options:["Yes","No"]})),
    q(id("clientIs"),"Client Information","Client is the:","single", info({options:["Driver","Passenger"]})),
    q(id("clientPosition"),"Client Information","Client position inside the car","carseat", info({
      options:["Driver","Front Passenger","Rear Driver Side","Rear Middle","Rear Passenger Side"]
    })),
    q(id("lostWorkDay"),"Client Information","Lost day of work","single", info({options:["Yes","No"]})),
    q(id("lostWorkDays"),"Client Information","How many days?","text", info({
      condition: s => shown(s) && s.answers[id("lostWorkDay")] === "Yes"
    })),
    q(id("employment"),"Client Information","Employment","text", info({})),
    q(id("fullName"),"Client Information","Full name","text", info({})),
    q(id("address"),"Client Information","Address","text", info({})),
    q(id("phone"),"Client Information","Phone","text", info({})),
    q(id("dob"),"Client Information","Date of birth","date", info({})),
    q(id("ssn"),"Client Information","SSN","text", info({})),
    q(id("medicareEligible"),"Client Information","Medicare eligible?","text", info({})),
    q(id("email"),"Client Information","E-mail","text", info({})),
    q(id("dlNumber"),"Client Information","Driver's License Number","text", info({})),
    q(id("dlState"),"Client Information","Driver's License State","text", info({})),
    q(id("priorAccidents"),"Client Information","Any previous accident with a vehicle","single", info({
      options:["None in less than 5 years","Yes, more than 5 years","Yes, less than 5 years"]
    })),
    q(id("healthInsuranceType"),"Client Information","Type of Health Insurance","single", info({
      options:["Private","Masshealth","No Insurance"]
    })),
    q(id("healthInsuranceName"),"Client Information","Health Insurance Name","text", info({
      condition: s => shown(s) && s.answers[id("healthInsuranceType")] === "Private"
    })),
    q(id("injuries"),"Client Information","Injuries","textarea", info({
      placeholder:"Describe the injuries..."
    })),
    q(id("ambulance"),"Client Information","Ambulance","single", info({options:["Yes","No"]})),
    q(id("er"),"Client Information","ER","single", info({options:["Yes","No"]})),
    q(id("erHospital"),"Client Information","Which hospital?","text", info({
      condition: s => shown(s) && s.answers[id("er")] === "Yes"
    })),
    q(id("clinic"),"Client Information","Clinic","text", info({}))
  );

  const DOC_ITEMS = [
    ["docDriversLicense",       "Valid Driver's License"],
    ["docDriversLicenseOrigin", "Valid Driver's License from country of origin"],
    ["docPassport",             "Passport"],
    ["docPoliceReport",         "Police Report"],
    ["docPoliceExchangeForm",   "Police Exchange Form"],
    ["docMedicalBills",         "Medical Bills"],
    ["docHospitalDischarge",    "Hospital Discharge"],
    ["docMasshealthCard",       "Masshealth Insurance Card"],
    ["docPrivateInsuranceCard", "Private Health Insurance Card"],
    ["docAccidentPhotos",       "Accident Photos"],
    ["docTowReceipt",           "Tow Receipt"]
  ];
  DOC_ITEMS.forEach(function(item){
    documentsFlow.push(
      q(id(item[0]), "Documents or information brought by our client", item[1], "single", {
        options:["Yes","No"], sectionFn: docsSec, condition: shown
      })
    );
  });

  perClientFlow.push(...clientInfoFlow, ...documentsFlow);
}

/* ---------------------------------------------------------
   VEHICLE INFORMATION (the client's own vehicle)
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
  /* Asked for every vehicle, whichever insurance branch was taken — they
     follow "Is the driver included on the insurance" on the Private side
     and "Is the driver an employee" on the Commercial side. */
  q("contactedInsuranceCompany","Vehicle Information","Was contact made with Insurance Company?","single",{
    options:["Yes","No","Both"]
  }),
  q("whatWasSaid","Vehicle Information","What was said?","text",{})
];

/* ---------------------------------------------------------
   VEHICLES INVOLVED IN ACCIDENT — one block per car involved, labelled
   "MVA 1", "MVA 2", ... The block repeats according to the answer to
   "How many cars were involved in the accident?". That question only
   exists for the auto kinds, so this section drops out entirely for
   Motorcycle / Pedestrian / Bicycle intakes.
--------------------------------------------------------- */
const VEHICLE_FIELDS = [
  ["registration",  "Registration",          "text"],
  ["regState",      "State of registration", "text"],
  ["owner",         "Owner",                 "text"],
  ["address",       "Address",               "text"],
  ["make",          "Make",                  "text"],
  ["model",         "Model",                 "text"],
  ["year",          "Year",                  "text"],
  ["color",         "Color",                 "text"],
  ["insurance",     "Insurance",             "text"],
  ["claimNumber",   "Claim number",          "text"],
  ["damage",        "Damage",                "textarea"]
];

const vehiclesInvolvedFlow = [];
for(let n = 1; n <= MAX_VEHICLES; n++){
  VEHICLE_FIELDS.forEach(function(def){
    const key = def[0], label = def[1], type = def[2];
    const opts = {
      mvaIndex: n,
      condition: s => (parseInt(s.answers.carsInvolved, 10) || 0) >= n
    };
    if(type === "textarea") opts.placeholder = "Describe the damage...";
    vehiclesInvolvedFlow.push(
      q("vehicle" + n + "_" + key,
        "Vehicles involved in accident",
        "MVA " + n + " — " + label,
        type,
        opts)
    );
  });
}

/* ---------------------------------------------------------
   SPECIAL NOTES — the final question of every intake, Full or Basic.
--------------------------------------------------------- */
const specialNotesFlow = [
  q("specialNotes","Special notes","Special notes","textarea",{
    placeholder:"Anything else worth recording about this intake..."
  })
];

/* ---------------------------------------------------------
   BUILD FULL FLOW (recomputed live based on state)
--------------------------------------------------------- */
function buildFlow(){
  state.clients = computeClients(state);

  if(isBasicIntake(state)){
    /* Basic: the short questionnaire only, repeated per client. */
    return [
      ...kindOfIntakeFlow,
      ...basicFlow,
      ...specialNotesFlow
    ];
  }

  if(!isFullIntake(state)){
    /* Nothing chosen yet — only the Kind of Intake question exists. */
    return [...kindOfIntakeFlow];
  }

  /* Full section order (as specified by Procon):
       1. Kind of Intake
       2. Kind of Accident
       3. Occupants
       4. Accident details for whichever kind was chosen
          (Auto Accident Info / Motorcycle / Pedestrian / Bicycle)
       5. Per client: Client Information, then the Documents they brought
       6. Vehicle Information
       7. Vehicles involved in accident (repeated per car involved)
       8. Special notes                                              */
  return [
    ...kindOfIntakeFlow,
    ...kindOfAccidentFlow,
    ...occupantsFlow,
    ...accidentInfoFlow,
    ...motorcycleFlow,
    ...pedestrianFlow,
    ...bicycleFlow,
    ...perClientFlow,
    ...vehicleInfoFlow,
    ...vehiclesInvolvedFlow,
    ...specialNotesFlow
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
  sectionLabel.textContent = sectionOf(f);

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
  else if(f.type === "datepicker"){
    /* Native date input — gives the browser's own calendar picker.
       The value it holds is ISO (YYYY-MM-DD); it is converted to
       MM-DD-YYYY for the review screen and the Word document. */
    const input = document.createElement("input");
    input.type = "date";
    input.value = currentVal || "";
    input.oninput = ()=>{ state.answers[f.id] = input.value; };
    input.onkeydown = (e)=>{ if(e.key==="Enter"){ goNext(); } };
    body.appendChild(input);
    setTimeout(()=>input.focus(), 30);
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
/* Splits the flow into consecutive RUNS of questions that share a section,
   preserving the exact order the questions were asked in. Runs keep each
   repeated client's answers in their own block. */
function groupIntoBlocks(flow){
  const blocks = [];
  flow.forEach(f=>{
    const sec = sectionOf(f);
    const last = blocks[blocks.length-1];
    if(last && last.section === sec) last.fields.push(f);
    else blocks.push({section: sec, fields: [f]});
  });
  return blocks;
}

function fmtVal(v){
  if(Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if(!v) return "—";
  return v;
}
/* Answer as it should read in the review and the Word document — date
   pickers hold ISO internally but must print as MM-DD-YYYY. */
function fmtField(f){
  const v = state.answers[f.id];
  if(f.type === "datepicker" && v) return isoToMDY(v);
  return fmtVal(v);
}

function renderReview(){
  progressBar.style.width = "100%";
  sectionLabel.textContent = "Review";
  const flow = visibleFlow();
  const blocks = groupIntoBlocks(flow);

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
  blocks.forEach(block=>{
    const rows = block.fields.filter(f=>state.answers[f.id]!==undefined);
    if(!rows.length) return;
    const secDiv = document.createElement("div");
    secDiv.className = "review-section";
    const h3 = document.createElement("h3");
    h3.textContent = block.section;
    secDiv.appendChild(h3);

    let lastMva = null;
    rows.forEach(f=>{
      /* A rule between each MVA inside the vehicles section. */
      if(f.mvaIndex && lastMva !== null && f.mvaIndex !== lastMva){
        const hr = document.createElement("div");
        hr.className = "mva-divider";
        secDiv.appendChild(hr);
      }
      if(f.mvaIndex) lastMva = f.mvaIndex;

      const item = document.createElement("div");
      item.className = "review-item";
      const l = document.createElement("span"); l.className="rlabel"; l.textContent = currentLabel(f) + ":";
      const v = document.createElement("span"); v.className="rval"; v.textContent = fmtField(f);
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
  document.getElementById("docxBtn").onclick = ()=> exportDocx(blocks);
  document.getElementById("emailBtn").onclick = ()=> emailIntake(blocks);
}

/* ---------------------------------------------------------
   CAR-SEAT DIAGRAM (canvas-drawn image, embedded into the exported
   Word document) — mirrors the on-screen picker's seat positions.
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

/* Question text prints in normal weight, the answer in bold. */
function qaRuns(f){
  const docx = window.docx;
  return [
    new docx.TextRun({ text: currentLabel(f) + ": ", bold: false, size: 20, color: "555555" }),
    new docx.TextRun({ text: fmtField(f), bold: true, size: 20, color: "111111" })
  ];
}
function qaCell(f){
  const docx = window.docx;
  return new docx.TableCell({
    width: { size: 50, type: docx.WidthType.PERCENTAGE },
    borders: CELL_BORDERS,
    margins: { top:80, bottom:80, left:100, right:100 },
    children: [ new docx.Paragraph({ children: qaRuns(f) }) ]
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
/* A full-width rule, used to separate one MVA from the next. */
function dividerParagraph(){
  const docx = window.docx;
  return new docx.Paragraph({
    children: [],
    border: { bottom: { style: "single", size: 6, color: "BBBBBB", space: 1 } },
    spacing: { before: 100, after: 140 }
  });
}

/* Builds the ordered list of docx content blocks (paragraphs/tables/images)
   for the full intake summary. The document follows the EXACT order the
   questions were asked in (see groupIntoBlocks) so the Word file reads the
   same way the intake was conducted, and every answer sits directly beside
   its question rather than drifting to the right side of the page. */
function buildDocxChildren(blocks){
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

  blocks.forEach(block=>{
    const sec = block.section;
    const rows = block.fields.filter(f=>state.answers[f.id]!==undefined);
    if(!rows.length) return;

    children.push(new docx.Paragraph({
      children: [ new docx.TextRun({ text: sec, bold: true, size: 24, color: "A8842A" }) ],
      border: { bottom: { style: "single", size: 6, color: "DDDDDD", space: 4 } },
      spacing: { before: 240, after: 120 }
    }));

    if(sec.indexOf("Documents or information brought by our client") === 0){
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
      let lastMva = null;
      rows.forEach(f=>{
        /* Separate each vehicle in the MVA section with a rule. */
        if(f.mvaIndex && lastMva !== null && f.mvaIndex !== lastMva){
          children.push(dividerParagraph());
        }
        if(f.mvaIndex) lastMva = f.mvaIndex;

        children.push(new docx.Paragraph({
          children: qaRuns(f),
          spacing: { after: 60 }
        }));
      });

      /* The car-seat drawing goes with whichever client's block holds it. */
      const seatField = rows.filter(fld => fld.type === "carseat" && state.answers[fld.id])[0];
      if(seatField){
        const imgBytes = canvasToPngBytes(buildCarSeatDiagramCanvas(state.answers[seatField.id]));
        children.push(new docx.Paragraph({
          children: [ new docx.TextRun({ text: "Client position inside the car:", italics: true, size: 18, color: "555555" }) ],
          spacing: { before: 100, after: 60 }
        }));
        children.push(new docx.Paragraph({
          children: [ new docx.ImageRun({ data: imgBytes, type: "png", transformation: { width: 170, height: 263 } }) ]
        }));
      }
    }
  });

  return children;
}

function buildDocxBlob(blocks){
  const docx = window.docx;
  const doc = new docx.Document({
    sections: [{ properties: {}, children: buildDocxChildren(blocks) }]
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

function exportDocx(blocks){
  const btn = document.getElementById("docxBtn");
  if(btn){ btn.disabled = true; btn.textContent = "Preparing…"; }
  buildDocxBlob(blocks).then(blob=>{
    downloadBlob(blob, "procon-usa-mva-intake.docx");
    if(btn){ btn.disabled = false; btn.textContent = "⬇ Download Word Document"; }
  }).catch(err=>{
    if(btn){ btn.disabled = false; btn.textContent = "⬇ Download Word Document"; }
    setStatus("Couldn't generate the Word document (" + err.message + ").", "error");
  });
}

/* Names used in the email subject/body — the Occupants list for a Full
   intake, or the Basic intake's own client-name answers. */
function intakeClientNames(){
  const full = state.clients.map(c=>c.name).filter(Boolean);
  if(full.length) return full.join(", ");
  const basic = [];
  for(let n=1;n<=MAX_CLIENTS;n++){
    const nm = state.answers["b"+n+"_clientName"];
    if(nm && String(nm).trim()) basic.push(String(nm).trim());
  }
  return basic.length ? basic.join(", ") : "Unnamed";
}

function emailIntake(blocks){
  const btn = document.getElementById("emailBtn");
  btn.disabled = true;
  btn.textContent = "Preparing…";
  setStatus("Generating Word document…");

  buildDocxBlob(blocks).then(blob=>{
    downloadBlob(blob, "procon-usa-mva-intake.docx");

    const clientNames = intakeClientNames();
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
