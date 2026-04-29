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

  let btnHTML = '';
  if (justificado) {
    btnHTML = `<button class="btn-detalhes" data-id="${p.id}">Ver detalhes</button>`;
  } else {
    const label = emAndamento ? '⏳ Em andamento' : 'Justificar';
    btnHTML = `<button class="btn-justificar" data-id="${p.id}" ${btnDisabled}>${label}</button>`;
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
    ${btnHTML}
  </div>`;
}

// ── MODAL JUSTIFICATIVA ────────────────────────────────────────────────────

async function abrirModal(paradaId) {
  const r = await api(`/paradas/${paradaId}`);
  const p = await r.json();
  const nome = p.nome_maquina || `Máquina ${p.inventory_number}`;

  $('just-parada-id').value = p.id;
  $('modal-titulo').textContent = `Justificar — ${nome}`;
  $('modal-info').innerHTML = `
    <strong>Início:</strong> ${fmtDt(p.inicio)}&emsp;
    <strong>Fim:</strong> ${fmtDt(p.fim)}&emsp;
    <strong>Duração:</strong> ${fmtDuracao(p.duracao_min)}
  `;
  $('just-categoria').value   = '';
  $('just-responsavel').value = '';
  $('just-descricao').value   = '';
  $('just-erro').classList.add('hidden');
  $('modal').classList.remove('hidden');
}

function fecharModal() { $('modal').classList.add('hidden'); }

$('modal-fechar').addEventListener('click', fecharModal);
$('btn-cancelar').addEventListener('click', fecharModal);
$('modal').addEventListener('click', e => { if (e.target === $('modal')) fecharModal(); });

$('form-just').addEventListener('submit', async e => {
  e.preventDefault();
  $('just-erro').classList.add('hidden');
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

// ── MODAL DETALHES ─────────────────────────────────────────────────────────

async function abrirDetalhes(paradaId) {
  const r = await api(`/paradas/${paradaId}`);
  const p = await r.json();
  const nome = p.nome_maquina || `Máquina ${p.inventory_number}`;

  $('detalhes-titulo').textContent = `Detalhes — ${nome}`;

  const just = p.justificativas && p.justificativas[0];
  $('detalhes-corpo').innerHTML = `
    <div class="detalhe-bloco">
      <div class="detalhe-titulo">Parada</div>
      <div class="detalhe-row"><span>Máquina</span><span>${nome} (${p.inventory_number})</span></div>
      <div class="detalhe-row"><span>Início</span><span>${fmtDt(p.inicio)}</span></div>
      <div class="detalhe-row"><span>Fim</span><span>${fmtDt(p.fim)}</span></div>
      <div class="detalhe-row"><span>Duração</span><span style="color:var(--accent);font-weight:700">${fmtDuracao(p.duracao_min)}</span></div>
    </div>
    ${just ? `
    <div class="detalhe-bloco" style="border-color:rgba(34,185,117,0.2);background:rgba(34,185,117,0.04)">
      <div class="detalhe-titulo">Justificativa</div>
      <div class="detalhe-row"><span>Categoria</span><span>${just.categoria}</span></div>
      <div class="detalhe-row"><span>Responsável</span><span>${just.responsavel}</span></div>
      <div class="detalhe-row"><span>Descrição</span><span>${just.descricao || '—'}</span></div>
      <div class="detalhe-row"><span>Registrado em</span><span>${fmtDt(just.criado_em)}</span></div>
    </div>` : '<p style="color:var(--text-muted);font-size:13px">Sem justificativa registrada.</p>'}
  `;

  $('modal-detalhes').classList.remove('hidden');
}

function fecharDetalhes() { $('modal-detalhes').classList.add('hidden'); }
$('detalhes-fechar').addEventListener('click', fecharDetalhes);
$('modal-detalhes').addEventListener('click', e => { if (e.target === $('modal-detalhes')) fecharDetalhes(); });

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

function renderUsuarios(usuarios) {
  const tbody = $('tbody-usuarios');
  tbody.innerHTML = usuarios.map(u => {
    const ini = iniciais(u.nome);
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="user-row-avatar">${ini}</div>
          <span style="font-weight:500">${u.nome}</span>
        </div>
      </td>
      <td style="color:var(--text-muted);font-size:12px">${u.login}</td>
      <td><span class="tag-perfil tag-${u.perfil}">${u.perfil}</span></td>
      <td>
        ${u.ativo
          ? `<span class="badge badge-success"><span class="pip"></span> Ativo</span>`
          : `<span class="badge badge-danger"><span class="pip"></span> Inativo</span>`}
      </td>
      <td>
        <div class="acoes">
          <button class="btn btn-ghost btn-sm" onclick="abrirModalUsuario(${u.id}, '${u.nome}', '${u.login}', '${u.perfil}')">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="excluirUsuario(${u.id}, '${u.nome}')">${u.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

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

if (TOKEN) {
  mostrarDashboard();
} else {
  $('tela-login').classList.remove('hidden');
}
