const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let customers = [], orders = [], tickets = JSON.parse(localStorage.getItem("shopconnect-tickets") || "[]");
let lastAIResult = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
function dateShort(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" });
}
function statusPill(status) {
  const label = String(status || "unknown").replace(/-/g, " ");
  return `<span class="pill ${esc(label.toLowerCase().replace(/\s+/g,"-"))}">${esc(label)}</span>`;
}
function notify(message, isError=false) {
  const n = $("#notice");
  n.textContent = message;
  n.classList.toggle("error", isError);
  n.classList.remove("hidden");
  window.scrollTo({top:0, behavior:"smooth"});
  setTimeout(() => n.classList.add("hidden"), 6500);
}
async function getJSON(url, options) {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || data.error || `Request failed (${r.status})`);
  return data;
}
async function loadData() {
  try {
    const [health, c, o] = await Promise.all([getJSON("/api/health"), getJSON("/api/customers"), getJSON("/api/orders")]);
    customers = c; orders = o;
    $("#mode-badge").textContent = health.mode === "demo-data" ? "● Demo data" : "● WooCommerce connected";
    $("#mode-badge").style.color = health.mode === "demo-data" ? "#a56a12" : "#16815e";
    renderAll();
  } catch (e) {
    notify(`Could not load the dashboard: ${e.message}. Check that the server is running.`, true);
    $("#mode-badge").textContent = "Connection error";
  }
}
function renderAll() {
  $("#stat-customers").textContent = customers.length;
  $("#stat-orders").textContent = orders.length;
  $("#stat-tickets").textContent = tickets.filter(t => t.status !== "Resolved").length;
  $("#stat-high").textContent = tickets.filter(t => t.priority === "High" && t.status !== "Resolved").length;
  $("#recent-orders").innerHTML = orders.slice(0,5).map(o => `<tr><td><strong>#${esc(o.id)}</strong></td><td>${esc(o.customer_name || "Guest customer")}</td><td>${esc(dateShort(o.date_created))}</td><td>${statusPill(o.status)}</td><td>${esc(o.total)}</td></tr>`).join("") || emptyRow(5,"No orders found.");
  renderCustomers(); renderOrders(); renderTickets();
}
function emptyRow(cols, text) { return `<tr><td colspan="${cols}" class="empty-row">${esc(text)}</td></tr>`; }
function renderCustomers() {
  const query = ($("#customer-search")?.value || "").toLowerCase();
  const filtered = customers.filter(c => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(query));
  $("#customers-table").innerHTML = filtered.map(c => `<tr><td><span class="customer-name">${esc(c.name)}</span><span class="sub-cell">Customer #${esc(c.id)}</span></td><td>${esc(c.email)}</td><td>${esc(c.phone || "—")}</td><td>${esc(c.ordersCount ?? orders.filter(o=>String(o.customer_id)===String(c.id)).length)}</td><td><button class="table-action" data-customer="${esc(c.id)}">View profile</button></td></tr>`).join("") || emptyRow(5,"No matching customers.");
}
function renderOrders() {
  const filter = $("#order-filter")?.value || "all";
  const filtered = orders.filter(o => filter === "all" || o.status === filter);
  $("#orders-table").innerHTML = filtered.map(o => {
    const item = (o.line_items || []).map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ") || "—";
    return `<tr><td><strong>#${esc(o.id)}</strong></td><td>${esc(o.customer_name || "Guest customer")}</td><td>${esc(item)}</td><td>${esc(dateShort(o.date_created))}</td><td>${statusPill(o.status)}</td><td>${esc(o.total)}</td></tr>`;
  }).join("") || emptyRow(6,"No orders for this status.");
}
function renderTickets() {
  $("#tickets-list").innerHTML = tickets.length ? tickets.slice().reverse().map(t => `<article class="ticket-card">
    <div class="ticket-meta"><span class="ticket-id">${esc(t.id)} · ${esc(dateShort(t.createdAt))}</span>${statusPill(t.priority)}</div>
    <h3>${esc(t.subject)}</h3><div class="ticket-customer">${esc(t.customer)} ${t.orderId ? `· Order #${esc(t.orderId)}` : ""}</div><p>${esc(t.description)}</p>
    ${t.aiSummary ? `<div class="tip"><strong>AI assistance</strong><p>${esc(t.aiSummary)}</p></div>` : ""}
    <div class="ticket-controls"><label>Status <select data-ticket-status="${esc(t.id)}">${["Open","In Progress","Resolved"].map(s=>`<option ${t.status===s?"selected":""}>${s}</option>`).join("")}</select></label><label>Priority <select data-ticket-priority="${esc(t.id)}">${["Low","Medium","High"].map(s=>`<option ${t.priority===s?"selected":""}>${s}</option>`).join("")}</select></label></div>
  </article>`).join("") : `<div class="panel empty-state"><div class="empty-icon">✉</div><strong>No tickets yet</strong><p>Create a support ticket or analyse a complaint with the assistant.</p></div>`;
  $("#stat-tickets").textContent = tickets.filter(t=>t.status!=="Resolved").length;
  $("#stat-high").textContent = tickets.filter(t=>t.priority==="High" && t.status!=="Resolved").length;
}
function showView(name) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${name}`).classList.remove("hidden");
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $("#page-title").textContent = ({overview:"Overview",customers:"Customers",orders:"Orders",tickets:"Support tickets",assistant:"AI support assistant"})[name];
}
function saveTickets() { localStorage.setItem("shopconnect-tickets", JSON.stringify(tickets)); renderTickets(); }
function openCustomer(id) {
  const c = customers.find(x => String(x.id) === String(id));
  if (!c) return;
  const related = orders.filter(o => String(o.customer_id) === String(c.id));
  const panel = $("#customer-detail");
  panel.classList.remove("hidden");
  panel.innerHTML = `<h3>${esc(c.name)} <span class="sub-cell">Customer #${esc(c.id)}</span></h3><div>${esc(c.email)} · ${esc(c.phone || "No phone provided")}</div><div class="detail-stats"><span><strong>${related.length}</strong> orders in loaded data</span><span><strong>${esc(c.ordersCount ?? related.length)}</strong> total orders reported</span></div><h3 style="margin-top:20px">Order history</h3><div class="table-wrap"><table><thead><tr><th>ORDER</th><th>DATE</th><th>STATUS</th><th>TOTAL</th></tr></thead><tbody>${related.map(o=>`<tr><td>#${esc(o.id)}</td><td>${esc(dateShort(o.date_created))}</td><td>${statusPill(o.status)}</td><td>${esc(o.total)}</td></tr>`).join("") || emptyRow(4,"No orders linked to this customer in the loaded data.")}</tbody></table></div>`;
  panel.scrollIntoView({behavior:"smooth",block:"nearest"});
}
$$(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
$$("[data-goto]").forEach(b => b.addEventListener("click", () => showView(b.dataset.goto)));
$("#customer-search").addEventListener("input", renderCustomers);
$("#order-filter").addEventListener("change", renderOrders);
$("#customers-table").addEventListener("click", e => { const b=e.target.closest("[data-customer]"); if(b) openCustomer(b.dataset.customer); });
$("#sync-btn").addEventListener("click", async () => {
  const b=$("#sync-btn"); b.disabled=true; b.textContent="Syncing…";
  try { const result=await getJSON("/api/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}); await loadData(); notify(result.message); }
  catch(e){notify(e.message,true)}
  finally{b.disabled=false;b.textContent="↻ Sync store"}
});
$("#new-ticket-btn").addEventListener("click",()=>$("#ticket-form").classList.toggle("hidden"));
$("#cancel-ticket").addEventListener("click",()=>$("#ticket-form").classList.add("hidden"));
$("#create-ticket-form").addEventListener("submit",e=>{
  e.preventDefault(); const f=new FormData(e.currentTarget);
  const ticket={id:`T-${Date.now().toString().slice(-7)}`,customer:f.get("customer").trim(),orderId:f.get("orderId").trim(),subject:f.get("subject").trim(),description:f.get("description").trim(),priority:f.get("priority"),status:f.get("status"),createdAt:new Date().toISOString()};
  tickets.push(ticket);saveTickets();e.currentTarget.reset();$("#ticket-form").classList.add("hidden");notify(`Ticket ${ticket.id} created successfully.`);showView("tickets");
});
$("#tickets-list").addEventListener("change",e=>{
  const id=e.target.dataset.ticketStatus||e.target.dataset.ticketPriority;if(!id)return;
  const ticket=tickets.find(t=>t.id===id);if(!ticket)return;
  if(e.target.dataset.ticketStatus)ticket.status=e.target.value;else ticket.priority=e.target.value;
  saveTickets();notify(`Ticket ${id} updated.`);
});
$("#assistant-form").addEventListener("submit",async e=>{
  e.preventDefault(); const button=e.currentTarget.querySelector("button");button.disabled=true;button.textContent="Analysing…";
  try{
    const result=await getJSON("/api/ai-assist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({complaint:$("#ai-complaint").value,orderId:$("#ai-order").value})});
    lastAIResult={...result,complaint:$("#ai-complaint").value,orderId:$("#ai-order").value};
    renderAI(lastAIResult);
  }catch(err){notify(err.message,true)}
  finally{button.disabled=false;button.textContent="✧ Analyse complaint"}
});
function renderAI(r){
  $("#ai-empty").classList.add("hidden");$("#ai-result").classList.remove("hidden");
  $("#ai-result").innerHTML=`<div class="result-block"><div class="result-label">ISSUE CATEGORY</div><div class="result-value"><strong>${esc(r.category)}</strong></div></div>
  <div class="result-block"><div class="result-label">SUGGESTED PRIORITY</div>${statusPill(r.priority)} <span class="sub-cell">${esc(r.proposedAction)}</span></div>
  <div class="result-block"><div class="result-label">COMPLAINT SUMMARY</div><div class="result-value">${esc(r.summary)}</div></div>
  <div class="result-block"><div class="result-label">SUGGESTED REPLY · HUMAN REVIEW REQUIRED</div><div class="result-value">${esc(r.suggestedReply)}</div></div>
  <div class="tip"><strong>Transparency</strong><p>${esc(r.notice)}</p></div>
  <div class="result-actions"><button class="btn btn-primary" id="create-ai-ticket">Create ticket from analysis</button><button class="btn btn-secondary" id="copy-ai-reply">Copy suggested reply</button></div>`;
  $("#create-ai-ticket").addEventListener("click",()=>{
    const t={id:`T-${Date.now().toString().slice(-7)}`,customer:"Customer to confirm",orderId:r.orderId,subject:r.category,description:r.complaint,priority:r.priority,status:"Open",createdAt:new Date().toISOString(),aiSummary:r.summary};
    tickets.push(t);saveTickets();notify(`Ticket ${t.id} created. Confirm the customer identity before taking action.`);showView("tickets");
  });
  $("#copy-ai-reply").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(r.suggestedReply);notify("Suggested reply copied. Review it before sending.");}catch{notify("Clipboard unavailable. Select and copy the suggested reply manually.",true)}});
}
loadData();
