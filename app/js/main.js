// main.js — inicialização, navegação e ligação dos eventos.

import * as store from './store.js';
import * as telas from './telas.js';
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

  // O painel de edição é desenhado por cima, sem trocar de aba: você volta
  // exatamente para onde estava, no mesmo ponto da rolagem.
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
  // Atalho do estado vazio da home.
  $tela.querySelectorAll('[data-ir]').forEach((b) => {
    b.onclick = () => ir(b.dataset.ir);
  });

  $tela.querySelectorAll('[data-editar]').forEach((b) => {
    b.onclick = () => { editando = b.dataset.editar; vibrar(8); render(); };
  });

  if (editando) ligarEdicao();

  if (aba === 'home') {
    $tela.querySelectorAll('[data-pagar]').forEach((b) => {
      b.onclick = () => {
        const c = store.estado().config.compromissos.find((x) => x.id === b.dataset.pagar);
        if (!c) return;

        // Sai o valor cheio (é o que a conta debita) e entra o reembolso
        // separado. Assim a planilha bate com o extrato e o "posso gastar"
        // continua enxergando só o que é seu.
        store.lancar({
          valor: -c.valor,
          categoria: c.categoria || c.nome,
          nota: c.nome,
          compromissoId: c.id,
        });
        if (c.reembolso > 0) {
          store.lancar({
            valor: c.reembolso,
            categoria: 'Reembolso',
            nota: c.nome,
            reembolso: true,
          });
        }
        vibrar();
        toast(`${c.nome} pago`);
        render();
        sincronizarSilencioso();
      };
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

/**
 * O formulário de compromisso serve para criar E para editar.
 *
 * Duplicar a tela só para editar significaria manter dois lugares em sincronia
 * cada vez que um campo novo aparece — e acabou de aparecer um. Tocar num
 * compromisso da lista carrega os valores aqui; o botão muda de nome e o id
 * escondido decide se é criação ou substituição.
 */
function ligarFormCompromisso() {
  const num = (id) => Number($tela.querySelector(id).value) || 0;
  const $ = (id) => $tela.querySelector(id);

  let modo = 'nao';   // nao | total | parte

  const pintarReembolso = () => {
    $tela.querySelectorAll('[data-reemb]').forEach((b) =>
      b.classList.toggle('on', b.dataset.reemb === modo));
    $('#campoReembolso').hidden = modo !== 'parte';
  };

  $tela.querySelectorAll('[data-reemb]').forEach((b) => {
    b.onclick = () => { modo = b.dataset.reemb; pintarReembolso(); };
  });

  const limpar = () => {
    for (const id of ['#cId', '#cNome', '#cValor', '#cDia', '#cParcelas', '#cExtra', '#cReembolso']) {
      $(id).value = '';
    }
    modo = 'nao';
    pintarReembolso();
    $('#cTitulo').textContent = 'Novo compromisso';
    $('#addComp').textContent = 'Adicionar compromisso';
    $('#delComp').hidden = true;
    $('#cCancelar').hidden = true;
  };

  const carregar = (c) => {
    $('#cId').value = c.id;
    $('#cNome').value = c.nome || '';
    $('#cValor').value = c.valor || '';
    $('#cDia').value = c.dia || '';
    $('#cParcelas').value = c.parcelas || '';
    $('#cInicio').value = c.inicio || '';
    $('#cExtra').value = c.extraPrimeira || '';
    $('#cReembolso').value = c.reembolso || '';
    modo = c.reembolsoTotal ? 'total' : (c.reembolso ? 'parte' : 'nao');
    pintarReembolso();
    $('#cTitulo').textContent = 'Editando: ' + c.nome;
    $('#addComp').textContent = 'Salvar alterações';
    $('#delComp').hidden = false;
    $('#cCancelar').hidden = false;
    $('#formComp').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  pintarReembolso();

  $tela.querySelectorAll('[data-comp]').forEach((b) => {
    b.onclick = () => {
      const c = store.estado().config.compromissos.find((x) => x.id === b.dataset.comp);
      if (c) { vibrar(8); carregar(c); }
    };
  });

  $('#cCancelar').onclick = () => { limpar(); render(); };

  $('#addComp').onclick = () => {
    const nome = $('#cNome').value.trim();
    const valor = num('#cValor');
    if (!nome || !valor) return toast('Preencha nome e valor', true);

    const id = $('#cId').value;
    const dados = {
      id: id || store.novoId(),
      nome,
      valor,
      dia: Math.min(31, Math.max(1, num('#cDia') || 1)),
      parcelas: num('#cParcelas') || null,
      inicio: $('#cInicio').value || null,
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

  $('#delComp').onclick = () => {
    const id = $('#cId').value;
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

/** Liga o painel de edição de um lançamento. */
function ligarEdicao() {
  const t = store.buscar(editando);
  if (!t) return;

  // Rascunho local: nada é gravado enquanto você não confirma, então fechar
  // sem salvar realmente não muda nada.
  let tipo = t.valor < 0 ? 'saida' : 'entrada';
  let metodo = t.metodo;
  let categoria = t.categoria;

  const fechar = () => { editando = null; render(); };
  $tela.querySelector('#fecharEdicao').onclick = fechar;
  $tela.querySelector('#fecharEdicaoX').onclick = fechar;

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

  $tela.querySelector('#eSalvar').onclick = () => {
    // Aceita 12,50 e 12.50: exigir um formato só é o tipo de rigor que só
    // serve para irritar quem está com o celular na mão.
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

  $tela.querySelector('#eApagar').onclick = () => {
    if (!confirm('Apagar este lançamento? Ele sai daqui e da planilha.')) return;
    store.apagar(t.id);
    editando = null;
    vibrar(20);
    toast('Lançamento apagado');
    render();
    sincronizarSilencioso();
  };
}

/**
 * Abre a câmera, entende o QR e joga o resultado na tela de lançar.
 *
 * Nada é gravado aqui. O caminho é sempre ler -> mostrar -> você confirma,
 * porque um lançamento errado dá mais trabalho para achar e apagar do que
 * um toque a mais para confirmar.
 */
async function abrirScanner() {
  let bruto;
  try {
    bruto = await escanear();
  } catch (e) {
    return toast(e.message, true);
  }
  if (!bruto) return;                       // você fechou a câmera

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

  // O nome da loja chega depois, se chegar: a consulta é opcional, pode estar
  // offline e não vale segurar a tela por ela.
  if (lido.cnpj && store.estado().config.buscarCNPJ !== false) {
    const nome = await nomeDoCNPJ(lido.cnpj);
    if (nome && telas.qrAtual() === lido) {
      lido.quem = nome;
      render();
    }
  }
}

function ligarAjustes() {
  const num = (id) => Number($tela.querySelector(id).value) || 0;

  for (const id of ['#renda', '#meta']) {
    $tela.querySelector(id).onchange = () =>
      store.salvarConfig({ renda: num('#renda'), meta: num('#meta') });
  }
  for (const id of ['#apiUrl', '#token']) {
    $tela.querySelector(id).onchange = (e) =>
      store.salvarConfig({ [id.slice(1)]: e.target.value.trim() });
  }

  $tela.querySelector('#buscarCNPJ').onchange = (e) =>
    store.salvarConfig({ buscarCNPJ: e.target.checked });

  ligarFormCompromisso();

  $tela.querySelector('#sincronizar').onclick = () => rodarSync(true);

  $tela.querySelector('#exportar').onclick = () => {
    const blob = new Blob([JSON.stringify(store.estado(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-financas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
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

/** Tenta sincronizar sem incomodar: falhou, fica na fila para a próxima. */
const sincronizarSilencioso = () => rodarSync(false);

/* ---------- navegação global ---------- */

document.querySelectorAll('.abas button').forEach((b) => {
  b.onclick = () => { vibrar(8); ir(b.dataset.aba); };
});

document.getElementById('mesAnterior').onclick = () => {
  ref = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  render();
};

// Toque no título volta para o mês atual.
$titulo.onclick = () => { ref = new Date(); render(); };

$sync.onclick = () => rodarSync(true);

// Voltar ao app depois de um tempo: recalcula o dia e busca novidades.
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
