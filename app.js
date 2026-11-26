const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const STORAGE_KEY = 'hydra_60_state_v6';
const API_STATE_URL = '/api/state';
let apiReady = false;
let saveQueue = Promise.resolve();
let apiErrorShown = false;
let authToken = '';
let editingUser = null;

const HOME_PHOTOS = [
  'imgs/img1.png', 'imgs/img2.png', 'imgs/img3.png', 'imgs/img4.png',
  'imgs/img5.png', 'imgs/img6.png', 'imgs/img7.png', 'imgs/img8.png',
  'imgs/img9.png', 'imgs/img10.png', 'imgs/img11.png', 'imgs/img12.png'
];

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        teams: Array.isArray(p.teams) ? p.teams : [],
        matches: Array.isArray(p.matches) ? p.matches : [],
        insp: Array.isArray(p.insp) ? p.insp : [],
        judge: Array.isArray(p.judge) ? p.judge : [],
        cfg: p.cfg && typeof p.cfg === 'object' ? p.cfg : {},
        aw: p.aw && typeof p.aw === 'object' ? p.aw : {},
        users: Array.isArray(p.users) ? p.users : []
      };
    }
  } catch (_) {}
  return { teams: [], matches: [], insp: [], judge: [], cfg: {}, aw: {}, users: [] };
}

let S = loadLocal();
let pg = 'home', sub = 'equipes', role = '', tab = '';
let db = null, U = { uid: 'local-staff', displayName: 'Organização Hydra' };
let me = { id: 'local-staff', name: '' };
let W = true, E = true, flt = '', SO = { c: 'n', d: 1 }, sel = '', selM = { T: '', Q: '' };
let T = null, left = 240, jt = null;

function saveLocal() {
  const snapshot = {
    teams: S.teams, matches: S.matches, insp: S.insp,
    judge: S.judge, cfg: S.cfg, aw: S.aw, users: (S.users || []).map(({ user, role }) => ({ user, role }))
  };

  // Mantém uma cópia local como contingência, mas o Railway é a fonte principal.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (_) {}

  if (!apiReady) return;

  const body = JSON.stringify(snapshot);
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const response = await fetch(API_STATE_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body
      });
      if (response.status === 401) {
        authToken = '';
        role = '';
        tab = '';
        render(true);
        throw new Error('Sessão expirada. Entre novamente para continuar.');
      }
      if (!response.ok) throw new Error(`Falha ao salvar no servidor (${response.status})`);
      apiErrorShown = false;
    })
    .catch(error => {
      console.error('Não foi possível salvar no Railway:', error);
      if (!apiErrorShown) {
        apiErrorShown = true;
        toast('Falha ao sincronizar com o banco. Verifique a conexão.');
      }
    });
}
const DEF = {
  nome: 'Boca do Rio', data: '3 de dezembro de 2026', local: '',
  ini: '09:00', fim: '12:00', step: 8, gap: 10, max: 16
};
const cf = () => ({ ...DEF, ...S.cfg });
const hm = s => { const [a, b] = String(s).split(':'); return +a * 60 + +b; };
const fm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const fT = s => Math.floor(Math.max(s, 0) / 60) + ':' + String(Math.max(s, 0) % 60).padStart(2, '0');

const getMatchDurSec = m => Math.max(10, Math.round((+(m?.durMin ?? 4) || 4) * 60));

const DESIGN_CRITERIA = [
  ['forma', 'Design: forma'],
  ['funcao', 'Design: função'],
  ['estetica', 'Design: estética']
];

const TORCIDA_CRITERIA = [
  ['entusiasmo', 'Torcida e Espírito: entusiasmo'],
  ['familia', 'Torcida e Espírito: família e trabalho em equipe'],
  ['conduta', 'Conduta e respeito']
];

const RO = {
  arbT: ['Árbitro de treino', ['mesaT', 'teste']],
  arbQ: ['Árbitro de qualificação', ['mesaQ', 'quali']],
  inspetor: ['Inspetor', ['inspecao']],
  juizDesign: ['Juiz de Design', ['avDesign']],
  juizTorcida: ['Juiz de Torcida e Conduta', ['avTorcida']],
  cred: ['Credenciamento', ['cred']],
  imagem: ['Equipe de Imagem', ['placarS', 'premios']],
  geral: ['Árbitro Chefe', ['usuarios', 'config', 'equipesA', 'cronograma', 'mesaT', 'mesaQ', 'inspecao', 'avDesign', 'avTorcida', 'cred', 'placarS', 'premios']]
};

const TN = {
  usuarios: 'Usuários e Senhas',
  mesaT: 'Arbitragem de treino',
  mesaQ: 'Arbitragem de qualificação',
  teste: 'Partidas de teste',
  quali: 'Qualificação',
  inspecao: 'Inspeção',
  avDesign: 'Avaliação de Design',
  avTorcida: 'Avaliação de Torcida e Conduta',
  cred: 'Credenciamento',
  placarS: 'Placar',
  premios: 'Prêmios',
  config: 'Configuração',
  equipesA: 'Equipes',
  cronograma: 'Cronograma'
};

const OBJ = [['geral', 'Geral'], ['treino', 'Para treino'], ['quali', 'Para qualificatória'], ['rev', 'Apenas revisão necessária'], ['outro', 'Outros (descreva)']];
const IF = [
  ['dim', 'Dimensões: 15–20 cm × 7–10 cm', 1], ['mot', 'Motores e elétrica originais', 1],
  ['rod', 'Rodas originais', 1], ['id', 'Equipe identificada com broches', 1],
  ['pil', '5 pilhas AA (3 robô + 2 controle)'], ['fix', 'Peças e adesivos bem fixados'],
  ['cor', 'Sem bordas cortantes ou partes soltas'], ['cha', 'Chassi base íntegro']
];

const tm = n => S.teams.find(t => t.n == n);
const pres = () => S.teams.filter(t => t.present);
const pad = n => String(n).padStart(2, '0');

const toast = t => {
  let e = $('#ts');
  if (!e) {
    e = document.createElement('div');
    e.id = 'ts';
    e.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#c40900;color:#fff;padding:8px 18px;border-radius:10px;z-index:99;font-size:13px';
    document.body.append(e);
  }
  e.textContent = t;
  e.style.display = 'block';
  setTimeout(() => { e.style.display = 'none'; }, 2200);
};

const opts = (a, v) => a.map(([k, l]) => `<option value="${esc(k)}"${k == v ? ' selected' : ''}>${esc(l)}</option>`).join('');

function teamSelect(attr, list, selectedVal) {
  const curObj = tm(selectedVal) || list[0] || { n: '–', name: '' };
  return `<div class="team-picker">
    <span class="team-badge">${esc(curObj.n)}</span>
    <select ${attr}>${opts(list.map(t => [t.n, `${t.n} · ${t.name}`]), selectedVal)}</select>
    <span class="team-arrow">▼</span>
  </div>`;
}

const res = m => m.rs > m.bs ? 'r' : m.bs > m.rs ? 'b' : 't';
const calc = l => {
  let r = 0, b = 0;
  l.forEach(e => {
    const v = e[1] == 'p' ? 3 : e[1] == 'c' ? -3 : -12;
    if (e[0] == 'r') r += v;
    else b += v;
  });
  return { rs: r, bs: b, cr: 0, cb: 0 };
};

const hasChiefUser = () => (S.users || []).some(u => u.role === 'geral');
const getRefArbiters = () => (S.users || [])
  .filter(u => ['arbT', 'arbQ', 'geral'].includes(u.role))
  .map(u => u.user);

const getMatchRefs = m => {
  const list = Array.isArray(m.refs) ? m.refs.filter(Boolean) : (m.ref ? [m.ref] : []);
  return list.length ? list.join(' · ') : 'não definido';
};

function renderTiles() {
  const block = HOME_PHOTOS.map((src, idx) => {
    const hasImg = src && !/^img\d+$/i.test(src.trim());
    return `<div class="tl">${hasImg ? `<img src="${esc(src)}" alt="Foto ${idx + 1}">` : ''}</div>`;
  }).join('');
  return `<div class="tiles"><div class="trk">${block + block}</div></div>`;
}

function rank() {
  const o = {};
  S.teams.forEach(t => { o[t.n] = { n: t.n, name: t.name, j: 0, b: 0, pts: 0 }; });
  S.matches.filter(m => m.k == 'Q' && m.st == 'done').forEach(m => {
    const w = res(m);
    [['red', 'r'], ['blue', 'b']].forEach(([a, c]) => m[a].forEach(n => {
      const x = o[n];
      if (!x) return;
      x.j++;
      x.pts += w == c ? 10 : w == 't' ? 3 : 0;
      x.b += m.log.filter(e => e == c + 'p').length;
    }));
  });
  return Object.values(o).sort((a, b) => b.pts - a.pts || b.b - a.b);
}

function jv(keys) {
  const o = {};
  S.judge.forEach(j => {
    const v = keys.map(k => j.sc?.[k]).filter(x => x != null && x !== '');
    if (v.length) (o[j.team] = o[j.team] || []).push(v.reduce((a, b) => a + +b, 0) / v.length);
  });
  return Object.entries(o).map(([n, a]) => ({ n, v: a.reduce((x, y) => x + y, 0) / a.length })).sort((a, b) => b.v - a.v);
}

const insp = n => S.insp.filter(i => i.team == n).sort((a, b) => a.t - b.t);
const kv = (m, c) => c == 'n' ? m.n : c == 'time' ? m.time : c == 'rs' ? m.rs : c == 'bs' ? m.bs : +m[c[0] == 'r' ? 'red' : 'blue'][+c[1]];

function mt(k) {
  const cs = [['n', 'Partida'], ['time', 'Horário'], ['r0', 'Vermelho 1'], ['r1', 'Vermelho 2'], ['b0', 'Azul 1'], ['b1', 'Azul 2']];
  if (k == 'Q') cs.push(['rs', 'Final Vermelho'], ['bs', 'Final Azul']);
  let ms = S.matches.filter(m => m.k == k).sort((a, b) => {
    const x = kv(a, SO.c), y = kv(b, SO.c);
    return (x > y ? 1 : x < y ? -1 : 0) * SO.d;
  });
  if (flt) ms = ms.filter(m => [...m.red, ...m.blue].includes(flt));
  const c = (l, cl) => l.map(n => `<td class="${cl}"><a data-team="${esc(n)}">${esc(n)}</a>`).join('');
  return `<div class="ft"><div class="fb"><button class="rs" data-a="reset">Limpar</button><input data-f placeholder="Nº da equipe" value="${esc(flt)}"><button class="fl" data-a="filtrar">Filtrar</button></div><table><tr>${cs.map(([c, l]) => `<th data-sort="${c}">${l}<i>▲▼</i>`).join('')}` +
    (ms.map(m => `<tr><td class="m"><a>${k == 'Q' ? 'Qualificação' : 'Treino'} ${m.n}</a>${m.st == 'live' ? ' · ao vivo' : ''}<td>${esc(m.time)}${c(m.red, 'r')}${c(m.blue, 'b')}${k == 'Q' ? (m.st == 'wait' ? '<td>–<td>–' : `<td class="R">${m.rs}<td class="B">${m.bs}`) : ''}`).join('') ||
    `<tr><td colspan="${cs.length}">Nenhuma partida publicada.</td>`) + '</table></div>';
}

const rt = (a, big = false) => `<div class="ft${big ? ' img-big' : ''}"><table><tr><th>#<th>Equipe<th>Partidas<th>Pontos de placar<th>Bolinhas marcadas` +
  a.map((x, i) => `<tr><td>${i + 1}<td>${esc(x.n)} · ${esc(x.name)}<td>${x.j}<td><b>${x.pts}</b><td>${x.b}`).join('') + '</table></div>';

const pod = (t, a, f) => `<div class="cd"><h3>${t}</h3>` +
  (a.slice(0, 3).map((x, i) => `<div style="font-size:18px">${['1º', '2º', '3º'][i]} ${esc(x.n)} · ${esc(tm(x.n)?.name || x.name || '')} <span class="mu">${f(x)}</span></div>`).join('') || '<p class="mu">Sem dados ainda.</p>') + '</div>';

const AW = [['win', 'Equipe vencedora'], ['design', 'Prêmio de design'], ['spirit', 'Espírito de equipe / torcida']];
const awp = () => AW.map(([k, l]) => `<div class="cd"><h3>${l}</h3>` +
  ([0, 1, 2].map(i => {
    const n = S.aw[k]?.[i];
    return n ? `<div style="font-size:18px">${i + 1}º · ${esc(n)} · ${esc(tm(n)?.name)}</div>` : '';
  }).join('') || '<p class="mu">Será anunciado na cerimônia.</p>') + '</div>').join('');

const ch = b => {
  const topBar = `<div class="top"><a data-go="portal">PORTAL DO JUIZ</a></div>`;
  const whoBar = pg === 'home' ? `<div class="bar"><a href="https://programacaohydrafr.wixsite.com/hydra-frc" target="_blank" rel="noopener noreferrer">QUEM SOMOS?</a></div>` : '';
  return `${topBar}${whoBar}${b}<footer><b>HYDRA FRC</b><div class="foot-right"><div class="flinks"><a>Termos de Uso</a><a>Contato</a><a>Política de Privacidade</a></div><small>© 2026 Equipe HYDRA FRC.<br>Todos os direitos reservados.</small></div></footer>`;
};

function warns() {
  const c = cf(), all = S.teams.length, w = [];
  if (all > c.max) w.push(`Há ${all} equipes cadastradas, mas a capacidade do evento é ${c.max}.`);
  if (all < 4) w.push(`Cadastre pelo menos 4 equipes para montar partidas (atualmente: ${all}).`);
  else {
    if (all % 4) w.push(`${all} equipes cadastradas: as partidas serão completadas em grupos de 4, e algumas equipes poderão jogar uma partida a mais.`);
    const M = Math.ceil(all / 4) * 4, fim = hm(c.ini) + (M - 1) * c.step + c.gap + c.step;
    if (fim > hm(c.fim)) w.push(`O cronograma estimado termina às ${fm(fim)}, depois do fim do evento (${c.fim}). Reduza o intervalo ou o número de equipes.`);
  }
  if (S.matches.some(m => [...m.red, ...m.blue].some(n => !tm(n)))) w.push('Há partidas com equipes removidas do cadastro. Revise os confrontos.');
  const dup = S.matches.filter(m => new Set([...m.red, ...m.blue]).size < 4);
  if (dup.length) w.push('Partidas com equipe repetida: ' + dup.map(m => m.k + m.n).join(', ') + '.');
  const q = S.teams.filter(t => S.matches.filter(m => m.k == 'Q' && [...m.red, ...m.blue].includes(t.n)).length < 3);
  if (S.matches.length && q.length) w.push('Equipes com menos de 3 partidas de qualificação: ' + q.map(t => t.n).join(', ') + '.');
  return w;
}

const wn = () => warns().map(x => `<div class="wn">${esc(x)}</div>`).join('');
const login = m => `<div class="cd"><h3>Acesso restrito</h3><p>${m}</p></div>`;

function loginScreen() {
  const roleOpts = Object.entries(RO).map(([k, v]) => [k, v[0]]);
  const chiefHasCustom = hasChiefUser();
  return `<div class="stf">
    <div class="volt"><button class="pill sm" data-go="home">VOLTAR</button></div>
    <div class="cd frm login-box">
      <h3>Login do Portal</h3>
      <label>Usuário
        <input id="lgUser" type="text" placeholder="Digite seu usuário">
      </label>
      <label>Função
        <select id="lgRole">${opts(roleOpts, role || 'geral')}</select>
      </label>
      <label>Senha
        <input id="lgPass" type="password" placeholder="Digite a senha" autocomplete="current-password">
      </label>
      <div class="row" style="justify-content:space-between;margin-top:12px">
        <button class="bt" data-a="doLogin">Entrar</button>
        <span class="mu" style="font-size:12px">${chiefHasCustom ? 'Use as credenciais cadastradas' : 'Acesso inicial do Árbitro Chefe: usuário em branco e senha definida pela organização'}</span>
      </div>
    </div>
  </div>`;
}

const V = {
  home() {
    const tx = '+ 3 REGIÕES DE SALVADOR | + 15 EQUIPES FORMADAS | + 24 ENCONTROS LOCAIS | DIVERSOS CONCEITOS DIDÁTICOS | ';
    return ch(`
      <section class="hero"><img class="hydra-logo" src="imgs/HYDRA LOGO.png" alt="Logo Hydra FRC"><h1>CAMPEONATO 60+</h1></section>
      <div class="tick"><span>${tx.repeat(4)}</span></div>
      ${renderTiles()}
      <div class="cta"><button class="pill" data-go="evento">Placar das Equipes</button></div>
    `);
  },
  quem() {
    return ch(`<div class="evw"><div class="volt"><button class="pill sm" data-go="home">VOLTAR</button></div><div class="panel"><h2>Quem somos</h2><p>A Equipe Hydra #9163 é uma equipe brasileira de robótica da Escola SESI Djalma Pessoa, em Salvador, fundada em 2022 e única representante da categoria FIRST Robotics Competition (FRC) na Bahia.</p><p>O Campeonato de Robótica 60+ leva aos idosos de Salvador a emoção do esporte e a experiência de construir robôs, formar equipes e competir em desafios STEAM.</p></div></div>`);
  },
  evento() {
    const c = cf(), b = (k, l) => `<button class="${sub == k ? 'on' : ''}" data-sub="${k}">${l}</button>`;
    const body = sub == 'equipes'
      ? S.teams.sort((a, b) => a.n - b.n).map(t => `<div class="rw"><span>${esc(t.name)}</span><span>${t.unit ? 'Unidade ' + esc(t.unit) : ''}</span></div>`).join('') || '<p style="padding:10px">Nenhuma equipe cadastrada.</p>'
      : sub == 'teste' ? mt('T') : sub == 'quali' ? mt('Q') : `<div style="padding:8px 4px" class="g">${awp()}</div>`;
    return ch(`<div class="evw"><div class="volt"><button class="pill sm" data-go="home">VOLTAR</button></div><div class="panel"><div class="evh"><h2>${esc(c.nome)}</h2><div class="inf">Horário do Evento - ${esc(c.ini.replace(':00', 'h'))} às ${esc(c.fim.replace(':00', 'h'))}<br>Data do Evento - ${esc(c.data)}<br>Capacidade do Evento - ${c.max} equipes</div></div><div class="evb"><div class="loc">${esc(c.local || 'Localização completa do evento')}</div><div class="nv">${b('teste', 'Partidas de Teste')}${b('premios', 'Prêmios')}${b('quali', 'Partidas de Qualificação')}${b('equipes', 'Equipes')}</div></div>${body}</div></div>`);
  },
  placar() {
    return ch(`<div class="evw"><div class="volt"><button class="pill sm" data-go="home">VOLTAR</button></div><div class="panel"><h2 style="margin:6px 10px">Placar das Equipes</h2>${rt(rank())}</div></div>`);
  },
  portal() {
    if (!role) return ch(loginScreen());
    const ts = RO[role][1];
    if (!ts.includes(tab)) tab = ts[0];

    if (role === 'imagem') {
      const nextTab = tab === 'placarS' ? 'premios' : 'placarS';
      const toggleLabel = tab === 'placarS' ? 'Prêmios' : 'Placar';
      if (tab === 'placarS') {
        return ch(`<div class="stf">
          <div class="row" style="justify-content:space-between;margin-bottom:4px">
            <button class="bt" data-tab="${nextTab}">${toggleLabel}</button>
            <button class="pill sm" data-a="logout">SAIR</button>
          </div>
          <section class="hero compact"><img class="hydra-logo" src="HYDRA LOGO.png" alt="Logo Hydra FRC"><h1>CAMPEONATO 60+</h1></section>
          ${rt(rank(), true)}
        </div>`);
      }
      const greetLabel = me.name && me.name !== RO[role][0] ? me.name : RO[role][0];
      return ch(`<div class="stf">
        <div class="staff-head">
          <p class="greeting">Olá, ${esc(greetLabel)}.</p>
          <div class="row">
            <button class="bt" data-tab="${nextTab}">${toggleLabel}</button>
            <button class="pill sm" data-a="logout">SAIR</button>
          </div>
        </div>
        ${P[tab]()}
      </div>`);
    }

    const greetLabel = me.name && me.name !== RO[role][0] ? me.name : RO[role][0];
    return ch(`<div class="stf">
      <div class="staff-head"><p class="greeting">Olá, ${esc(greetLabel)}.</p><button class="pill sm" data-a="logout">SAIR</button></div>
      <div class="tabs">${ts.map(t => `<button class="${t == tab ? 'on' : ''}" data-tab="${t}">${TN[t]}</button>`).join('')}</div>
      ${P[tab]()}
    </div>`);
  }
};

const mesa = k => {
  let ms = S.matches.filter(m => m.k == k).sort((a, b) => a.n - b.n);
  if (!E && ms.some(m => (m.refs?.length || m.ref))) {
    ms = ms.filter(m => (m.refs || [m.ref]).includes(me.name));
  }
  if (!ms.length) return login('Nenhuma partida disponível para você. O árbitro chefe precisa gerar o cronograma e atribuir os árbitros.');
  const m = ms.find(x => k + x.n == selM[k]) || ms.find(x => x.st != 'done') || ms[0];
  selM[k] = k + m.n;
  const live = m.st == 'live';
  const durMin = +(m.durMin ?? 4) || 4;
  const durSec = getMatchDurSec(m);
  const side = (c, l) => {
    const teamNumbers = m[c == 'r' ? 'red' : 'blue'];
    const cards = m.yellowCards || {};
    const teamRows = teamNumbers.map(n => `<div class="penalty-team"><div><b>${esc(n)} · ${esc(tm(n)?.name || 'Equipe')}</b><small>Cartões amarelos nesta partida: ${cards[n] || 0}</small></div><div class="row"><button class="bt yellow" data-yellow="${esc(n)}" data-match="${mid(m)}" ${live ? '' : 'disabled'}>Aplicar cartão</button>${cards[n] ? `<button class="bt gr" data-yellow-remove="${esc(n)}" data-match="${mid(m)}" ${live ? '' : 'disabled'}>Desfazer</button>` : ''}</div></div>`).join('');
    return `<div class="cd"><h3>${l}</h3>${teamRows}<div class="big">${m[c + 's']}</div><div class="mu" style="text-align:center">Bolinhas: ${m.log.filter(e => e == c + 'p').length}</div><button class="bt w" data-e="${c}p" ${live ? '' : 'disabled'}>+3 Marcou ponto</button><button class="bt gr w" data-e="${c}c" ${live ? '' : 'disabled'}>−3 Colisão (causador)</button><button class="bt gr w" data-e="${c}i" ${live ? '' : 'disabled'}>−12 Imobilização</button></div>`;
  };

  const treinoDurCtrl = k === 'T'
    ? `<label class="row" style="gap:6px"><span>Duração da partida (min):</span><input type="number" min="0.5" max="60" step="0.5" style="width:76px" data-dur="${mid(m)}" value="${esc(durMin)}"></label>`
    : `<span>Duração: <b>${durMin} min</b></span>`;

  const restartBtn = k === 'T'
    ? `<button class="bt gr" data-a="restart">Reiniciar partida</button>`
    : (m.st == 'done' ? '<button class="bt gr" data-a="reopen">Reabrir</button>' : '');

  return `<div class="cd frm"><div class="row" style="justify-content:space-between">
    <select data-selm="${k}">${opts(ms.map(x => [k + x.n, (k == 'T' ? 'Treino ' : 'Qualificação ') + x.n + ' · ' + x.time + (x.st == 'done' ? ' (concluída)' : x.st == 'live' ? ' (ao vivo)' : '')]), k + m.n)}</select>
    ${treinoDurCtrl}
    <span>Árbitros: <b>${esc(getMatchRefs(m))}</b></span>
  </div></div>
  <div class="big" id="tm">${fT(live ? left : durSec)}</div>
  <div class="row" style="justify-content:center">
    <button class="bt" data-a="start" ${m.st == 'wait' ? '' : 'disabled'}>Iniciar (${durMin} min)</button>
    <button class="bt gr" data-a="undo" ${live ? '' : 'disabled'}>Desfazer</button>
    <button class="bt" data-a="end" ${live ? '' : 'disabled'}>Finalizar e enviar</button>
    ${restartBtn}
  </div>
  <div class="g">${side('r', 'Vermelha')}${side('b', 'Azul')}</div>`;
};

function judgeEvalView(mode) {
  if (!U || !me.id) return login('O painel de avaliação exige login.');
  const a = pres();
  if (!a.length) return login('Nenhuma equipe credenciada como presente ainda.');
  if (!tm(sel) || !tm(sel).present) sel = a[0].n;

  const criteria = mode === 'design' ? DESIGN_CRITERIA : TORCIDA_CRITERIA;
  const targetRole = mode === 'design' ? 'juizDesign' : 'juizTorcida';
  const title = mode === 'design' ? 'Avaliação de Design' : 'Avaliação de Torcida e Conduta';

  const o = S.judge.find(j => j.team == sel && j.uid == me.id) || { sc: {}, obs: '' };
  const myVals = criteria.map(([k]) => o.sc?.[k]).filter(x => x != null && x !== '');
  const myAvg = myVals.length ? (myVals.reduce((acc, v) => acc + +v, 0) / myVals.length).toFixed(1) : '–';

  const registeredJudges = (S.users || []).filter(u => u.role === targetRole);
  const scoredForTeam = S.judge.filter(j => j.team == sel);

  const combinedRows = [
    ...registeredJudges.map(u => {
      const uid = 'u-' + u.user;
      const found = scoredForTeam.find(j => j.uid === uid || j.name === u.user);
      return { uid, name: u.user, sc: found?.sc || {}, obs: found?.obs || '' };
    }),
    ...scoredForTeam.filter(j => !registeredJudges.some(u => ('u-' + u.user) === j.uid || u.user === j.name))
  ];

  const allScores = [];
  combinedRows.forEach(r => {
    criteria.forEach(([k]) => {
      const v = r.sc?.[k];
      if (v != null && v !== '') allScores.push(+v);
    });
  });
  const judgesAvg = allScores.length ? (allScores.reduce((acc, v) => acc + v, 0) / allScores.length).toFixed(1) : '–';

  return `${teamSelect('data-sel', a, sel)}
    <div class="avg-strip">
      <div class="avg-box"><small>Média do juiz (você)</small><b>${myAvg}</b></div>
      <div class="avg-box"><small>Média dos juízes (${esc(title)})</small><b>${judgesAvg}</b></div>
    </div>
    <div class="cd frm">
      <h3>${title} · Notas (0 a 10) <span id="sv" class="ok"></span></h3>
      ${criteria.map(([k, l]) => `<label class="row" style="justify-content:space-between;padding:4px 0">
        <span>${l}</span>
        <input type="number" min="0" max="10" step="0.5" data-j="${k}" value="${o.sc?.[k] ?? ''}" style="width:84px">
      </label>`).join('')}
      <textarea id="obs" rows="2" placeholder="Observações" style="width:100%;margin-top:8px">${esc(o.obs || '')}</textarea>
    </div>
    <div class="cd">
      <h3>Tabela de Juízes · Equipe ${esc(sel)}</h3>
      <div style="overflow-x:auto">
        <table>
          <tr>
            <th>Critério</th>
            ${combinedRows.map(r => `<th>${esc(r.name)}${r.uid == me.id ? ' (você)' : ''}</th>`).join('')}
          </tr>
          ${criteria.map(([k, l]) => `<tr>
            <td>${l}</td>
            ${combinedRows.map(r => `<td>${esc(r.sc?.[k] ?? '–')}</td>`).join('')}
          </tr>`).join('')}
          <tr>
            <td><b>Média do juiz</b></td>
            ${combinedRows.map(r => {
              const vals = criteria.map(([k]) => r.sc?.[k]).filter(v => v != null && v !== '');
              const avg = vals.length ? (vals.reduce((acc, v) => acc + +v, 0) / vals.length).toFixed(1) : '–';
              return `<td><b>${avg}</b></td>`;
            }).join('')}
          </tr>
          <tr>
            <td>Observações</td>
            ${combinedRows.map(r => `<td style="text-align:left">${esc(r.obs || '–')}</td>`).join('')}
          </tr>
        </table>
      </div>
    </div>`;
}

const P = {
  usuarios() {
    const roleOpts = Object.entries(RO).map(([k, v]) => [k, v[0]]);
    const list = S.users || [];
    const editing = editingUser ? list.find(u => u.user === editingUser.user && u.role === editingUser.role) : null;
    const form = editing
      ? `<div class="cd frm"><h3>Alterar senha de ${esc(editing.user)}</h3><p class="mu">A senha atual nunca é exibida e não é necessária para definir uma nova.</p><div class="row"><input id="uPass" type="password" autocomplete="new-password" placeholder="Digite a nova senha"><button class="bt" data-a="addUser">Salvar nova senha</button><button class="bt gr" data-a="cancelUserEdit">Cancelar</button></div></div>`
      : `<div class="cd frm"><h3>Criar usuário</h3><div class="row"><input id="uName" placeholder="Usuário / Nome"><select id="uRole">${opts(roleOpts, 'juizDesign')}</select><input id="uPass" type="password" autocomplete="new-password" placeholder="Defina uma senha"><button class="bt" data-a="addUser">Criar usuário</button></div></div>`;
    return `${form}<div class="cd"><h3>Usuários cadastrados</h3><div class="user-list">${list.map((u, idx) => `<div class="user-row"><div><b>${esc(u.user)}</b><small>${esc(RO[u.role]?.[0] || u.role)}</small></div><div class="row"><button class="bt gr" data-editu="${idx}">Alterar senha</button><button class="bt gr" data-delu="${idx}">Remover</button></div></div>`).join('') || '<p>Nenhum usuário cadastrado ainda.</p>'}</div></div>`;
  },
  mesaT: () => mesa('T'),
  mesaQ: () => mesa('Q'),
  teste: () => `<div style="color:#000">${mt('T')}</div>`,
  quali: () => `<div style="color:#000">${mt('Q')}</div>`,
  placarS: () => rt(rank(), role === 'imagem'),
  premios() {
    const designRank = jv(DESIGN_CRITERIA.map(([k]) => k));
    const spiritRank = jv(TORCIDA_CRITERIA.map(([k]) => k));
    if (!E) {
      return `<h3>Pontuação atual · Design e Torcida/Conduta</h3>
        <div class="g">
          ${pod('Prêmio de design (pontuação)', designRank, x => x.v.toFixed(1) + ' pts')}
          ${pod('Prêmio de torcida e conduta (pontuação)', spiritRank, x => x.v.toFixed(1) + ' pts')}
        </div>
        <h3>Anúncio oficial</h3>
        <div class="g">${awp()}</div>`;
    }
    const r = rank(), s3 = (k, i) => `<select data-aw="${k}|${i}"><option value="">–</option>${opts(pres().map(t => [t.n, t.n + ' · ' + t.name]), S.aw[k]?.[i] ?? '')}</select>`;
    return `<div class="cd frm"><h3>Lançar equipes vencedoras</h3><p>O público vê apenas os nomes das equipes, sem pontuação.</p>` +
      AW.map(([k, l]) => `<div class="row" style="padding:4px 0"><b style="min-width:190px">${l}</b>${[0, 1, 2].map(i => `${i + 1}º ${s3(k, i)}`).join(' ')}</div>`).join('') +
      `</div><h3>Referência (Design e Torcida/Conduta)</h3><div class="g">${pod('Equipe vencedora', r, x => x.pts + ' pts')}${pod('Prêmio de design', designRank, x => x.v.toFixed(1) + ' pts')}${pod('Torcida e conduta', spiritRank, x => x.v.toFixed(1) + ' pts')}</div>`;
  },
  config() {
    const c = cf(), i = (k, l, t = 'text') => `<label>${l}<br><input type="${t}" data-cf="${k}" value="${esc(c[k])}"></label>`;
    return `${wn()}<div class="cd frm"><h3>Dados do evento</h3><div class="g">${i('nome', 'Nome do evento')}${i('data', 'Data')}${i('local', 'Localização')}${i('max', 'Capacidade (nº de equipes)', 'number')}${i('ini', 'Início', 'time')}${i('fim', 'Fim', 'time')}${i('step', 'Intervalo entre partidas (min)', 'number')}${i('gap', 'Pausa entre treino e qualificação (min)', 'number')}</div><br><button class="bt" data-a="savecfg">Salvar</button></div>`;
  },
  equipesA() {
    return `<div class="cd frm"><h3>Cadastrar equipe</h3><div class="row"><input id="tn" placeholder="Nº" size="5"><input id="tnm" placeholder="Nome da equipe"><input id="tu" placeholder="Unidade"><button class="bt" data-a="addteam">Adicionar</button><button class="bt gr" data-a="demo">Carregar 8 exemplos</button></div><p class="mu" style="margin:8px 0 0;font-size:12px">O cadastro já permite incluir a equipe no cronograma. O credenciamento é independente e pode ser feito depois.</p></div>${wn()}<div class="cd"><table><tr><th>Nº<th>Equipe<th>Unidade<th>Credenciada<th>` +
      S.teams.sort((a, b) => a.n - b.n).map(t => `<tr><td>${esc(t.n)}<td>${esc(t.name)}<td>${esc(t.unit)}<td>${t.present ? '<span class="ok">Sim</span>' : '<span class="mu">Aguardando credenciamento</span>'}<td><button class="bt gr" data-del="${esc(t.n)}">Remover</button>`).join('') + '</table></div>';
  },
  cronograma() {
    const ms = [...S.matches].sort((a, b) => a.k < b.k ? 1 : a.k > b.k ? -1 : a.n - b.n);
    const ar = getRefArbiters();
    const pt = S.teams.map(t => [t.n, t.n + ' · ' + t.name]);
    const sl = (m, s, i) => `<td><select data-slot="${m.k}${pad(m.n)}|${s}|${i}">${opts([...pt, ...(pt.some(p => p[0] == m[s][i]) || !m[s][i] ? [] : [[m[s][i], m[s][i] + ' (não cadastrada)']])], m[s][i])}</select>`;
    const refSel = (m, idx) => {
      const curRef = Array.isArray(m.refs) ? (m.refs[idx] || '') : (idx === 0 ? (m.ref || '') : '');
      return `<td><select data-rf="${m.k}${pad(m.n)}|${idx}"><option value="">–</option>${opts(ar.map(x => [x, x]), curRef)}</select>`;
    };
    return `${wn()}<div class="row"><button class="bt" data-a="gen">Gerar cronograma aleatório</button><button class="bt gr" data-a="flow">Recalcular horários</button><button class="bt gr" data-a="addT">+ Partida de treino</button><button class="bt gr" data-a="addQ">+ Partida de qualificação</button><button class="bt gr" data-a="clr">Apagar partidas</button></div><div class="cd frm" style="overflow-x:auto"><table><tr><th>Partida<th>Horário<th>Vermelho 1<th>Vermelho 2<th>Azul 1<th>Azul 2<th>Árbitro 1<th>Árbitro 2<th>Excluir` +
      ms.map(m => `<tr><td>${m.k == 'T' ? 'Treino' : 'Qualif.'} ${m.n}<td><input type="time" data-tm="${m.k}${pad(m.n)}" value="${esc(m.time)}">${sl(m, 'red', 0)}${sl(m, 'red', 1)}${sl(m, 'blue', 0)}${sl(m, 'blue', 1)}${refSel(m, 0)}${refSel(m, 1)}<td><button class="bt gr" data-delm="${m.k}${pad(m.n)}">Excluir</button>`).join('') + '</table></div>';
  },
  inspecao() {
    const a = pres();
    if (!a.length) return login('Nenhuma equipe credenciada como presente. Faça o credenciamento primeiro.');
    if (!tm(sel) || !tm(sel).present) sel = a[0].n;
    const h = insp(sel), d = new Date(), nw = pad(d.getHours()) + ':' + pad(d.getMinutes());
    return `${teamSelect('data-sel', a, sel)}<div class="cd frm"><div class="row"><div>Horário: <b>${nw}</b></div><label>Objetivo da inspeção<br><select id="io" data-io>${opts(OBJ, h.length ? 'rev' : 'geral')}</select></label></div><textarea id="id" rows="2" placeholder="Descreva o objetivo" style="width:100%;margin:8px 0;display:none"></textarea>${IF.map(([k, l, f]) => `<label style="display:flex;gap:8px;padding:4px 0;${f && h.length ? 'display:none' : ''}" class="${f ? 'fo' : ''}"><input type="checkbox" data-k="${k}"> ${l}</label>`).join('')}<textarea id="obs" rows="2" placeholder="Observações" style="width:100%;margin:8px 0"></textarea><button class="bt" data-a="insp">Registrar inspeção</button></div><div class="cd"><h3>Histórico da equipe ${esc(sel)}</h3><table><tr><th>Horário<th>Objetivo<th>Resultado<th>Inspetor` +
      h.map(i => `<tr><td>${esc(i.hora)}<td>${esc(OBJ.find(o => o[0] == i.obj)?.[1])}${i.desc ? ' – ' + esc(i.desc) : ''}<td>${i.ok ? '<span class="ok">Aprovada</span>' : '<span class="no">Pendente</span>'}<td>${esc(i.by)}`).join('') + '</table></div>';
  },
  avDesign: () => judgeEvalView('design'),
  avTorcida: () => judgeEvalView('torcida')
};

P.cred = () => {
  if (!S.teams.length) return login('Nenhuma equipe cadastrada. O árbitro chefe precisa cadastrar as equipes primeiro.');
  return S.teams.sort((a, b) => a.n - b.n).map(t => `<div class="cd frm"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(t.n)} · ${esc(t.name)} <span class="mu">${esc(t.unit)}</span></h3><label><input type="checkbox" data-pr="${esc(t.n)}" ${t.present ? 'checked' : ''}> Equipe presente</label></div></div>`).join('');
};

const col = c => db ? db.collection(c) : null;
const cur = k => S.matches.find(m => m.k + m.n == selM[k]);
const mid = m => m.k + pad(m.n);
const curK = () => tab == 'mesaQ' ? 'Q' : 'T';

function patchMatch(m, o) {
  Object.assign(m, o);
  saveLocal();
  if (db) col('matches').doc(mid(m)).update(o);
  render(true);
}
const sv = (m, o) => patchMatch(m, o);

function upsertTeam(docId, data) {
  const idx = S.teams.findIndex(x => String(x.n) == String(docId));
  if (idx >= 0) S.teams[idx] = { ...S.teams[idx], ...data };
  else S.teams.push(data);
  saveLocal();
  if (db) col('teams').doc(String(docId)).set(data, { merge: true });
  render(true);
}

function removeTeam(docId) {
  S.teams = S.teams.filter(x => String(x.n) != String(docId));
  saveLocal();
  if (db) col('teams').doc(String(docId)).delete();
  render(true);
}

function removeMatch(docId) {
  S.matches = S.matches.filter(m => mid(m) !== docId);
  saveLocal();
  if (db) col('matches').doc(docId).delete();
  toast('Partida excluída');
  render(true);
}

const H = {
  async doLogin() {
    const uName = ($('#lgUser')?.value || '').trim();
    const r = $('#lgRole')?.value || 'geral';
    const p = ($('#lgPass')?.value || '').trim();
    if (!p) return toast('Informe a senha');
    try {
      const response = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: uName, role: r, password: p })
      });
      const result = await response.json();
      if (!response.ok) return toast(result.error || 'Usuário, função ou senha inválidos');
      authToken = result.token;
      role = result.role;
      saveLocal();
      me = { id: 'u-' + (result.user || 'local-geral'), name: result.user || RO.geral[0] };
      tab = RO[role][1][0];
      E = role === 'geral';
      toast('Acesso liberado');
      render(true);
    } catch (error) {
      console.error('Falha no login:', error);
      toast('Não foi possível autenticar no servidor');
    }
  },
  logout() {
    if (authToken) fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }).catch(() => {});
    authToken = '';
    role = '';
    tab = '';
    me = { id: 'local-staff', name: '' };
    clearInterval(T);
    render(true);
  },
  async addUser() {
    const editing = editingUser;
    const user = editing ? editing.user : ($('#uName')?.value || '').trim();
    const uRole = editing ? editing.role : ($('#uRole')?.value || 'juizDesign');
    const password = ($('#uPass')?.value || '').trim();
    if (!user || !password) return toast(editing ? 'Informe a nova senha' : 'Preencha usuário e senha');
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action: editing ? 'password' : 'create', user, role: uRole, password })
      });
      const result = await response.json();
      if (!response.ok) return toast(result.error || 'Não foi possível salvar o usuário');
      S.users = result.users || S.users;
      editingUser = null;
      saveLocal();
      toast(editing ? 'Senha alterada com sucesso' : 'Usuário criado');
      render(true);
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      toast('Falha ao comunicar com o servidor');
    }
  },
  async removeUser(user) {
    if (!confirm(`Remover o usuário ${user.user}?`)) return;
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ action: 'delete', user: user.user, role: user.role }) });
      const result = await response.json();
      if (!response.ok) return toast(result.error || 'Não foi possível remover o usuário');
      S.users = result.users || [];
      saveLocal();
      render(true);
    } catch (error) { console.error(error); toast('Falha ao comunicar com o servidor'); }
  },
  cancelUserEdit() { editingUser = null; render(true); },
  addYellowCard(teamNumber, matchId) {
    const m = S.matches.find(x => mid(x) === matchId);
    if (!m || m.st !== 'live') return;
    const involved = [...m.red, ...m.blue].map(String);
    if (!involved.includes(String(teamNumber))) return toast('Equipe não participa desta partida');
    m.yellowCards = m.yellowCards || {};
    m.yellowCards[teamNumber] = (m.yellowCards[teamNumber] || 0) + 1;
    saveLocal();
    toast(`Cartão amarelo aplicado à equipe ${teamNumber}`);
    render(true);
  },
  removeYellowCard(teamNumber, matchId) {
    const m = S.matches.find(x => mid(x) === matchId);
    if (!m || !m.yellowCards?.[teamNumber]) return;
    m.yellowCards[teamNumber]--;
    if (!m.yellowCards[teamNumber]) delete m.yellowCards[teamNumber];
    saveLocal();
    toast(`Cartão removido da equipe ${teamNumber}`);
    render(true);
  },
  async start() {
    const m = cur(curK());
    if (!m) return;
    left = getMatchDurSec(m);
    sv(m, { st: 'live' });
    clearInterval(T);
    T = setInterval(() => {
      left--;
      const e = $('#tm');
      if (e) e.textContent = fT(left);
      if (left <= 0) clearInterval(T);
    }, 1000);
  },
  undo() {
    const m = cur(curK());
    if (!m) return;
    const l = m.log.slice(0, -1);
    sv(m, { log: l, ...calc(l) });
  },
  end() {
    clearInterval(T);
    const m = cur(curK());
    if (m) sv(m, { st: 'done' });
    toast('Pontuação enviada');
  },
  restart() {
    clearInterval(T);
    const m = cur(curK());
    if (m) {
      left = getMatchDurSec(m);
      sv(m, { st: 'wait', log: [], rs: 0, bs: 0, cr: 0, cb: 0, yellowCards: {} });
      toast('Partida reiniciada');
    }
  },
  reopen() {
    const m = cur(curK());
    if (m) sv(m, { st: 'live' });
  },
  reset() { flt = ''; render(true); },
  filtrar() { flt = ($('[data-f]')?.value || '').trim(); render(true); },
  insp() {
    const o = $('#io').value, d = $('#id').value.trim();
    if (o == 'outro' && !d) return toast('Descreva o objetivo da inspeção');
    const it = [...document.querySelectorAll('.frm [data-k]')].filter(i => o == 'geral' || !i.closest('.fo'));
    const t = Date.now();
    const rec = {
      team: sel, t,
      hora: (d => pad(d.getHours()) + ':' + pad(d.getMinutes()))(new Date()),
      obj: o, desc: d, ok: it.every(i => i.checked),
      miss: it.filter(i => !i.checked).map(i => i.dataset.k),
      obs: $('#obs').value, by: me.name || 'inspetor'
    };
    S.insp.push(rec);
    saveLocal();
    if (db) col('insp').doc(sel + '_' + t).set(rec);
    toast('Inspeção registrada');
    document.activeElement.blur();
    render(true);
  },
  async jsave() {
    const sc = {};
    document.querySelectorAll('[data-j]').forEach(i => {
      if (i.value !== '') sc[i.dataset.j] = Math.min(10, Math.max(0, +i.value));
    });
    const rec = { team: sel, uid: me.id, name: me.name || 'Juiz', sc, obs: $('#obs').value, t: Date.now() };
    const i = S.judge.findIndex(x => x.team == sel && x.uid == me.id);
    if (i >= 0) S.judge[i] = rec;
    else S.judge.push(rec);
    saveLocal();
    if (db) await col('judge').doc(sel + '__' + me.id).set(rec);
    const e = $('#sv');
    if (e) { e.textContent = 'salvo'; setTimeout(() => { e.textContent = ''; }, 1200); }
    render(true);
  },
  savecfg() {
    const o = {};
    document.querySelectorAll('[data-cf]').forEach(i => {
      o[i.dataset.cf] = i.type == 'number' ? +i.value : i.value;
    });
    S.cfg = { ...cf(), ...o };
    saveLocal();
    if (db) col('cfg').doc('main').set(S.cfg);
    toast('Configuração salva');
    document.activeElement.blur();
    render(true);
  },
  addteam() {
    const n = $('#tn').value.trim();
    if (!n) return;
    upsertTeam(n, { n, name: $('#tnm').value || 'Equipe ' + n, unit: $('#tu').value, present: false });
    document.activeElement.blur();
  },
  async demo() {
    const nm = ['Rosas do Deserto', 'Valentes e Bravas', 'Trovões do Sertão', 'Águias de Ouro', 'Leões da Bahia', 'Ventos do Mar', 'Guerreiras do Axé', 'Titãs 60+'];
    for (let i = 0; i < 8; i++) {
      const d = { n: String(i + 1), name: nm[i], unit: i % 2 ? 'Alameda' : 'São Cristóvão', present: false };
      const idx = S.teams.findIndex(x => x.n == d.n);
      if (idx >= 0) S.teams[idx] = d;
      else S.teams.push(d);
      if (db) await col('teams').doc(d.n).set(d);
    }
    saveLocal();
    toast('Equipes carregadas (aguardando credenciamento)');
    render(true);
  },
  async gen() {
    const a = S.teams.map(t => t.n), c = cf();
    if (a.length < 4) return toast('São necessárias ao menos 4 equipes cadastradas');
    await H.clr();
    const sh = x => [...x].sort(() => Math.random() - .5);
    let t = hm(c.ini);
    for (const k of ['T', 'Q']) {
      let n = 0;
      for (let r = 0; r < (k == 'T' ? 1 : 3); r++) {
        const s = sh(a), rem = s.length % 4;
        if (rem) {
          const x = s.slice(-rem);
          s.push(...sh(a).filter(y => !x.includes(y)).slice(0, 4 - rem));
        }
        for (let i = 0; i < s.length; i += 4) {
          n++;
          const q = s.slice(i, i + 4);
          const mObj = { k, n, durMin: 4, time: fm(t), red: q.slice(0, 2), blue: q.slice(2), refs: ['', ''], rs: 0, bs: 0, cr: 0, cb: 0, st: 'wait', log: [] };
          S.matches.push(mObj);
          if (db) await col('matches').doc(k + pad(n)).set(mObj);
          t += c.step;
        }
      }
      t += c.gap;
    }
    saveLocal();
    toast('Cronograma gerado');
    render(true);
  },
  async flow() {
    const c = cf();
    let t = hm(c.ini), k = 'T';
    for (const m of [...S.matches].sort((a, b) => a.k < b.k ? 1 : a.k > b.k ? -1 : a.n - b.n)) {
      if (m.k != k) { k = m.k; t += c.gap; }
      m.time = fm(t);
      if (db) await col('matches').doc(mid(m)).update({ time: m.time });
      t += c.step;
    }
    saveLocal();
    toast('Horários recalculados');
    render(true);
  },
  addT() { H.addm('T'); },
  addQ() { H.addm('Q'); },
  async addm(k) {
    const a = S.teams.map(t => t.n);
    if (a.length < 4) return toast('São necessárias ao menos 4 equipes cadastradas');
    const c = cf(), n = Math.max(0, ...S.matches.filter(m => m.k == k).map(m => m.n)) + 1;
    const last = Math.max(hm(c.ini) - c.step, ...S.matches.map(m => hm(m.time)));
    const mObj = { k, n, durMin: 4, time: fm(last + c.step), red: a.slice(0, 2), blue: a.slice(2, 4), refs: ['', ''], rs: 0, bs: 0, cr: 0, cb: 0, st: 'wait', log: [] };
    S.matches.push(mObj);
    saveLocal();
    if (db) await col('matches').doc(k + pad(n)).set(mObj);
    render(true);
  },
  async clr() {
    if (db) {
      const s = await col('matches').get();
      for (const d of s.docs) await col('matches').doc(d.id).delete();
    }
    S.matches = [];
    saveLocal();
    render(true);
  }
};

function render(force) {
  const f = document.activeElement;
  if (!force && f?.closest?.('.frm')) {
    if ((tab == 'avDesign' || tab == 'avTorcida') && $('#others')) $('#others').innerHTML = '';
    return;
  }
  if (!force && f?.matches?.('[data-f]')) return;
  $('#app').innerHTML = V[pg]();
}

document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { pg = g.dataset.go; render(true); return; }
  const q = s => e.target.closest(s);
  let x;
  if (x = q('[data-sub]')) { sub = x.dataset.sub; render(true); }
  else if (x = q('[data-tab]')) { tab = x.dataset.tab; render(true); }
  else if (x = q('[data-sort]')) { SO = { c: x.dataset.sort, d: SO.c == x.dataset.sort ? -SO.d : 1 }; render(true); }
  else if (x = q('[data-team]')) { flt = x.dataset.team; render(true); }
  else if (x = q('[data-a]')) H[x.dataset.a]?.();
  else if (x = q('[data-editu]')) { const u = S.users[+x.dataset.editu]; if (u) { editingUser = { user: u.user, role: u.role }; render(true); } }
  else if (x = q('[data-delu]')) { const u = S.users[+x.dataset.delu]; if (u) H.removeUser(u); }
  else if (x = q('[data-delm]')) removeMatch(x.dataset.delm);
  else if (x = q('[data-yellow]')) H.addYellowCard(x.dataset.yellow, x.dataset.match);
  else if (x = q('[data-yellow-remove]')) H.removeYellowCard(x.dataset.yellowRemove, x.dataset.match);
  else if (x = q('[data-e]')) {
    const m = cur(curK());
    if (!m || m.st != 'live') return;
    const l = [...m.log, x.dataset.e];
    sv(m, { log: l, ...calc(l) });
  }
  else if (x = q('[data-del]')) removeTeam(x.dataset.del);
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.sel !== undefined) { sel = t.value; t.blur(); render(true); }
  else if (t.dataset.selm) { selM[t.dataset.selm] = t.value; render(true); }
  else if (t.dataset.io !== undefined) {
    document.querySelectorAll('.fo').forEach(l => { l.style.display = t.value == 'geral' ? 'flex' : 'none'; });
    $('#id').style.display = t.value == 'outro' ? 'block' : 'none';
  }
  else if (t.dataset.pr !== undefined) upsertTeam(t.dataset.pr, { present: t.checked });
  else if (t.dataset.tm) { const m = S.matches.find(x => mid(x) == t.dataset.tm); if (m) sv(m, { time: t.value }); }
  else if (t.dataset.dur) {
    const m = S.matches.find(x => mid(x) == t.dataset.dur);
    if (m) {
      const durMin = Math.max(0.5, +t.value || 4);
      if (m.st != 'live') left = getMatchDurSec({ ...m, durMin });
      sv(m, { durMin });
    }
  }
  else if (t.dataset.rf) {
    const [id, idx] = t.dataset.rf.split('|');
    const m = S.matches.find(x => mid(x) == id);
    if (m) {
      const nextRefs = Array.isArray(m.refs) ? [...m.refs] : [m.ref || '', ''];
      nextRefs[+idx] = t.value;
      sv(m, { refs: nextRefs, ref: nextRefs[0] || '' });
    }
  }
  else if (t.dataset.slot) {
    const [id, s, i] = t.dataset.slot.split('|'), m = S.matches.find(x => mid(x) == id);
    if (m) { const a = [...m[s]]; a[+i] = t.value; sv(m, { [s]: a }); }
  }
  else if (t.dataset.aw) {
    const [k, i] = t.dataset.aw.split('|'), a = [...(S.aw[k] || ['', '', ''])];
    a[+i] = t.value;
    S.aw = { ...S.aw, [k]: a };
    saveLocal();
    if (db) col('cfg').doc('aw').set(S.aw);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.target.id === 'lgPass' || e.target.id === 'lgUser')) H.doLogin();
});

document.addEventListener('input', e => {
  if (e.target.matches('[data-j],#obs') && (tab == 'avDesign' || tab == 'avTorcida')) {
    clearTimeout(jt);
    jt = setTimeout(() => H.jsave(), 450);
  }
});

async function startApp() {
  try {
    const response = await fetch(API_STATE_URL);
    if (!response.ok) throw new Error(`Servidor respondeu ${response.status}`);
    const result = await response.json();

    if (result.state && typeof result.state === 'object') {
      const saved = result.state;
      S = {
        teams: Array.isArray(saved.teams) ? saved.teams : [],
        matches: Array.isArray(saved.matches) ? saved.matches : [],
        insp: Array.isArray(saved.insp) ? saved.insp : [],
        judge: Array.isArray(saved.judge) ? saved.judge : [],
        cfg: saved.cfg && typeof saved.cfg === 'object' ? saved.cfg : {},
        aw: saved.aw && typeof saved.aw === 'object' ? saved.aw : {},
        users: Array.isArray(saved.users) ? saved.users : []
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (_) {}
    } else {
      // Banco ainda vazio: mantém os dados locais em memória até o primeiro login autorizado.
      apiReady = true;
    }
    apiReady = true;
  } catch (error) {
    console.error('Erro ao conectar ao banco do Railway:', error);
    apiReady = false;
    toast('Banco indisponível. O site está usando os dados locais deste navegador.');
  }
  render(true);
}

startApp();