INSERT OR IGNORE INTO services(id,name,category,price_cents,duration_minutes,source_json)
VALUES ('touche-evaluacion-capilar','Evaluación y diagnóstico capilar','ASESORÍA',0,20,'{"source":"settings.txt aportado por el usuario","duration":"Evaluación gratuita de aproximadamente 20 minutos"}');
INSERT INTO schema_migrations(version) VALUES ('0007_evaluation_service');
