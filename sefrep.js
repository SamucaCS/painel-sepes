const SUPABASE_URL = "https://ffprsdeicjjttfedzbif.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcHJzZGVpY2pqdHRmZWR6YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTg4NTksImV4cCI6MjA4MTEzNDg1OX0.U5J1L6vv7RZztxUjJ4UKcNhtHzwOlaU0NTeXoyAa0GU";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEMAS = [
    { key: "VTC", label: "VTC" },
    { key: "CTC", label: "CTC" },
    { key: "LICENCA_PREMIUM", label: "Licença Prêmio" },
    { key: "LICENCA_PREMIO", label: "Licença Prêmio" },
    { key: "CONTAGEM_TEMPO", label: "Contagem de Tempo" },
];

// Removido CONTAGEM_TEMPO daqui para que ele mostre o Status/Badge
const TEMAS_TOPICO = new Set(["LICENCA_PREMIUM", "LICENCA_PREMIO"]);

const $ = (id) => document.getElementById(id);
let allRows = [];
let pieChart = null;

document.addEventListener("DOMContentLoaded", () => {
    $("btnMenu").addEventListener("click", () => (window.location.href = "index.html"));
    $("btnSeape").addEventListener("click", () => (window.location.href = "seape.html"));
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
    temaSel.innerHTML = `<option value="">Todos</option>` +
        [
            { key: "VTC", label: "VTC" },
            { key: "CTC", label: "CTC" },
            { key: "LICENCA_PREMIUM", label: "Licença Prêmio" },
            { key: "CONTAGEM_TEMPO", label: "Contagem de Tempo" },
        ].map(t => `<option value="${t.key}">${t.label}</option>`).join("");

    const statusSel = $("fStatus");
    statusSel.innerHTML = `
    <option value="">Todos</option>
    <option value="concluido">Concluído / Finalizado</option>
    <option value="andamento">Em andamento</option>
    <option value="naoconcluido">Não concluído</option>
    <option value="analise">Em análise</option>
    <option value="devolvido">Devolvido</option>
    <option value="publicado">Publicado</option>
    <option value="semstatus">Sem status (tópico)</option>
  `;
    $("fEscola").innerHTML = `<option value="">Todas</option>`;
    $("fBusca").value = "";
}

async function load() {
    try {
        showMsg("Carregando dados...", "");
        const rows = await fetchAllSEFREP();
        allRows = rows;

        const escolas = Array.from(new Set(allRows.map(r => (r.escola || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        $("fEscola").innerHTML = `<option value="">Todas</option>` + escolas.map(e => `<option value="${escapeAttr(e)}">${escapeHtml(e)}</option>`).join("");

        $("pillResumo").innerHTML = `Registros: <strong>${allRows.length}</strong>`;
        $("lblAtualizacao").textContent = `Atualizado em ${fmtDateTime(new Date().toISOString())}`;

        showMsg("", "");
        applyFilters();
    } catch (err) {
        console.error(err);
        showMsg("Erro ao carregar: " + (err?.message || err), "err");
    }
}

async function fetchAllSEFREP() {
    const pageSize = 1000;
    let from = 0;
    let out = [];

    while (true) {
        const { data, error } = await supabaseClient
            .from("sefrep_registros")
            .select("*")
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
            const temaKey = (r.tema_key || "").toUpperCase();
            const semStatus = TEMAS_TOPICO.has(temaKey);
            if (status === "semstatus") return semStatus;
            if (semStatus) return false;
            return statusClass(r.status || "") === status;
        });
    }

    if (busca) {
        rows = rows.filter(r => {
            const bag = [r.nome, r.protocolo, r.topico, r.observacoes, r.escola].filter(Boolean).join(" ").toLowerCase();
            return bag.includes(busca);
        });
    }

    renderKpis(rows);
    renderPie(rows);
    renderTable(rows);
    $("lblQtd").textContent = `${rows.length} registro(s)`;
}

function renderKpis(rows) {
    const counts = { VTC: 0, CTC: 0, LICENCA_PREMIUM: 0, CONTAGEM_TEMPO: 0 };
    rows.forEach(r => {
        const k = (r.tema_key || "").toUpperCase();
        if (k === "LICENCA_PREMIO") counts.LICENCA_PREMIUM++;
        else if (counts[k] !== undefined) counts[k]++;
    });

    $("kpis").innerHTML = [
        kpiCard("Total", rows.length),
        kpiCard("VTC", counts.VTC),
        kpiCard("CTC", counts.CTC),
        kpiCard("Licença Prêmio", counts.LICENCA_PREMIUM),
        kpiCard("Contagem de Tempo", counts.CONTAGEM_TEMPO),
    ].join("");
}

function kpiCard(label, value) {
    return `<div class="kpi"><div class="label">${escapeHtml(label)}</div><div class="value">${value}</div></div>`;
}

function renderPie(rows) {
    const counts = { concluido: 0, andamento: 0, naoconcluido: 0, analise: 0, devolvido: 0, publicado: 0, semstatus: 0 };

    rows.forEach(r => {
        const temaKey = (r.tema_key || "").toUpperCase();
        if (TEMAS_TOPICO.has(temaKey)) {
            counts.semstatus += 1;
        } else {
            const c = statusClass(r.status || "");
            if (c && counts[c] !== undefined) counts[c] += 1;
        }
    });

    const ctx = $("pieStatus").getContext("2d");
    if (pieChart) pieChart.destroy();

    pieChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Concluído", "Em andamento", "Não concluído", "Análise", "Devolvido", "Publicado", "Tópico"],
            datasets: [{
                data: [counts.concluido, counts.andamento, counts.naoconcluido, counts.analise, counts.devolvido, counts.publicado, counts.semstatus],
                backgroundColor: ["#16A34A", "#F59E0B", "#EF4444", "#94A3B8", "#FCD34D", "#3B82F6", "#64748B"],
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "62%" }
    });
}

function renderTable(rows) {
    const tbody = $("tbody");
    tbody.innerHTML = rows.length ? "" : `<tr><td colspan="8" class="muted">Nenhum registro encontrado.</td></tr>`;

    rows.forEach(r => {
        const temaKey = (r.tema_key || "").toUpperCase();
        const temaLabel = normalizeTemaLabel(r.tema, temaKey);
        let stCell = `<span class="muted">—</span>`;

        if (TEMAS_TOPICO.has(temaKey)) {
            stCell = r.topico ? `<span class="tag-neutral">${escapeHtml(prettyTopico(r.topico))}</span>` : `<span class="muted">—</span>`;
        } else {
            stCell = r.status ? `<span class="badge-status ${statusClass(r.status)}">${escapeHtml(r.status)}</span>` : `<span class="muted">—</span>`;
        }

        // Regra para ocultar Data de Saída na Contagem de Tempo
        const saidaDisplay = (temaKey === "CONTAGEM_TEMPO") ? `<span class="muted">—</span>` : (r.data_saida ? fmtDate(r.data_saida) : `<span class="muted">—</span>`);

        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${fmtDateTime(r.created_at || r.updated_at)}</td>
      <td>${escapeHtml(temaLabel)}</td>
      <td>${r.escola ? escapeHtml(r.escola) : `<span class="muted">—</span>`}</td>
      <td>${stCell}</td>
      <td>${r.protocolo ? escapeHtml(r.protocolo) : `<span class="muted">—</span>`}</td>
      <td>${r.data_entrada ? fmtDate(r.data_entrada) : `<span class="muted">—</span>`}</td>
      <td>${saidaDisplay}</td>
      <td title="${escapeAttr(r.observacoes)}">${r.observacoes ? escapeHtml(truncate(r.observacoes, 70)) : `<span class="muted">—</span>`}</td>
    `;
        tbody.appendChild(tr);
    });
}

function normalizeTemaLabel(temaText, temaKey) {
    if (temaKey === "LICENCA_PREMIUM" || temaKey === "LICENCA_PREMIO") return "Licença Prêmio";
    if (temaKey === "CONTAGEM_TEMPO") return "Contagem de Tempo";
    if (temaKey === "VTC") return "VTC";
    if (temaKey === "CTC") return "CTC";
    return temaText || temaKey || "—";
}

function prettyTopico(t) {
    const s = (t || "").toLowerCase().trim();
    if (s === "pecunia") return "Pecúnia";
    if (s === "gozo") return "Gozo";
    if (s.includes("cert")) return "Certidão";
    if (s === "manual") return "Manual";
    if (s === "automatico" || s === "automático") return "Automático";
    return t;
}

function statusClass(status) {
    const s = (status || "").toLowerCase().trim();
    if (s.includes("não") || s.includes("nao")) return "naoconcluido";
    if (s.includes("andamento") || s.includes("atendendo")) return "andamento";
    if (s.includes("concluido") || s.includes("finalizado")) return "concluido";
    if (s.includes("analise")) return "analise";
    if (s.includes("devolvido")) return "devolvido";
    if (s.includes("publicado")) return "publicado";
    return "";
}

function truncate(text, n) { return text.length > n ? text.slice(0, n) + "…" : text; }
function fmtDate(dateStr) { if (!dateStr) return ""; const [y, m, d] = dateStr.split("-"); return `${d}/${m}/${y}`; }
function fmtDateTime(iso) { if (!iso) return "—"; const dt = new Date(iso); return dt.toLocaleString('pt-BR'); }
function escapeHtml(str) { return (str || "").toString().replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#039;" }[m])); }
function escapeAttr(str) { return escapeHtml(str); }
