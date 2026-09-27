const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dominio base oficial en Render
const DOMAIN = process.env.RENDER_EXTERNAL_URL || 'https://zenixmedic-cloud.onrender.com';

// Base de datos en memoria para almacenamiento dinámico de prescripciones
const recetasDB = {};

function generarHashInalterable(datos) {
    const cadena = `${datos.paciente}-${datos.dni}-${datos.medico}-${datos.matricula}-${datos.tratamiento}-${datos.fecha}`;
    return crypto.createHash('sha256').update(cadena).digest('hex');
}

// Check de salud de la API
app.get('/', (req, res) => {
    res.send('API ZenixMedic activa y homologada ante ReNaPDiS.');
});

// 1. REGISTRO DINÁMICO DE RECETA
app.post('/api/recetas/registrar', (req, res) => {
    const b = req.body;
    
    const idReceta = "REC-" + Date.now().toString(36).toUpperCase();
    const nroOrden = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
    const cuir = "001700230" + Date.now() + "001";
    const fechaActual = new Date().toLocaleDateString('es-AR');

    const nuevaReceta = {
        idReceta,
        nroOrden,
        cuir,
        emisor: "ZENIXMEDIC",
        estado: "VÁLIDA",
        creada: fechaActual,
        fechaCreacionTimestamp: Date.now(),
        vigenciaDesde: fechaActual,
        fechaDispensa: null,
        farmaciaNombre: null,
        medico: {
            nombre: b.medico || "Médico Prescriptor",
            matricula: b.matricula || "M.N. S/N",
            profesion: b.profesion || "Profesional de la Salud",
            especialidad: b.especialidad || "Medicina General",
            codigoRefeps: b.codigoRefeps || "541094049196",
            lugarAtencion: b.lugarAtencion || "Consultorio Médico ZenixMedic"
        },
        paciente: {
            nombre: b.paciente || "Paciente",
            dni: b.dni || "S/DNI",
            cuil: b.cuil || "S/CUIL",
            nroAfiliado: b.nroAfiliado || b.cobertura || "Particular",
            obraSocial: b.obraSocial || "Particular",
            plan: b.plan || "S/P",
            sexo: b.sexo || "No especificado",
            fechaNacimiento: b.fechaNacimiento || "S/F",
            codigoCie10: b.diagnostico || "Z76.9 - ATENCIÓN MÉDICA GENERAL"
        },
        medicamento: {
            nombreComercial: b.nombreComercial || "PRESCRIPCIÓN MÉDICA",
            monodroga: b.monodroga || "",
            presentacion: b.presentacion || "",
            cantidad: b.cantidad || 1,
            tratamientoProlongado: b.tratamientoProlongado || "No",
            indicacionesTexto: b.tratamiento || ""
        },
        firmaDigitalHash: generarHashInalterable({ 
            paciente: b.paciente, 
            dni: b.dni, 
            medico: b.medico, 
            matricula: b.matricula, 
            tratamiento: b.tratamiento, 
            fecha: fechaActual 
        })
    };

    recetasDB[idReceta] = nuevaReceta;

    res.json({
        ok: true,
        idReceta,
        firmaHash: nuevaReceta.firmaDigitalHash,
        urlValidacion: `${DOMAIN}/validar/${idReceta}`
    });
});

// 2. ENDPOINT PARA REGISTRAR DISPENSA EN FARMACIA
app.post('/api/recetas/:id/dispensar', (req, res) => {
    const id = req.params.id;
    const r = recetasDB[id] || recetasDB[`REC-${id}`];

    if (!r) {
        return res.status(404).json({ ok: false, mensaje: "Receta no encontrada." });
    }

    if (r.estado === 'DISPENSADA') {
        return res.status(400).json({ ok: false, mensaje: "La receta ya fue utilizada previamente." });
    }

    if (r.estado === 'VENCIDA') {
        return res.status(400).json({ ok: false, mensaje: "La receta se encuentra vencida (superó los 30 días)." });
    }

    const { farmacia } = req.body;
    r.estado = 'DISPENSADA';
    r.fechaDispensa = new Date().toLocaleString('es-AR');
    r.farmaciaNombre = farmacia || 'Farmacia Autorizada';

    res.json({ ok: true, mensaje: "Dispensa registrada con éxito.", receta: r });
});

// 3. VISTA WEB PÚBLICA DE VALIDACIÓN (DISEÑO VERUMRP / RCTA CON QR Y CONTROL DE 30 DÍAS)
app.get('/validar/:id', (req, res) => {
    const id = req.params.id;
    const r = recetasDB[id] || recetasDB[`REC-${id}`];

    if (!r) {
        return res.send(`
            <body style="font-family:sans-serif; text-align:center; padding:40px; background:#f8d7da; color:#721c24;">
                <h1>❌ Receta No Encontrada</h1>
                <p>El código consultado no figura en el Registro Oficial ZenixMedic.</p>
            </body>
        `);
    }

    // CONTROL AUTOMÁTICO DE VENCIMIENTO A 30 DÍAS
    const fechaCreacionObj = r.fechaCreacionTimestamp ? new Date(r.fechaCreacionTimestamp) : new Date();
    const fechaActualObj = new Date();
    const diferenciaDias = Math.floor((fechaActualObj - fechaCreacionObj) / (1000 * 60 * 60 * 24));
    
    if (diferenciaDias > 30 && r.estado !== 'DISPENSADA') {
        r.estado = 'VENCIDA';
    }

    const esDispensada = r.estado === 'DISPENSADA';
    const esVencida = r.estado === 'VENCIDA';
    const urlValidacion = `${DOMAIN}/validar/${r.idReceta}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlValidacion)}`;

    let badgeHtml = '<span class="badge-ok">🟢 VÁLIDA / OK</span>';
    if (esDispensada) badgeHtml = '<span class="badge-dispensada">🔴 DISPENSADA</span>';
    if (esVencida) badgeHtml = '<span class="badge-vencida">⚠️ VENCIDA</span>';

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
                    <div><span class="label">Nro. Orden:</span> ${r.nroOrden}</div>
                    <div><span class="label">Vigencia desde:</span> ${r.vigenciaDesde}</div>
                </div>

                <div class="grid-2">
                    <div><span class="label">ID Receta:</span> ${r.idReceta}</div>
                    <div><span class="label">Creada:</span> ${r.creada}</div>
                </div>

                ${esDispensada ? `
                    <div class="alert-dispensada">
                        <strong>⚠️ ESTA RECETA YA FUE DISPENSADA</strong><br>
                        Entregada el: ${r.fechaDispensa}<br>
                        <span>Atendido por: ${r.farmaciaNombre}</span>
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
                    <p style="margin: 3px 0;"><span class="label">Médico:</span> ${r.medico.nombre}</p>
                    <p style="margin: 3px 0;"><span class="label">Matrícula:</span> ${r.medico.matricula}</p>
                    <p style="margin: 3px 0;"><span class="label">Profesión:</span> ${r.medico.profesion}</p>
                    <p style="margin: 3px 0;"><span class="label">Especialidad:</span> ${r.medico.especialidad}</p>
                    <p style="margin: 3px 0;"><span class="label">Código REFEPS:</span> ${r.medico.codigoRefeps}</p>
                    <p style="margin: 3px 0;"><span class="label">Lugar de atención:</span> ${r.medico.lugarAtencion}</p>
                </div>

                <div class="divider"></div>

                <div style="font-size: 0.88em; line-height: 1.5;">
                    <p style="margin: 3px 0;"><span class="label">Paciente:</span> ${r.paciente.nombre}</p>
                    <p style="margin: 3px 0;"><span class="label">DNI:</span> ${r.paciente.dni}</p>
                    <p style="margin: 3px 0;"><span class="label">CUIL:</span> ${r.paciente.cuil}</p>
                    <p style="margin: 3px 0;"><span class="label">Nro. Afiliado:</span> ${r.paciente.nroAfiliado}</p>
                    <p style="margin: 3px 0;"><span class="label">Obra Social:</span> ${r.paciente.obraSocial}</p>
                    <p style="margin: 3px 0;"><span class="label">Plan:</span> ${r.paciente.plan}</p>
                    <p style="margin: 3px 0;"><span class="label">Código CIE-10 / Diagnóstico:</span> ${r.paciente.codigoCie10}</p>
                </div>

                <div class="divider"></div>

                <div class="section-title">Medicamentos</div>
                <div class="rp-header">Rp/</div>

                <div style="padding: 0 4px; font-size: 0.88em;">
                    <div class="med-title">${r.medicamento.nombreComercial}</div>
                    ${r.medicamento.monodroga ? `<div class="med-mono">${r.medicamento.monodroga}</div>` : ''}
                    ${r.medicamento.presentacion ? `<p style="margin: 4px 0;"><span class="label">Presentación:</span> ${r.medicamento.presentacion}</p>` : ''}
                    <p style="margin: 4px 0;"><span class="label">Cantidad:</span> ${r.medicamento.cantidad}</p>
                    ${r.medicamento.indicacionesTexto ? `<p style="margin: 4px 0;"><span class="label">Indicaciones:</span> ${r.medicamento.indicacionesTexto.replace(/\n/g, '<br>')}</p>` : ''}
                    
                    <div class="cuir-box">
                        <span class="label">CUIR:</span> ${r.cuir}
                    </div>

                    <div class="grid-2" style="margin-top: 10px;">
                        <div><span class="label">Tratamiento prolongado:</span> ${r.medicamento.tratamientoProlongado}</div>
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

                    const res = await fetch('/api/recetas/${r.idReceta}/dispensar', {
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
});

// Redirección segura para cualquier ruta invalida
app.use('*', (req, res) => {
    res.send('API ZenixMedic activa.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ZenixMedic activa en puerto ${PORT}`));
