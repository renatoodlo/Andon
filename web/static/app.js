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

function iniciais(nome) {
  return nome.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
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
  if (!confirm('Sair do sistema?')) return;
  TOKEN = PERFIL = USUARIO = '';
  localStorage.clear();
  clearInterval(REFRESH_TIMER);
  $('tela-dashboard').classList.add('hidden');
  $('tela-login').classList.remove('hidden');
  $('login-user').value = '';
  $('login-senha').value = '';
});

// ── DASHBOARD ──────────────────────────────────────────────────────────────

function mostrarDashboard() {
  $('tela-login').classList.add('hidden');
  $('tela-dashboard').classList.remove('hidden');

  // Preenche info do usuário na sidebar
  $('user-name').textContent = USUARIO;
  $('user-role').textContent = PERFIL;
  $('user-avatar').textContent = iniciais(USUARIO);

  if (PERFIL === 'supervisor') {
    document.querySelectorAll('.supervisor-only').forEach(el => el.classList.remove('hidden'));
  }

  mostrarAba('paradas');
  clearInterval(REFRESH_TIMER);
  REFRESH_TIMER = setInterval(() => {
    if (!$('aba-paradas').classList.contains('hidden')) carregarParadas();
  }, 30000);
}

// ── NAVEGAÇÃO ABAS ─────────────────────────────────────────────────────────

function mostrarAba(aba) {
  $('aba-paradas').classList.toggle('hidden', aba !== 'paradas');
  $('aba-usuarios').classList.toggle('hidden', aba !== 'usuarios');
  $('aba-detalhes').classList.add('hidden');
  $('nav-paradas').classList.toggle('active', aba === 'paradas');
  $('nav-usuarios').classList.toggle('active', aba === 'usuarios');

  if (aba === 'paradas')  carregarParadas();
  if (aba === 'usuarios') carregarUsuarios();
}

$('nav-paradas').addEventListener('click',  () => mostrarAba('paradas'));
$('nav-usuarios').addEventListener('click', () => mostrarAba('usuarios'));

// ── FILTROS ────────────────────────────────────────────────────────────────

$('btn-filtrar').addEventListener('click', () => {
  $('painel-filtros').classList.toggle('hidden');
});

$('btn-aplicar').addEventListener('click', carregarParadas);

$('btn-limpar').addEventListener('click', () => {
  $('filtro-status').value      = '';
  $('filtro-data-inicio').value = '';
  $('filtro-data-fim').value    = '';
  $('filtro-maquina').value     = '';
  $('painel-filtros').classList.add('hidden');
  carregarParadas();
});

function buildQuery() {
  const p = new URLSearchParams();
  const s  = $('filtro-status').value;
  const di = $('filtro-data-inicio').value;
  const df = $('filtro-data-fim').value;
  const m  = $('filtro-maquina').value.trim();
  if (s)  p.set('status',      s);
  if (di) p.set('data_inicio', di);
  if (df) p.set('data_fim',    df);
  if (m)  p.set('maquina',     m);
  return p.toString() ? '?' + p.toString() : '';
}

// ── PARADAS ────────────────────────────────────────────────────────────────

async function carregarParadas() {
  try {
    const r = await api('/paradas' + buildQuery());
    if (r.status === 401) { TOKEN = ''; localStorage.clear(); location.reload(); return; }
    renderParadas(await r.json());
  } catch (err) {
    console.error('Erro ao carregar paradas:', err);
  }
}

function renderParadas(paradas) {
  const pendentes = paradas.filter(p => p.status_just === 'NAO_JUSTIFICADO' && p.fim);

  // Atualiza subtitle da página
  const total = paradas.length;
  const nJust = pendentes.length;
  $('paradas-sub').textContent = `${total} parada${total !== 1 ? 's' : ''} · ${nJust} pendente${nJust !== 1 ? 's' : ''}`;

  // Badge na sidebar
  const sidebarCount = $('sidebar-count');
  if (nJust > 0) {
    sidebarCount.textContent = nJust;
    sidebarCount.classList.remove('hidden');
  } else {
    sidebarCount.classList.add('hidden');
  }

  // Badge no painel de filtros
  const badge = $('badge-pendentes');
  if (nJust > 0) {
    badge.textContent = `${nJust} pendente${nJust > 1 ? 's' : ''}`;
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
  document.querySelectorAll('.btn-detalhes').forEach(btn => {
    btn.addEventListener('click', () => abrirDetalhes(Number(btn.dataset.id)));
  });
}

function cardHTML(p) {
  const emAndamento = !p.fim;
  const justificado = p.status_just === 'JUSTIFICADO';
  const btnDisabled = (emAndamento || justificado) ? 'disabled' : '';
  const nome        = p.nome_maquina || `Máquina ${p.inventory_number}`;

  let badgeHTML = '';
  if (justificado) {
    badgeHTML = `<span class="badge badge-success"><span class="pip"></span> Justificado</span>`;
  } else if (emAndamento) {
    badgeHTML = `<span class="badge badge-warning"><span class="pip"></span> Em andamento</span>`;
  } else {
    badgeHTML = `<span class="badge badge-danger"><span class="pip"></span> Pendente</span>`;
  }

  let duracaoHTML = '';
  if (emAndamento) {
    duracaoHTML = `<div class="card-duracao" style="font-size:14px;color:var(--text-muted)">⏳ Em andamento</div>`;
  } else {
    duracaoHTML = `<div class="card-duracao">${fmtDuracao(p.duracao_min)}</div>`;
  }

  let footerHTML = '';
  if (justificado) {
    const just = p.justificativas && p.justificativas[0];
    const catLabel  = just ? just.categoria  : '—';
    const respLabel = just ? just.responsavel : '—';
    const descLabel = just && just.descricao ? just.descricao : '';
    footerHTML = `
      <div class="card-just-preview">
        <div class="card-just-row">
          <span class="card-just-cat">${catLabel}</span>
          <span class="card-just-resp">${respLabel}</span>
        </div>
        ${descLabel ? `<div class="card-just-desc">${descLabel}</div>` : ''}
      </div>
      <button class="btn-detalhes" data-id="${p.id}">Ver detalhes</button>`;
  } else {
    const label = emAndamento ? '⏳ Em andamento' : 'Justificar';
    footerHTML = `<button class="btn-justificar" data-id="${p.id}" ${btnDisabled}>${label}</button>`;
  }

  return `
  <div class="card ${justificado ? 'justificado' : 'nao-justificado'}">
    <div class="card-header">
      <div>
        <div class="card-maquina">${nome}</div>
        <div class="card-inv">${p.inventory_number}</div>
      </div>
      ${badgeHTML}
    </div>
    ${duracaoHTML}
    <div class="card-row"><span>Início</span><span>${fmtDt(p.inicio)}</span></div>
    <div class="card-row"><span>Fim</span><span>${fmtDt(p.fim)}</span></div>
    ${footerHTML}
  </div>`;
}

// ── DRAWER JUSTIFICATIVA ───────────────────────────────────────────────────

const CATEGORIAS_JUST = [
  { id: 'ferramenta',  label: 'Troca de ferramenta' },
  { id: 'corretiva',   label: 'Manutenção corretiva' },
  { id: 'preventiva',  label: 'Manutenção preventiva' },
  { id: 'setup',       label: 'Setup / Ajuste' },
  { id: 'material',    label: 'Falta de material' },
  { id: 'operador',    label: 'Falta de operador' },
  { id: 'qualidade',   label: 'Qualidade' },
  { id: 'treinamento', label: 'Reunião / Treinamento' },
  { id: 'outro',       label: 'Outro' },
];

function _renderCatGrid(selected) {
  $('cat-grid').innerHTML = CATEGORIAS_JUST.map(c => `
    <div class="cat-chip${selected === c.id ? ' active' : ''}" data-cat="${c.id}">${c.label}</div>
  `).join('');
}

$('cat-grid').addEventListener('click', e => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  $('just-categoria').value = chip.dataset.cat;
  $('cat-grid').querySelectorAll('.cat-chip').forEach(c => c.classList.toggle('active', c === chip));
  $('just-cat-erro').classList.add('hidden');
});

$('just-descricao').addEventListener('input', () => {
  $('just-char-count').textContent = $('just-descricao').value.length;
});

async function abrirModal(paradaId) {
  const r = await api(`/paradas/${paradaId}`);
  const p = await r.json();
  const nome = p.nome_maquina || `Máquina ${p.inventory_number}`;

  $('just-parada-id').value = p.id;
  $('just-categoria').value = '';
  $('just-responsavel').value = '';
  $('just-descricao').value = '';
  $('just-char-count').textContent = '0';
  $('just-erro').classList.add('hidden');
  $('just-cat-erro').classList.add('hidden');

  $('modal-titulo').textContent = nome;

  const inv = p.inventory_number || '';
  const status = p.status_just === 'JUSTIFICADO'
    ? `<span style="color:var(--accent)">● Justificado</span>`
    : `<span style="color:var(--danger)">● Não justificada</span>`;
  $('modal-info').innerHTML = `<span>${inv}</span><span class="drawer-meta-dot"></span>${status}`;

  // timeline
  const inicio = p.inicio ? new Date(p.inicio) : null;
  const fim    = p.fim    ? new Date(p.fim)    : null;
  const fmtHora = d => d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtData = d => d ? d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const durStr  = fmtDuracao(p.duracao_min);
  $('drawer-timeline').innerHTML = `
    <div class="dt-col">
      <div class="dt-label">Início</div>
      <div class="dt-time">${fmtHora(inicio)}</div>
      <div class="dt-date">${fmtData(inicio)}</div>
    </div>
    <div class="dt-dur">
      <div class="dt-dur-val">${durStr}</div>
      <div class="dt-dur-label">duração</div>
    </div>
    <div class="dt-col right">
      <div class="dt-label">Fim</div>
      <div class="dt-time">${fmtHora(fim)}</div>
      <div class="dt-date">${fmtData(fim)}</div>
    </div>
  `;

  _renderCatGrid('');
  $('modal').classList.remove('hidden');
}

function fecharModal() { $('modal').classList.add('hidden'); }

$('modal-fechar').addEventListener('click', fecharModal);
$('btn-cancelar').addEventListener('click', fecharModal);
$('modal').addEventListener('click', e => { if (e.target === $('modal')) fecharModal(); });

$('form-just').addEventListener('submit', async e => {
  e.preventDefault();
  $('just-erro').classList.add('hidden');
  if (!$('just-categoria').value) {
    $('just-cat-erro').classList.remove('hidden');
    return;
  }
  const body = {
    parada_id:   Number($('just-parada-id').value),
    categoria:   $('just-categoria').value,
    responsavel: $('just-responsavel').value.trim(),
    descricao:   $('just-descricao').value.trim(),
  };
  try {
    const r = await api('/justificativas', { method: 'POST', body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Erro ao salvar');
    fecharModal();
    carregarParadas();
  } catch (err) {
    $('just-erro').textContent = err.message;
    $('just-erro').classList.remove('hidden');
  }
});

// ── DETALHES FULL-PAGE ─────────────────────────────────────────────────────

let _detParadaId = null;

async function abrirDetalhes(paradaId) {
  _detParadaId = paradaId;
  const r = await api(`/paradas/${paradaId}`);
  const p = await r.json();
  const nome      = p.nome_maquina || `Máquina ${p.inventory_number}`;
  const inv       = p.inventory_number || '';
  const just      = p.justificativas && p.justificativas[0];
  const justificado = p.status_just === 'JUSTIFICADO';

  // breadcrumb
  $('det-bc-id').textContent = `PRD-${String(p.id).padStart(4, '0')}`;
  $('det-id-label').textContent = `#PRD-${String(p.id).padStart(4, '0')}`;

  // badge status
  const badge = $('det-badge-status');
  if (justificado) {
    badge.className = 'badge badge-success';
    badge.innerHTML = '<span class="pip"></span>Justificada';
  } else {
    badge.className = 'badge badge-danger';
    badge.innerHTML = '<span class="pip"></span>Não justificada';
  }

  // hero
  $('det-maquina').innerHTML = nome + (p.modelo ? ` <span>${p.modelo}</span>` : '');
  $('det-meta').innerHTML = [inv, p.linha ? `Linha ${p.linha}` : '', p.area || '']
    .filter(Boolean)
    .map((s, i, a) => i < a.length - 1 ? `${s}<span class="det-hero-meta-dot">·</span>` : s)
    .join('');

  // duração hero
  const minutos = p.duracao_min || 0;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  $('det-duracao').innerHTML = h > 0
    ? `${h}<span>h</span> ${m}<span>m</span>`
    : `${m}<span>m</span>`;
  $('det-dur-sub').textContent = `${minutos} minutos`;

  // timeline bar
  const inicio = p.inicio ? new Date(p.inicio) : null;
  const fim    = p.fim    ? new Date(p.fim)    : null;
  if (inicio && fim) {
    const dayStart = new Date(inicio); dayStart.setHours(0,0,0,0);
    const pct = t => ((t - dayStart) / 86400000) * 100;
    const left = pct(inicio).toFixed(2);
    const width = (pct(fim) - pct(inicio)).toFixed(2);
    $('det-tl-seg').style.left  = `${left}%`;
    $('det-tl-seg').style.width = `${width}%`;
    const fmtH = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('det-tl-label').textContent = `▲ ${fmtH(inicio)} → ${fmtH(fim)}`;
  }

  // justificativa card
  if (just) {
    const ini = iniciais(just.responsavel || '');
    $('det-just-body').innerHTML = `
      <div class="det-just-grid">
        <div>
          <div class="det-field-label">Categoria</div>
          <div class="det-cat-pill">${just.categoria}</div>
        </div>
        <div>
          <div class="det-field-label">Responsável</div>
          <div class="det-resp-row">
            <div class="det-resp-avatar">${ini}</div>
            <div>
              <div class="det-resp-name">${just.responsavel}</div>
              <div class="det-resp-role">Técnico · Manutenção</div>
            </div>
          </div>
        </div>
      </div>
      ${just.descricao ? `
      <div>
        <div class="det-field-label">Descrição</div>
        <div class="det-desc-box">${just.descricao}</div>
      </div>` : ''}
      <div class="det-just-foot">
        <span>Registrado em ${fmtDt(just.criado_em)}</span>
        <button class="btn btn-ghost btn-sm" id="det-just-editar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Editar
        </button>
      </div>
    `;
    $('det-card-title-success', $('det-just-card'));
  } else {
    $('det-just-body').innerHTML = `
      <div class="det-no-just">Sem justificativa registrada para esta parada.</div>
    `;
  }

  // audit log
  const fmtH = d => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const logs = [];
  if (just) logs.push({ cor: 'var(--success)', acao: 'Justificativa registrada', quem: just.responsavel, hora: fmtH(just.criado_em) });
  if (p.fim)    logs.push({ cor: 'var(--accent)', acao: 'Parada finalizada',  quem: 'Sistema MES', hora: fmtH(p.fim) });
  if (p.inicio) logs.push({ cor: 'var(--danger)', acao: 'Parada detectada',   quem: 'Sistema MES', hora: fmtH(p.inicio) });

  $('det-log').innerHTML = logs.map(l => `
    <div class="det-log-item">
      <div class="det-log-dot" style="background:${l.cor};box-shadow:0 0 8px ${l.cor}"></div>
      <div style="flex:1;min-width:0">
        <div class="det-log-action">${l.acao}</div>
        <div class="det-log-who">${l.quem}</div>
      </div>
      <div class="det-log-time">${l.hora}</div>
    </div>
  `).join('');

  // "editar justificativa" action button
  $('det-btn-editar').onclick = () => { fecharDetalhes(); abrirModal(paradaId); };

  // show aba
  $('aba-paradas').classList.add('hidden');
  $('aba-usuarios').classList.add('hidden');
  $('aba-detalhes').classList.remove('hidden');
}

function fecharDetalhes() {
  $('aba-detalhes').classList.add('hidden');
  $('aba-paradas').classList.remove('hidden');
  // reactivate sidebar nav
  $('nav-paradas').classList.add('active');
  $('nav-usuarios').classList.remove('active');
}

$('det-bc-back').addEventListener('click', fecharDetalhes);

// ── USUÁRIOS ───────────────────────────────────────────────────────────────

async function carregarUsuarios() {
  try {
    const r = await api('/usuarios');
    if (!r.ok) return;
    renderUsuarios(await r.json());
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
  }
}

let _todosUsuarios = [];
let _filtroPillAtivo = 'todos';

function renderUsuarios(usuarios) {
  _todosUsuarios = usuarios;

  // KPI counts
  const total      = usuarios.length;
  const supervisor = usuarios.filter(u => u.perfil === 'supervisor').length;
  const tecnico    = usuarios.filter(u => u.perfil === 'tecnico').length;
  const operador   = usuarios.filter(u => u.perfil === 'operador').length;
  const kpiTotal = $('kpi-total'); if (kpiTotal) kpiTotal.textContent = total;
  const kpiSup   = $('kpi-supervisor'); if (kpiSup) kpiSup.textContent = supervisor;
  const kpiTec   = $('kpi-tecnico'); if (kpiTec) kpiTec.textContent = tecnico;
  const kpiOp    = $('kpi-operador'); if (kpiOp) kpiOp.textContent = operador;

  _aplicarFiltros();
}

function _aplicarFiltros() {
  const q = ($('u-busca') ? $('u-busca').value : '').toLowerCase().trim();
  let lista = _todosUsuarios;
  if (_filtroPillAtivo === 'ativos')   lista = lista.filter(u => u.ativo);
  if (_filtroPillAtivo === 'inativos') lista = lista.filter(u => !u.ativo);
  if (q) lista = lista.filter(u => u.nome.toLowerCase().includes(q) || u.login.toLowerCase().includes(q));
  _renderCards(lista);
}

function _renderCards(lista) {
  const grid = $('grid-usuarios');
  if (!grid) return;
  if (!lista.length) {
    grid.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:40px 0">Nenhum usuário encontrado</p>`;
    return;
  }
  grid.innerHTML = lista.map(u => {
    const ini = iniciais(u.nome);
    const perfilLabel = u.perfil.charAt(0).toUpperCase() + u.perfil.slice(1);
    const badgeClass = u.ativo ? 'badge-success' : 'badge-danger';
    const badgeLabel = u.ativo ? 'Ativo' : 'Inativo';
    return `
    <div class="u-card${u.ativo ? '' : ' inativo'}">
      ${u.ativo ? '' : '<div class="u-card-stripe"></div>'}
      <div class="u-card-avatar ${u.perfil}">${ini}</div>
      <div class="u-card-info">
        <div class="u-card-name-row">
          <span class="u-card-name">${u.nome}</span>
          <span class="badge ${badgeClass}"><span class="pip"></span>${badgeLabel}</span>
        </div>
        <div class="u-card-meta">
          <span class="u-card-login">@${u.login}</span>
          <span>·</span>
          <span>${perfilLabel}</span>
        </div>
      </div>
      <div class="u-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="abrirModalUsuario(${u.id}, '${u.nome}', '${u.login}', '${u.perfil}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="excluirUsuario(${u.id}, '${u.nome}')">${u.ativo ? 'Desativar' : 'Ativar'}</button>
      </div>
    </div>`;
  }).join('');
}

// pill filter clicks
document.querySelectorAll('.u-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.u-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    _filtroPillAtivo = pill.dataset.filtro || 'todos';
    _aplicarFiltros();
  });
});

// search input
const _uBusca = $('u-busca');
if (_uBusca) _uBusca.addEventListener('input', _aplicarFiltros);

$('btn-novo-usuario').addEventListener('click', () => abrirModalUsuario());

function abrirModalUsuario(id = null, nome = '', login = '', perfil = 'operador') {
  $('usuario-id').value     = id || '';
  $('usuario-nome').value   = nome;
  $('usuario-login').value  = login;
  $('usuario-perfil').value = perfil;
  $('usuario-senha').value  = '';
  $('usuario-erro').classList.add('hidden');
  $('modal-usuario-titulo').textContent = id ? 'Editar Usuário' : 'Novo Usuário';
  $('usuario-login').disabled = !!id;
  $('modal-usuario').classList.remove('hidden');
}

function fecharModalUsuario() { $('modal-usuario').classList.add('hidden'); }
$('modal-usuario-fechar').addEventListener('click', fecharModalUsuario);
$('btn-usuario-cancelar').addEventListener('click', fecharModalUsuario);
$('modal-usuario').addEventListener('click', e => { if (e.target === $('modal-usuario')) fecharModalUsuario(); });

$('form-usuario').addEventListener('submit', async e => {
  e.preventDefault();
  $('usuario-erro').classList.add('hidden');
  const id   = $('usuario-id').value;
  const body = {
    nome:   $('usuario-nome').value.trim(),
    perfil: $('usuario-perfil').value,
  };
  if (!id) body.login = $('usuario-login').value.trim();
  const senha = $('usuario-senha').value;
  if (senha) body.senha = senha;
  else if (!id) {
    $('usuario-erro').textContent = 'Senha obrigatória para novo usuário';
    $('usuario-erro').classList.remove('hidden');
    return;
  }

  try {
    const r = id
      ? await api(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await api('/usuarios',        { method: 'POST', body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Erro ao salvar');
    fecharModalUsuario();
    carregarUsuarios();
  } catch (err) {
    $('usuario-erro').textContent = err.message;
    $('usuario-erro').classList.remove('hidden');
  }
});

async function excluirUsuario(id, nome) {
  if (!confirm(`Desativar/ativar o usuário "${nome}"?`)) return;
  try {
    await api(`/usuarios/${id}`, { method: 'DELETE' });
    carregarUsuarios();
  } catch (err) {
    alert('Erro ao alterar usuário');
  }
}

// ── INIT ───────────────────────────────────────────────────────────────────

async function carregarStatusLogin() {
  try {
    const r = await fetch('/status');
    if (!r.ok) return;
    const d = await r.json();
    const elMaq = $('login-stat-maquinas');
    const elPend = $('login-stat-pendentes');
    if (elMaq) elMaq.textContent = d.maquinas_com_historico;
    if (elPend) elPend.textContent = d.paradas_pendentes;
  } catch (_) {}
}

if (TOKEN) {
  mostrarDashboard();
} else {
  $('tela-login').classList.remove('hidden');
  carregarStatusLogin();
}
