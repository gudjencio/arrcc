(() => {
  "use strict";

  const CONFIG = {
    // Paste your deployed Google Apps Script Web App URL here.
    emailRelayUrl: "https://script.google.com/macros/s/AKfycbxd3dCzqHS7AkAIUIxqkZFRMRIoRvjc8FGDc8gFmHs2sJPyj9T0bjeZeoxM95IWL5ym/exec", // Paste the deployed Apps Script /exec URL here after deployment.
    // Optional future RF gateway. Leave empty until you have an authenticated sensor gateway.
    rfObservationUrl: "",
    reverseGeocodeUrl: "https://api.bigdatacloud.net/data/reverse-geocode-client"
  };

  const EMERGENCY = {
    FR:{police:"17",fire:"18",general:"112"}, US:{police:"911",fire:"911",general:"911"},
    CA:{police:"911",fire:"911",general:"911"}, MX:{police:"911",fire:"911",general:"911"},
    JP:{police:"110",fire:"119",general:"119"}, GB:{police:"999",fire:"999",general:"999"},
    IE:{police:"999",fire:"999",general:"112"}, DE:{police:"110",fire:"112",general:"112"},
    ES:{police:"091",fire:"080",general:"112"}, IT:{police:"112",fire:"115",general:"112"},
    PT:{police:"112",fire:"112",general:"112"}, BE:{police:"101",fire:"112",general:"112"},
    NL:{police:"112",fire:"112",general:"112"}, CH:{police:"117",fire:"118",general:"112"},
    AT:{police:"133",fire:"122",general:"112"}, AU:{police:"000",fire:"000",general:"000"},
    NZ:{police:"111",fire:"111",general:"111"}, IN:{police:"112",fire:"112",general:"112"},
    BR:{police:"190",fire:"193",general:"192"}, AR:{police:"911",fire:"100",general:"911"},
    CL:{police:"133",fire:"132",general:"131"}, CO:{police:"123",fire:"123",general:"123"},
    ZA:{police:"10111",fire:"10177",general:"112"}, SG:{police:"999",fire:"995",general:"999"},
    KR:{police:"112",fire:"119",general:"112"},
    GR:{police:"100",fire:"199",general:"112"}, PL:{police:"997",fire:"998",general:"112"},
    NO:{police:"112",fire:"110",general:"113"}, SE:{police:"112",fire:"112",general:"112"},
    DK:{police:"112",fire:"112",general:"112"}, FI:{police:"112",fire:"112",general:"112"},
    IS:{police:"112",fire:"112",general:"112"}, CZ:{police:"158",fire:"150",general:"112"},
    SK:{police:"158",fire:"150",general:"112"}, HU:{police:"107",fire:"105",general:"112"},
    RO:{police:"112",fire:"112",general:"112"}, BG:{police:"112",fire:"112",general:"112"},
    HR:{police:"192",fire:"193",general:"112"}, SI:{police:"113",fire:"112",general:"112"},
    RS:{police:"192",fire:"193",general:"112"}, UA:{police:"102",fire:"101",general:"112"},
    RU:{police:"102",fire:"101",general:"112"}, TR:{police:"112",fire:"112",general:"112"},
    AE:{police:"999",fire:"997",general:"998"}, SA:{police:"999",fire:"998",general:"997"},
    IL:{police:"100",fire:"102",general:"101"}, EG:{police:"122",fire:"180",general:"123"},
    NG:{police:"112",fire:"112",general:"112"}, KE:{police:"999",fire:"999",general:"112"},
    TH:{police:"191",fire:"199",general:"1669"}, MY:{police:"999",fire:"999",general:"999"},
    PH:{police:"911",fire:"911",general:"911"}, ID:{police:"110",fire:"113",general:"112"},
    CN:{police:"110",fire:"119",general:"120"}, HK:{police:"999",fire:"999",general:"999"},
    TW:{police:"110",fire:"119",general:"119"}, PK:{police:"15",fire:"16",general:"1122"},
    BD:{police:"999",fire:"999",general:"999"}, LK:{police:"119",fire:"110",general:"1990"},
    PE:{police:"105",fire:"116",general:"106"}, VE:{police:"911",fire:"911",general:"911"},
    UY:{police:"911",fire:"104",general:"911"}, CR:{police:"911",fire:"911",general:"911"},
    DO:{police:"911",fire:"911",general:"911"}, GH:{police:"112",fire:"112",general:"112"},
    TZ:{police:"112",fire:"114",general:"112"}, MA:{police:"19",fire:"15",general:"112"},
    TN:{police:"197",fire:"198",general:"112"}, DZ:{police:"1548",fire:"14",general:"112"}
  };

  const $ = id => document.getElementById(id);
  const state = {
    lang:"en", country:null, city:null, coords:null, accuracy:null, watchId:null,
    scanning:false, map:null, marker:null, accuracyCircle:null, coverageCircle:null,
    contacts:[], stream:null, recorder:null, chunks:[], lastPhoto:null, risk:"normal",
    rfObservation:null
  };

  function chooseLanguage() {
    const supported = window.ARRCC_LOCALES || {};
    const browser = navigator.language || "en";
    const base = browser.split("-")[0].toLowerCase();
    const aliases = {"zh-cn":"zh","zh-tw":"zh","zh-hans":"zh","zh-hant":"zh"};
    state.lang = supported[browser] ? browser : (aliases[browser.toLowerCase()] || (supported[base] ? base : "en"));
    const select = $("language");
    select.innerHTML = "";
    Object.entries(supported).forEach(([code, data]) => {
      const option = document.createElement("option");
      option.value = code; option.textContent = data.name;
      option.selected = code === state.lang;
      select.appendChild(option);
    });
    applyLanguage();
  }

  function t(key) {
    const pack = (window.ARRCC_LOCALES && window.ARRCC_LOCALES[state.lang]) || window.ARRCC_LOCALES.en;
    return pack[key] || window.ARRCC_LOCALES.en[key] || key;
  }

  function applyLanguage() {
    const l = window.ARRCC_LOCALES[state.lang] || window.ARRCC_LOCALES.en;
    document.documentElement.lang = state.lang;
    document.documentElement.dir = l.dir || "ltr";
    const textMap = {
      brandSubtitle:"brandSubtitle", eyebrow:"eyebrow", title:"title", consent:"consent", sosHint:"sosHint", policeLabel:"police",
      fireLabel:"fire", generalLabel:"general", emergencyWarning:"emergencyWarning", locationTitle:"locationTitle",
      mapTitle:"mapTitle", mapSummary:"mapSummary", mapNote:"mapNote", networkLabel:"network", gpsLabel:"gps",
      rfLabel:"rf", timeLabel:"time", toolsTitle:"toolsTitle", toolsSummary:"toolsSummary", alarmLabel:"alarm",
      flashLabel:"flash", photoLabel:"photo", videoLabel:"video", stopVideoLabel:"stopVideo", contactsTitle:"contacts",
      contactsSummary:"contactsSummary", contactEmail:"email", addContact:"add",
      notesTitle:"notesTitle", share:"share", copy:"copy", footerSafety:"footerSafety", projectLink:"projectLink"
    };
    Object.entries(textMap).forEach(([id,key]) => { if ($(id)) $(id).textContent = t(key); });
    if ($("languageLabel")) $("languageLabel").textContent = t("language");
    if ($("language")) $("language").setAttribute("aria-label", t("language"));
    if ($("sosText")) $("sosText").textContent = t("sos").toUpperCase();
    if ($("scan")) $("scan").textContent = state.scanning ? t("stop") : t("scan");
    if ($("riskBadge")) { $("riskBadge").textContent = t(({normal:"riskNormal",attention:"riskAttention",danger:"riskDanger",emergency:"riskEmergency"})[state.risk] || "ready"); $("riskBadge").className = "badge " + state.risk; }
    if ($("rfState")) $("rfState").textContent = state.rfObservation ? JSON.stringify(state.rfObservation) : t("noRf");
    if ($("location")) $("location").textContent = state.coords ? `${state.coords.lat.toFixed(5)}, ${state.coords.lon.toFixed(5)}` : t("notShared");
    if ($("notes")) $("notes").placeholder = t("notesPlaceholder");
    if ($("contactName")) $("contactName").placeholder = t("contactName");
    if ($("contactEmail")) $("contactEmail").placeholder = t("email");
    if ($("map")) $("map").setAttribute("aria-label", t("mapAria"));
    if ($("police")) $("police").parentElement.setAttribute("aria-label", t("callAria"));
    if ($("location")) $("location").setAttribute("aria-label", t("statusAria"));
    updateEmergencyLinks();
  }

  function initMap() {
    state.map = L.map("map", {zoomControl:true}).setView([20,0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom:19, attribution:"© OpenStreetMap contributors"
    }).addTo(state.map);
  }

  function setLocation(position) {
    const {latitude,longitude,accuracy} = position.coords;
    state.coords = {lat:latitude, lon:longitude};
    state.accuracy = Math.round(accuracy || 0);
    $("gpsState").textContent = `${state.accuracy} m`;
    $("location").textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    if ($("scan")) $("scan").textContent = t("stop");
    if (!state.marker) {
      state.marker = L.marker([latitude,longitude]).addTo(state.map).bindPopup("arrcc");
      state.accuracyCircle = L.circle([latitude,longitude], {radius:accuracy || 30}).addTo(state.map);
      state.coverageCircle = L.circle([latitude,longitude], {radius:Math.max(30,Math.min(500,accuracy*2 || 60)), color:"#7f9cff", fillOpacity:.06}).addTo(state.map);
    } else {
      state.marker.setLatLng([latitude,longitude]);
      state.accuracyCircle.setLatLng([latitude,longitude]).setRadius(accuracy || 30);
      state.coverageCircle.setLatLng([latitude,longitude]).setRadius(Math.max(30,Math.min(500,accuracy*2 || 60)));
    }
    state.map.setView([latitude,longitude], 17);
    if (!state.country) reverseGeocode();
  }

  async function reverseGeocode() {
    if (!state.coords) return;
    try {
      const u = new URL(CONFIG.reverseGeocodeUrl);
      u.searchParams.set("latitude", state.coords.lat);
      u.searchParams.set("longitude", state.coords.lon);
      u.searchParams.set("localityLanguage", state.lang);
      const r = await fetch(u.toString(), {headers:{"Accept":"application/json"}});
      if (!r.ok) return;
      const d = await r.json();
      state.country = (d.countryCode || "").toUpperCase() || null;
      state.city = d.city || d.locality || d.principalSubdivision || null;
      updateEmergencyLinks();
    } catch (_) {
      // Geocoding is optional. Emergency buttons remain available after country selection.
    }
  }

  function startLocation() {
    if (!navigator.geolocation) {
      $("gpsState").textContent = t("noLocation"); return;
    }
    $("gpsState").textContent = t("locating");
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = navigator.geolocation.watchPosition(setLocation, () => {
      $("gpsState").textContent = t("noLocation");
    }, {enableHighAccuracy:true, maximumAge:5000, timeout:15000});
    navigator.geolocation.getCurrentPosition(setLocation,()=>{}, {enableHighAccuracy:true, timeout:15000});
  }

  function networkInfo() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return t("noLocation");
    const type = c.type || c.effectiveType || "unknown";
    const down = c.downlink ? ` · ${c.downlink} Mb/s` : "";
    return `${type}${down}`;
  }

  function updateNetwork() {
    $("network").textContent = networkInfo();
  }

  function setRisk(level) {
    if (!["normal","attention","danger","emergency"].includes(level)) level = "normal";
    state.risk = level;
    applyLanguage();
  }

  function startScan() {
    state.scanning = true;
    $("scan").textContent = t("stop");
    $("mapNote").textContent = t("scanRunning") + " — " + t("consent");
    startLocation();
    updateNetwork();
    // No fake threat generation: the browser scan only monitors available local telemetry.
    setRisk("normal");
  }

  function stopScan() {
    state.scanning = false;
    $("scan").textContent = t("scan");
    $("mapNote").textContent = t("mapDisclaimer");
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  function alarm() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { alert(t("audioUnavailable")); return; }
    const ctx = new Ctx();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sawtooth"; osc.frequency.value = 880; gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination); osc.start();
    let on = true;
    const timer = setInterval(() => { on=!on; osc.frequency.value = on ? 1200 : 650; }, 160);
    setTimeout(() => { clearInterval(timer); osc.stop(); ctx.close(); }, 8000);
  }

  async function flashStrobe() {
    if (!state.stream) {
      try { state.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false}); }
      catch (_) { $("mediaStatus").textContent = t("cameraPermission"); return; }
    }
    const track = state.stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) {
      $("mediaStatus").textContent = t("torchUnavailable");
      return;
    }
    let on=false, count=0;
    const timer=setInterval(async()=> {
      on=!on; count++;
      try { await track.applyConstraints({advanced:[{torch:on}]}); } catch(_){}
      if(count>=20){clearInterval(timer); try{track.applyConstraints({advanced:[{torch:false}]});}catch(_){}}
    },120);
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("cameraUnavailable"));
    if (!state.stream) {
      state.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:true});
      $("preview").srcObject = state.stream;
      $("preview").hidden = false;
    }
    return state.stream;
  }

  async function photo() {
    try {
      const stream = await openCamera();
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const w = settings.width || 1280, h = settings.height || 720;
      const canvas=$("canvas"); canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext("2d"); ctx.drawImage($("preview"),0,0,w,h);
      state.lastPhoto = canvas.toDataURL("image/jpeg",0.78);
      $("mediaStatus").textContent = t("photoCaptured");
    } catch(e) { $("mediaStatus").textContent = e.message; }
  }

  async function startVideo() {
    try {
      const stream=await openCamera();
      state.chunks=[];
      state.recorder = new MediaRecorder(stream, {mimeType: MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : ""});
      state.recorder.ondataavailable=e=>{if(e.data.size)state.chunks.push(e.data)};
      state.recorder.onstop=()=> {
        const blob=new Blob(state.chunks,{type:"video/webm"});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a"); a.href=url; a.download=`arrcc-${Date.now()}.webm`;
        a.textContent=t("saveVideo"); a.className="emergency-link";
        $("mediaStatus").appendChild(document.createElement("br")); $("mediaStatus").appendChild(a);
      };
      state.recorder.start(500);
      $("video").disabled=true; $("stopVideo").disabled=false;
      $("mediaStatus").textContent=t("recording");
    } catch(e) { $("mediaStatus").textContent=e.message; }
  }

  function stopVideo() {
    if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
    $("video").disabled=false; $("stopVideo").disabled=true;
  }

  function contactsRender() {
    const ul=$("contacts"); ul.innerHTML="";
    state.contacts.forEach((c,i)=>{
      const li=document.createElement("li"); li.className="contact-row";
      li.innerHTML=`<span><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.email)}</small></span>`;
      const b=document.createElement("button"); b.type="button"; b.textContent=t("remove");
      b.addEventListener("click",()=>{state.contacts.splice(i,1);contactsRender()});
      li.appendChild(b); ul.appendChild(li);
    });
  }

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

  function addContact(e){
    e.preventDefault();
    const name=$("contactName").value.trim(), email=$("contactEmail").value.trim();
    if(!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ $("shareStatus").textContent=t("contactInvalid"); return; }
    if(state.contacts.length>=8){ $("shareStatus").textContent=t("contactLimit"); return; }
    state.contacts.push({name,email}); $("contactName").value=""; $("contactEmail").value=""; contactsRender();
  }

  function updateEmergencyLinks(){
    const e=EMERGENCY[state.country] || {police:"112",fire:"112",general:"112"};
    $("police").href=`tel:${e.police}`;
    $("fire").href=`tel:${e.fire}`;
    $("general").href=`tel:${e.general}`;
    $("policeNumber").textContent=e.police; $("fireNumber").textContent=e.fire; $("generalNumber").textContent=e.general;
    $("police").title=`${state.country || "Default"}: ${e.police}`;
    $("fire").title=`${state.country || "Default"}: ${e.fire}`;
    $("general").title=`${state.country || "Default"}: ${e.general}`;
  }

  function reportObject(){
    return {
      project:"arrcc",
      version:"0.1.0",
      timestamp:new Date().toISOString(),
      language:state.lang,
      country:state.country,
      city:state.city,
      emergencyNumbers:EMERGENCY[state.country] || null,
      coordinates:state.coords,
      accuracyMeters:state.accuracy,
      network:networkInfo(),
      risk:state.risk,
      notes:$("notes").value.trim(),
      rfObservation:state.rfObservation,
      userAgent:navigator.userAgent
    };
  }

  function formatReport(){
    const r=reportObject();
    return [
      "ARRCC SAFETY REPORT","",
      `Time: ${r.timestamp}`,
      `Language: ${r.language}`,
      `Country: ${r.country || "unknown"}`,
      `City/area: ${r.city || "unknown"}`,
      `Local emergency numbers shown by arrcc: ${r.emergencyNumbers ? JSON.stringify(r.emergencyNumbers) : "fallback shown; country not identified"}`,
      `Coordinates: ${r.coordinates ? `${r.coordinates.lat}, ${r.coordinates.lon}` : "unavailable"}`,
      `GPS accuracy: ${r.accuracyMeters ?? "unknown"} m`,
      `Network: ${r.network}`,
      `Risk state: ${r.risk}`,
      `RF observation: ${r.rfObservation ? JSON.stringify(r.rfObservation) : "none"}`,
      "Notes:",r.notes || "(none)","",
      "This report was generated by arrcc. It is not a verified identification of an attacker or hazard."
    ].join("\n");
  }

  async function sendReport(){
    if(!CONFIG.emailRelayUrl){
      $("shareStatus").textContent=t("reportConfigure");
      return;
    }
    $("shareStatus").textContent=t("reportSending");
    const payload={...reportObject(), recipients:state.contacts.map(c=>c.email), report:formatReport(), photo:state.lastPhoto || null};
    try{
      await fetch(CONFIG.emailRelayUrl,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload),mode:"no-cors"});
      $("shareStatus").textContent=t("reportSent");
    }catch(e){$("shareStatus").textContent=t("reportFailed"); }
  }

  async function copyReport(){
    const text=formatReport();
    try{await navigator.clipboard.writeText(text);$("shareStatus").textContent=t("reportCopied")}
    catch(_){$("shareStatus").textContent=t("reportCopyFailed"); const w=window.open("","_blank"); if(w){w.document.write("<pre></pre>");w.document.querySelector("pre").textContent=text;}}
  }

  function sos(){
    alarm();
    setRisk("emergency");
    startLocation();
    $("notes").focus();
    $("shareStatus").textContent=({fr:"Mode urgence activé sur cet appareil. Appelez les secours avec le bouton adapté et prévenez vos contacts de confiance si vous pouvez le faire sans risque.",es:"Modo de emergencia activado en este dispositivo. Llama a los servicios adecuados y avisa a tus contactos de confianza solo si es seguro."}[state.lang] || t("sosStatus"));
  }

  $("language").addEventListener("change",e=>{state.lang=e.target.value;applyLanguage();contactsRender(); $("time").textContent=new Date().toLocaleString(state.lang);});
  $("scan").addEventListener("click",()=>state.scanning?stopScan():startScan());
  $("sos").addEventListener("click",sos);
  $("alarm").addEventListener("click",alarm);
  $("flash").addEventListener("click",flashStrobe);
  $("photo").addEventListener("click",photo);
  $("video").addEventListener("click",startVideo);
  $("stopVideo").addEventListener("click",stopVideo);
  $("contactForm").addEventListener("submit",addContact);
  $("share").addEventListener("click",sendReport);
  $("copy").addEventListener("click",copyReport);

  chooseLanguage();
  initMap();
  document.querySelectorAll("details").forEach(d=>d.addEventListener("toggle",()=>{ if(d.open && state.map) setTimeout(()=>state.map.invalidateSize(),120); }));
  updateNetwork();
  updateEmergencyLinks();
  $("time").textContent=new Date().toLocaleString(state.lang);
  setInterval(()=>{$("time").textContent=new Date().toLocaleString(state.lang);updateNetwork()},2000);

  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
