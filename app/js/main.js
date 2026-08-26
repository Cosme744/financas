// main.js — inicialização, navegação e ligação dos eventos.

import * as store from './store.js';
import * as telas from './telas.js';
import { sincronizar } from './sync.js';

const $tela = document.getElementById('tela');
const $titulo = document.getElementById('mesTitulo');
const $sync = document.getElementById('btnSync');
const $toast = document.getElementById('toast');

let aba = 'home';
let ref = new Date();       // mês em exibição
let sincronizando = false;

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

  document.querySelectorAll('.abas button').forEach((b) =>
    b.classList.toggle('ativa', b.dataset.aba === aba));

  $sync.classList.toggle('pendente', store.estado().fila.length > 0);

  ligarEventos();
  window.scrollTo(0, 0);
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
    });
  }

  if (aba === 'ajustes') ligarAjustes();
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

  $tela.querySelector('#addComp').onclick = () => {
    const nome = $tela.querySelector('#cNome').value.trim();
    const valor = num('#cValor');
    if (!nome || !valor) return toast('Preencha nome e valor', true);

    const novo = {
      id: store.novoId(),
      nome,
      valor,
      dia: Math.min(31, Math.max(1, num('#cDia') || 1)),
      parcelas: num('#cParcelas') || null,
      inicio: $tela.querySelector('#cInicio').value || null,
      reembolso: num('#cReembolso'),
      categoria: nome,
    };
    store.salvarConfig({ compromissos: [...(store.estado().config.compromissos || []), novo] });
    toast(`${nome} adicionado`);
    render();
  };

  $tela.querySelectorAll('[data-remover]').forEach((b) => {
    b.onclick = () => {
      const compromissos = store.estado().config.compromissos.filter((c) => c.id !== b.dataset.remover);
      store.salvarConfig({ compromissos });
      render();
    };
  });

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
