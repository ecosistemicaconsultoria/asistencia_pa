// Arma supabase/instalacion_completa.sql: todas las migraciones, en orden, en un solo archivo (HU-38).
// Sirve para instalar Presente en un proyecto de Supabase NUEVO (otra IAP con su propio proyecto): se pega una sola
// vez en el SQL Editor. En un proyecto que ya tiene migraciones aplicadas NO se usa: ahí se aplican solo las nuevas.
// Uso: node supabase/armar_instalacion.mjs   (la prueba tests/hu38_replica.spec.js revisa que esté al día)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const AQUI = new URL('./', import.meta.url);
export function armarInstalacion() {
  const migraciones = readdirSync(new URL('migrations/', AQUI)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const partes = [
    '-- =====================================================================',
    '-- ARCHIVO GENERADO: no editar. Es la suma de supabase/migrations/*.sql (ver supabase/armar_instalacion.mjs).',
    '-- Instalación completa de Presente en un proyecto de Supabase NUEVO (docs/REPLICA.md, opción B).',
    '-- Cómo: Supabase > SQL Editor > New query > pegar todo > Run (una sola vez).',
    `-- Incluye: ${migraciones.join(', ')}`,
    '-- ====================================================================='
  ];
  for (const m of migraciones) {
    partes.push('', `-- >>>>>>>>>> ${m} <<<<<<<<<<`, readFileSync(new URL(`migrations/${m}`, AQUI), 'utf8').trimEnd());
  }
  return `${partes.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('instalacion_completa.sql', AQUI), armarInstalacion());
  console.log('supabase/instalacion_completa.sql actualizado');
}
