const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_PASS = process.env.DEFAULT_CHIEF_PASSWORD || 'hydra6767';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não foi definida. Configure a variável do PostgreSQL no Railway.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

app.use(express.json({ limit: '5mb' }));

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, passHash: hash };
}

function verifyPassword(password, user) {
  if (user.passHash && user.salt) {
    const candidate = Buffer.from(hashPassword(password, user.salt).passHash, 'hex');
    const expected = Buffer.from(user.passHash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }
  // Compatibilidade temporária com os usuários cadastrados antes desta atualização.
  return typeof user.pass === 'string' && user.pass === String(password);
}

function publicState(state) {
  const copy = structuredClone(state || {});
  copy.users = Array.isArray(copy.users)
    ? copy.users.map(({ user, role }) => ({ user, role }))
    : [];
  return copy;
}

async function readStoredState() {
  const result = await pool.query('SELECT state FROM campeonato_state WHERE id = 1');
  return result.rowCount ? result.rows[0].state : null;
}

async function writeStoredState(state) {
  await pool.query(
    `INSERT INTO campeonato_state (id, state, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id)
     DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    [JSON.stringify(state)]
  );
}


async function readTestReservations() {
  const result = await pool.query(`
    SELECT id, team, team_name AS "teamName",
           TO_CHAR(reservation_date, 'YYYY-MM-DD') AS date,
           TO_CHAR(start_time, 'HH24:MI') AS time,
           note, status, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM test_reservations
    ORDER BY reservation_date, start_time, created_at
  `);
  return result.rows;
}

async function migrateLegacyPasswords() {
  const state = await readStoredState();
  if (!state || !Array.isArray(state.users)) return;
  let changed = false;
  state.users = state.users.map(user => {
    if (typeof user.pass === 'string') {
      const secured = hashPassword(user.pass);
      const migrated = { user: user.user, role: user.role, ...secured };
      changed = true;
      return migrated;
    }
    return user;
  });
  if (changed) await writeStoredState(state);
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
  req.auth = session;
  next();
}

async function ensureDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campeonato_state (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_matches (
      id TEXT PRIMARY KEY,
      teams JSONB NOT NULL,
      start_time TIME NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'in_progress', 'done')),
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_reservations (
      id TEXT PRIMARY KEY,
      team TEXT NOT NULL,
      team_name TEXT NOT NULL DEFAULT '',
      reservation_date DATE NOT NULL,
      start_time TIME NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'in_use', 'done', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await migrateLegacyPasswords();
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('Health check:', error);
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const userName = String(req.body?.user || '').trim();
    const role = String(req.body?.role || 'geral');
    const password = String(req.body?.password || '');
    if (!password) return res.status(400).json({ error: 'Informe a senha.' });

    const state = await readStoredState() || {};
    const users = Array.isArray(state.users) ? state.users : [];
    let account;

    if (!userName && role === 'geral' && !users.some(u => u.role === 'geral')) {
      if (password !== DEFAULT_PASS) return res.status(401).json({ error: 'Senha incorreta.' });
      account = { user: '', role: 'geral' };
    } else {
      account = users.find(u =>
        String(u.user || '').toLowerCase() === userName.toLowerCase() && u.role === role
      );
      if (!account || !verifyPassword(password, account)) {
        return res.status(401).json({ error: 'Usuário, função ou senha inválidos.' });
      }
      if (typeof account.pass === 'string') {
        const secured = hashPassword(account.pass);
        state.users = users.map(u => u === account
          ? { user: u.user, role: u.role, ...secured }
          : u);
        await writeStoredState(state);
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { user: account.user || '', role: account.role, expiresAt: Date.now() + SESSION_TTL_MS });
    res.json({ token, user: account.user || '', role: account.role });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Não foi possível autenticar.' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/state', async (_req, res) => {
  try {
    const result = await pool.query('SELECT state, updated_at FROM campeonato_state WHERE id = 1');
    const state = result.rowCount ? publicState(result.rows[0].state) : {
      teams: [], matches: [], insp: [], judge: [], cfg: {}, aw: {}, users: []
    };
    state.testReservations = await readTestReservations();
    res.json({ state, updatedAt: result.rowCount ? result.rows[0].updated_at : null });
  } catch (error) {
    console.error('Erro ao carregar estado:', error);
    res.status(500).json({ error: 'Não foi possível carregar os dados.' });
  }
});

app.get('/api/training-matches', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, teams, TO_CHAR(start_time, 'HH24:MI') AS time,
             note, status, created_by AS "createdBy", created_at AS "createdAt"
      FROM training_matches ORDER BY start_time, created_at
    `);
    res.json({ matches: result.rows });
  } catch (error) {
    console.error('Erro ao listar partidas de treino:', error);
    res.status(500).json({ error: 'Não foi possível carregar as partidas de treino.' });
  }
});

app.post('/api/training-matches', requireAuth, async (req, res) => {
  if (req.auth.role !== 'arbT') return res.status(403).json({ error: 'Apenas árbitros de treino podem reservar partidas.' });
  const { id, teams, time, note = '' } = req.body || {};
  if (!id || !Array.isArray(teams) || teams.length < 1 || teams.length > 2 || new Set(teams.map(String)).size !== teams.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) {
    return res.status(400).json({ error: 'Selecione uma ou duas equipes e informe um horário válido.' });
  }
  try {
    const stored = await readStoredState() || {};
    const registered = new Set((stored.teams || []).map(t => String(t.n)));
    if (teams.some(t => !registered.has(String(t)))) return res.status(400).json({ error: 'Todas as equipes precisam estar cadastradas.' });
    const result = await pool.query(`
      INSERT INTO training_matches (id, teams, start_time, note, created_by)
      VALUES ($1, $2::jsonb, $3::time, $4, $5)
      RETURNING id, teams, TO_CHAR(start_time, 'HH24:MI') AS time, note, status, created_by AS "createdBy", created_at AS "createdAt"
    `, [String(id).slice(0, 100), JSON.stringify(teams.map(String)), time, String(note).slice(0, 240), req.auth.user || 'Árbitro de treino']);
    res.status(201).json({ ok: true, match: result.rows[0] });
  } catch (error) {
    console.error('Erro ao reservar partida de treino:', error);
    res.status(500).json({ error: 'Não foi possível reservar a partida.' });
  }
});

app.patch('/api/training-matches/:id', requireAuth, async (req, res) => {
  if (!['arbT', 'geral'].includes(req.auth.role)) return res.status(403).json({ error: 'Apenas árbitros de treino podem atualizar partidas.' });
  const { status } = req.body || {};
  if (!['reserved', 'in_progress', 'done'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  try {
    const result = await pool.query(`
      UPDATE training_matches SET status = $2, updated_at = NOW() WHERE id = $1
      RETURNING id, teams, TO_CHAR(start_time, 'HH24:MI') AS time, note, status, created_by AS "createdBy", created_at AS "createdAt"
    `, [req.params.id, status]);
    if (!result.rowCount) return res.status(404).json({ error: 'Partida não encontrada.' });
    res.json({ ok: true, match: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar partida de treino:', error);
    res.status(500).json({ error: 'Não foi possível atualizar a partida.' });
  }
});

app.delete('/api/training-matches/:id', requireAuth, async (req, res) => {
  if (!['arbT', 'geral'].includes(req.auth.role)) return res.status(403).json({ error: 'Apenas árbitros de treino podem excluir partidas.' });
  try {
    const result = await pool.query('DELETE FROM training_matches WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Partida não encontrada.' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao excluir partida de treino:', error);
    res.status(500).json({ error: 'Não foi possível excluir a partida.' });
  }
});

app.post('/api/users', requireAuth, async (req, res) => {
  if (req.auth.role !== 'geral') return res.status(403).json({ error: 'Apenas o Árbitro Chefe pode gerenciar usuários.' });
  try {
    const { action, user: userName, role, password } = req.body || {};
    if (!userName || !role) return res.status(400).json({ error: 'Usuário e função são obrigatórios.' });
    const state = await readStoredState() || { teams: [], matches: [], insp: [], judge: [], cfg: {}, aw: {}, users: [] };
    state.users = Array.isArray(state.users) ? state.users : [];
    const index = state.users.findIndex(u =>
      String(u.user).toLowerCase() === String(userName).toLowerCase() && u.role === role
    );

    if (action === 'delete') {
      if (index < 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
      state.users.splice(index, 1);
    } else if (action === 'create' || action === 'password') {
      if (!password || String(password).length < 4) return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
      if (action === 'create' && index >= 0) return res.status(409).json({ error: 'Já existe um usuário com essa função.' });
      if (action === 'password' && index < 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
      const secured = hashPassword(password);
      const record = { user: String(userName).trim(), role, ...secured };
      if (index >= 0) state.users[index] = record;
      else state.users.push(record);
    } else {
      return res.status(400).json({ error: 'Ação inválida.' });
    }

    await writeStoredState(state);
    res.json({ ok: true, users: publicState(state).users });
  } catch (error) {
    console.error('Erro ao gerenciar usuário:', error);
    res.status(500).json({ error: 'Não foi possível atualizar os usuários.' });
  }
});

app.put('/api/state', requireAuth, async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Corpo da requisição inválido.' });
  }

  const arrayKeys = ['teams', 'matches', 'testReservations', 'insp', 'judge', 'users'];
  for (const key of arrayKeys) {
    if (incoming[key] !== undefined && !Array.isArray(incoming[key])) {
      return res.status(400).json({ error: `O campo ${key} deve ser uma lista.` });
    }
  }

  try {
    const existing = await readStoredState() || {};
    const oldUsers = Array.isArray(existing.users) ? existing.users : [];
    // Usuários e credenciais só podem ser alterados pela rota administrativa /api/users.
    const secureUsers = oldUsers.map(user => {
      if (user.passHash && user.salt) return user;
      if (typeof user.pass === 'string') {
        const secured = hashPassword(user.pass);
        return { user: user.user, role: user.role, ...secured };
      }
      return { user: user.user, role: user.role };
    });
    const { testReservations: _ignoredReservations, ...mainState } = incoming;
    const state = { ...mainState, users: secureUsers };
    await writeStoredState(state);
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao salvar estado:', error);
    res.status(500).json({ error: 'Não foi possível salvar os dados.' });
  }
});

app.use(express.static(path.join(__dirname)));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

ensureDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Campeonato 60+ disponível na porta ${PORT}`);
    });
  })
  .catch(error => {
    console.error('Não foi possível preparar o banco PostgreSQL:', error);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
