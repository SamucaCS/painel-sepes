const SUPABASE_URL = "https://ffprsdeicjjttfedzbif.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcHJzZGVpY2pqdHRmZWR6YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTg4NTksImV4cCI6MjA4MTEzNDg1OX0.U5J1L6vv7RZztxUjJ4UKcNhtHzwOlaU0NTeXoyAa0GU";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TEMAS = [
    { key: "EVOLUCAO_FUNCIONAL", label: "Evolução funcional" },
    { key: "APOSENTADORIA", label: "Aposentadoria" },
    { key: "FAI_PUCT", label: "FAI & PUCT" },
];
const $ = (id) => document.getElementById(id);
let allRows = [];
let pieChart = null;

document.addEventListener("DOMContentLoaded", () => {
    $("btnMenu").addEventListener("click", () => (window.location.href = "index.html"));
    $("btnSefrep").addEventListener("click", () => (window.location.href = "sefrep.html"));
    $("btnRecarregar").addEventListener("click", () => load());

    $("btnAplicar").addEventListener("click", () => applyFilters());
    $("btnLimpar").addEventListener("click", () => {
        fillFiltersDefaults();
        applyFilters();
    });

    fillFiltersDefaults();
    load();
});

function showMsg(text, type = "") {
    const el = $("msg");
    if (!text) {
        el.style.display = "none";
        el.textContent = "";
        el.className = "msg";
        return;
    }
    el.style.display = "block";
    el.className = "msg";
    if (type) el.classList.add(type);
    el.textContent = text;
}

function fillFiltersDefaults() {
    const temaSel = $("fTema");
    temaSel.innerHTML = `<option value="">Todos</option>` + TEMAS.map(t => `<option value="${t.key}">${t.label}</option>`).join("");
    const statusSel = $("fStatus");
    statusSel.innerHTML = `
    <option value="">Todos</option>
    <option value="concluido">Concluído</option>
    <option value="andamento">Em andamento</option>
    <option value="naoconcluido">Não concluído</option>
    <option value="atendendo">Atendendo exigências</option>
  `;

    const escolaSel = $("fEscola");
    escolaSel.innerHTML = `<option value="">Todas</option>`;

    $("fBusca").value = "";
}

async function load() {
    try {
        showMsg("Carregando dados...", "");
        const rows = await fetchAllSEAPE();
        allRows = rows;


        const escolas = Array.from(new Set(allRows.map(r => (r.escola || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        $("fEscola").innerHTML = `<option value="">Todas</option>` + escolas.map(e => `<option value="${escapeAttr(e)}">${escapeHtml(e)}</option>`).join("");

        const total = allRows.length;
        $("pillResumo").innerHTML = `Registros: <strong>${total}</strong>`;
        $("lblAtualizacao").textContent = `Atualizado em ${fmtDateTime(new Date().toISOString())}`;

        showMsg("", "");
        applyFilters();
    } catch (err) {
        console.error(err);
        showMsg("Erro ao carregar: " + (err?.message || err), "err");
    }
}

async function fetchAllSEAPE() {
    const pageSize = 1000;
    let from = 0;
    let out = [];

    while (true) {
        const { data, error } = await supabaseClient
            .from("seape_registros")
            .select("id, tema_key, tema, escola, protocolo, processo, status, observacoes, data_entrada, data_saida, created_at, updated_at")
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) throw error;

        out = out.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
    }

    return out;
}

function applyFilters() {
    const tema = $("fTema").value;
    const status = $("fStatus").value;
    const escola = $("fEscola").value;
    const busca = ($("fBusca").value || "").toLowerCase().trim();

    let rows = [...allRows];

    if (tema) rows = rows.filter(r => (r.tema_key || "") === tema);

    if (escola) rows = rows.filter(r => (r.escola || "") === escola);

    if (status) {
        rows = rows.filter(r => {
            const sc = statusClass(r.status || "");
            if (status === "atendendo") return (r.status || "").toLowerCase().includes("atendendo");
            return sc === status;
        });
    }

    if (busca) {
        rows = rows.filter(r => {
            const bag = [
                r.protocolo,
                r.processo,
                r.observacoes
            ].filter(Boolean).join(" ").toLowerCase();
            return bag.includes(busca);
        });
    }

    renderKpis(rows);
    renderPie(rows);
    renderTable(rows);

    $("lblQtd").textContent = `${rows.length} registro(s)`;
}

function renderKpis(rows) {
    const kpis = $("kpis");
    const total = rows.length;

    const byTema = new Map();
    for (const t of TEMAS) byTema.set(t.key, 0);
    rows.forEach(r => {
        const k = r.tema_key || "";
        if (byTema.has(k)) byTema.set(k, byTema.get(k) + 1);
    });

    kpis.innerHTML = [
        kpiCard("Total", total),
        ...TEMAS.map(t => kpiCard(t.label, byTema.get(t.key) || 0))
    ].join("");
}

function kpiCard(label, value) {
    return `
    <div class="kpi">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${value}</div>
    </div>
  `;
}

function renderPie(rows) {
    const counts = { concluido: 0, andamento: 0, naoconcluido: 0 };

    rows.forEach(r => {
        const c = statusClass(r.status || "");
        if (c && counts[c] !== undefined) counts[c] += 1;
    });

    const ctx = $("pieStatus").getContext("2d");
    if (pieChart) pieChart.destroy();

    pieChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Concluído", "Em andamento", "Não concluído"],
            datasets: [{
                data: [counts.concluido, counts.andamento, counts.naoconcluido],
                backgroundColor: ["#16A34A", "#F59E0B", "#EF4444"],
                borderColor: "rgba(255,255,255,.10)",
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            cutout: "62%"
        }
    });
}
function renderTable(rows) {
    const tbody = $("tbody");
    tbody.innerHTML = "";
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="muted">Nenhum registro encontrado.</td></tr>`;
        return;
    }

    rows.forEach(r => {
        const temaLabel = (r.tema || prettyTema(r.tema_key) || "—");
        const st = r.status ? `<span class="badge-status ${statusClass(r.status)}">${escapeHtml(r.status)}</span>` : `<span class="muted">—</span>`;
        const proc = r.protocolo ? r.protocolo : (r.processo ? r.processo : "");
        const obs = r.observacoes ? r.observacoes : "";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escapeHtml(temaLabel)}</td>
            <td>${st}</td>
            <td>${proc ? escapeHtml(proc) : `<span class="muted">—</span>`}</td>
            <td>${r.data_entrada ? fmtDate(r.data_entrada) : `<span class="muted">—</span>`}</td>
            <td>${r.data_saida ? fmtDate(r.data_saida) : `<span class="muted">—</span>`}</td>
            <td class="col-obs">
                <div class="obs-wrapper" title="${escapeAttr(obs)}">
                    ${obs ? escapeHtml(obs) : `<span class="muted">—</span>`}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
function prettyTema(key) {
    const t = TEMAS.find(x => x.key === key);
    return t ? t.label : key;
}

function statusClass(status) {
    const s = (status || "").toLowerCase().trim();
    if (s.includes("não") || s.includes("nao")) return "naoconcluido";
    if (s.includes("andamento") || s.includes("atendendo")) return "andamento";
    if (s.includes("concluido")) return "concluido";
    return "";
}

function truncate(text, n) {
    const s = (text || "").toString();
    return s.length > n ? (s.slice(0, n) + "…") : s;
}

function fmtDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
}

function fmtDateTime(iso) {
    if (!iso) return "—";
    const dt = new Date(iso);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, "0");
    const mi = String(dt.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function escapeHtml(str) {
    return (str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function escapeAttr(str) {
    return escapeHtml(str).replaceAll('"', "&quot;");
}
