(() => {
  "use strict";

  // Google Apps Script web app URL (see marketing/pilot-backend/Code.gs). Empty: the form falls back to WhatsApp.
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbwmIqcdA8RkcN_R72pQu6njb-L02fIJS8QjAHhVNjtxoeX45uqCajFAgcVqN2l13lHr6Q/exec";
  const WHATSAPP = "923345251333";
  const PAGE = "pilot-v1";

  // Personalised copies, chosen with ?for=<slug>. Calculator values are examples the visitor changes.
  const AGENCIES = {
    theecomdude: { person: "Mehran", agency: "theecomdude", categories: "Fashion, cosmetics, electronics or home", orders: 3000, rto: 20, ship: 500, ad: 400 },
  };
  const GENERIC = { orders: 1000, rto: 20, ship: 500, ad: 400 };

  // Demo data only: the pin from the product film.
  const GATE = [33.63541, 73.07012];
  const BLOCK_CENTRE = [33.63462, 73.06918];
  const EXACT_METRES = 20;

  const $ = (selector) => document.querySelector(selector);
  const slug = (new URLSearchParams(location.search).get("for") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const agency = AGENCIES[slug] || null;
  const page = agency ? `${PAGE}:${slug}` : PAGE;
  const visit = Math.random().toString(36).slice(2, 10);
  const startedAt = Date.now();

  /* ---------- Anonymous events: no cookies, no storage, a random id per page load ---------- */
  const sent = new Set();
  function track(event, value = "", once = true) {
    if (once && sent.has(event)) return;
    sent.add(event);
    if (!ENDPOINT) return;
    const body = JSON.stringify({ type: "event", event, value: String(value), page, visit });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=utf-8" }))) return;
    } catch { /* fall through */ }
    fetch(ENDPOINT, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=utf-8" }, keepalive: true }).catch(() => {});
  }
  track("open", document.referrer ? new URL(document.referrer).hostname : "direct");

  const waLink = (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
  const waDefault = waLink(`Assalam o Alaikum Moiz, I saw the DeliveryPin pilot page${agency ? ` (${agency.agency})` : ""}.`);
  for (const id of ["#wa-next", "#wa-foot"]) { const a = $(id); if (a) a.href = waDefault; }
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-cta]");
    if (!target) return;
    const cta = target.dataset.cta;
    if (cta === "qr") track("qr_open", "", false);
    else if (cta === "whatsapp") track("whatsapp", target.id, false);
  });

  /* ---------- Personalisation ---------- */
  if (agency) {
    const prepared = $("#prepared");
    prepared.textContent = `Prepared for ${agency.person} · ${agency.agency}`;
    prepared.hidden = false;
    $("#agency-sub").textContent = `${agency.categories}: every COD brand you run has the same address problem.`;
    $("#f-agency").value = agency.agency;
  }

  /* ---------- Header border and the phone sticky CTA ---------- */
  const header = $(".top");
  const sticky = $("#sticky");
  let heroGone = false, pilotVisible = false;
  const updateSticky = () => sticky.classList.toggle("show", heroGone && !pilotVisible);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => { heroGone = !entry.isIntersecting; header.classList.toggle("scrolled", heroGone); updateSticky(); }).observe($(".hero-actions"));
    new IntersectionObserver(([entry]) => { pilotVisible = entry.isIntersecting; updateSticky(); }, { rootMargin: "0px 0px -20% 0px" }).observe($("#pilot"));
  }

  /* ---------- Live demo: pin, landmark, label QR ---------- */
  const navUrl = ([lat, lng]) => `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
  function distance([lat1, lng1], [lat2, lng2]) {
    const rad = Math.PI / 180, r = 6371000;
    const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(a));
  }

  let firstQr = true;
  function renderQr(point) {
    const url = navUrl(point);
    for (const id of ["#qr-link", "#qr-open"]) $(id).href = url;
    if (typeof window.qrcode !== "function") return;
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("#qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    if (!firstQr) { const box = $("#qr-link"); box.classList.remove("pulse"); void box.offsetWidth; box.classList.add("pulse"); }
    firstQr = false;
  }

  function updatePin(point, moved) {
    const metres = Math.round(distance(point, GATE));
    const status = $("#demo-status");
    const landmark = $("#f-landmark");
    landmark.textContent = metres <= 300 ? "Madina Masjid" : "Looked up when the customer confirms";
    if (metres <= EXACT_METRES) {
      status.textContent = "Exact pin on Ayesha's gate. The label's QR now leads the rider here.";
      status.classList.add("ok");
      $("#demo-prompt").textContent = "That's the whole idea: the rider gets the gate, not the block.";
      if (moved) track("pin_exact");
    } else {
      status.innerHTML = `Pin is about <span id="dist">${metres}</span> m from Ayesha's gate.`;
      status.classList.remove("ok");
    }
    if (moved) { track("pin_moved"); flash(landmark); updateAddress(point, metres <= EXACT_METRES); }
    renderQr(point);
  }

  const flash = (element) => { element.classList.remove("flash"); void element.offsetWidth; element.classList.add("flash"); };

  /* Address details follow the pin, as in the real popup. On the gate the demo address is shown;
     anywhere else the street and area come from OpenStreetMap's Nominatim (one lookup per pin drop). */
  const DEMO_ADDRESS = "House 27, Street 4, B-Block, Satellite Town, Rawalpindi";
  let addressTimer = 0, addressController = null;
  function setAddress(text) {
    for (const id of ["#f-address", "#l-address"]) { const element = $(id); element.textContent = text; flash(element); }
  }
  function formatAddress(address) {
    const street = [address.house_number, address.road].filter(Boolean).join(" ");
    const area = address.neighbourhood || address.suburb || address.quarter || address.residential || address.village;
    const city = (address.city || address.town || address.county || address.state_district || "").replace(/^(Metropolitan|Municipal) Corporation\s+/i, "");
    return [street, area, city].filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(", ");
  }
  function updateAddress(point, onGate) {
    clearTimeout(addressTimer);
    addressController?.abort();
    if (onGate) { setAddress(DEMO_ADDRESS); return; }
    $("#f-address").textContent = "Finding the address for this pin…";
    // Nominatim allows one request a second, so wait until the pin settles.
    addressTimer = setTimeout(async () => {
      const controller = new AbortController();
      addressController = controller;
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat=${point[0].toFixed(6)}&lon=${point[1].toFixed(6)}`;
        const response = await fetch(url, { signal: controller.signal });
        const body = await response.json();
        if (controller.signal.aborted) return;
        setAddress((body.address && formatAddress(body.address)) || "Address details not found here: the customer types them in");
      } catch {
        if (!controller.signal.aborted) setAddress("Address lookup unavailable: the customer types the address in");
      }
    }, 700);
  }

  updatePin(BLOCK_CENTRE, false);

  function loadMap() {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "vendor/leaflet.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "vendor/leaflet.js";
    script.onload = initMap;
    script.onerror = () => { $("#map-fallback").textContent = "The map couldn't load. The label below still shows the demo QR."; };
    document.head.appendChild(script);
  }

  function initMap() {
    const L = window.L;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    // On phones one finger scrolls the page; the pin itself is still draggable and a tap moves it.
    const map = L.map("map", { center: [33.63505, 73.06965], zoom: 17, minZoom: 14, maxZoom: 19, dragging: !touch, scrollWheelZoom: false, tap: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    map.attributionControl.setPrefix(false);

    const target = L.marker(GATE, { icon: L.divIcon({ className: "", html: '<div class="target"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false }).addTo(map);
    target.bindTooltip("Ayesha's gate (demo)", { permanent: true, direction: "top", offset: [0, -12], className: "target-label" });

    const pinSvg = '<div class="pin-icon"><svg viewBox="0 0 34 44" width="34" height="44"><path d="M17 1C8.2 1 1 8 1 16.7 1 28.4 17 43 17 43s16-14.6 16-26.3C33 8 25.8 1 17 1z" fill="#F2501A" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16.5" r="5.5" fill="#fff"/></svg></div>';
    const pin = L.marker(BLOCK_CENTRE, { draggable: true, autoPan: true, keyboard: true, title: "Delivery pin: drag to the gate", icon: L.divIcon({ className: "", html: pinSvg, iconSize: [34, 44], iconAnchor: [17, 43] }) }).addTo(map);
    const fromLatLng = (latLng) => [latLng.lat, latLng.lng];
    pin.on("drag", () => updatePin(fromLatLng(pin.getLatLng()), false));
    pin.on("dragend", () => updatePin(fromLatLng(pin.getLatLng()), true));
    map.on("click", (event) => {
      const point = distance(fromLatLng(event.latlng), GATE) <= EXACT_METRES * 1.5 ? GATE : fromLatLng(event.latlng);
      pin.setLatLng(point);
      updatePin(point, true);
    });
    // Snap to the gate when the pin lands close enough, as a confirming customer would.
    pin.on("dragend", () => { if (distance(fromLatLng(pin.getLatLng()), GATE) <= EXACT_METRES * 1.5) { pin.setLatLng(GATE); updatePin(GATE, true); } });

    $("#map-fallback").classList.add("gone");
  }

  const demo = $("#demo");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io.disconnect(); loadMap(); } }, { rootMargin: "600px 0px" });
    io.observe(demo);
  } else loadMap();

  /* ---------- Film: picks a 480p or 720p encode on first play ---------- */
  const film = $("#film-video");
  const filmPlay = $("#film-play");
  function startFilm() {
    if (!film.src) {
      const slow = navigator.connection && (navigator.connection.saveData || /2g|3g/.test(navigator.connection.effectiveType || ""));
      film.src = slow || window.innerWidth < 820 ? "media/demo-480.mp4" : "media/demo-720.mp4";
    }
    filmPlay.classList.add("gone");
    film.play().catch(() => {});
  }
  filmPlay.addEventListener("click", startFilm);
  film.addEventListener("play", () => { filmPlay.classList.add("gone"); track("video_play"); });
  film.addEventListener("timeupdate", () => {
    if (!film.duration) return;
    const share = film.currentTime / film.duration;
    if (share >= 0.25) track("video_25");
    if (share >= 0.5) track("video_50");
    if (share >= 0.97) track("video_100");
  });
  film.addEventListener("ended", () => track("video_100"));
  // Play inside the tap itself so phones allow sound.
  $("[data-cta=film]").addEventListener("click", () => { if (!film.src) startFilm(); });

  /* ---------- Calculator: only the visitor's own numbers, multiplied ---------- */
  const defaults = agency || GENERIC;
  const inputs = { orders: $("#c-orders"), rto: $("#c-rto"), ship: $("#c-ship"), ad: $("#c-ad") };
  inputs.orders.value = defaults.orders; inputs.rto.value = defaults.rto; inputs.ship.value = defaults.ship; inputs.ad.value = defaults.ad;
  const saved = $("#c-saved");
  const rupees = (n) => "Rs " + Math.round(n).toLocaleString("en-PK");
  const number = (input) => Math.max(0, Number(input.value) || 0);
  function calc(user) {
    const returns = Math.round(number(inputs.orders) * Math.min(100, number(inputs.rto)) / 100);
    const each = number(inputs.ship) + number(inputs.ad);
    saved.max = String(Math.max(1, returns));
    if (Number(saved.value) > returns) saved.value = String(returns);
    const n = Number(saved.value);
    $("#o-returns").textContent = returns.toLocaleString("en-PK");
    $("#o-each").textContent = rupees(each);
    $("#o-total").textContent = rupees(returns * each);
    $("#o-saved-n").textContent = n.toLocaleString("en-PK");
    $("#o-saved").textContent = rupees(n * each);
    if (user) track("calc_used", `${number(inputs.orders)}|${number(inputs.rto)}|${number(inputs.ship)}|${number(inputs.ad)}|${n}`);
  }
  for (const input of Object.values(inputs)) input.addEventListener("input", () => calc(true));
  saved.addEventListener("input", () => calc(true));
  calc(false);

  /* ---------- Sign-up: step 1 saves the lead, step 2 adds optional details ---------- */
  const lead = $("#lead"), details = $("#details"), next = $("#next");
  let leadId = "", leadToken = "", leadName = "", leadAgency = "";
  lead.addEventListener("focusin", () => track("form_start"), { once: true });

  async function post(body) {
    if (!ENDPOINT) throw new Error("no endpoint");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(ENDPOINT, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" }, signal: controller.signal });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "failed");
      return json;
    } finally { clearTimeout(timer); }
  }

  const normaliseWhatsapp = (value) => value.replace(/[^\d+]/g, "");
  const validWhatsapp = (value) => { const digits = value.replace(/\D/g, ""); return digits.length >= 10 && digits.length <= 15; };

  function showError(box, text, fallback) {
    box.hidden = false;
    box.textContent = text + " ";
    if (fallback) {
      const a = document.createElement("a");
      a.href = fallback; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Send it on WhatsApp instead";
      a.addEventListener("click", () => track("whatsapp", "fallback", false));
      box.appendChild(a);
    }
  }

  lead.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = $("#lead-error");
    error.hidden = true;
    const data = new FormData(lead);
    const name = String(data.get("name") || "").trim();
    const agencyName = String(data.get("agency") || "").trim();
    const whatsapp = normaliseWhatsapp(String(data.get("whatsapp") || ""));
    lead.name.setAttribute("aria-invalid", String(!name));
    lead.agency.setAttribute("aria-invalid", String(!agencyName));
    lead.whatsapp.setAttribute("aria-invalid", String(!validWhatsapp(whatsapp)));
    if (!name || !agencyName || !validWhatsapp(whatsapp)) {
      showError(error, !name || !agencyName ? "Please add your name and agency." : "Please check the WhatsApp number, for example 0300 1234567.");
      (lead.querySelector("[aria-invalid=true]") || lead.name).focus();
      return;
    }
    const button = $("#lead-btn");
    button.disabled = true; button.textContent = "Saving…";
    try {
      const result = await post({ type: "lead", name, agency: agencyName, whatsapp, website: String(data.get("website") || ""), elapsed: Date.now() - startedAt, page });
      leadId = result.id; leadToken = result.token; leadName = name; leadAgency = agencyName;
      track("lead", leadId);
      lead.hidden = true; details.hidden = false;
      details.email.focus({ preventScroll: true });
    } catch {
      showError(error, "We couldn't save that just now.", waLink(`Assalam o Alaikum Moiz, I'm ${name} from ${agencyName}. I'd like to join the DeliveryPin pilot.`));
    } finally {
      button.disabled = false; button.textContent = "Join the pilot";
    }
  });

  function finish() {
    details.hidden = true; next.hidden = false;
    $("#wa-next").href = waLink(`Assalam o Alaikum Moiz, I'm ${leadName} from ${leadAgency}. I just joined the DeliveryPin pilot (${leadId}).`);
    $("#next-ref").textContent = `Your reference: ${leadId}`;
    sticky.remove();
    next.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  details.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(details);
    const body = { type: "details", id: leadId, token: leadToken, email: String(data.get("email") || "").trim(), brands: String(data.get("brands") || "").trim(), orders: String(data.get("orders") || "").trim(), couriers: data.getAll("couriers").join(", "), problem: String(data.get("problem") || "").trim() };
    if (!body.email && !body.brands && !body.orders && !body.couriers && !body.problem) { finish(); return; }
    const button = $("#details-btn");
    button.disabled = true; button.textContent = "Sending…";
    try {
      await post(body);
      track("details");
      finish();
    } catch {
      showError($("#details-error"), "Your seat is saved, but these details didn't send.", waLink(`Assalam o Alaikum Moiz, ${leadName} from ${leadAgency} (${leadId}). Brands: ${body.brands}. Orders/month: ${body.orders}. Couriers: ${body.couriers}. Main problem: ${body.problem}`));
    } finally {
      button.disabled = false; button.textContent = "Send details";
    }
  });
  $("#details-skip").addEventListener("click", finish);
})();
