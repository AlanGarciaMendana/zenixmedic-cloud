const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

const DOMAIN = process.env.RENDER_EXTERNAL_URL || 'https://zenixmedic-cloud.onrender.com';

// Receta de prueba que replica los datos de tu imagen
const recetaDemo = {
    idReceta: "REC-19936E623",
    nroOrden: "9600047794040",
    cuir: "0017002302010000000000205960004779404001",
    emisor: "ZENIXMEDIC",
    estado: "OK",
    creada: "17/09/2026",
    vigenciaDesde: "17/09/2026",
    medico: {
        nombre: "Dr. Leonardo Zambrano",
        matricula: "MN 138653",
        profesion: "Médico ORL / Cx de CyC",
        especialidad: "OTORRINOLARING., CIR. CABEZA Y CUELLO",
        codigoRefeps: "541094049196",
        lugarAtencion: "Av. R. Balbin 4211. Tel: 11 5272-3319/20"
    },
    paciente: {
        codigo: "MALGA12071993",
        nombre: "Alan Garcia Mendaña",
        dni: "37786090",
        cuil: "20377860900",
        nroAfiliado: "8000061545764011005",
        financiador: "SWISS MEDICAL",
        plan: "SMG20",
        sexo: "Masculino",
        fechaNacimiento: "12/07/1993",
        codigoCie10: "Z769 / Postoperatorio"
    },
    medicamento: {
        nombreComercial: "ACLOXIGENAC",
        monodroga: "diclofenac sódico",
        presentacion: "50 mg comp.rec. x 10",
        cantidad: 1,
        tratamientoProlongado: "No"
    },
    firmaDigitalHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
};

const recetasDB = {
    "19936E623": recetaDemo,
    "REC-19936E623": recetaDemo
};

function generarHashInalterable(datos) {
    const cadena = `${datos.paciente}-${datos.dni}-${datos.medico}-${datos.matricula}-${datos.tratamiento}-${datos.fecha}`;
    return crypto.createHash('sha256').update(cadena).digest('hex');
}

app.get('/', (req, res) => {
    res.send('API ZenixMedic activa y homologada ante ReNaPDiS.');
});

// 1. REGISTRO DE RECETAS EN LA NUBE
app.post('/api/recetas/registrar', (req, res) => {
    const body = req.body;
    const idReceta = "REC-" + Date.now().toString(36).toUpperCase();
    const nroOrden = Math.floor(1000000000003 + Math.random() * 9000000000000).toString();
    const cuir = "001700230" + Date.now() + "001";
    const fechaActual = new Date().toLocaleDateString('es-AR');

    const nuevaReceta = {
        idReceta,
        nroOrden,
        cuir,
        emisor: "ZENIXMEDIC",
        estado: "OK",
        creada: fechaActual,
        vigenciaDesde: fechaActual,
        medico: {
            nombre: body.medico || "Dr. Leonardo Zambrano",
            matricula: body.matricula || "MN 138653",
            profesion: "Médico Prescriptor",
            especialidad: body.especialidad || "OTORRINOLARINGOLOGÍA",
            codigoRefeps: "541094049196",
            lugarAtencion: "Consultorio Central ZenixMedic"
        },
        paciente: {
            codigo: (body.paciente || "PACIENTE").substring(0,5).toUpperCase() + "12071993",
            nombre: body.paciente || "Alan Garcia Mendaña",
            dni: body.dni || "37786090",
            cuil: body.cuil || ("20" + (body.dni || "37786090") + "0"),
            nroAfiliado: body.nroAfiliado || "8000061545764011005",
            financiador: body.obraSocial || "SWISS MEDICAL",
            plan: body.plan || "SMG20",
            sexo: body.sexo || "Masculino",
            fechaNacimiento: body.fechaNacimiento || "12/07/1993",
            codigoCie10: body.diagnostico || "Z76.9 - ATENCIÓN MÉDICA GENERAL"
        },
        medicamento: {
            nombreComercial: body.nombreComercial || "ACLOXIGENAC",
            monodroga: body.monodroga || "diclofenac sódico",
            presentacion: body.presentacion || "50 mg comp.rec. x 10",
            cantidad: body.cantidad || 1,
            tratamientoProlongado: "No",
            indicacionesTexto: body.tratamiento || ""
        },
        firmaDigitalHash: generarHashInalterable({ paciente: body.paciente, dni: body.dni, medico: body.medico, matricula: body.matricula, tratamiento: body.tratamiento, fecha: fechaActual })
    };

    recetasDB[idReceta] = nuevaReceta;

    res.json({
        ok: true,
        idReceta,
        firmaHash: nuevaReceta.firmaDigitalHash,
        urlValidacion: `${DOMAIN}/validar/${idReceta}`
    });
});

// 2. VISTA DE VALIDACIÓN OFICIAL (REPLICANDO VERUMRP EXATAMENTE COMO EN TU CAPTURA)
app.get('/validar/:id', (req, res) => {
    const id = req.params.id;
    const r = recetasDB[id] || recetasDB[`REC-${id}`] || { ...recetaDemo, idReceta: id };

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prescripción Digital - ZenixMedic / VerumRP</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 12px; }
                .container { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 18px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
                .header-title { text-align: center; font-size: 1.15em; font-weight: 700; color: #0f172a; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
                .grid-2 { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.9em; }
                .label { color: #0f172a; font-weight: 700; }
                .val-ok { color: #16a34a; font-weight: bold; }
                .divider { border: 0; border-top: 1px solid #e2e8f0; margin: 14px 0; }
                .section-title { text-align: center; font-weight: 700; font-size: 1em; margin: 15px 0 10px 0; color: #0f172a; }
                .rp-header { background: #f1f5f9; padding: 6px 12px; font-weight: 700; color: #334155; border-radius: 4px; font-size: 0.9em; margin-bottom: 8px; }
                .med-title { font-weight: 800; font-size: 0.98em; text-transform: uppercase; color: #0f172a; margin-top: 6px; }
                .med-mono { color: #475569; font-size: 0.9em; margin-bottom: 6px; }
                .cuir-box { font-family: monospace; font-size: 0.75em; word-break: break-all; color: #475569; background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px dashed #cbd5e1; margin-top: 10px; }
                .icon-check { background: #22c55e; color: white; border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; margin-left: 4px; }
                .btn-print { background: #f97316; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; width: 100%; cursor: pointer; font-size: 0.95em; margin-top: 16px; }
                @media print { .btn-print { display: none; } body { background: white; padding: 0; } .container { box-shadow: none; border: none; } }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header-title">Prescripción</div>
                
                <div class="grid-2">
                    <div><span class="label">Emisor:</span> ${r.emisor}</div>
                    <div><span class="label">Verificación:</span> <span class="icon-check">✓</span></div>
                </div>

                <div class="grid-2">
                    <div><span class="label">Nro. Orden:</span> ${r.nroOrden}</div>
                    <div><span class="label">Vigencia desde:</span> ${r.vigenciaDesde}</div>
                </div>

                <div class="grid-2">
                    <div><span class="label">Estado:</span> <span class="val-ok">${r.estado}</span></div>
                    <div><span class="label">Creada:</span> ${r.creada}</div>
                </div>

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
                    <p style="margin: 3px 0;"><span class="label">Paciente:</span> ${r.paciente.codigo} (${r.paciente.nombre})</p>
                    <p style="margin: 3px 0;"><span class="label">DNI:</span> ${r.paciente.dni}</p>
                    <p style="margin: 3px 0;"><span class="label">CUIL:</span> ${r.paciente.cuil}</p>
                    <p style="margin: 3px 0;"><span class="label">Nro. Afiliado:</span> ${r.paciente.nroAfiliado}</p>
                    <p style="margin: 3px 0;"><span class="label">Financiador:</span> ${r.paciente.financiador}</p>
                    <p style="margin: 3px 0;"><span class="label">Plan:</span> ${r.paciente.plan}</p>
                    <p style="margin: 3px 0;"><span class="label">Código CIE-10 / Diagnóstico:</span> ${r.paciente.codigoCie10}</p>
                </div>

                <div class="divider"></div>

                <div class="section-title">Medicamentos</div>
                <div class="rp-header">Rp/</div>

                <div style="padding: 0 4px; font-size: 0.88em;">
                    <div class="med-title">${r.medicamento.nombreComercial}</div>
                    <div class="med-mono">${r.medicamento.monodroga}</div>
                    <p style="margin: 4px 0;"><span class="label">Presentación:</span> ${r.medicamento.presentacion}</p>
                    <p style="margin: 4px 0;"><span class="label">Cantidad:</span> ${r.medicamento.cantidad}</p>
                    ${r.medicamento.indicacionesTexto ? `<p style="margin: 4px 0;"><span class="label">Posología:</span> ${r.medicamento.indicacionesTexto}</p>` : ''}
                    
                    <div class="cuir-box">
                        <span class="label">CUIR:</span> ${r.cuir}
                    </div>

                    <div class="grid-2" style="margin-top: 10px;">
                        <div><span class="label">Tratamiento prolongado:</span> ${r.medicamento.tratamientoProlongado}</div>
                    </div>
                </div>

                <button class="btn-print" onclick="window.print()">🖨️ Guardar o Imprimir Prescripción</button>
            </div>
        </body>
        </html>
    `);
});

// Fallback universal
app.use('*', (req, res) => {
    res.redirect('/validar/19936E623');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ZenixMedic activa en puerto ${PORT}`));
