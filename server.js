const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não foi definida. Configure a variável do PostgreSQL no Railway.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Ative apenas se o provedor exigir SSL na conexão utilizada.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

app.use(express.json({ limit: '5mb' }));

async function ensureDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campeonato_state (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
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

app.get('/api/state', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const result = await pool.query(
      'SELECT state, updated_at FROM campeonato_state WHERE id = 1'
    );
    if (!result.rowCount) return res.json({ state: null });
    const updatedAt = result.rows[0].updated_at;
    const since = req.query.since ? new Date(req.query.since).getTime() : NaN;
    if (Number.isFinite(since) && since === new Date(updatedAt).getTime()) {
      return res.status(304).end();
    }
    res.json({ state: result.rows[0].state, updatedAt });
  } catch (error) {
    console.error('Erro ao carregar estado:', error);
    res.status(500).json({ error: 'Não foi possível carregar os dados.' });
  }
});

app.put('/api/state', async (req, res) => {
  const state = req.body;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return res.status(400).json({ error: 'Corpo da requisição inválido.' });
  }

  const arrayKeys = ['teams', 'matches', 'insp', 'judge', 'users'];
  for (const key of arrayKeys) {
    if (state[key] !== undefined && !Array.isArray(state[key])) {
      return res.status(400).json({ error: `O campo ${key} deve ser uma lista.` });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO campeonato_state (id, state, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id)
       DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
       RETURNING updated_at`,
      [JSON.stringify(state)]
    );
    res.json({ ok: true, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    console.error('Erro ao salvar estado:', error);
    res.status(500).json({ error: 'Não foi possível salvar os dados.' });
  }
});

app.use(express.static(path.join(__dirname)));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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
