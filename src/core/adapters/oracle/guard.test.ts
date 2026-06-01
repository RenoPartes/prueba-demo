/**
 * Test del guard SELECT-only (capa 1). Pura lógica, sin BD.
 * Corre con: npm run test:guard  (node --experimental-strip-types --test)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardReadOnlySql } from './guard.ts'

test('acepta un SELECT simple', () => {
  const r = guardReadOnlySql('SELECT * FROM productos')
  assert.equal(r.ok, true)
})

test('acepta WITH (CTE)', () => {
  const r = guardReadOnlySql('WITH x AS (SELECT 1 FROM dual) SELECT * FROM x')
  assert.equal(r.ok, true)
})

test('acepta SELECT con FETCH FIRST y mayúsculas/minúsculas mezcladas', () => {
  const r = guardReadOnlySql('select id from VENTAS order by total desc fetch first 10 rows only')
  assert.equal(r.ok, true)
})

test('normaliza quitando el ; final', () => {
  const r = guardReadOnlySql('SELECT 1 FROM dual;')
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.sql, 'SELECT 1 FROM dual')
})

test('NO produce falso positivo por keyword dentro de un literal', () => {
  const r = guardReadOnlySql("SELECT * FROM pedidos WHERE estado = 'update pendiente'")
  assert.equal(r.ok, true)
})

for (const bad of [
  'INSERT INTO productos VALUES (1)',
  'UPDATE clientes SET nombre = 1',
  'DELETE FROM ventas',
  'DROP TABLE productos',
  'ALTER TABLE x ADD y',
  'TRUNCATE TABLE ventas',
  'CREATE TABLE z (a NUMBER)',
  'MERGE INTO a USING b ON (1=1)',
  'GRANT SELECT ON x TO y',
  'BEGIN proc(); END;',
  'DECLARE x NUMBER; BEGIN NULL; END;',
  'SELECT 1 FROM dual; DROP TABLE x',
  'SELECT * INTO bak FROM productos',
  "BEGIN EXECUTE IMMEDIATE 'DROP TABLE x'; END;",
]) {
  test(`rechaza: ${bad}`, () => {
    const r = guardReadOnlySql(bad)
    assert.equal(r.ok, false)
  })
}

test('rechaza string vacío', () => {
  assert.equal(guardReadOnlySql('   ').ok, false)
})
