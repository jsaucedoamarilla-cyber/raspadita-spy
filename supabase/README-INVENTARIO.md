# Inventario seguro de Raspadita San Pedro del Ycuamandyyu

Este repositorio ahora prepara un esquema separado para el inventario definitivo. La tabla anterior `public.boletas` se conserva sin cambios porque sus columnas duplicadas (`id` y `Id`) deben reconciliarse después de revisar su procedencia.

## Reglas de seguridad

- Nunca colocar una clave `service_role` o `secret` en HTML, APK, GitHub público ni mensajes.
- La app pública no consulta ni modifica tablas directamente; debe usar una función Edge que valide un token aleatorio, limite reintentos y entregue el resultado de una sola boleta.
- La clave publishable/anon no otorga permisos administrativos por sí sola; RLS y políticas siguen siendo obligatorias.
- No crear 5.000 boletas públicas hasta que la función Edge autenticada y el flujo de raspado estén desplegados y probados.
- El inventario de premios debe ser de 5.000 exactas y sin exponer cantidades restantes al cliente.
- Cantidades solicitadas: ₲5.000 x25; ₲10.000 x20; ₲20.000 x20; ₲50.000 x5; ₲100.000 x3; ₲200.000 x1; ₲500.000 x1; ₲1.000.000 x1; ₲2.000.000 x1; “Ganaste una boleta” x250; sin premio x4.692.

## Tablas

- `public.raspadita_tickets`: inventario normalizado, solo backend.
- `public.raspadita_admin_events`: bitácora mínima de eventos administrativos, solo backend.

## Pendientes técnicos

1. Implementar y desplegar la función Edge de emisión/consulta/raspado/reclamo usando `SUPABASE_SERVICE_ROLE_KEY` únicamente en secretos del entorno de Supabase.
2. Generar 5.000 tokens criptográficamente aleatorios y guardar solamente SHA-256 en la tabla.
3. Integrar la app web y Android con esos endpoints (el cliente jamás determina el premio).
4. Verificar la sesión administrativa con Supabase Auth; quitar el PIN local `1234`.
5. Probar con varias boletas de prueba antes de publicar enlaces a clientes.
