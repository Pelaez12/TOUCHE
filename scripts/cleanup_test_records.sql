-- Limpieza segura de registros de prueba en Cloudflare D1 (touche-reservas).
-- NO elimina ninguna de las 520 clientas historicas ni las 1.551 atenciones en treatments.
-- Ejecutar solo si se desea purga fisica en D1 ademas del archivado ya realizado.

DELETE FROM appointments WHERE id IN (
  'b1fdb466-c2b0-44d6-89c6-5bd4c0b169ba',
  '458dab99-0967-4e8a-8b3a-6f97f6a13ed4',
  '7c1b540c-a76a-454c-be32-57c5be6e05d9',
  'cc5047d3-af16-4bd5-aef7-ecb76677df58'
) AND treatment_id IS NULL;

DELETE FROM audit_log WHERE entity_id IN (
  'b1fdb466-c2b0-44d6-89c6-5bd4c0b169ba',
  '458dab99-0967-4e8a-8b3a-6f97f6a13ed4',
  '7c1b540c-a76a-454c-be32-57c5be6e05d9',
  'cc5047d3-af16-4bd5-aef7-ecb76677df58',
  '0bf859a1-4eec-4051-bd13-3f289c602fcf'
);

-- Purga fisica opcional de la ficha de prueba ya archivada (#521, 0 atenciones):
DELETE FROM clients
WHERE id = '0bf859a1-4eec-4051-bd13-3f289c602fcf'
  AND dni = '61000000'
  AND archived_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM treatments WHERE client_id = '0bf859a1-4eec-4051-bd13-3f289c602fcf')
  AND NOT EXISTS (SELECT 1 FROM appointments WHERE client_id = '0bf859a1-4eec-4051-bd13-3f289c602fcf');
