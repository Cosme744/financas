// main.js — inicialização, navegação e ligação dos eventos.

import * as store from './store.js';
import * as telas from './telas.js';
import { situacao } from './engine.js';
import { sincronizar } from './sync.js';
import { escanear, interpretar, nomeDoCNPJ } from './qr.js';

const $tela = document.getElementById('tela');
const $titulo = document.getElementById('mesTitulo');
const $sync = document.getElementById('btnSync');
const $toast = document.getElementById('toast');

let aba = 'home';
let ref = new Date();       // mês em exibição
let sincronizando = false;
let editando = null;        // id do lançamento aberto para edição

/* ---------- utilidades ---------- */

let toastTimer;
function toast(msg, erro = false) {
  $toast.textContent = msg;
  $toast.classList.toggle('erro', erro);
  $toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('on'), 2600);
}

function vibrar(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

const mesmoMes = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/* ---------- pagamento de compromisso ---------- */

function pagarCompromisso(id, adiantando) {
  const c = store.estado().config.compromissos.find((x) => x.id === id);
  if (!c) return;

  const s = situacao(c, store.estado().transacoes, new Date());
  const parcela = c.parcelas ? s.proxima : null;
  const hoje = new Date().toISOString().slice(0, 10);

  store.lancar({
    valor: -c.valor,
    categoria: c.categoria || c.nome,
    nota: parcela ? `${c.nome} (${parcela}/${c.parcelas})` : c.nome,
    compromissoId: c.id,
    parcela,
    data: hoje,
  });

  if (c.reembolso > 0) {
    store.lancar({
      valor: c.reembolso,
      categoria: 'Reembolso',
      nota: c.nome,
      reembolso: true,
      data: hoje,
    });
  }

  vibrar(adiantando ? 24 : 12);
  toast(adiantando ? `${c.nome}: ${parcela}ª parcela adiantada` : `${c.nome} pago`);
  render();
  sincronizarSilencioso();
}

/* ---------- render ---------- */

function render() {
  const nome = ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  $titulo.textContent = mesmoMes(ref, new Date()) ? nome.split(' de ')[0] : nome;

  $tela.innerHTML =
    aba === 'home' ? telas.home(ref)
    : aba === 'lancar' ? telas.lancar()
    : aba === 'mes' ? telas.mes(ref)
    : aba === 'futuro' ? telas.futuro()
    : telas.ajustes();

  const alvo = editando ? store.buscar(editando) : null;
  if (editando && !alvo) editando = null;
  if (alvo) $tela.insertAdjacentHTML('beforeend', telas.painelEditar(alvo));

  document.querySelectorAll('.abas button').forEach((b) =>
    b.classList.toggle('ativa', b.dataset.aba === aba));

  $sync.classList.toggle('pendente', store.estado().fila.length > 0);

  ligarEventos();
  if (!editando) window.scrollTo(0, 0);
}

function ir(destino) {
  aba = destino;
  render();
}

/* ---------- eventos por tela ---------- */

function ligarEventos() {
  $tela.querySelectorAll('[data-ir]').forEach((b) => {
    b.onclick = () => ir(b.dataset.ir);
  });

  $tela.querySelectorAll('[data-editar]').forEach((b) => {
    b.onclick = () => { editando = b.dataset.editar; vibrar(8); render(); };
  });

  if (editando) ligarEdicao();

  if (aba === 'home') {
    $tela.querySelectorAll('[data-pagar]').forEach((b) => {
      b.onclick = () => pagarCompromisso(b.dataset.pagar, false);
    });
    $tela.querySelectorAll('[data-adiantar]').forEach((b) => {
      b.onclick = () => pagarCompromisso(b.dataset.adiantar, true);
    });
  }

  if (aba === 'lancar') {
    telas.ligarLancar($tela, render, (t) => {
      vibrar(18);
      toast(`${telas.dinheiro(t.valor)} lançado`);
      aba = 'home';
      render();
      sincronizarSilencioso();
    }, abrirScanner);
  }

  if (aba === 'ajustes') ligarAjustes();
}

function ligarFormCompromisso() {
  const num = (id) => Number($tela.querySelector(id)?.value) || 0;
  const $ = (id) => $tela.querySelector(id);

  let modo = 'nao';

  const pintarReembolso = () => {
    $tela.querySelectorAll('[data-reemb]').forEach((b) =>
      b.classList.toggle('on', b.dataset.reemb === modo));
    const campo = $('#campoReembolso');
    if (campo) campo.hidden = modo !== 'parte';
  };

  $tela.querySelectorAll('[data-reemb]').forEach((b) => {
    b.onclick = () => { modo = b.dataset.reemb; pintarReembolso(); };
  });

  const limpar = () => {
    for (const id of ['#cId', '#cNome', '#cValor', '#cDia', '#cParcelas', '#cExtra', '#cReembolso']) {
      const el = $(id);
      if (el) el.value = '';
    }
    modo = 'nao';
    pintarReembolso();
    if ($('#cTitulo')) $('#cTitulo').textContent = 'Novo compromisso';
    if ($('#addComp')) $('#addComp').textContent = 'Adicionar compromisso';
    if ($('#delComp')) $('#delComp').hidden = true;
    if ($('#cCancelar')) $('#cCancelar').hidden = true;
  };

  const carregar = (c) => {
    if ($('#cId')) $('#cId').value = c.id;
    if ($('#cNome')) $('#cNome').value = c.nome || '';
    if ($('#cValor')) $('#cValor').value = c.valor || '';
    if ($('#cDia')) $('#cDia').value = c.dia || '';
    if ($('#cParcelas')) $('#cParcelas').value = c.parcelas || '';
    if ($('#cInicio')) $('#cInicio').value = c.inicio || '';
    if ($('#cExtra')) $('#cExtra').value = c.extraPrimeira || '';
    if ($('#cReembolso')) $('#cReembolso').value = c.reembolso || '';
    modo = c.reembolsoTotal ? 'total' : (c.reembolso ? 'parte' : 'nao');
    pintarReembolso();
    if ($('#cTitulo')) $('#cTitulo').textContent = 'Editando: ' + c.nome;
    if ($('#addComp')) $('#addComp').textContent = 'Salvar alterações';
    if ($('#delComp')) $('#delComp').hidden = false;
    if ($('#cCancelar')) $('#cCancelar').hidden = false;
    $('#formComp')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  pintarReembolso();

  // Clique na lista de compromissos para carregar no formulário
  $tela.querySelectorAll('[data-comp]').forEach((b) => {
    b.onclick = () => {
      const c = store.estado().config.compromissos.find((x) => x.id === b.dataset.comp);
      if (c) { vibrar(8); carregar(c); }
    };
  });

  const btnCancelar = $('#cCancelar');
  if (btnCancelar) btnCancelar.onclick = () => { limpar(); render(); };

  const btnAdd = $('#addComp');
  if (btnAdd) {
    btnAdd.onclick = () => {
      const nome = $('#cNome')?.value.trim();
      const valor = num('#cValor');
      if (!nome || !valor) return toast('Preencha nome e valor', true);

      const id = $('#cId')?.value;
      const dados = {
        id: id || store.novoId(),
        nome,
        valor,
        dia: Math.min(31, Math.max(1, num('#cDia') || 1)),
        parcelas: num('#cParcelas') || null,
        inicio: $('#cInicio')?.value || null,
        extraPrimeira: num('#cExtra'),
        reembolso: modo === 'parte' ? num('#cReembolso') : 0,
        reembolsoTotal: modo === 'total',
        categoria: nome,
      };

      const lista = store.estado().config.compromissos || [];
      store.salvarConfig({
        compromissos: id ? lista.map((c) => (c.id === id ? dados : c)) : [...lista, dados],
      });
      toast(id ? `${nome} atualizado` : `${nome} adicionado`);
      render();
      sincronizarSilencioso();
    };
  }

  const btnDel = $('#delComp');
  if (btnDel) {
    btnDel.onclick = () => {
      const id = $('#cId')?.value;
      if (!id) return;
      const c = store.estado().config.compromissos.find((x) => x.id === id);
      if (!confirm(`Apagar "${c ? c.nome : 'este compromisso'}"? Os lançamentos já feitos ficam.`)) return;
      store.salvarConfig({
        compromissos: store.estado().config.compromissos.filter((x) => x.id !== id),
      });
      toast('Compromisso apagado');
      render();
      sincronizarSilencioso();
    };
  }
}

function ligarEdicao() {
  const t = store.buscar(editando);
  if (!t) return;

  let tipo = t.valor < 0 ? 'saida' : 'entrada';
  let metodo = t.metodo;
  let categoria = t.categoria;

  const fechar = () => { editando = null; render(); };
  if ($tela.querySelector('#fecharEdicao')) $tela.querySelector('#fecharEdicao').onclick = fechar;
  if ($tela.querySelector('#fecharEdicaoX')) $tela.querySelector('#fecharEdicaoX').onclick = fechar;

  const marcar = (attr, valor) => {
    $tela.querySelectorAll(`[${attr}]`).forEach((b) =>
      b.classList.toggle('on', b.getAttribute(attr) === valor));
  };
  $tela.querySelectorAll('[data-etipo]').forEach((b) => {
    b.onclick = () => { tipo = b.dataset.etipo; marcar('data-etipo', tipo); };
  });
  $tela.querySelectorAll('[data-emetodo]').forEach((b) => {
    b.onclick = () => { metodo = b.dataset.emetodo; marcar('data-emetodo', metodo); };
  });
  $tela.querySelectorAll('[data-ecat]').forEach((b) => {
    b.onclick = () => { categoria = b.dataset.ecat; marcar('data-ecat', categoria); };
  });

  const btnSalvar = $tela.querySelector('#eSalvar');
  if (btnSalvar) {
    btnSalvar.onclick = () => {
      const bruto = Number(String($tela.querySelector('#eValor').value).replace(',', '.'));
      if (!Number.isFinite(bruto) || bruto <= 0) return toast('Valor inválido', true);

      store.atualizar(t.id, {
        valor: tipo === 'saida' ? -Math.abs(bruto) : Math.abs(bruto),
        data: $tela.querySelector('#eData').value || t.data,
        categoria,
        metodo,
        nota: $tela.querySelector('#eNota').value.trim(),
      });
      editando = null;
      vibrar(14);
      toast('Lançamento atualizado');
      render();
      sincronizarSilencioso();
    };
  }

  const btnApagar = $tela.querySelector('#eApagar');
  if (btnApagar) {
    btnApagar.onclick = () => {
      if (!confirm('Apagar este lançamento? Ele sai daqui e da planilha.')) return;
      store.apagar(t.id);
      editando = null;
      vibrar(20);
      toast('Lançamento apagado');
      render();
      sincronizarSilencioso();
    };
  }
}

async function abrirScanner() {
  let bruto;
  try {
    bruto = await escanear();
  } catch (e) {
    return toast(e.message, true);
  }
  if (!bruto) return;

  const lido = interpretar(bruto);
  if (!lido) {
    return toast('Não reconheci esse QR. Leia o do cupom fiscal, não o do comprovante.', true);
  }

  if (lido.id && store.existe(lido.id)) {
    return toast('Essa nota já foi lançada.', true);
  }

  telas.aplicarQR(lido);
  vibrar(18);
  toast(lido.valor ? `${telas.dinheiro(lido.valor)} lido do QR` : 'QR lido — digite o valor');
  render();

  if (lido.cnpj && store.estado().config.buscarCNPJ !== false) {
    const nome = await nomeDoCNPJ(lido.cnpj);
    if (nome && telas.qrAtual() === lido) {
      lido.quem = nome;
      render();
    }
  }
}

function ligarAjustes() {
  const num = (id) => Number($tela.querySelector(id)?.value) || 0;

  for (const id of ['#renda', '#meta']) {
    const el = $tela.querySelector(id);
    if (el) {
      el.onchange = () => store.salvarConfig({ renda: num('#renda'), meta: num('#meta') });
    }
  }
  for (const id of ['#apiUrl', '#token']) {
    const el = $tela.querySelector(id);
    if (el) {
      el.onchange = (e) => store.salvarConfig({ [id.slice(1)]: e.target.value.trim() });
    }
  }

  // Liga os eventos dos formulários de compromisso
  ligarFormCompromisso();

  const btnSync = $tela.querySelector('#sincronizar');
  if (btnSync) btnSync.onclick = () => rodarSync(true);

  const btnExp = $tela.querySelector('#exportar');
  if (btnExp) {
    btnExp.onclick = () => {
      const blob = new Blob([JSON.stringify(store.estado(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup-financas-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }
}

/* ---------- sincronização ---------- */

async function rodarSync(explicito) {
  if (sincronizando) return;
  if (!store.estado().config.apiUrl) {
    if (explicito) toast('Configure a URL do Web App primeiro', true);
    return;
  }
  sincronizando = true;
  $sync.classList.add('girando');
  try {
    const r = await sincronizar();
    if (explicito) {
      toast(r.baixouConfig
        ? 'Configuração baixada da planilha'
        : `${r.enviados} enviado(s), ${r.recebidos} recebido(s)`);
    }
    render();
  } catch (e) {
    if (explicito) toast(e.message, true);
  } finally {
    sincronizando = false;
    $sync.classList.remove('girando');
  }
}

const sincronizarSilencioso = () => rodarSync(false);

/* ---------- navegação global ---------- */

document.querySelectorAll('.abas button').forEach((b) => {
  b.onclick = () => { vibrar(8); ir(b.dataset.aba); };
});

const btnMesAnt = document.getElementById('mesAnterior');
if (btnMesAnt) {
  btnMesAnt.onclick = () => {
    ref = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    render();
  };
}

$titulo.onclick = () => { ref = new Date(); render(); };
$sync.onclick = () => rodarSync(true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (mesmoMes(ref, new Date())) ref = new Date();
    render();
    sincronizarSilencioso();
  }
});

window.addEventListener('online', sincronizarSilencioso);

/* ---------- boot ---------- */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
rodarSync(false);