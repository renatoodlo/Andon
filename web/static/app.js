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
  const PERFIL_LABEL = { supervisor: 'Supervisor', tecnico_mep: 'Técnico MEP', tecnico_manutencao: 'Técnico Manutenção' };
  $('user-role').textContent = PERFIL_LABEL[PERFIL] || PERFIL;
  $('user-avatar').textContent = iniciais(USUARIO);

  if (PERFIL === 'supervisor') {
    document.querySelectorAll('.supervisor-only').forEach(el => el.classList.remove('hidden'));
  }

  mostrarAba('dashboard');
  clearInterval(REFRESH_TIMER);
  REFRESH_TIMER = setInterval(() => {
    if (!$('aba-paradas').classList.contains('hidden')) carregarParadas();
  }, 30000);
}

// ── NAVEGAÇÃO ABAS ─────────────────────────────────────────────────────────

function mostrarAba(aba) {
  if ((aba === 'usuarios' || aba === 'configuracoes') && PERFIL !== 'supervisor') aba = 'dashboard';

  $('aba-dashboard').classList.toggle('hidden', aba !== 'dashboard');
  $('aba-paradas').classList.toggle('hidden', aba !== 'paradas');
  $('aba-usuarios').classList.toggle('hidden', aba !== 'usuarios');
  $('aba-configuracoes').classList.toggle('hidden', aba !== 'configuracoes');
  $('aba-detalhes').classList.add('hidden');

  $('nav-dashboard').classList.toggle('active', aba === 'dashboard');
  $('nav-paradas').classList.toggle('active', aba === 'paradas');
  $('nav-usuarios').classList.toggle('active', aba === 'usuarios');
  $('nav-configuracoes').classList.toggle('active', aba === 'configuracoes');

  if (aba === 'dashboard')     carregarDashboard();
  if (aba === 'paradas')       carregarParadas();
  if (aba === 'usuarios')      carregarUsuarios();
  if (aba === 'configuracoes') carregarConfiguracoes();

  if (aba !== 'dashboard') pararPollingMapa();
}

$('nav-paradas').addEventListener('click',       () => mostrarAba('paradas'));
$('nav-usuarios').addEventListener('click',      () => mostrarAba('usuarios'));
$('nav-configuracoes').addEventListener('click', () => mostrarAba('configuracoes'));

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
  const tecMep     = usuarios.filter(u => u.perfil === 'tecnico_mep').length;
  const tecMan     = usuarios.filter(u => u.perfil === 'tecnico_manutencao').length;
  const kpiTotal = $('kpi-total');             if (kpiTotal) kpiTotal.textContent = total;
  const kpiSup   = $('kpi-supervisor');        if (kpiSup)   kpiSup.textContent   = supervisor;
  const kpiTecM  = $('kpi-tecnico-mep');       if (kpiTecM)  kpiTecM.textContent  = tecMep;
  const kpiTecN  = $('kpi-tecnico-manutencao'); if (kpiTecN)  kpiTecN.textContent  = tecMan;

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
    const perfilLabel = { supervisor: 'Supervisor', tecnico_mep: 'Téc. MEP', tecnico_manutencao: 'Téc. Manutenção' }[u.perfil] || u.perfil;
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

function abrirModalUsuario(id = null, nome = '', login = '', perfil = 'tecnico_mep') {
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

// ── CONFIGURAÇÕES ──────────────────────────────────────────────────────────

async function carregarConfiguracoes() {
  await Promise.all([carregarPerfil(), carregarThresholds(), carregarMaquinasCfg()]);
}

// ── Perfil ──────────────────────────────────────────────────────────────────

async function carregarPerfil() {
  try {
    const r = await api('/me');
    if (!r.ok) return;
    const d = await r.json();
    $('cfg-nome').value = d.nome || '';
    $('cfg-senha-atual').value = '';
    $('cfg-senha-nova').value = '';
    $('cfg-senha-confirmar').value = '';
  } catch (_) {}
}

$('form-perfil').addEventListener('submit', async e => {
  e.preventDefault();
  $('cfg-perfil-erro').classList.add('hidden');
  $('cfg-perfil-ok').classList.add('hidden');

  const nome    = $('cfg-nome').value.trim();
  const atual   = $('cfg-senha-atual').value;
  const nova    = $('cfg-senha-nova').value;
  const confirm = $('cfg-senha-confirmar').value;

  if (nova && nova !== confirm) {
    $('cfg-perfil-erro').textContent = 'As senhas não coincidem';
    $('cfg-perfil-erro').classList.remove('hidden');
    return;
  }

  const body = {};
  if (nome) body.nome = nome;
  if (nova)  { body.senha_atual = atual; body.senha_nova = nova; }

  try {
    const r = await api('/me', { method: 'PUT', body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Erro ao salvar');
    $('cfg-perfil-ok').classList.remove('hidden');
    $('cfg-senha-atual').value = '';
    $('cfg-senha-nova').value = '';
    $('cfg-senha-confirmar').value = '';
    // atualiza nome na sidebar
    if (nome) { USUARIO = nome; $('user-name').textContent = nome; $('user-avatar').textContent = iniciais(nome); }
  } catch (err) {
    $('cfg-perfil-erro').textContent = err.message;
    $('cfg-perfil-erro').classList.remove('hidden');
  }
});

// ── Thresholds ───────────────────────────────────────────────────────────────

async function carregarThresholds() {
  try {
    const r = await api('/configuracoes');
    if (!r.ok) return;
    const d = await r.json();
    const val = parseInt(d.urgente_minutos) || 30;
    $('cfg-urgente-range').value = val;
    $('cfg-urgente-val').textContent = val;
  } catch (_) {}
}

$('cfg-urgente-range').addEventListener('input', () => {
  $('cfg-urgente-val').textContent = $('cfg-urgente-range').value;
});

$('form-thresholds').addEventListener('submit', async e => {
  e.preventDefault();
  $('cfg-thresh-ok').classList.add('hidden');
  try {
    const r = await api('/configuracoes', {
      method: 'PUT',
      body: JSON.stringify({ urgente_minutos: $('cfg-urgente-range').value }),
    });
    if (!r.ok) throw new Error();
    $('cfg-thresh-ok').classList.remove('hidden');
    setTimeout(() => $('cfg-thresh-ok').classList.add('hidden'), 3000);
  } catch (_) {}
});

// ── Máquinas ─────────────────────────────────────────────────────────────────

async function carregarMaquinasCfg() {
  try {
    const r = await api('/maquinas');
    if (!r.ok) return;
    renderMaquinasCfg(await r.json());
  } catch (_) {}
}

function renderMaquinasCfg(lista) {
  $('cfg-lista-maquinas').innerHTML = lista.map(m => `
    <div class="cfg-maq-item" data-inv="${m.inventory_number}">
      <span class="cfg-maq-inv">${m.inventory_number}</span>
      <input class="cfg-maq-nome-input" value="${m.nome}" data-original="${m.nome}"
        onchange="salvarNomeMaquina('${m.inventory_number}', this)" />
      <button class="cfg-maq-save" onclick="salvarNomeMaquina('${m.inventory_number}', this.previousElementSibling)">Salvar</button>
      <button class="cfg-maq-del" title="Remover" onclick="removerMaquina('${m.inventory_number}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>
        </svg>
      </button>
    </div>
  `).join('');

  // mostra botão salvar ao editar
  $('cfg-lista-maquinas').querySelectorAll('.cfg-maq-nome-input').forEach(inp => {
    inp.addEventListener('input', () => {
      inp.nextElementSibling.classList.toggle('visible', inp.value !== inp.dataset.original);
    });
  });
}

async function salvarNomeMaquina(inv, input) {
  const nome = input.value.trim();
  if (!nome) return;
  try {
    const r = await api(`/maquinas/${inv}`, { method: 'PUT', body: JSON.stringify({ nome }) });
    if (r.ok) {
      input.dataset.original = nome;
      input.nextElementSibling.classList.remove('visible');
    }
  } catch (_) {}
}

async function removerMaquina(inv) {
  if (!confirm(`Remover máquina ${inv}?`)) return;
  try {
    await api(`/maquinas/${inv}`, { method: 'DELETE' });
    carregarMaquinasCfg();
  } catch (_) {}
}

$('cfg-btn-add-maquina').addEventListener('click', () => {
  $('cfg-maquinas-form-wrap').classList.remove('hidden');
  $('cfg-maq-inv').focus();
});
$('cfg-btn-maq-cancelar').addEventListener('click', () => {
  $('cfg-maquinas-form-wrap').classList.add('hidden');
  $('cfg-maq-inv').value = '';
  $('cfg-maq-nome').value = '';
  $('cfg-maq-erro').classList.add('hidden');
});
$('cfg-btn-maq-salvar').addEventListener('click', async () => {
  $('cfg-maq-erro').classList.add('hidden');
  const inv  = $('cfg-maq-inv').value.trim();
  const nome = $('cfg-maq-nome').value.trim();
  if (!inv || !nome) {
    $('cfg-maq-erro').textContent = 'Preencha o InventoryNumber e o nome';
    $('cfg-maq-erro').classList.remove('hidden');
    return;
  }
  try {
    const r = await api('/maquinas', { method: 'POST', body: JSON.stringify({ inventory_number: inv, nome }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Erro');
    $('cfg-maquinas-form-wrap').classList.add('hidden');
    $('cfg-maq-inv').value = '';
    $('cfg-maq-nome').value = '';
    carregarMaquinasCfg();
  } catch (err) {
    $('cfg-maq-erro').textContent = err.message;
    $('cfg-maq-erro').classList.remove('hidden');
  }
});

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

// ── DASHBOARD / FLOOR MAP ──────────────────────────────────────────────────

const PLANTA = {
  pc: {
    label: 'Pass Car',
    cells: [
      {
        id: 'CM11',
        cols: 3,
        machines: [
          { inv: '7783', label: 'OP10\nNOVA', col: 1, row: 1 },
          { inv: '7781', label: 'OP10A',      col: 2, row: 1 },
          { inv: '7782', label: 'OP10B',      col: 3, row: 1 },
          { inv: '7784', label: 'OP30',       col: 1, row: 2, colSpan: 3 },
          { inv: '7786', label: 'RA13',       col: 1, row: 3 },
          { inv: '7785', label: 'RA14',       col: 2, row: 3 },
          { inv: null,   label: 'BL',         col: 3, row: 3, disabled: true },
          { inv: '7787', label: 'OP70',       col: 1, row: 4, colSpan: 3 },
        ]
      },
      {
        id: 'CM13',
        cols: 3,
        machines: [
          { inv: '7476', label: 'OP10AB',     col: 1, row: 1 },
          { inv: '7376', label: 'OP10CD',     col: 2, row: 1 },
          { inv: '7576', label: 'OP20',       col: 3, row: 1 },
          { inv: '7676', label: 'OP30',       col: 1, row: 2, colSpan: 3 },
          { inv: '7276', label: 'OP40A',      col: 1, row: 3 },
          { inv: '7776', label: 'OP40B',      col: 2, row: 3 },
          { inv: null,   label: 'BL',         col: 3, row: 3, disabled: true },
          { inv: '7876', label: 'OP50',       col: 1, row: 4 },
          { inv: '7978', label: 'OP70',       col: 2, row: 4 },
        ]
      }
    ]
  }
};

let SETOR_ATIVO = null;
let MAPA_STATUS = {};
let MAPA_TIMER  = null;
let FILA_ABERTA = true;

function carregarDashboard() {
  atualizarSectorCards();
}

async function atualizarSectorCards() {
  try {
    const r = await api('/mapa/status');
    if (!r.ok) return;
    MAPA_STATUS = await r.json();
    const maquinas = MAPA_STATUS.maquinas || {};

    const pc_invs = PLANTA.pc.cells.flatMap(c => c.machines.filter(m => m.inv).map(m => m.inv));
    const pc_par  = pc_invs.filter(inv => maquinas[inv]?.status === 'parada');
    const pc_pend = pc_par.filter(inv => maquinas[inv]?.just === 'NAO_JUSTIFICADO');

    $('sector-pc-op').textContent  = pc_invs.length - pc_par.length;
    $('sector-pc-par').textContent = pc_par.length;
    $('sector-pc-pend').textContent = pc_pend.length;

    const badge = $('sector-pc-badge');
    badge.textContent = pc_par.length;
    badge.classList.toggle('hidden', pc_par.length === 0);
  } catch (_) {}
}

function abrirSetor(setor) {
  SETOR_ATIVO = setor;
  const planta = PLANTA[setor];
  $('dash-sectors').classList.add('hidden');
  $('dash-map').classList.remove('hidden');
  $('dash-map-title').textContent = `▸ ${planta.label}`;
  renderFloorMap(setor);
  iniciarPollingMapa();
}

function voltarSetores() {
  pararPollingMapa();
  SETOR_ATIVO = null;
  $('dash-map').classList.add('hidden');
  $('dash-sectors').classList.remove('hidden');
  atualizarSectorCards();
}

function toggleFilaPanel() {
  FILA_ABERTA = !FILA_ABERTA;
  $('dm-fila').classList.toggle('hidden', !FILA_ABERTA);
  $('btn-ocultar-fila').textContent = FILA_ABERTA ? 'Ocultar fila' : 'Mostrar fila';
}

function renderFloorMap(setor) {
  const floor = $('dm-floor');
  floor.innerHTML = '';
  for (const cell of PLANTA[setor].cells) {
    const cellEl = document.createElement('div');
    cellEl.className = 'fm-cell';
    cellEl.innerHTML = `<div class="fm-cell-label">${cell.id}</div>`;

    const grid = document.createElement('div');
    grid.className = 'fm-grid';
    grid.style.gridTemplateColumns = `repeat(${cell.cols}, 1fr)`;

    for (const m of cell.machines) {
      const block = document.createElement('div');
      block.className = 'fm-machine' + (m.disabled ? ' fm-machine-disabled' : '');
      block.style.gridColumn = m.colSpan ? `${m.col} / span ${m.colSpan}` : String(m.col);
      block.style.gridRow    = String(m.row);

      if (m.inv) {
        block.dataset.inv = m.inv;
        block.onclick = () => { $('filtro-maquina').value = m.inv; mostrarAba('paradas'); };
      }

      const st = m.inv ? (MAPA_STATUS.maquinas || {})[m.inv] : null;
      aplicarStatusMaquina(block, st);

      block.innerHTML = `<span class="fm-machine-label">${m.label.replace('\n', '<br>')}</span>`;
      if (st?.status === 'parada') {
        const d = document.createElement('span');
        d.className = 'fm-machine-dur';
        d.textContent = fmtDuracao(st.duracao_min);
        block.appendChild(d);
      }
      grid.appendChild(block);
    }
    cellEl.appendChild(grid);
    floor.appendChild(cellEl);
  }
}

function aplicarStatusMaquina(el, st) {
  el.classList.remove('fm-operando', 'fm-parada', 'fm-urgente');
  if (!st || st.status !== 'parada') {
    el.classList.add('fm-operando');
  } else if (st.just === 'NAO_JUSTIFICADO') {
    el.classList.add('fm-urgente');
  } else {
    el.classList.add('fm-parada');
  }
}

async function pollarMapa() {
  if (!SETOR_ATIVO) return;
  try {
    const r = await api('/mapa/status');
    if (!r.ok) return;
    MAPA_STATUS = await r.json();
    const maquinas = MAPA_STATUS.maquinas || {};

    for (const cell of PLANTA[SETOR_ATIVO].cells) {
      for (const m of cell.machines) {
        if (!m.inv) continue;
        const el = $('dm-floor').querySelector(`[data-inv="${m.inv}"]`);
        if (!el) continue;
        const st = maquinas[m.inv];
        aplicarStatusMaquina(el, st);
        let durEl = el.querySelector('.fm-machine-dur');
        if (st?.status === 'parada') {
          if (!durEl) { durEl = document.createElement('span'); durEl.className = 'fm-machine-dur'; el.appendChild(durEl); }
          durEl.textContent = fmtDuracao(st.duracao_min);
        } else if (durEl) { durEl.remove(); }
      }
    }

    const invs    = PLANTA[SETOR_ATIVO].cells.flatMap(c => c.machines.filter(m => m.inv).map(m => m.inv));
    const paradas = invs.filter(inv => maquinas[inv]?.status === 'parada');
    const pend    = paradas.filter(inv => maquinas[inv]?.just === 'NAO_JUSTIFICADO');
    $('dm-operando').textContent  = invs.length - paradas.length;
    $('dm-paradas').textContent   = paradas.length;
    $('dm-pendentes').textContent = pend.length;

    atualizarFila(maquinas);
    $('dash-map-sub').textContent = `Planta 04 · Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  } catch (_) {}
}

function atualizarFila(maquinas) {
  const list  = $('dm-fila-list');
  const ativas = Object.entries(maquinas)
    .filter(([, st]) => st.status === 'parada')
    .sort((a, b) => (b[1].duracao_min || 0) - (a[1].duracao_min || 0));

  $('dm-fila-count').textContent = `${ativas.length} chamado${ativas.length !== 1 ? 's' : ''}`;

  if (ativas.length === 0) {
    list.innerHTML = '<div class="dfp-empty">Nenhuma parada ativa</div>';
    return;
  }

  list.innerHTML = ativas.map(([inv, st]) => {
    const nome    = nomeInvMapa(inv);
    const urgente = st.just === 'NAO_JUSTIFICADO';
    return `<div class="dfp-item${urgente ? ' dfp-item-urgente' : ''}" onclick="(function(){$('filtro-maquina').value='${inv}';mostrarAba('paradas')})()">
      <div class="dfp-item-header">
        <span class="dfp-item-nome">${nome}</span>
        <span class="dfp-item-dur">${fmtDuracao(st.duracao_min)}</span>
      </div>
      <div class="dfp-item-status">${urgente ? 'Não justificado' : 'Em andamento'}</div>
    </div>`;
  }).join('');
}

function nomeInvMapa(inv) {
  for (const planta of Object.values(PLANTA)) {
    for (const cell of planta.cells) {
      const m = cell.machines.find(m => m.inv === inv);
      if (m) return `${cell.id} ${m.label.replace('\n', ' ')}`;
    }
  }
  return inv;
}

function iniciarPollingMapa() {
  pararPollingMapa();
  pollarMapa();
  MAPA_TIMER = setInterval(pollarMapa, 15000);
}

function pararPollingMapa() {
  if (MAPA_TIMER) { clearInterval(MAPA_TIMER); MAPA_TIMER = null; }
}

// ── INIT ───────────────────────────────────────────────────────────────────

if (TOKEN) {
  mostrarDashboard();
} else {
  $('tela-login').classList.remove('hidden');
  carregarStatusLogin();
}
