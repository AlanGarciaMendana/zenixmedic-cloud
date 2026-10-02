const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const { Resend } = require('resend'); // IMPORTACIÓN DE RESEND AGREGADA

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dominio base oficial en Render
const DOMAIN = process.env.RENDER_EXTERNAL_URL || 'https://zenixmedic-cloud.onrender.com';

// Conexión a PostgreSQL en Neon (se lee desde las variables de entorno de Render)
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Inicialización de la API de correos (se lee de las variables de entorno)
const resend = new Resend(process.env.RESEND_API_KEY);

// Inicialización de la tabla en Neon
pool.query(`
    CREATE TABLE IF NOT EXISTS recetas_cloud (
        id_receta VARCHAR(50) PRIMARY KEY,
        nro_orden VARCHAR(50),
        cuir VARCHAR(100),
        emisor VARCHAR(50),
        estado VARCHAR(20) DEFAULT 'VÁLIDA',
        creada VARCHAR(50),
        fecha_timestamp BIGINT,
        vigencia_desde VARCHAR(50),
        fecha_dispensa VARCHAR(50),
        farmacia_nombre VARCHAR(150),
        medico_json JSONB,
        paciente_json JSONB,
        medicamento_json JSONB,
        firma_hash TEXT
    )
`).then(() => console.log('Tabla recetas_cloud verificada/creada en Neon.'))
  .catch(err => console.error('Error inicializando tabla en Neon:', err));

function generarHashInalterable(datos) {
    const cadena = `${datos.paciente}-${datos.dni}-${datos.medico}-${datos.matricula}-${datos.tratamiento}-${datos.fecha}`;
    return crypto.createHash('sha256').update(cadena).digest('hex');
}

// Check de salud de la API
app.get('/', (req, res) => {
    res.send('API ZenixMedic activa y homologada ante ReNaPDiS.');
});

// 1. REGISTRO DINÁMICO DE RECETA EN BASE DE DATOS PERSISTENTE
app.post('/api/recetas/registrar', async (req, res) => {
    try {
        const b = req.body;
        
        const idReceta = "REC-" + Date.now().toString(36).toUpperCase();
        const nroOrden = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
        const cuir = "001700230" + Date.now() + "001";
        const fechaActual = new Date().toLocaleDateString('es-AR');
        const timestamp = Date.now();

        const medicoObj = {
            nombre: b.medico || "Médico Prescriptor",
            matricula: b.matricula || "M.N. S/N",
            profesion: b.profesion || "Profesional de la Salud",
            especialidad: b.especialidad || "Medicina General",
            codigoRefeps: b.codigoRefeps || "541094049196",
            lugarAtencion: b.lugarAtencion || "Consultorio Médico ZenixMedic"
        };

        const pacienteObj = {
            nombre: b.paciente || "Paciente",
            dni: b.dni || "S/DNI",
            cuil: b.cuil || "S/CUIL",
            nroAfiliado: b.nroAfiliado || b.cobertura || "Particular",
            obraSocial: b.obraSocial || "Particular",
            plan: b.plan || "S/P",
            sexo: b.sexo || "No especificado",
            fechaNacimiento: b.fechaNacimiento || "S/F",
            codigoCie10: b.diagnostico || "Z76.9 - ATENCIÓN MÉDICA GENERAL"
        };

        const medicamentoObj = {
            nombreComercial: b.nombreComercial || "PRESCRIPCIÓN MÉDICA",
            monodroga: b.monodroga || "",
            presentacion: b.presentacion || "",
            cantidad: b.cantidad || 1,
            tratamientoProlongado: b.tratamientoProlongado || "No",
            indicacionesTexto: b.tratamiento || ""
        };

        const firmaHash = generarHashInalterable({ 
            paciente: b.paciente, 
            dni: b.dni, 
            medico: b.medico, 
            matricula: b.matricula, 
            tratamiento: b.tratamiento, 
            fecha: fechaActual 
        });

        const queryInsert = `
            INSERT INTO recetas_cloud (
                id_receta, nro_orden, cuir, emisor, estado, creada, 
                fecha_timestamp, vigencia_desde, medico_json, paciente_json, 
                medicamento_json, firma_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;

        await pool.query(queryInsert, [
            idReceta, nroOrden, cuir, "ZENIXMEDIC", "VÁLIDA", fechaActual,
            timestamp, fechaActual, JSON.stringify(medicoObj), JSON.stringify(pacienteObj),
            JSON.stringify(medicamentoObj), firmaHash
        ]);

        res.json({
            ok: true,
            idReceta,
            firmaHash,
            urlValidacion: `${DOMAIN}/validar/${idReceta}`
        });
    } catch (error) {
        console.error("Error al registrar receta:", error);
        res.status(500).json({ ok: false, error: "Error al registrar en base de datos." });
    }
});

// 2. ENDPOINT PARA REGISTRAR DISPENSA EN FARMACIA
app.post('/api/recetas/:id/dispensar', async (req, res) => {
    try {
        const idBusqueda = req.params.id.toUpperCase();
        const idReceta = idBusqueda.startsWith('REC-') ? idBusqueda : `REC-${idBusqueda}`;

        const result = await pool.query('SELECT * FROM recetas_cloud WHERE id_receta = $1', [idReceta]);

        if (result.rows.length === 0) {
            return res.status(404).json({ ok: false, mensaje: "Receta no encontrada." });
        }

        const r = result.rows[0];

        if (r.estado === 'DISPENSADA') {
            return res.status(400).json({ ok: false, mensaje: "La receta ya fue utilizada previamente." });
        }

        if (r.estado === 'VENCIDA') {
            return res.status(400).json({ ok: false, mensaje: "La receta se encuentra vencida (superó los 30 días)." });
        }

        const { farmacia } = req.body;
        const fechaDispensa = new Date().toLocaleString('es-AR');
        const farmaciaNombre = farmacia || 'Farmacia Autorizada';

        await pool.query(
            'UPDATE recetas_cloud SET estado = $1, fecha_dispensa = $2, farmacia_nombre = $3 WHERE id_receta = $4',
            ['DISPENSADA', fechaDispensa, farmaciaNombre, idReceta]
        );

        res.json({ ok: true, mensaje: "Dispensa registrada con éxito." });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: "Error al registrar la dispensa." });
    }
});

// 3. VISTA WEB PÚBLICA DE VALIDACIÓN
app.get('/validar/:id', async (req, res) => {
    try {
        const idBusqueda = req.params.id.toUpperCase();
        const idReceta = idBusqueda.startsWith('REC-') ? idBusqueda : `REC-${idBusqueda}`;

        const result = await pool.query('SELECT * FROM recetas_cloud WHERE id_receta = $1', [idReceta]);

        if (result.rows.length === 0) {
            return res.send(`
                <body style="font-family:sans-serif; text-align:center; padding:40px; background:#f8d7da; color:#721c24;">
                    <h1>❌ Receta No Encontrada</h1>
                    <p>El código consultado no figura en el Registro Oficial ZenixMedic.</p>
                </body>
            `);
        }

        const r = result.rows[0];
        let estadoCalculado = r.estado;

        // Control de vencimiento a 30 días
        const fechaCreacionObj = r.fecha_timestamp ? new Date(Number(r.fecha_timestamp)) : new Date();
        const fechaActualObj = new Date();
        const diferenciaDias = Math.floor((fechaActualObj - fechaCreacionObj) / (1000 * 60 * 60 * 24));
        
        if (diferenciaDias > 30 && estadoCalculado !== 'DISPENSADA') {
            estadoCalculado = 'VENCIDA';
        }

        const esDispensada = estadoCalculado === 'DISPENSADA';
        const esVencida = estadoCalculado === 'VENCIDA';
        const urlValidacion = `${DOMAIN}/validar/${r.id_receta}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlValidacion)}`;

        let badgeHtml = '<span class="badge-ok">🟢 VÁLIDA / OK</span>';
        if (esDispensada) badgeHtml = '<span class="badge-dispensada">🔴 DISPENSADA</span>';
        if (esVencida) badgeHtml = '<span class="badge-vencida">⚠ VENCIDA</span>';

        const medico = typeof r.medico_json === 'string' ? JSON.parse(r.medico_json) : r.medico_json;
        const paciente = typeof r.paciente_json === 'string' ? JSON.parse(r.paciente_json) : r.paciente_json;
        const medicamento = typeof r.medicamento_json === 'string' ? JSON.parse(r.medicamento_json) : r.medicamento_json;

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Prescripción Digital - ${r.emisor}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 12px; }
                    .container { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 18px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
                    .header-title { text-align: center; font-size: 1.15em; font-weight: 700; color: #0f172a; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
                    .grid-2 { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.9em; }
                    .label { color: #0f172a; font-weight: 700; }
                    .badge-ok { background: #16a34a; color: white; padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 0.85em; }
                    .badge-dispensada { background: #dc2626; color: white; padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 0.85em; }
                    .badge-vencida { background: #d97706; color: white; padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 0.85em; }
                    .divider { border: 0; border-top: 1px solid #e2e8f0; margin: 14px 0; }
                    .section-title { text-align: center; font-weight: 700; font-size: 1em; margin: 15px 0 10px 0; color: #0f172a; }
                    .rp-header { background: #f1f5f9; padding: 6px 12px; font-weight: 700; color: #334155; border-radius: 4px; font-size: 0.9em; margin-bottom: 8px; }
                    .med-title { font-weight: 800; font-size: 0.98em; text-transform: uppercase; color: #0f172a; margin-top: 6px; }
                    .med-mono { color: #475569; font-size: 0.9em; margin-bottom: 6px; }
                    .cuir-box { font-family: monospace; font-size: 0.75em; word-break: break-all; color: #475569; background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px dashed #cbd5e1; margin-top: 10px; }
                    .alert-dispensada { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; padding: 12px; border-radius: 8px; margin: 12px 0; text-align: center; font-size: 0.9em; }
                    .alert-vencida { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; padding: 12px; border-radius: 8px; margin: 12px 0; text-align: center; font-size: 0.9em; }
                    .box-farmacia { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 8px; margin-top: 15px; }
                    .btn-dispensar { background: #16a34a; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; width: 100%; cursor: pointer; font-size: 0.9em; margin-top: 8px; }
                    .qr-container { text-align: center; margin: 15px 0 5px 0; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; }
                    .btn-print { background: #f97316; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; width: 100%; cursor: pointer; font-size: 0.95em; margin-top: 12px; }
                    @media print { .btn-print, .box-farmacia, .qr-container { display: none; } body { background: white; padding: 0; } .container { box-shadow: none; border: none; } }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header-title">Prescripción Médica Digital</div>
                    
                    <div class="grid-2">
                        <div><span class="label">Emisor:</span> ${r.emisor}</div>
                        <div>${badgeHtml}</div>
                    </div>

                    <div class="grid-2">
                        <div><span class="label">Nro. Orden:</span> ${r.nro_orden}</div>
                        <div><span class="label">Vigencia desde:</span> ${r.vigencia_desde}</div>
                    </div>

                    <div class="grid-2">
                        <div><span class="label">ID Receta:</span> ${r.id_receta}</div>
                        <div><span class="label">Creada:</span> ${r.creada}</div>
                    </div>

                    ${esDispensada ? `
                        <div class="alert-dispensada">
                            <strong>⚠️ ESTA RECETA YA FUE DISPENSADA</strong><br>
                            Entregada el: ${r.fecha_dispensa}<br>
                            <span>Atendido por: ${r.farmacia_nombre}</span>
                        </div>
                    ` : ''}

                    ${esVencida ? `
                        <div class="alert-vencida">
                            <strong>⚠️ PRESCRIPCIÓN VENCIDA</strong><br>
                            Han transcurrido más de 30 días desde su fecha de emisión (${r.creada}). Requiere nueva prescripción médica.
                        </div>
                    ` : ''}

                    <div class="divider"></div>

                    <div style="font-size: 0.88em; line-height: 1.5;">
                        <p style="margin: 3px 0;"><span class="label">Médico:</span> ${medico.nombre}</p>
                        <p style="margin: 3px 0;"><span class="label">Matrícula:</span> ${medico.matricula}</p>
                        <p style="margin: 3px 0;"><span class="label">Profesión:</span> ${medico.profesion}</p>
                        <p style="margin: 3px 0;"><span class="label">Especialidad:</span> ${medico.especialidad}</p>
                        <p style="margin: 3px 0;"><span class="label">Código REFEPS:</span> ${medico.codigoRefeps}</p>
                        <p style="margin: 3px 0;"><span class="label">Lugar de atención:</span> ${medico.lugarAtencion}</p>
                    </div>

                    <div class="divider"></div>

                    <div style="font-size: 0.88em; line-height: 1.5;">
                        <p style="margin: 3px 0;"><span class="label">Paciente:</span> ${paciente.nombre}</p>
                        <p style="margin: 3px 0;"><span class="label">DNI:</span> ${paciente.dni}</p>
                        <p style="margin: 3px 0;"><span class="label">CUIL:</span> ${paciente.cuil}</p>
                        <p style="margin: 3px 0;"><span class="label">Nro. Afiliado:</span> ${paciente.nroAfiliado}</p>
                        <p style="margin: 3px 0;"><span class="label">Obra Social:</span> ${paciente.obraSocial}</p>
                        <p style="margin: 3px 0;"><span class="label">Plan:</span> ${paciente.plan}</p>
                        <p style="margin: 3px 0;"><span class="label">Código CIE-10 / Diagnóstico:</span> ${paciente.codigoCie10}</p>
                    </div>

                    <div class="divider"></div>

                    <div class="section-title">Medicamentos</div>
                    <div class="rp-header">Rp/</div>

                    <div style="padding: 0 4px; font-size: 0.88em;">
                        <div class="med-title">${medicamento.nombreComercial}</div>
                        ${medicamento.monodroga ? `<div class="med-mono">${medicamento.monodroga}</div>` : ''}
                        ${medicamento.presentacion ? `<p style="margin: 4px 0;"><span class="label">Presentación:</span> ${medicamento.presentacion}</p>` : ''}
                        <p style="margin: 4px 0;"><span class="label">Cantidad:</span> ${medicamento.cantidad}</p>
                        ${medicamento.indicacionesTexto ? `<p style="margin: 4px 0;"><span class="label">Indicaciones:</span> ${medicamento.indicacionesTexto.replace(/\n/g, '<br>')}</p>` : ''}
                        
                        <div class="cuir-box">
                            <span class="label">CUIR:</span> ${r.cuir}
                        </div>

                        <div class="grid-2" style="margin-top: 10px;">
                            <div><span class="label">Tratamiento prolongado:</span> ${medicamento.tratamientoProlongado}</div>
                        </div>
                    </div>

                    ${(!esDispensada && !esVencida) ? `
                        <div class="box-farmacia">
                            <span class="label" style="color: #166534;">💊 Módulo de Farmacia / Dispensa</span>
                            <form onsubmit="dispensarReceta(event)" style="margin-top: 8px;">
                                <input type="text" id="inputFarmacia" placeholder="Nombre o CUIT de la Farmacia" required style="width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 4px; margin-bottom: 6px;">
                                <button type="submit" class="btn-dispensar">Confirmar Entrega y Anular Reuso</button>
                            </form>
                        </div>
                    ` : ''}

                    <div class="qr-container">
                        <img src="${qrApiUrl}" alt="Código QR de Verificación" width="130" height="130"><br>
                        <small style="color:#64748b; font-size:0.75em;">Escanee para validar autenticidad de la prescripción</small>
                    </div>

                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar Comprobante</button>
                </div>

                <script>
                    async function dispensarReceta(e) {
                        e.preventDefault();
                        const farmacia = document.getElementById('inputFarmacia').value;
                        if (!confirm("¿Confirmar que los medicamentos fueron entregados al paciente? Esta acción inhabilitará el reuso de la receta.")) return;

                        const res = await fetch('/api/recetas/${r.id_receta}/dispensar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ farmacia: farmacia })
                        });

                        const data = await res.json();
                        if (data.ok) {
                            window.location.reload();
                        } else {
                            alert(data.mensaje || "Error al procesar la dispensa.");
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error("Error al validar receta:", error);
        res.status(500).send("Error al validar la receta.");
    }
});

// 4. NUEVO ENDPOINT: Recuperar contraseña agregado
app.post('/api/auth/recuperar-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ ok: false, mensaje: "El correo es obligatorio." });
    }

    try {
        const { data, error } = await resend.emails.send({
            from: 'ZenixMedic <onboarding@resend.dev>', // Modificar este remitente si configuras un dominio propio en Resend
            to: email,
            subject: 'ZenixMedic - Recuperación de Contraseña',
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2 style="color: #f97316;">ZenixMedic</h2>
                    <h3>Recuperación de Acceso</h3>
                    <p>Hola, hemos recibido una solicitud para restablecer la contraseña asociada a este correo.</p>
                    <p>Por políticas de seguridad en historias clínicas, debés comunicarte con el <strong>Administrador del Sistema</strong> de tu clínica para que te asigne una nueva clave temporal.</p>
                    <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">
                    <small style="color: #64748b;">Si no solicitaste este cambio, ignorá este mensaje.</small>
                </div>
            `
        });

        if (error) {
            console.error("Error de Resend:", error);
            return res.status(500).json({ ok: false, mensaje: "Fallo en el proveedor de correos." });
        }

        res.json({ ok: true, mensaje: "Correo de recuperación enviado con éxito." });
    } catch (error) {
        console.error("Error interno:", error);
        res.status(500).json({ ok: false, mensaje: "Error interno en el servidor de la nube." });
    }
});

// Redirección segura
app.use('*', (req, res) => {
    res.send('API ZenixMedic activa.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ZenixMedic activa en puerto ${PORT}`));
