const products = [
  { id: 1, brand: "Dieux", name: "Deliverance Serum", type: "Serum", concern: ["Sensitivity", "Texture"], price: 69, retailer: "Credo", tone: "#c5cfc0", pack: "#f2eee3" },
  { id: 2, brand: "Prequel", name: "Gleanser", type: "Cleanser", concern: ["Dryness", "Sensitivity"], price: 18, retailer: "Dermstore", tone: "#d6d2c7", pack: "#efe9da" },
  { id: 3, brand: "Experiment", name: "Super Saturated", type: "Serum", concern: ["Dryness"], price: 28, retailer: "Credo", tone: "#d1c8bc", pack: "#ece7dc" },
  { id: 4, brand: "Tower 28", name: "SOS Daily Rescue", type: "Moisturizer", concern: ["Sensitivity"], price: 28, retailer: "Sephora", tone: "#c8d0c2", pack: "#f5f1e8" },
  { id: 5, brand: "Sofie Pavitt", name: "Mandelic Serum", type: "Serum", concern: ["Texture", "Aging"], price: 56, retailer: "Sephora", tone: "#c9c7be", pack: "#eeeae0" },
  { id: 6, brand: "Dieux", name: "Air Angel", type: "Moisturizer", concern: ["Dryness"], price: 44, retailer: "Credo", tone: "#bbc9bc", pack: "#e8e7dc" },
  { id: 7, brand: "EltaMD", name: "UV Clear SPF 46", type: "SPF", concern: ["Sensitivity", "Aging"], price: 43, retailer: "Dermstore", tone: "#d8cfc1", pack: "#f3eee5" },
  { id: 8, brand: "Skinfix", name: "Barrier+ Triple Lipid", type: "Moisturizer", concern: ["Dryness", "Sensitivity"], price: 54, retailer: "Sephora", tone: "#d0cabb", pack: "#e9e5d9" }
];

const parseSaved = () => {
  try {
    const value = JSON.parse(localStorage.getItem("mgt-saved") || "[]");
    return Array.isArray(value) ? value.filter(Number.isInteger) : [];
  } catch {
    return [];
  }
};

const state = {
  retailer: "All retailers",
  filters: { concern: new Set(), type: new Set() },
  price: 120,
  saved: new Set(parseSaved()),
  compare: new Set(),
  deletionScheduled: false,
  billing: "monthly",
  guestMode: "basic"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function persistSaved() {
  localStorage.setItem("mgt-saved", JSON.stringify([...state.saved]));
  $("#savedCount").textContent = state.saved.size;
  $("#savedTabCount").textContent = state.saved.size;
}

function getFilteredProducts() {
  let result = products.filter((product) => {
    if (state.retailer === "Saved") return state.saved.has(product.id);
    return state.retailer === "All retailers" || product.retailer === state.retailer;
  });

  for (const key of ["concern", "type"]) {
    if (!state.filters[key].size) continue;
    result = result.filter((product) => [...state.filters[key]].some((value) => (
      key === "type" ? product.type === value : product.concern.includes(value)
    )));
  }

  return result.filter((product) => product.price <= state.price);
}

function renderProducts() {
  const grid = $("#productGrid");
  let list = getFilteredProducts();
  const sort = $("#sortSelect").value;

  if (sort === "price-low") list = [...list].sort((a, b) => a.price - b.price);
  if (sort === "price-high") list = [...list].sort((a, b) => b.price - a.price);

  $("#resultCount").textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
  grid.innerHTML = list.map((product) => `
    <article class="product-card">
      <div class="product-image" style="--tone:${product.tone};--pack:${product.pack}">
        <span class="label">${product.brand}<br>${product.type}</span>
        <button class="save-button ${state.saved.has(product.id) ? "saved" : ""}" data-save="${product.id}" type="button" aria-label="${state.saved.has(product.id) ? "Remove" : "Save"} ${product.name}">
          ${state.saved.has(product.id) ? "♥" : "♡"}
        </button>
        <button class="compare-button ${state.compare.has(product.id) ? "selected" : ""}" data-compare="${product.id}" type="button">
          ${state.compare.has(product.id) ? "✓ Comparing" : "+ Compare"}
        </button>
      </div>
      <div class="product-info">
        <div class="product-brand">${product.brand}</div>
        <div class="product-name">${product.name}</div>
        <div class="product-bottom"><span class="product-retailer">${product.retailer}</span><span>$${product.price}</span></div>
      </div>
    </article>
  `).join("");

  $("#emptyState").hidden = Boolean(list.length);
  $("#activeFilters").innerHTML = [...state.filters.concern, ...state.filters.type].map((value) => `
    <span class="filter-chip">${value}<button data-remove="${value}" type="button" aria-label="Remove ${value} filter">×</button></span>
  `).join("");
  $("#priceValue").textContent = `$${state.price}`;
  $("#compareTray").hidden = !state.compare.size;
  $("#compareCount").textContent = state.compare.size;
  document.body.classList.toggle("has-compare", Boolean(state.compare.size));
  persistSaved();
}

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function resetFilters() {
  state.filters.concern.clear();
  state.filters.type.clear();
  state.price = 120;
  $("#priceRange").value = 120;
  $$('input[type="checkbox"]').forEach((input) => { input.checked = false; });
  renderProducts();
}

function activateConsolePanel(name) {
  $$(".console-tab").forEach((button) => {
    const isActive = button.dataset.panel === name;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  $$("[data-console-panel]").forEach((panel) => {
    const isActive = panel.dataset.consolePanel === name;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
  });
}

function updateDeletionDemo() {
  state.deletionScheduled = !state.deletionScheduled;
  $("#deletionState").hidden = !state.deletionScheduled;
  $("#deleteActionCopy").firstChild.textContent = state.deletionScheduled ? "Cancel scheduled deletion" : "Schedule account deletion";
  $("#deleteActionDetail").textContent = state.deletionScheduled ? "Keep this demo profile active" : "30-day recovery window";
  $("#deleteActionIcon").textContent = state.deletionScheduled ? "×" : "→";
  showToast(state.deletionScheduled ? "Demo deletion scheduled — no real account was changed" : "Demo deletion cancelled");
}

const membershipPlans = [
  {
    id: "essential",
    name: "Essential",
    monthly: 49,
    annual: 529,
    audience: "For a simple, consistent care rhythm.",
    usage: "250 requests / month",
    overage: "$19 for each 100-request pack",
    depth: "Focused guidance",
    length: "Concise action plan",
    turnaround: "Standard turnaround",
    concurrency: "1 active request · 1 profile",
    confidence: "Clear, grounded recommendations for everyday decisions.",
    upgrade: "Unlock a more connected view of your routine."
  },
  {
    id: "guided",
    name: "Guided",
    monthly: 129,
    annual: 1390,
    audience: "For regular routines with more context and momentum.",
    usage: "900 requests / month",
    overage: "$59 for each 250-request pack",
    depth: "Connected routine review",
    length: "Full explanation and options",
    turnaround: "Priority turnaround",
    concurrency: "2 active requests · 3 profiles",
    confidence: "Higher-confidence connected review for recurring routines.",
    upgrade: "Unlock the highest depth for detailed, multi-part decisions.",
    popular: true
  },
  {
    id: "studio",
    name: "Studio",
    monthly: 349,
    annual: 3690,
    audience: "For detailed planning, comparisons, and high-volume care work.",
    usage: "2,500 requests / month",
    overage: "$159 for each 750-request package",
    depth: "Deep multi-signal review",
    length: "Expanded plan and comparison",
    turnaround: "Fastest available turnaround",
    concurrency: "4 active requests · 10 profiles",
    confidence: "Highest available depth for detailed, multi-part decisions.",
    upgrade: "Unlock volume solutions as your care work grows."
  }
];

function renderPricing() {
  const grid = $("#pricingGrid");
  if (!grid) return;
  const annual = state.billing === "annual";
  grid.innerHTML = membershipPlans.map((plan) => {
    const price = annual ? plan.annual : plan.monthly;
    const savings = plan.monthly * 12 - plan.annual;
    const billingNote = annual
      ? `Billed annually in USD · Save $${savings}`
      : "Billed monthly in USD · Change any time";
    return `<article class="pricing-card${plan.popular ? " popular" : ""}">
      ${plan.popular ? '<span class="popular-badge">Most popular</span>' : ""}
      <p class="pricing-tier">${plan.name}</p>
      <h3>${plan.audience}</h3>
      <p class="price"><span>$${price}</span> <small>/${annual ? "year" : "month"}</small></p>
      <p class="billing-note">${billingNote}</p>
      <button class="${plan.popular ? "primary-button" : "secondary-button"} plan-button" data-pricing-action="select" data-tier="${plan.id}" type="button">Choose ${plan.name} <span>→</span></button>
      <dl class="plan-details"><div><dt>Included usage</dt><dd>${plan.usage}</dd></div><div><dt>When you need more</dt><dd>${plan.overage}</dd></div><div><dt>Output</dt><dd>${plan.depth}<br>${plan.length}</dd></div><div><dt>Speed + focus</dt><dd>${plan.turnaround}<br>${plan.concurrency}</dd></div><div><dt>Confidence</dt><dd>${plan.confidence}</dd></div></dl>
      <p class="upgrade-note"><b>Upgrading unlocks:</b> ${plan.upgrade}</p>
    </article>`;
  }).join("");
}

const demoFlows = {
  "Skin Match": {
    kicker: "SKIN MATCH · SAMPLE FLOW",
    title: "Find a calmer starting point",
    step: "Step 1 of 2 · Choose sample priorities",
    body: `
      <p class="flow-intro">Choose one or more priorities. The production portal combines these with sensitivities, preferences, and approved product data.</p>
      <div class="flow-options">
        <label class="flow-option"><input type="checkbox" name="match-concern" value="Barrier support" checked> Barrier support</label>
        <label class="flow-option"><input type="checkbox" name="match-concern" value="Sensitivity"> Sensitivity</label>
        <label class="flow-option"><input type="checkbox" name="match-concern" value="Texture"> Texture</label>
        <label class="flow-option"><input type="checkbox" name="match-concern" value="Fine lines"> Fine lines</label>
      </div>
      <button class="flow-action" data-flow-action="match" type="button">Create sample match <span>→</span></button>
    `
  },
  "Routine Builder": {
    kicker: "ROUTINE BUILDER · SAMPLE FLOW",
    title: "A simple barrier-first routine",
    step: "Sample routine · Compatibility checked",
    body: `
      <p class="flow-intro">The deterministic routine engine orders products first. Our analysis engine explains the result without changing safety rules.</p>
      <div class="routine-preview">
        <div><b>AM 01</b><span>Prequel Gleanser</span><small>Daily</small></div>
        <div><b>AM 02</b><span>Dieux Deliverance Serum</span><small>Daily</small></div>
        <div><b>AM 03</b><span>EltaMD UV Clear SPF 46</span><small>Daily</small></div>
        <div><b>PM 01</b><span>Skinfix Barrier+ Triple Lipid</span><small>Daily</small></div>
      </div>
      <button class="flow-action" data-flow-action="routine" type="button">Explain this routine <span>→</span></button>
    `
  },
  "Care Coach": {
    kicker: "CARE COACH · SAMPLE FLOW",
    title: "Ask a routine question",
    step: "Private platform routing · Sample only",
    body: `
      <p class="flow-intro">Try a sample question. This demo simulates the guidance flow and does not send your text outside this demonstration.</p>
      <textarea class="coach-input" id="coachQuestion" aria-label="Care Coach question">How should I simplify my routine when my skin feels irritated?</textarea>
      <button class="flow-action" data-flow-action="coach" type="button">Route sample question <span>→</span></button>
    `
  },
  "Data export": {
    kicker: "ACCOUNT DATA · SAMPLE FLOW",
    title: "Review a portable export",
    step: "Preview only · No personal data",
    body: `
      <p class="flow-intro">Production exports require a verified session. This preview contains sample fields only.</p>
      <pre class="export-preview">{
  "profile": { "displayName": "Alex Morgan" },
  "skinGoals": ["barrier support"],
  "savedProducts": ["Deliverance Serum"],
  "routine": { "morning": 3, "evening": 1 },
  "deletionRequest": null
}</pre>
      <button class="flow-action" data-flow-action="export" type="button">Prepare demo export <span>↓</span></button>
    `
  },
  "Release evidence": {
    kicker: "RELEASE EVIDENCE · SAMPLE VIEW",
    title: "A clear handoff, not a guess",
    step: "Verified locally · Live validation remains separate",
    body: `
      <p class="flow-intro">This sample shows the release evidence recorded before a build moves forward. It keeps local verification separate from real production approval.</p>
      <div class="routine-preview">
        <div><b>01</b><span>Portal release gate</span><small>Passed locally</small></div>
        <div><b>02</b><span>Public artifact scan</span><small>Clear</small></div>
        <div><b>03</b><span>Continuous verification</span><small>Configured for reviews and main updates</small></div>
        <div><b>04</b><span>Live environment</span><small>Still requires credentials, service checks, and restore evidence</small></div>
      </div>
      <div class="flow-result"><span>RELEASE STATUS</span><h3>Ready for reviewed integration</h3><p>The source can move through review with recorded local evidence. Deployment stays blocked until the live environment proves its own readiness.</p><div class="flow-meta"><span>LOCAL EVIDENCE</span><span>NO LIVE CLAIMS</span><span>REVIEW REQUIRED</span></div></div>
    `
  }
};

function openDemoFlow(name) {
  const flow = demoFlows[name];
  if (!flow) return;
  $("#demoDialogKicker").textContent = flow.kicker;
  $("#demoDialogTitle").textContent = flow.title;
  $("#demoDialogStep").textContent = flow.step;
  $("#demoDialogBody").innerHTML = flow.body;
  const dialog = $("#demoDialog");
  if (!dialog.open) dialog.showModal();
}

function renderFlowResult(action) {
  const body = $("#demoDialogBody");
  if (action === "match") {
    const choices = $$('input[name="match-concern"]:checked').map((input) => input.value);
    if (!choices.length) {
      showToast("Choose at least one sample priority");
      return;
    }
    $("#demoDialogStep").textContent = "Step 2 of 2 · Explainable sample result";
    body.innerHTML = `<div class="flow-result"><span>TOP SAMPLE MATCH · 92% FIT</span><h3>Deliverance Serum</h3><p>Selected for ${choices.join(", ").toLowerCase()} with a low-friction place in the current routine. Production results require approved catalog evidence.</p><div class="flow-meta"><span>SCORING FIRST</span><span>PLATFORM EXPLANATION</span><span>INCLUDED GUIDANCE</span></div></div>`;
    return;
  }
  if (action === "routine") {
    $("#demoDialogStep").textContent = "Routine explanation complete";
    body.innerHTML = '<div class="flow-result"><span>ROUTINE EXPLANATION</span><h3>Keep the routine steady</h3><p>The routine separates treatment from recovery, protects the morning with SPF, and avoids adding another active while irritation is present.</p><div class="flow-meta"><span>PROPRIETARY SCORING</span><span>SAFETY RULES PRESERVED</span><span>INCLUDED GUIDANCE</span></div></div>';
    return;
  }
  if (action === "coach") {
    const question = $("#coachQuestion")?.value.trim();
    if (!question) {
      showToast("Enter a sample question first");
      return;
    }
    $("#demoDialogStep").textContent = "Guidance prepared · Sample only";
    body.innerHTML = '<div class="flow-result"><span>GUIDANCE REVIEW · SAMPLE OUTPUT</span><h3>Reduce variables for several days</h3><p>Pause optional actives, keep a gentle cleanser and familiar moisturizer, and continue sunscreen if tolerated. Seek professional guidance for persistent pain, swelling, or a severe reaction.</p><div class="flow-meta"><span>CONTEXT REVIEWED</span><span>SAFETY-AWARE</span><span>INCLUDED GUIDANCE</span></div></div>';
    return;
  }
  if (action === "export") {
    $("#demoDialogStep").textContent = "Demo export prepared";
    body.insertAdjacentHTML("beforeend", '<div class="flow-result"><span>EXPORT READY</span><h3>Sample package prepared</h3><p>No file was downloaded and no live account data was accessed in this demonstration.</p></div>');
    const button = body.querySelector('[data-flow-action="export"]');
    if (button) button.disabled = true;
  }
}

document.addEventListener("click", (event) => {
  const billingToggle = event.target.closest("[data-billing]");
  if (billingToggle) {
    state.billing = billingToggle.dataset.billing;
    $$("[data-billing]").forEach((button) => {
      const active = button === billingToggle;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderPricing();
    return;
  }

  const planChoice = event.target.closest("[data-pricing-action='select']");
  if (planChoice) {
    const plan = membershipPlans.find((item) => item.id === planChoice.dataset.tier);
    if (plan) showToast(`${plan.name} selected in this demo. Secure enrollment will be connected in the production release.`);
    return;
  }

  const guestMode = event.target.closest("[data-guest-mode]");
  if (guestMode) {
    state.guestMode = guestMode.dataset.guestMode;
    $$(".guest-mode").forEach((button) => {
      const active = button === guestMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#guestInviteState").hidden = true;
    showToast(state.guestMode === "match" ? "Shared access selected for this demo" : "Basic guest access selected for this demo");
    return;
  }

  if (event.target.closest("#guestInviteButton")) {
    const label = state.guestMode === "match" ? "Shared access" : "Basic guest";
    $("#guestInviteMode").textContent = label;
    $("#guestInviteState").hidden = false;
    showToast(`${label} invite prepared for 30 days in this demo`);
    return;
  }

  const saveButton = event.target.closest("[data-save]");
  if (saveButton) {
    const id = Number(saveButton.dataset.save);
    state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
    renderProducts();
    showToast(state.saved.has(id) ? "Saved to your edit" : "Removed from Saved");
    return;
  }

  const compareButton = event.target.closest("[data-compare]");
  if (compareButton) {
    const id = Number(compareButton.dataset.compare);
    state.compare.has(id) ? state.compare.delete(id) : state.compare.add(id);
    renderProducts();
    return;
  }

  const removeFilter = event.target.closest("[data-remove]");
  if (removeFilter) {
    for (const key of ["concern", "type"]) state.filters[key].delete(removeFilter.dataset.remove);
    $$('input[type="checkbox"]').forEach((input) => {
      if (input.value === removeFilter.dataset.remove) input.checked = false;
    });
    renderProducts();
    return;
  }

  const retailer = event.target.closest(".retailer-tab");
  if (retailer) {
    state.retailer = retailer.dataset.retailer;
    $$(".retailer-tab").forEach((button) => button.classList.toggle("active", button === retailer));
    renderProducts();
    return;
  }

  const consoleTab = event.target.closest(".console-tab");
  if (consoleTab) {
    activateConsolePanel(consoleTab.dataset.panel);
    return;
  }

  const demoAction = event.target.closest(".demo-action");
  if (demoAction) {
    openDemoFlow(demoAction.dataset.demo);
    return;
  }

  const flowAction = event.target.closest("[data-flow-action]");
  if (flowAction) {
    renderFlowResult(flowAction.dataset.flowAction);
    return;
  }

  if (event.target.closest("#closeDemoDialog")) {
    $("#demoDialog").close();
    return;
  }

  if (event.target.closest("#deleteAccountButton")) {
    updateDeletionDemo();
    return;
  }

  if (event.target.closest("#clearAll") || event.target.closest("#resetEmpty")) {
    resetFilters();
    return;
  }

  if (event.target.closest("#clearCompare")) {
    state.compare.clear();
    renderProducts();
    return;
  }

  if (event.target.closest("#compareButton")) {
    showToast("Comparison preview is ready for your selected products");
    return;
  }

  if (event.target.closest("#savedHeader")) {
    state.retailer = "Saved";
    $$(".retailer-tab").forEach((button) => button.classList.toggle("active", button.dataset.retailer === "Saved"));
    renderProducts();
    $("#shop").scrollIntoView({ behavior: "smooth" });
    return;
  }

  if (event.target.closest("#menuButton")) {
    const menu = $(".main-nav");
    const open = menu.classList.toggle("open");
    $("#menuButton").setAttribute("aria-expanded", String(open));
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) {
    const set = state.filters[event.target.name];
    event.target.checked ? set.add(event.target.value) : set.delete(event.target.value);
    renderProducts();
  }
  if (event.target.id === "priceRange") {
    state.price = Number(event.target.value);
    renderProducts();
  }
  if (event.target.id === "sortSelect") renderProducts();
});

const navLinks = $$(".main-nav a");
navLinks.forEach((link) => link.addEventListener("click", () => {
  $(".main-nav").classList.remove("open");
  $("#menuButton").setAttribute("aria-expanded", "false");
}));

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-30% 0px -60% 0px", threshold: [0, .2, .6] });
  ["home", "applications", "plans", "shop", "operations", "account"].forEach((id) => observer.observe(document.getElementById(id)));
}

activateConsolePanel("privacy");
renderProducts();
renderPricing();
