const API = '';
let TOKEN   = localStorage.getItem('andon_token')   || '';
let PERFIL  = localStorage.getItem('andon_perfil')  || '';
let USUARIO = localStorage.getItem('andon_usuario') || '';
let REFRESH_TIMER = null;

// ── UTILS ──────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  return fetch(API + path, { headers, ...opts });
}

function fmtDt(str) {
  if (!str) return '—';
  const d = new Date(str.replace(' ', 'T'));
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDuracao(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

function toLocalInput(str) {
  if (!str) return '';
  return str.replace(' ', 'T').slice(0, 16);
}

// ── LOGIN ──────────────────────────────────────────────────────────────────

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  $('login-erro').classList.add('hidden');
  const body = new URLSearchParams({
    username: $('login-user').value.trim(),
    password: $('login-senha').value,
  });
  try {
    const r = await fetch(API + '/login', { method: 'POST', body });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Erro ao entrar');
    TOKEN   = data.access_token;
    PERFIL  = data.perfil;
    USUARIO = $('login-user').value.trim();
    localStorage.setItem('andon_token',   TOKEN);
    localStorage.setItem('andon_perfil',  PERFIL);
    localStorage.setItem('andon_usuario', USUARIO);
    mostrarDashboard();
  } catch (err) {
    $('login-erro').textContent = err.message;
    $('login-erro').classList.remove('hidden');
  }
});

// ── LOGOUT ─────────────────────────────────────────────────────────────────

$('btn-logout').addEventListener('click', () => {
  TOKEN = PERFIL = USUARIO = '';
  localStorage.clear();
  clearInterval(REFRESH_TIMER);
  $('tela-dashboard').classList.add('hidden');
  $('tela-login').classList.remove('hidden');
  $('login-user').value = '';
  $('login-senha').value = '';
});

// ── NAVEGAÇÃO ──────────────────────────────────────────────────────────────

function mostrarDashboard() {
  $('tela-login').classList.add('hidden');
  $('tela-dashboard').classList.remove('hidden');
  $('header-usuario').textContent = `👤 ${USUARIO} (${PERFIL})`;
  carregarParadas();
  clearInterval(REFRESH_TIMER);
  REFRESH_TIMER = setInterval(carregarParadas, 30000);
}

// ── FILTROS ────────────────────────────────────────────────────────────────

$('btn-filtrar').addEventListener('click', carregarParadas);
$('btn-limpar').addEventListener('click', () => {
  $('filtro-status').value   = '';
  $('filtro-data').value     = '';
  $('filtro-maquina').value  = '';
  carregarParadas();
});

function buildQuery() {
  const p = new URLSearchParams();
  const s = $('filtro-status').value;
  const d = $('filtro-data').value;
  const m = $('filtro-maquina').value.trim();
  if (s) p.set('status',  s);
  if (d) p.set('data',    d);
  if (m) p.set('maquina', m);
  return p.toString() ? '?' + p.toString() : '';
}

// ── CARREGAR PARADAS ───────────────────────────────────────────────────────

async function carregarParadas() {
  try {
    const r = await api('/paradas' + buildQuery());
    if (r.status === 401) { $('btn-logout').click(); return; }
    const paradas = await r.json();
    renderParadas(paradas);
  } catch (err) {
    console.error('Erro ao carregar paradas:', err);
  }
}

// ── RENDER ─────────────────────────────────────────────────────────────────

function renderParadas(paradas) {
  const pendentes = paradas.filter(p => p.status_just === 'NAO_JUSTIFICADO' && p.fim);
  const badge = $('badge-pendentes');

  if (pendentes.length > 0) {
    badge.textContent = `${pendentes.length} pendente${pendentes.length > 1 ? 's' : ''}`;
    badge.classList.remove('hidden');
    $('secao-pendentes').classList.remove('hidden');
    $('grid-pendentes').innerHTML = pendentes.map(cardHTML).join('');
  } else {
    badge.classList.add('hidden');
    $('secao-pendentes').classList.add('hidden');
  }

  $('grid-paradas').innerHTML = paradas.map(cardHTML).join('');
  $('msg-vazio').classList.toggle('hidden', paradas.length > 0);

  document.querySelectorAll('.btn-justificar').forEach(btn => {
    btn.addEventListener('click', () => abrirModal(Number(btn.dataset.id)));
  });
}

function statusClass(s) {
  if (s === 'NAO_JUSTIFICADO') return 'nao-justificado';
  if (s === 'PARCIAL')         return 'parcial';
  return 'justificado';
}

function badgeHTML(s) {
  const map = {
    NAO_JUSTIFICADO: ['nao', '🔴 Não Justificado'],
    PARCIAL:         ['par', '🟡 Parcial'],
    JUSTIFICADO:     ['jus', '✅ Justificado'],
  };
  const [cls, label] = map[s] || ['nao', s];
  return `<span class="badge ${cls}">${label}</span>`;
}

function cardHTML(p) {
  const emAndamento = !p.fim;
  const btnLabel  = emAndamento ? 'Em andamento...' : 'Justificar';
  const btnDisabled = (emAndamento || p.status_just === 'JUSTIFICADO') ? 'disabled' : '';

  return `
  <div class="card ${statusClass(p.status_just)}">
    <div class="card-header">
      <span class="card-maquina">🏭 Máquina ${p.inventory_number}</span>
      ${badgeHTML(p.status_just)}
    </div>
    <div class="card-duracao">${emAndamento ? '⏳ Em andamento' : fmtDuracao(p.duracao_min)}</div>
    <div class="card-row"><span>Início</span><span>${fmtDt(p.inicio)}</span></div>
    <div class="card-row"><span>Fim</span><span>${fmtDt(p.fim)}</span></div>
    <button class="btn-justificar" data-id="${p.id}" ${btnDisabled}>${btnLabel}</button>
  </div>`;
}

// ── MODAL ──────────────────────────────────────────────────────────────────

async function abrirModal(paradaId) {
  const r = await api(`/paradas/${paradaId}`);
  const p = await r.json();

  $('just-parada-id').value = p.id;
  $('modal-titulo').textContent = `Justificar — Máquina ${p.inventory_number}`;
  $('modal-info').innerHTML = `
    <strong>Início:</strong> ${fmtDt(p.inicio)}<br>
    <strong>Fim:</strong> ${fmtDt(p.fim)}<br>
    <strong>Duração:</strong> ${fmtDuracao(p.duracao_min)}<br>
    <strong>Status:</strong> ${p.status_just.replace('_', ' ')}
  `;

  $('just-inicio').value = toLocalInput(p.inicio);
  $('just-fim').value    = toLocalInput(p.fim);
  $('just-categoria').value  = '';
  $('just-responsavel').value = '';
  $('just-descricao').value  = '';
  $('just-erro').classList.add('hidden');

  $('modal').classList.remove('hidden');
}

function fecharModal() { $('modal').classList.add('hidden'); }

$('modal-fechar').addEventListener('click', fecharModal);
$('btn-cancelar').addEventListener('click', fecharModal);
$('modal').addEventListener('click', e => { if (e.target === $('modal')) fecharModal(); });

// ── SUBMIT JUSTIFICATIVA ───────────────────────────────────────────────────

$('form-just').addEventListener('submit', async e => {
  e.preventDefault();
  $('just-erro').classList.add('hidden');

  const inicio = $('just-inicio').value.replace('T', ' ');
  const fim    = $('just-fim').value.replace('T', ' ');

  if (inicio >= fim) {
    $('just-erro').textContent = 'O início deve ser antes do fim.';
    $('just-erro').classList.remove('hidden');
    return;
  }

  const body = {
    parada_id:   Number($('just-parada-id').value),
    inicio_just: inicio,
    fim_just:    fim,
    categoria:   $('just-categoria').value,
    responsavel: $('just-responsavel').value.trim(),
    descricao:   $('just-descricao').value.trim(),
  };

  try {
    const r = await api('/justificativas', {
      method: 'POST',
      body:   JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Erro ao salvar');
    fecharModal();
    carregarParadas();
  } catch (err) {
    $('just-erro').textContent = err.message;
    $('just-erro').classList.remove('hidden');
  }
});

// ── INIT ───────────────────────────────────────────────────────────────────

if (TOKEN) {
  mostrarDashboard();
} else {
  $('tela-login').classList.remove('hidden');
}
