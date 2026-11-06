import { request } from "./api.js";
import { totals, money, dateText, termLabels } from "./financial-values.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const statusNames = {
  DRAFT: "Mustand",
  READY: "Valmis",
  SENDING: "Saatmisel",
  SENT: "Saadetud",
  UNCERTAIN: "Vajab saatmise kontrolli",
};
const typeNames = { invoice: "Arve", quotation: "Hinnapakkumine" };
const call = (path = "", options = {}) => request(`/financial${path}`, options);
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Tallinn" }).format(
    new Date(),
  );
export async function mountFinancial(root, { kind = "" } = {}) {
  const section = document.createElement("section");
  section.className = "staff-home financial";
  root.replaceChildren(section);
  let settings,
    current,
    offset = 0,
    search = "",
    status = "",
    createId = crypto.randomUUID();
  const render = (html) => {
    section.innerHTML = `<h1>DOKUMENDID</h1><p class="financial-error" role="alert" hidden></p>${html}`;
  };
  const error = (e) => {
    const box = section.querySelector('[role="alert"]');
    if (box) {
      box.hidden = false;
      const message = e.payload?.error || e.message;
      box.textContent = ({ 401: "Seanss on aegunud. Logige uuesti sisse.", 403: "Teil puudub selleks toiminguks õigus.", 429: "Liiga palju päringuid. Proovige veidi hiljem uuesti." })[e.status]
        || (typeof message === "string" && !/^[A-Z_]+$/.test(message) && !(e instanceof TypeError) ? message : "Toiming ebaõnnestus. Proovige uuesti.");
      box.scrollIntoView({ block: "nearest" });
    }
  };
  const button = (action, label) =>
    `<button type="button" data-finance="${action}">${label}</button>`;
  const input = (name, label, value = "", type = "text", placeholder = "") =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="1500"></label>`;
  async function list() {
    const result = await call(
      `?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&offset=${offset}&kind=${encodeURIComponent(kind)}`,
    );
    current = null;
    render(`${kind ? `<h2>${kind === "invoice" ? "Arved" : "Hinnapakkumised"}</h2>` : ""}<div class="financial-toolbar">${kind !== "quotation" ? button("new-invoice", "Arved → Loo uus arve") : ""}${kind !== "invoice" ? button("new-quotation", "Hinnapakkumised → Loo uus hinnapakkumine") : ""}</div>
      ${!settings.issuer ? "<p>Käibemaksu staatus vajab administraatori kinnitust. Uute dokumentide loomine pole veel võimalik.</p>" : ""}
      <form data-finance-form="filter" class="financial-toolbar">${input("search", "Otsi numbri või tellija järgi", search)}
      <label>Staatus<select name="status"><option value="">Kõik</option>${Object.entries(
        statusNames,
      )
        .map(
          ([key, label]) =>
            `<option value="${key}" ${key === status ? "selected" : ""}>${label}</option>`,
        )
        .join("")}</select></label><button>Otsi</button></form>
      <div class="financial-table"><table><thead><tr>${["Number", "Liik", "Kuupäev", "Tellija", "Summa", "Staatus", "Koostaja"].map((s) => `<th>${s}</th>`).join("")}</tr></thead><tbody>
      ${result.documents.map((d) => `<tr><td><button data-finance="open" data-id="${d.id}">${esc(d.number)}</button></td><td>${typeNames[d.kind]}</td><td>${dateText(d.data.date)}</td><td>${esc(d.data.customer)}</td><td>${d.data.totals.lines.includes(null) ? "—" : money(d.data.totals.total)}</td><td>${statusNames[d.status]}</td><td>${esc(d.creator_name)}</td></tr>`).join("") || '<tr><td colspan="7">Dokumente ei leitud.</td></tr>'}</tbody></table></div>
      <div class="financial-toolbar">${offset ? button("previous", "Eelmised") : ""}${result.hasMore ? button("next", "Järgmised") : ""}</div>`);
  }
  function row(item = { quantity: "1", unit: "teenus", unitPrice: "" }) {
    return `<fieldset class="financial-item"><legend>Kauba / teenuse rida</legend>${input("description", "Kirjeldus", item.description, "text", "Esinemine moderaatori rollis koos transpordiga")}
      ${input("quantity", "Kogus", item.quantity, "text", "1")}${input("unit", "Ühik", item.unit, "text", "teenus")}${input("unitPrice", "Ühiku hind (€)", item.unitPrice, "text", "400,00")}
      <output class="financial-line-total"></output>${button("remove-line", "Eemalda rida")}</fieldset>`;
  }
  function editor(doc) {
    current = doc;
    const v = doc.data,
      quote = doc.kind === "quotation";
    render(`${button("list", "← Dokumentide loend")}<h2>${typeNames[doc.kind]} ${esc(doc.number || "— uus mustand")}</h2>
      <p>Organisatsiooni andmed lisatakse automaatselt. Valuuta: EUR. ${doc.issuer?.vatRegistered ? `Käibemaks: ${doc.issuer.vatRate}%` : "Käibemaks ei lisandu."}</p>
      <form data-finance-form="save"><div class="financial-fields">
      ${input("date", "Kuupäev", v.date, "date")}${input("dueDate", quote ? "Kehtib kuni" : "Maksetähtaeg", v.dueDate, "date")}
      ${quote ? input("execution", "Täitmise aeg", v.execution, "text", "Kuupäev või periood") : input("supplyDate", "Kauba / teenuse kuupäev", v.supplyDate || "", "date")}
      ${input("project", "Projekti / lepingu viide", v.project, "text", "GALA-2026")}
      ${input("reference", "Viide", v.reference)}
      ${input("customer", "Tellija nimi", v.customer, "text", "Ettevõtte, asutuse või eraisiku nimi")}${input("registrationCode", "Registrikood", v.registrationCode)}
      ${input("address", "Aadress", v.address)}${input("contact", "Kontaktisik", v.contact)}${input("email", "E-post", v.email, "email")}${input("phone", "Telefon", v.phone, "tel")}
      ${!quote ? input("referenceNumber", "Viitenumber (valikuline)", v.referenceNumber) + input("explanation", "Selgitus", v.explanation) : ""}</div>
      <h3>Kaubad ja teenused</h3><div class="financial-items">${v.items.map(row).join("")}</div>${button("add-line", "Lisa kauba / teenuse rida")}<p class="financial-total" aria-live="polite"></p>
      <h3>Tingimused</h3><p>Tingimused lisatakse Wordi faili. Täitmata väljad märgitakse kriipsuga.</p>
      ${Object.entries(termLabels)
        .map(
          ([key, label]) =>
            `<label>${label}<textarea name="term-${key}" maxlength="1500" placeholder="${esc({ delivery: "Koht või üleandmise viis", costs: "Kõik kulud sisalduvad hinnas.", payment: "100% pärast täitmist, 14 päeva arve kuupäevast.", confirmation: "Saatke nõustumus aadressile juhatus@noortetugi.ee.", changes: "Muudatused lepitakse eelnevalt kokku e-posti teel.", annexes: "Lisade pealkirjad ja kuupäevad" }[key])}">${esc(v.terms?.[key])}</textarea></label>`,
        )
        .join("")}
      <div class="financial-toolbar"><button type="submit">Salvesta mustand</button>${doc.id ? button("preview", quote ? "Laadi alla Wordi fail" : "Laadi alla PDF") + button("finalize", quote ? "Kinnita ja saada Wordi fail" : "Kinnita ja saada PDF") : ""}</div></form>`);
    recalculate();
  }
  function values() {
    const form = section.querySelector('form[data-finance-form="save"]');
    const read = (name) => form.querySelector(`[name="${name}"]`)?.value || "";
    const data = Object.fromEntries(
      [
        "date",
        "dueDate",
        "customer",
        "registrationCode",
        "address",
        "contact",
        "email",
        "phone",
        "execution",
        "project",
        "reference",
        "referenceNumber",
        "explanation",
      ].map((k) => [k, read(k)]),
    );
    if (current.kind === "invoice") data.supplyDate = read("supplyDate");
    data.currency = "EUR";
    data.items = [...form.querySelectorAll(".financial-item")].map((el) =>
      Object.fromEntries(
        ["description", "quantity", "unit", "unitPrice"].map((k) => [
          k,
          el.querySelector(`[name="${k}"]`).value,
        ]),
      ),
    );
    data.terms = Object.fromEntries(
      Object.keys(termLabels).map((k) => [k, read(`term-${k}`)]),
    );
    return data;
  }
  function recalculate() {
    const output = section.querySelector(".financial-total");
    if (!output) return;
    try {
      const sums = totals(values().items, current.issuer.vatRate, { allowIncomplete: true });
      output.textContent = sums.lines.includes(null)
        ? "Kogus või hind on täitmata. Mustandi saab salvestada; lõppsumma arvutatakse pärast kõigi ridade täitmist."
        : `Summa: ${money(sums.subtotal)} · Käibemaks: ${money(sums.vat)} · Kokku: ${money(sums.total)}`;
      section
        .querySelectorAll(".financial-line-total")
        .forEach(
          (el, i) => (el.textContent = `Summa: ${sums.lines[i] === null ? "—" : money(sums.lines[i])}`),
        );
    } catch {
      output.textContent = "Sisestage kogus ja ühiku hind.";
      section.querySelectorAll(".financial-line-total").forEach((el) => (el.textContent = "Summa: —"));
    }
  }
  async function save() {
    const result = await call(current.id ? `/${current.id}` : "", {
      method: current.id ? "PATCH" : "POST",
      json: current.id
        ? { data: values(), version: current.version }
        : {
            id: createId,
            kind: current.kind,
            data: values(),
            correctionOf: current.correction_of,
          },
    });
    current = result.document;
    createId = crypto.randomUUID();
    return current;
  }
  async function open(id) {
    const result = await call(`/${id}`);
    current = result.document;
    if (current.status === "DRAFT") {
      editor(current);
      return;
    }
    render(`${button("list", "← Dokumentide loend")}<h2>${typeNames[current.kind]} ${esc(current.number)}</h2><p>${esc(current.data.customer)} · ${money(current.data.totals.total)} · ${statusNames[current.status]}</p>
      <div class="financial-toolbar">${current.kind === 'invoice' ? `<a href="/api/staff/financial/${id}/pdf?download=1">Laadi alla PDF</a>` : ''}<a href="/api/staff/financial/${id}/docx">Laadi alla Wordi fail</a>${current.kind !== 'invoice' && !current.has_docx ? `<a href="/api/staff/financial/${id}/pdf?download=1">Laadi alla varasem PDF</a>` : ""}${button("correct", "Loo seotud paranduse mustand")}</div>
      <p>Kinnitatud dokumenti ei muudeta. Parandus säilitatakse eraldi dokumendina ja algne dokument jääb ajalukku.</p>
      ${
        current.status === "READY"
          ? `<h3>Saada e-postiga</h3><form data-finance-form="send">${input("recipient", "Saaja e-post", current.data.email || (current.confirmation_delivery_status ? "" : settings.financeEmail), "email")}
      <p>${current.confirmation_delivery_status ? "See vorm on dokumendi saatmiseks kliendile. Kinnitamise e-kirja kordussaatmine ei ole lubatud." : "Ainult asutusesiseseks saatmiseks sisestage finantsjuhi aadress."} Koopia: ${esc(settings.financeEmail)}.</p>
      ${input("subject", "Teema", `${typeNames[current.kind]} ${current.number}`)}<label>Sõnum<textarea name="message" maxlength="10000">Tere!\n\nManuses on ${current.kind === "invoice" ? "arve" : "hinnapakkumine"} ${esc(current.number)}.\n\nLugupidamisega\nMTÜ Noortealgatuste Tugi</textarea></label>
      <p>Manus: ${current.has_docx ? esc(`${current.kind === "invoice" ? "Arve" : "Hinnapakkumine"}_${current.number}.docx`) : `${esc(current.number)}.pdf`}</p><label><input type="checkbox" name="confirmed" required> Kinnitan saaja, sõnumi ja manuse ning soovin dokumendi saata.</label><button>Saada dokument</button></form>`
          : ""
      }
      ${["SENDING", "UNCERTAIN"].includes(current.status) ? "<p>Saatmise tulemus vajab administraatori kontrolli. Ärge looge kordussaatmist enne postkasti kontrollimist.</p>" : ""}
      ${current.confirmation_delivery_status ? `<p role="status">${current.confirmation_delivery_status === "SENT" ? `Dokument on kinnitatud. E-posti teenus võttis ${current.kind === 'invoice' ? 'PDF-i' : 'Wordi faili'} saatmiseks vastu aadressile ${esc(current.kind === 'invoice' ? settings.invoiceCopyEmail : settings.financeEmail)}.` : "Dokument on kinnitatud. E-kirja saatmine on pooleli või vajab kontrolli; ärge saatke uuesti enne postkasti kontrollimist."}</p>` : ""}<h3>Ajalugu</h3><ul>${result.history.map((h) => `<li>${esc(new Date(h.created_at).toLocaleString("et-EE"))} · ${esc(h.actor_name)} · ${esc({ CREATED: "Loodud", UPDATED: "Muudetud", FINALIZED: "Kinnitatud", CONFIRMATION_SENT: "Kinnitamise e-kiri saadetud", CONFIRMATION_UNCERTAIN: "Kinnitatud; e-kirja saatmine vajab kontrolli", SEND_STARTED: "Saatmine alustatud", SENT: "Saadetud", UNCERTAIN: "Saatmine vajab kontrolli" }[h.action] || h.action)}</li>`).join("")}</ul>`);
  }
  section.addEventListener("input", recalculate);
  section.addEventListener("click", async (event) => {
    const b = event.target.closest("[data-finance]");
    if (!b) return;
    b.disabled = true;
    try {
      const action = b.dataset.finance;
      if (action === "list") await list();
      else if (action === "open") await open(b.dataset.id);
      else if (action === "next" || action === "previous") {
        offset += action === "next" ? 50 : -50;
        await list();
      } else if (action.startsWith("new-")) {
        if (!settings.issuer)
          throw new Error(
            "Käibemaksu staatus vajab administraatori kinnitust.",
          );
        createId = crypto.randomUUID();
        editor({
          kind: action.slice(4),
          issuer: settings.issuer,
          data: {
            date: today(),
            dueDate: today(),
            items: [{ quantity: "1", unit: "teenus", unitPrice: "" }],
          },
        });
      } else if (action === "add-line") {
        section
          .querySelector(".financial-items")
          .insertAdjacentHTML("beforeend", row());
        recalculate();
      } else if (action === "remove-line") {
        if (section.querySelectorAll(".financial-item").length > 1)
          b.closest("fieldset").remove();
        recalculate();
      } else if (action === "preview") {
        // Reserve the tab during the user's click; browsers can block popups
        // opened only after an asynchronous draft save.
        const preview = window.open("about:blank", "_blank");
        if (preview) preview.opener = null;
        try {
          await save();
          editor(current);
          const url = `/api/staff/financial/${current.id}/${current.kind === 'invoice' ? 'pdf?download=1' : 'docx'}`;
          section.insertAdjacentHTML("beforeend", `<p><a href="${url}" target="_blank" rel="noopener">${current.kind === 'invoice' ? 'Laadi alla PDF' : 'Laadi alla Wordi fail'}</a></p>`);
          if (preview) preview.location.replace(url);
        } catch (e) {
          preview?.close();
          throw e;
        }
      } else if (action === "finalize") {
        await save();
        if (current.data.totals.lines.includes(null))
          throw new Error("Enne kinnitamist täitke kõigi ridade kogus ja ühiku hind.");
        if (
          !window.confirm(
            `Kinnitada dokument summas ${money(current.data.totals.total)}? ${current.kind === 'invoice' ? 'PDF' : 'Wordi fail'} saadetakse aadressile ${current.kind === 'invoice' ? settings.invoiceCopyEmail : settings.financeEmail}. Pärast kinnitamist ei saa selle sisu muuta.`,
          )
        ) {
          editor(current);
          return;
        }
        const result = await call(`/${current.id}/finalize`, {
          method: "POST",
          json: { version: current.version },
        });
        await open(current.id);
        if (result.warning) error(new Error(result.warning));
      } else if (action === "correct") {
        if (!settings.issuer) throw new Error("Käibemaksu staatus vajab administraatori kinnitust.");
        createId = crypto.randomUUID();
        editor({
          ...current,
          id: undefined,
          number: undefined,
          status: "DRAFT",
          issuer: settings.issuer,
          correction_of: current.id,
        });
      }
    } catch (e) {
      error(e);
    } finally {
      b.disabled = false;
    }
  });
  section.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target,
      b = form.querySelector('button[type="submit"],button:not([type])');
    if (b) b.disabled = true;
    try {
      if (form.dataset.financeForm === "filter") {
        const f = new FormData(form);
        search = String(f.get("search"));
        status = String(f.get("status"));
        offset = 0;
        await list();
      }
      if (form.dataset.financeForm === "save") {
        await save();
        editor(current);
      }
      if (form.dataset.financeForm === "send") {
        const f = new FormData(form);
        await call(`/${current.id}/send`, {
          method: "POST",
          json: {
            recipient: f.get("recipient"),
            subject: f.get("subject"),
            message: f.get("message"),
            confirmed: f.get("confirmed") === "on",
          },
        });
        await open(current.id);
      }
    } catch (e) {
      if (form.dataset.financeForm === "send" && e.payload?.document) {
        try { await open(e.payload.document.id); } catch { /* Keep the original delivery warning. */ }
      }
      error(e);
    } finally {
      if (b) b.disabled = false;
    }
  });
  render("<p>Laadin dokumente…</p>");
  try {
    settings = await call("/settings");
    await list();
  } catch (e) {
    error(e);
  }
}
