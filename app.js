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

const YN = ["Sim","Não"];
const YNM = ["Sim","Não","Não lembra ou não sabe"];

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
   CASE INFO (rest of page 1)
--------------------------------------------------------- */
const caseInfoFlow = [
  q("referral","Case Info","Referral","text",{}),
  q("clinic","Case Info","Clinic","text",{}),
  q("caseType","Case Info","Case type","single",{options:["Normal","Difficult"]}),
  q("clinicRequest","Case Info","Clinic Request","single",{options:["Yes","No","N/A"]}),
  q("propertyDamage","Case Info","Property Damage (Service Request)","single",{options:YN}),
  q("importantNotes","Case Info","Important Notes","textarea",{}),
  q("intakeDate","Case Info","Intake Date","date",{})
];

/* ---------------------------------------------------------
   FATOS DO ACIDENTE (Accident Facts) — page 2
--------------------------------------------------------- */
const factsFlow = [
  q("accidentDate","Accident Facts","Dia do Acidente","date",{}),
  q("accidentTime","Accident Facts","Hora do acidente","text",{placeholder:"ex: 14:30"}),
  q("accidentCity","Accident Facts","Cidade do acidente","text",{}),
  q("accidentLocation","Accident Facts","Local do acidente","text",{}),
  q("policeCame","Accident Facts","A polícia veio ao local?","single",{options:YN}),
  q("policeReport","Accident Facts","A polícia fez o relatório (reporte)?","single",{options:YNM}),
  q("policeTicket","Accident Facts","A polícia deu multa?","single",{options:YNM}),
  q("ticketType","Accident Facts","Que tipo de multa?","text",{condition:s=>s.answers.policeTicket==="Sim"}),
  q("occupantsInCar","Accident Facts","Quantas pessoas estavam dentro do carro?","single",{options:["1","2","3","4","5","6"]}),
  q("carsInvolved","Accident Facts","Quantos carros envolvidos no acidente?","single",{options:["1","2","3","4","5"]}),
  q("impactsFelt","Accident Facts","Quantos impactos você sentiu?","single",{options:["1","2"]}),
  q("driverSeatbelt","Accident Facts","O motorista estava usando cinto de segurança?","single",{options:YN}),
  q("passengersSeatbelt","Accident Facts","Os passageiros estava(m) usando cinto de segurança?","single",{options:YN,
    condition: s => s.answers.numPeople !== "1"}),
  q("passengersNoSeatbeltList","Accident Facts","Liste o(s) passageiro(s) que não estava(m) usando cinto","textarea",{
    condition: s => s.answers.passengersSeatbelt === "Não"
  }),
  q("accidentFactsNotes","Accident Facts","Descreva os fatos do acidente","textarea",{}),
  q("witness","Accident Facts","Teve alguma testemunha?","single",{options:["Não","Sim"]}),
  q("witnessName","Accident Facts","Nome da testemunha","text",{condition:s=>s.answers.witness==="Sim"}),
  q("airbag","Accident Facts","O airbag abriu?","single",{options:YNM}),
  q("carUseReason","Accident Facts","Motivo que estava usando o carro","single",{
    options:["Indo trabalhar","Voltando do trabalho","Trabalhando","Uso particular","Taxi/Uber/Lyft/Aplicativo","Carro alugado","Outro"]
  }),
  q("carUseReasonOther","Accident Facts","Descreva o motivo","text",{condition:s=>s.answers.carUseReason==="Outro"})
];

/* ---------------------------------------------------------
   CONDIÇÕES NA HORA DO ACIDENTE — page 3
--------------------------------------------------------- */
const conditionsFlow = [
  q("lighting","Conditions","A iluminação","single",{options:[
    "Estava de dia","Madrugada","Final de tarde","Noite – Rua Iluminada",
    "Noite – Rua sem iluminação","Noite – Não lembra sobre a iluminação","Outra","Não sabe"]}),
  q("weather","Conditions","Condições do clima","single",{options:[
    "Limpo","Nublado","Chovendo","Nevando","Chovendo gelo / granizo","Neblina",
    "Rajadas fortes de vento","Soprando areia ou neve","Outro"]}),
  q("trafficSignal","Conditions","Tipo de sinal de trânsito","single",{options:[
    "Sem Sinal","Placa de pare","Semáforo, Farol ou Sinal","Semáforo piscando - Amarelo",
    "Semáforo piscando - Vermelho","Sinal de cuidado (Yield)","Sinal de zona de escola",
    "Sinal de alerta (Warning)","Sinal cruzamento de trem","Não sabe"]}),
  q("signalWorking","Conditions","O sinal de trânsito estava funcionando na hora do acidente?","single",{
    options:["Sim","Não","Não havia sinal"]}),
  q("roadCondition","Conditions","Condição da pista","single",{options:[
    "Seca","Molhada","Neve","Gelo","Areia/lama/poeira/óleo/piso de pedra",
    "Água (parada ou mexendo)","Lamaçal de neve ou gelo derretido","Outra"]}),
  q("intersectionType","Conditions","Tipo de interseção","single",{options:[
    "Não era uma interseção","Interseção de 4 ruas em cruz","Interseção em T","Interseção em Y",
    "Subindo a rampa","Descendo a rampa","Rotatória","Interseção de 5 ruas ou mais",
    "Rampa da garagem (Driveway)","Cruzamento da linha do trem","Outro"]}),
  q("roadType","Conditions","Tipo de rua","single",{options:[
    "Mão dupla sem faixa","Mão dupla com faixa, sem muro de divisão",
    "Mão dupla com faixa e muro de divisão","Mão única","Outra"]}),
  q("schoolBus","Conditions","Acidente envolveu ônibus escolar?","single",{options:YN}),
  q("constructionArea","Conditions","Acidente foi em área de reparo ou construção da estrada?","single",{options:YN}),
  q("accidentType","Conditions","Como foi o acidente","single",{options:[
    "Acidente com apenas um carro","Na traseira","De ângulo (aprox. 90º)",
    "Lateral na mesma direção","Lateral na direção oposta","De frente","Traseira com traseira","Outra"]})
];

/* ---------------------------------------------------------
   INFORMAÇÕES SOBRE O VEÍCULO — page 4
--------------------------------------------------------- */
const vehicleInfoFlow = [
  q("priorAccident2","Vehicle Info","O veículo já sofreu acidente antes?","single",{options:["Sim","Não","Outro"]}),
  q("financed","Vehicle Info","O carro é financiado?","single",{options:["Sim","Não","Outro"]}),
  q("upgrades","Vehicle Info","Houve algum aprimoramento no veículo? (freio novo, pintura nova, som novo, etc.)","text",{}),
  q("otherVehicleAtHome","Vehicle Info","Há algum outro veículo na sua casa?","single",{options:YN}),
  q("otherVehicleOwner","Vehicle Info","Nome do dono","text",{condition:s=>s.answers.otherVehicleAtHome==="Sim"}),
  q("otherVehicleInsurer","Vehicle Info","Nome da seguradora","text",{condition:s=>s.answers.otherVehicleAtHome==="Sim"}),
  q("otherVehicleRelationship","Vehicle Info","Relacionamento","text",{condition:s=>s.answers.otherVehicleAtHome==="Sim"}),
  q("gap","Vehicle Info","Tem GAP?","single",{options:["Sim","Não","Não sei ou não lembro","Outro"]}),
  q("towed","Vehicle Info","O carro foi rebocado?","single",{options:YN}),
  q("carLocation","Vehicle Info","Onde está o carro?","text",{condition:s=>s.answers.towed==="Sim"}),
  q("bodyshopName","Vehicle Info","Bodyshop / towing company — Nome","text",{condition:s=>s.answers.towed==="Sim"}),
  q("bodyshopPhone","Vehicle Info","Telefone","text",{condition:s=>s.answers.towed==="Sim"}),
  q("bodyshopContact","Vehicle Info","Pessoa de contato","text",{condition:s=>s.answers.towed==="Sim"}),
  q("bodyshopAddress","Vehicle Info","Endereço","text",{condition:s=>s.answers.towed==="Sim"}),
  q("carOwner","Vehicle Info","O dono do carro é","single",{options:[
    "Motorista","Passageiro","Esposo(a)","Pai ou Mãe","Filho ou filha","Irmão ou irmã",
    "Amigo(a)","Empresa","Colega de quarto","Outro"]}),
  q("ownerSameHouse","Vehicle Info","O dono do carro mora na mesma casa que o motorista?","single",{options:["Sim","Não","Outro"]}),
  q("overnightCity","Vehicle Info","Em que cidade o veículo fica estacionado à noite?","text",{}),
  q("insuranceType","Vehicle Info","Que tipo de seguro tem o carro?","single",{options:["Particular","Comercial","Outro"]}),
  q("coverageType","Vehicle Info","Que cobertura tem o carro?","single",{options:["Básico / simples","Total com aluguel","Total sem aluguel"]}),
  // Particular
  q("driverIncludedInsurance","Vehicle Info","O motorista está incluído no seguro?","single",{
    options:["Sim","Não","Outro"], condition:s=>s.answers.insuranceType==="Particular"}),
  q("hoursPerWeek","Vehicle Info","Se não, quantas horas o motorista usa o carro por semana?","text",{
    condition:s=>s.answers.insuranceType==="Particular" && s.answers.driverIncludedInsurance==="Não"}),
  // Comercial
  q("driverEmployee","Vehicle Info","O motorista é funcionário da empresa?","single",{
    options:["Sim","Não","Outro"], condition:s=>s.answers.insuranceType==="Comercial"}),
  q("companyTime","Vehicle Info","Quanto tempo a empresa existe?","text",{condition:s=>s.answers.insuranceType==="Comercial"}),
  q("insurerContact","Vehicle Info","Já houve algum contato com a seguradora?","single",{
    options:YN, condition:s=>s.answers.insuranceType==="Comercial"}),
  q("insurerContactWho","Vehicle Info","Quem?","text",{
    condition:s=>s.answers.insuranceType==="Comercial" && s.answers.insurerContact==="Sim"}),
  q("insurerWhich","Vehicle Info","Qual seguradora?","multi",{
    options:["PIP","BI"], condition:s=>s.answers.insuranceType==="Comercial"}),
  q("pipStatement","Vehicle Info","O que foi dito para PIP?","textarea",{
    condition:s=>s.answers.insuranceType==="Comercial" && (s.answers.insurerWhich||[]).includes("PIP")}),
  q("biStatement","Vehicle Info","O que foi dito para BI?","textarea",{
    condition:s=>s.answers.insuranceType==="Comercial" && (s.answers.insurerWhich||[]).includes("BI")})
];

/* ---------------------------------------------------------
   MV1-MV4 — page 5 (dynamic count based on carsInvolved, capped at 4)
--------------------------------------------------------- */
function mvFields(n){
  const fields = ["plate","state","owner","address","city","city_state","zip","make","model","year","color","insurance","phone","extension","claimNumber","adjuster","damage"];
  const labels = {
    plate:"Placa / Registration", state:"State", owner:"Owner", address:"Address",
    city:"City", city_state:"State", zip:"Zip", make:"Make", model:"Model", year:"Year",
    color:"Color", insurance:"Insurance", phone:"Phone", extension:"Extension",
    claimNumber:"Claim n°", adjuster:"Adjuster", damage:"Damage"
  };
  const out = [];
  fields.forEach(f=>{
    out.push(q(`mv${n}_${f}`, `Vehicle MV${n}`, `MV${n} — ${labels[f]}`, f==="damage" ? "textarea":"text", {
      condition: s => (parseInt(s.answers.carsInvolved,10)||1) >= n
    }));
  });
  return out;
}
const mvFlow = [1,2,3,4].flatMap(mvFields);

/* ---------------------------------------------------------
   INFORMAÇÕES DO CLIENTE — page 6 (repeats per client)
--------------------------------------------------------- */
const DOCS = [
  "Carteira de Motorista (Americana ou Brasileira)","Passaporte","Relatório da Polícia",
  "Contas Médicas (Hospital, Ambulância, etc.)","Hospital Discharge","Carteira do Plano de Saúde",
  "Recibo do Reboque","Registro do Carro","Contrato do Seguro do Carro (Apólice)"
];

function clientFields(idx){
  const p = `client${idx}_`;
  const sectionName = `Client Info — Person ${idx+1}`;
  const cname = s => (s.clients[idx] && s.clients[idx].name) ? s.clients[idx].name : `Client ${idx+1}`;
  const cond = s => !!s.clients[idx];
  const list = [
    q(p+"role",sectionName,"Motorista, Passageiro ou Pedestre?","single",{options:["Motorista","Passageiro","Pedestre"]}),
    q(p+"lostWork",sectionName,"Perdeu dias de trabalho?","single",{options:YN}),
    q(p+"language",sectionName,"Cliente fala","single",{options:["Português","Inglês","Espanhol","Creolo","Outra"]}),
    q(p+"languageOther",sectionName,"Qual outra língua?","text",{condition:s=>cond(s) && s.answers[p+"language"]==="Outra"}),
    q(p+"interpreter",sectionName,"Precisa de intérprete?","single",{options:YN}),
    q(p+"email",sectionName,"Email","text",{}),
    q(p+"licenseNumber",sectionName,"Nº Carteira de Motorista","text",{}),
    q(p+"licenseState",sectionName,"Estado (da carteira)","text",{}),
    q(p+"fullName",sectionName,"Nome COMPLETO","text",{defaultValueFn: cname}),
    q(p+"address",sectionName,"Endereço","text",{}),
    q(p+"city",sectionName,"Cidade","text",{}),
    q(p+"state",sectionName,"Estado","text",{}),
    q(p+"zip",sectionName,"Zip","text",{}),
    q(p+"cell",sectionName,"Celular","text",{}),
    q(p+"dob",sectionName,"Data de Nascimento (DOB)","date",{}),
    q(p+"ssn",sectionName,"SSN","text",{}),
    q(p+"emergencyName",sectionName,"Contato de Emergência — Nome","text",{}),
    q(p+"emergencyCell",sectionName,"Contato de Emergência — Celular","text",{}),
    q(p+"emergencyRel",sectionName,"Contato de Emergência — Relacionamento","text",{}),
    q(p+"priorAccident",sectionName,"Algum acidente anteriormente?","single",{
      options:["Não","Sim, há mais de 5 anos","Sim, há menos de 5 anos"]}),
    q(p+"healthPlan",sectionName,"Plano de Saúde","single",{
      options:["Privado","Masshealth","Outro","Não tem Plano de saúde"]}),
    q(p+"injuries",sectionName,"Lesão / Machucados / Danos Físicos / Dor","multi",{
      options:["Costas","Pescoço","Braços","Pernas","Corte","Pontos","Cicatriz","Cirurgia","Fratura de Osso"]}),
    q(p+"injuryDesc",sectionName,"Descreva as lesões acima","textarea",{}),
    q(p+"ambulance",sectionName,"Ambulância (nome/empresa)","text",{}),
    q(p+"hospital",sectionName,"Nome do Hospital","text",{}),
    q(p+"daysHospitalized",sectionName,"Quantos dias ficou internado?","text",{}),
    q(p+"clinicName",sectionName,"Clínica","text",{}),
    q(p+"carPosition",sectionName,"Posição do cliente no carro","single",{options:["1","2","3","4","5"]}),
  ];
  DOCS.forEach((doc,i)=>{
    list.push(q(p+"doc"+i+"_needed",sectionName,`${doc} — Necessário?`,"single",{options:YN}));
    list.push(q(p+"doc"+i+"_received",sectionName,`${doc} — Recebido?`,"single",{options:YN}));
  });
  list.push(q(p+"notes",sectionName,"Notas adicionais sobre o cliente","textarea",{}));
  // apply shared condition + title prefix to all
  return list.map(f=>{
    const orig = f.condition;
    f.condition = s => cond(s) && (orig ? orig(s) : true);
    f.titlePrefix = () => cname(state);
    return f;
  });
}

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
  const maxClients = 8; // cap; only rendered ones with a matching client show
  let clientQuestions = [];
  for(let i=0;i<maxClients;i++){
    clientQuestions = clientQuestions.concat(clientFields(i));
  }
  return [
    ...occupantsFlow,
    ...caseInfoFlow,
    ...factsFlow,
    ...conditionsFlow,
    ...vehicleInfoFlow,
    ...mvFlow,
    ...clientQuestions
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
