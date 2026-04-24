const STORAGE_KEY = "hortalicasElaineMovimentacoes";
const CATEGORIAS_RECEITA = ["Feira Gyn Viva", "Feira Goia", "Pontinho Max", "Entregas"];
const FIREBASE_PLACEHOLDER = "COLE_SUA_API_KEY_AQUI";

const els = {
  authScreen: document.getElementById("authScreen"),
  appContainer: document.getElementById("appContainer"),
  authForm: document.getElementById("authForm"),
  authStatus: document.getElementById("authStatus"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  usuarioInfo: document.getElementById("usuarioInfo"),
  modoLocalBtn: document.getElementById("modoLocalBtn"),
  dataAtual: document.getElementById("dataAtual"),
  saldoAtual: document.getElementById("saldoAtual"),
  totalReceitas: document.getElementById("totalReceitas"),
  totalDespesas: document.getElementById("totalDespesas"),
  margemResultado: document.getElementById("margemResultado"),
  financeForm: document.getElementById("financeForm"),
  descricao: document.getElementById("descricao"),
  categoria: document.getElementById("categoria"),
  valor: document.getElementById("valor"),
  data: document.getElementById("data"),
  listaMovimentacoes: document.getElementById("listaMovimentacoes"),
  limparTudo: document.getElementById("limparTudo"),
  gerarPdf: document.getElementById("gerarPdf"),
  filtroTipo: document.getElementById("filtroTipo"),
  filtroCategoria: document.getElementById("filtroCategoria"),
  filtroDataInicio: document.getElementById("filtroDataInicio"),
  filtroDataFim: document.getElementById("filtroDataFim"),
  totalFiltroSelecionado: document.getElementById("totalFiltroSelecionado"),
  receitasFiltroSelecionado: document.getElementById("receitasFiltroSelecionado"),
  despesasFiltroSelecionado: document.getElementById("despesasFiltroSelecionado"),
  limparFiltro: document.getElementById("limparFiltro"),
  submitBtn: document.getElementById("submitBtn"),
  cancelEdit: document.getElementById("cancelEdit")
};

let movimentacoes = [];
let chartReceitaDespesa;
let chartEvolucao;
let chartDespesasCategoria;
let editandoId = null;
let usuarioAtual = null;
let modoOnline = false;
let auth = null;
let db = null;
let googleProvider = null;
let filtros = {
  tipo: "todos",
  categoria: "todas",
  dataInicio: "",
  dataFim: ""
};

init();

function init() {
  els.dataAtual.textContent = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date());

  els.data.value = hojeISO(0);

  els.financeForm.addEventListener("submit", onSubmitForm);
  els.listaMovimentacoes.addEventListener("click", onTabelaAcao);
  els.limparTudo.addEventListener("click", onLimparTudo);
  els.gerarPdf.addEventListener("click", onGerarPdf);
  els.cancelEdit.addEventListener("click", cancelarEdicao);
  els.categoria.addEventListener("change", aplicarTipoAutomatico);
  els.filtroTipo.addEventListener("change", onFiltroChange);
  els.filtroCategoria.addEventListener("change", onFiltroChange);
  els.filtroDataInicio.addEventListener("change", onFiltroChange);
  els.filtroDataFim.addEventListener("change", onFiltroChange);
  els.limparFiltro.addEventListener("click", onLimparFiltro);
  els.loginBtn.addEventListener("click", onLoginWithGoogle);
  els.logoutBtn.addEventListener("click", onLogout);
  els.modoLocalBtn.addEventListener("click", onModoLocal);

  aplicarTipoAutomatico();
  atualizarOpcoesFiltroCategoria();

  if (inicializarFirebase()) {
    setAuthStatus("Clique em Entrar com Google para acessar o painel.", "info");

    auth.onAuthStateChanged(async (user) => {
      usuarioAtual = user;

      if (user) {
        modoOnline = true;
        atualizarCabecalhoUsuario();
        setAuthStatus(`Conectado como ${user.email}.`, "success");
        await carregarMovimentacoesNuvem();
        atualizarVisibilidadeApp(true);
        render();
        return;
      }

      movimentacoes = [];
      modoOnline = false;
      atualizarCabecalhoUsuario();
      atualizarVisibilidadeApp(false);
      setAuthStatus("Clique em Entrar com Google para sincronizar os dados.", "info");
    });

    return;
  }

  ativarModoLocal("Firebase ainda nao configurado. O painel esta em modo local neste navegador.");
}

async function onSubmitForm(event) {
  event.preventDefault();

  const descricao = els.descricao.value.trim();
  const categoria = els.categoria.value;
  const tipo = tipoPorCategoria(categoria);
  const valor = Number(els.valor.value);
  const data = els.data.value;

  if (!categoria || !data || !Number.isFinite(valor) || valor <= 0) {
    alert("Preencha todos os campos com valores validos.");
    return;
  }

  if (editandoId) {
    movimentacoes = movimentacoes.map((item) =>
      item.id === editandoId
        ? {
            ...item,
            tipo,
            descricao: descricao || "Sem descricao",
            categoria,
            valor,
            data
          }
        : item
    );
  } else {
    movimentacoes.push({
      id: crypto.randomUUID(),
      tipo,
      descricao: descricao || "Sem descricao",
      categoria,
      valor,
      data
    });
  }

  try {
    await persistirMovimentacoes();
  } catch (error) {
    console.error(error);
    alert("Movimentacao salva localmente, mas houve falha na sincronizacao online.");
  }

  resetarFormulario();
  render();
}

async function onTabelaAcao(event) {
  const botao = event.target.closest("button[data-id]");
  if (!botao) {
    return;
  }

  const id = botao.dataset.id;
  const acao = botao.dataset.action;

  if (acao === "edit") {
    iniciarEdicao(id);
    return;
  }

  movimentacoes = movimentacoes.filter((item) => item.id !== id);

  try {
    await persistirMovimentacoes();
  } catch (error) {
    console.error(error);
    alert("Exclusao salva localmente, mas nao sincronizou com o banco online.");
  }

  if (editandoId === id) {
    resetarFormulario();
  }

  render();
}

async function onLimparTudo() {
  if (movimentacoes.length === 0) {
    return;
  }

  const confirmou = confirm("Deseja realmente remover todas as movimentacoes?");
  if (!confirmou) {
    return;
  }

  movimentacoes = [];

  try {
    await persistirMovimentacoes();
  } catch (error) {
    console.error(error);
    alert("Os dados foram limpos localmente, mas houve falha na sincronizacao online.");
  }

  render();
}

function render() {
  const itensFiltrados = aplicarFiltros(movimentacoes);
  const resumo = calcularResumo(movimentacoes);
  const resumoFiltro = calcularResumo(itensFiltrados);
  renderKPIs(resumo);
  atualizarOpcoesFiltroCategoria();
  renderResumoFiltro(resumoFiltro);
  renderTabela(itensFiltrados);
  renderGraficos(resumo, movimentacoes);
}

function calcularResumo(itens) {
  const totalReceitas = itens
    .filter((item) => item.tipo === "receita")
    .reduce((acum, item) => acum + item.valor, 0);

  const totalDespesas = itens
    .filter((item) => item.tipo === "despesa")
    .reduce((acum, item) => acum + item.valor, 0);

  const saldoAtual = totalReceitas - totalDespesas;
  const margem = totalReceitas > 0 ? (saldoAtual / totalReceitas) * 100 : 0;

  return {
    totalReceitas,
    totalDespesas,
    saldoAtual,
    margem
  };
}

function renderKPIs(resumo) {
  els.totalReceitas.textContent = moedaBRL(resumo.totalReceitas);
  els.totalDespesas.textContent = moedaBRL(resumo.totalDespesas);
  els.saldoAtual.textContent = moedaBRL(resumo.saldoAtual);
  els.margemResultado.textContent = `${resumo.margem.toFixed(1).replace(".", ",")}%`;

  els.saldoAtual.style.color = resumo.saldoAtual >= 0 ? "#2f7a2a" : "#b13d2f";
}

function renderTabela(itens) {
  if (itens.length === 0) {
    els.listaMovimentacoes.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">Nenhuma movimentacao cadastrada.</td>
      </tr>
    `;
    return;
  }

  const itensOrdenados = [...itens].sort((a, b) => new Date(b.data) - new Date(a.data));

  els.listaMovimentacoes.innerHTML = itensOrdenados
    .map((item) => {
      const classeValor = item.tipo === "receita" ? "valor-receita" : "valor-despesa";
      const sinal = item.tipo === "receita" ? "+" : "-";

      return `
        <tr>
          <td>${dataBR(item.data)}</td>
          <td>${item.descricao}</td>
          <td>${item.categoria}</td>
          <td>
            <span class="tipo-chip ${item.tipo}">
              ${item.tipo === "receita" ? "Receita" : "Despesa"}
            </span>
          </td>
          <td class="${classeValor}">${sinal} ${moedaBRL(item.valor)}</td>
          <td>
            <button class="edit-btn" data-action="edit" data-id="${item.id}" type="button">Editar</button>
            <button class="delete-btn" data-action="delete" data-id="${item.id}" type="button">Excluir</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderGraficos(resumo, itens) {
  const contexto1 = document.getElementById("chartReceitaDespesa");
  const contexto2 = document.getElementById("chartEvolucao");
  const contexto3 = document.getElementById("chartDespesasCategoria");

  if (chartReceitaDespesa) {
    chartReceitaDespesa.destroy();
  }

  if (chartEvolucao) {
    chartEvolucao.destroy();
  }

  if (chartDespesasCategoria) {
    chartDespesasCategoria.destroy();
  }

  chartReceitaDespesa = new Chart(contexto1, {
    type: "doughnut",
    data: {
      labels: ["Receitas", "Despesas"],
      datasets: [
        {
          data: [resumo.totalReceitas, resumo.totalDespesas],
          backgroundColor: ["#3d8b45", "#cc523d"],
          borderWidth: 0,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom"
        },
        title: {
          display: true,
          text: "Distribuicao Geral"
        }
      }
    }
  });

  const dadosMensais = construirSerieMensal(itens, 6);

  chartEvolucao = new Chart(contexto2, {
    type: "bar",
    data: {
      labels: dadosMensais.labels,
      datasets: [
        {
          label: "Receitas",
          data: dadosMensais.receitas,
          backgroundColor: "rgba(61, 139, 69, 0.75)",
          borderRadius: 8
        },
        {
          label: "Despesas",
          data: dadosMensais.despesas,
          backgroundColor: "rgba(204, 82, 61, 0.75)",
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom"
        },
        title: {
          display: true,
          text: "Receitas e Despesas dos Ultimos 6 Meses"
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return moedaBRL(value);
            }
          }
        }
      }
    }
  });

  const dadosDespesasCategoria = construirDespesasPorCategoria(itens);

  chartDespesasCategoria = new Chart(contexto3, {
    type: "bar",
    data: {
      labels: dadosDespesasCategoria.labels,
      datasets: [
        {
          label: "Total por categoria",
          data: dadosDespesasCategoria.valores,
          backgroundColor: "rgba(186, 84, 66, 0.78)",
          borderRadius: 8
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: true,
          text: "Total de Despesas por Categoria"
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return moedaBRL(value);
            }
          }
        }
      }
    }
  });
}

function construirDespesasPorCategoria(itens) {
  const agrupado = itens
    .filter((item) => item.tipo === "despesa")
    .reduce((acc, item) => {
      acc[item.categoria] = (acc[item.categoria] || 0) + item.valor;
      return acc;
    }, {});

  const entradas = Object.entries(agrupado).sort((a, b) => b[1] - a[1]);

  if (entradas.length === 0) {
    return { labels: ["Sem despesas"], valores: [0] };
  }

  return {
    labels: entradas.map(([categoria]) => categoria),
    valores: entradas.map(([, total]) => total)
  };
}

function construirSerieMensal(itens, quantidadeMeses) {
  const agora = new Date();
  const meses = [];

  for (let i = quantidadeMeses - 1; i >= 0; i -= 1) {
    const data = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    const label = data.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    meses.push({ chave, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }

  const receitas = meses.map(({ chave }) =>
    itens
      .filter((item) => item.tipo === "receita" && item.data.startsWith(chave))
      .reduce((acum, item) => acum + item.valor, 0)
  );

  const despesas = meses.map(({ chave }) =>
    itens
      .filter((item) => item.tipo === "despesa" && item.data.startsWith(chave))
      .reduce((acum, item) => acum + item.valor, 0)
  );

  return {
    labels: meses.map((mes) => mes.label),
    receitas,
    despesas
  };
}

function moedaBRL(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(valor);
}

function dataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeISO(offsetDias) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().split("T")[0];
}

function criarMovimentacoesIniciais() {
  return [
    {
      id: crypto.randomUUID(),
      tipo: "receita",
      descricao: "Venda semanal",
      categoria: "Feira Gyn Viva",
      valor: 1480,
      data: hojeISO(-5)
    },
    {
      id: crypto.randomUUID(),
      tipo: "despesa",
      descricao: "Compra de mudas",
      categoria: "Ceasa",
      valor: 420,
      data: hojeISO(-4)
    },
    {
      id: crypto.randomUUID(),
      tipo: "despesa",
      descricao: "Abastecimento da semana",
      categoria: "Combustivel",
      valor: 180,
      data: hojeISO(-2)
    },
    {
      id: crypto.randomUUID(),
      tipo: "receita",
      descricao: "Venda de final de semana",
      categoria: "Pontinho Max",
      valor: 930,
      data: hojeISO(-1)
    }
  ];
}

function inicializarFirebase() {
  try {
    const config = window.FIREBASE_CONFIG;
    if (
      typeof firebase === "undefined" ||
      !config ||
      !config.apiKey ||
      config.apiKey === FIREBASE_PLACEHOLDER
    ) {
      return false;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }

    auth = firebase.auth();
    db = firebase.firestore();
    googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });
    return true;
  } catch (error) {
    console.error("Falha ao iniciar Firebase:", error);
    return false;
  }
}

function atualizarVisibilidadeApp(mostrarApp) {
  els.authScreen.hidden = mostrarApp;
  els.appContainer.hidden = !mostrarApp;
}

function atualizarCabecalhoUsuario() {
  if (modoOnline && usuarioAtual) {
    els.usuarioInfo.textContent = usuarioAtual.email || "Usuario conectado";
    els.logoutBtn.hidden = false;
    return;
  }

  els.usuarioInfo.textContent = "Modo local";
  els.logoutBtn.hidden = true;
}

function setAuthStatus(mensagem, tone = "info") {
  els.authStatus.textContent = mensagem;
  els.authStatus.dataset.tone = tone;
}

function alternarBotoesAuth(emProcessamento) {
  els.loginBtn.disabled = emProcessamento;
  els.modoLocalBtn.disabled = emProcessamento;
}

async function onLoginWithGoogle() {
  if (!auth || !googleProvider) {
    ativarModoLocal("Preencha o firebase-config.js para ativar o login online.");
    return;
  }

  try {
    alternarBotoesAuth(true);
    setAuthStatus("Abrindo acesso com Google...", "info");
    await auth.signInWithPopup(googleProvider);
  } catch (error) {
    setAuthStatus(traduzirErroAuth(error), "error");
  } finally {
    alternarBotoesAuth(false);
  }
}

async function onLogout() {
  if (!auth) {
    return;
  }

  await auth.signOut();
}

function onModoLocal() {
  ativarModoLocal("Modo local ativo. Os dados ficam salvos apenas neste navegador.");
}

function ativarModoLocal(mensagem) {
  modoOnline = false;
  usuarioAtual = null;
  movimentacoes = carregarMovimentacoesLocal();
  atualizarCabecalhoUsuario();
  atualizarVisibilidadeApp(true);
  setAuthStatus(mensagem, "info");
  render();
}

function carregarMovimentacoesLocal() {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (!salvo) {
      return criarMovimentacoesIniciais();
    }

    const parseado = JSON.parse(salvo);
    if (!Array.isArray(parseado)) {
      return criarMovimentacoesIniciais();
    }

    return normalizarMovimentacoes(parseado);
  } catch {
    return criarMovimentacoesIniciais();
  }
}

async function carregarMovimentacoesNuvem() {
  if (!db || !usuarioAtual) {
    movimentacoes = carregarMovimentacoesLocal();
    return;
  }

  try {
    const snapshot = await obterDocPainel().get();

    if (snapshot.exists) {
      const dados = snapshot.data();
      if (Array.isArray(dados.movimentacoes)) {
        movimentacoes = normalizarMovimentacoes(dados.movimentacoes);
        return;
      }
    }

    movimentacoes = criarMovimentacoesIniciais();
    await persistirMovimentacoes();
  } catch (error) {
    console.error("Falha ao carregar dados online:", error);
    movimentacoes = carregarMovimentacoesLocal();
    setAuthStatus("Nao foi possivel ler o banco online. O painel abriu com os dados locais.", "error");
  }
}

function normalizarMovimentacoes(lista) {
  if (!Array.isArray(lista)) {
    return [];
  }

  return lista
    .filter((item) => item && item.categoria && item.data)
    .map((item) => ({
      id: item.id || crypto.randomUUID(),
      tipo: item.tipo || tipoPorCategoria(item.categoria),
      descricao: item.descricao || "Sem descricao",
      categoria: item.categoria,
      valor: Number(item.valor) || 0,
      data: item.data
    }));
}

function obterDocPainel() {
  return db.collection("usuarios").doc(usuarioAtual.uid).collection("painel").doc("financeiro");
}

async function persistirMovimentacoes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movimentacoes));

  if (modoOnline && db && usuarioAtual) {
    await obterDocPainel().set(
      {
        email: usuarioAtual.email || "",
        movimentacoes,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }
}

function traduzirErroAuth(error) {
  const mensagens = {
    "auth/popup-closed-by-user": "A janela do Google foi fechada antes da conclusao.",
    "auth/cancelled-popup-request": "O login foi cancelado. Tente novamente.",
    "auth/popup-blocked": "O navegador bloqueou a janela do Google. Libere o pop-up e tente de novo.",
    "auth/unauthorized-domain": "Este dominio ainda nao esta liberado no Firebase Auth. Adicione o dominio do Vercel em Authorized domains.",
    "auth/account-exists-with-different-credential": "Ja existe conta com este email usando outro metodo de acesso.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Falha de conexao. Verifique sua internet."
  };

  return mensagens[error?.code] || "Nao foi possivel concluir a autenticacao com Google agora.";
}

function onFiltroChange() {
  filtros = {
    tipo: els.filtroTipo.value,
    categoria: els.filtroCategoria.value,
    dataInicio: els.filtroDataInicio.value,
    dataFim: els.filtroDataFim.value
  };

  render();
}

function onLimparFiltro() {
  filtros = {
    tipo: "todos",
    categoria: "todas",
    dataInicio: "",
    dataFim: ""
  };

  els.filtroTipo.value = "todos";
  els.filtroCategoria.value = "todas";
  els.filtroDataInicio.value = "";
  els.filtroDataFim.value = "";
  render();
}

function atualizarOpcoesFiltroCategoria() {
  const categorias = [...new Set(movimentacoes.map((item) => item.categoria))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  const selecionada = filtros.categoria;

  els.filtroCategoria.innerHTML = `
    <option value="todas">Todas</option>
    ${categorias.map((categoria) => `<option value="${categoria}">${categoria}</option>`).join("")}
  `;

  els.filtroCategoria.value = categorias.includes(selecionada) || selecionada === "todas" ? selecionada : "todas";
  filtros.categoria = els.filtroCategoria.value;
}

function aplicarFiltros(itens) {
  return itens.filter((item) => {
    const okTipo = filtros.tipo === "todos" || item.tipo === filtros.tipo;
    const okCategoria = filtros.categoria === "todas" || item.categoria === filtros.categoria;
    const okInicio = !filtros.dataInicio || item.data >= filtros.dataInicio;
    const okFim = !filtros.dataFim || item.data <= filtros.dataFim;
    return okTipo && okCategoria && okInicio && okFim;
  });
}

function onGerarPdf() {
  const itensFiltrados = aplicarFiltros(movimentacoes);
  if (itensFiltrados.length === 0) {
    alert("Nao ha lancamentos para gerar PDF com os filtros atuais.");
    return;
  }

  if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") {
    alert("Biblioteca de PDF nao carregada.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const resumo = calcularResumo(itensFiltrados);
  const totaisCategoria = construirTotaisPorCategoria(itensFiltrados);
  const dataGeracao = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());

  doc.setFontSize(16);
  doc.text("Hortalicas da Elaine - Relatorio Financeiro", 14, 16);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${dataGeracao}`, 14, 22);
  doc.text(`Filtro tipo: ${textoFiltroTipo()}`, 14, 27);
  doc.text(`Filtro categoria: ${filtros.categoria === "todas" ? "Todas" : filtros.categoria}`, 14, 32);
  doc.text(`Periodo: ${textoFiltroPeriodo()}`, 14, 37);
  doc.text(`Quantidade de lancamentos: ${itensFiltrados.length}`, 14, 42);

  doc.text(`Total receitas: ${moedaBRL(resumo.totalReceitas)}`, 14, 49);
  doc.text(`Total despesas: ${moedaBRL(resumo.totalDespesas)}`, 14, 54);
  doc.text(`Saldo do filtro: ${moedaBRL(resumo.saldoAtual)}`, 14, 59);

  doc.autoTable({
    startY: 65,
    head: [["Data", "Descricao", "Categoria", "Tipo", "Valor"]],
    body: [...itensFiltrados]
      .sort((a, b) => new Date(b.data) - new Date(a.data))
      .map((item) => [
        dataBR(item.data),
        item.descricao,
        item.categoria,
        item.tipo === "receita" ? "Receita" : "Despesa",
        `${item.tipo === "receita" ? "+" : "-"} ${moedaBRL(item.valor)}`
      ]),
    theme: "striped",
    headStyles: { fillColor: [61, 139, 69] },
    styles: { fontSize: 9, cellPadding: 2.2 },
    margin: { left: 10, right: 10 }
  });

  const posY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.text("Totais por categoria (filtro aplicado)", 14, posY);

  doc.autoTable({
    startY: posY + 3,
    head: [["Categoria", "Receitas", "Despesas", "Saldo"]],
    body: totaisCategoria.map((item) => [
      item.categoria,
      moedaBRL(item.receitas),
      moedaBRL(item.despesas),
      moedaBRL(item.saldo)
    ]),
    theme: "grid",
    headStyles: { fillColor: [85, 106, 72] },
    styles: { fontSize: 9, cellPadding: 2.2 },
    margin: { left: 10, right: 10 }
  });

  const sufixoData = new Date().toISOString().slice(0, 10);
  doc.save(`relatorio-hortalicas-${sufixoData}.pdf`);
}

function renderResumoFiltro(resumo) {
  els.totalFiltroSelecionado.textContent = moedaBRL(resumo.saldoAtual);
  els.receitasFiltroSelecionado.textContent = moedaBRL(resumo.totalReceitas);
  els.despesasFiltroSelecionado.textContent = moedaBRL(resumo.totalDespesas);
}

function construirTotaisPorCategoria(itens) {
  const agrupado = itens.reduce((acc, item) => {
    if (!acc[item.categoria]) {
      acc[item.categoria] = { categoria: item.categoria, receitas: 0, despesas: 0, saldo: 0 };
    }

    if (item.tipo === "receita") {
      acc[item.categoria].receitas += item.valor;
      acc[item.categoria].saldo += item.valor;
    } else {
      acc[item.categoria].despesas += item.valor;
      acc[item.categoria].saldo -= item.valor;
    }

    return acc;
  }, {});

  return Object.values(agrupado).sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));
}

function textoFiltroTipo() {
  if (filtros.tipo === "receita") {
    return "Receitas";
  }
  if (filtros.tipo === "despesa") {
    return "Despesas";
  }
  return "Todos";
}

function textoFiltroPeriodo() {
  const inicio = filtros.dataInicio ? dataBR(filtros.dataInicio) : "Inicio";
  const fim = filtros.dataFim ? dataBR(filtros.dataFim) : "Fim";

  if (!filtros.dataInicio && !filtros.dataFim) {
    return "Todo o periodo";
  }

  return `${inicio} ate ${fim}`;
}

function iniciarEdicao(id) {
  const item = movimentacoes.find((mov) => mov.id === id);
  if (!item) {
    return;
  }

  editandoId = id;
  els.descricao.value = item.descricao === "Sem descricao" ? "" : item.descricao;
  els.categoria.value = item.categoria;
  els.valor.value = item.valor;
  els.data.value = item.data;

  aplicarTipoAutomatico();
  els.submitBtn.textContent = "Atualizar movimentacao";
  els.cancelEdit.hidden = false;
  els.descricao.focus();
}

function cancelarEdicao() {
  resetarFormulario();
}

function resetarFormulario() {
  editandoId = null;
  els.financeForm.reset();
  els.data.value = hojeISO(0);
  els.submitBtn.textContent = "Salvar movimentacao";
  els.cancelEdit.hidden = true;
  aplicarTipoAutomatico();
}

function tipoPorCategoria(categoria) {
  return CATEGORIAS_RECEITA.includes(categoria) ? "receita" : "despesa";
}

function aplicarTipoAutomatico() {
  const categoria = els.categoria.value;
  const tipo = tipoPorCategoria(categoria);
  els.financeForm.querySelector('input[name="tipo"][value="receita"]').checked = tipo === "receita";
  els.financeForm.querySelector('input[name="tipo"][value="despesa"]').checked = tipo === "despesa";
}
