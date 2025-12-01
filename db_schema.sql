-- Tabla para los partidos (Información general)
CREATE TABLE IF NOT EXISTS matches (
    id BIGINT PRIMARY KEY,          -- ID original del partido (matchId)
    name TEXT NOT NULL,             -- Nombre del encuentro (ej. "Rayo Vallecano vs Valencia CF")
    url TEXT,                       -- URL del partido
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla para los mercados
-- Aquí es donde aplicamos la lógica de guardar las opciones como JSONB.
-- Cada fila representa UN mercado (ej. "1x2") y contiene TODAS sus opciones en el campo 'selections'.
CREATE TABLE IF NOT EXISTS markets (
    id SERIAL PRIMARY KEY,
    match_id BIGINT REFERENCES matches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,             -- Nombre del mercado (ej. "1x2", "Total", "Quinto gol")
    selections JSONB NOT NULL,      -- AQUÍ se guarda el array completo de cuotas: [{"name":..., "price":...}, ...]
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(match_id, name)          -- Un partido no puede tener dos mercados con el mismo nombre
);

-- Índice para consultas rápidas
CREATE INDEX idx_markets_match_id ON markets(match_id);
