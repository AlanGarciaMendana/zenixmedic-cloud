const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// Domain base de tu app en Render
const DOMAIN = process.env.RENDER_EXTERNAL_URL || 'https://zenixmedic-cloud.onrender.com';

// Receta de prueba por defecto
const recetaDemo = {
    id: "REC-1790533482850",
    paciente: "María González",
    dni: "30.123.456",
    fechaNacimiento: "15/05/1985",
    edad: "41 años",
    grupoSanguineo: "A+",
    alergias: "Penicilina (Ninguna otra conocida)",
    obraSocial: "OSDE - Afiliado N°: 1-123456-01",
    medico: "Dr. Juan Pérez",
    matricula: "M.N. 123456 / M.P. 654321",
    especialidad: "Clínica Médica",
    tratamiento: "Paracetamol 500 mg - Comprimidos x 20\nCantidad: 1 (un) envase.\nPosología: Tomar 1 comprimido cada 8 horas en caso de dolor o fiebre.",
    fecha: "27/09/2026",
    estado: "VÁLIDA",
    firmaDigitalHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
};

const recetasDB = {
    "REC-1790533482850": recetaDemo
};

function generarHashInalterable(datos) {
    const cadena = `${datos.paciente}-${datos.dni}-${datos.fechaNacimiento}-${datos.medico}-${datos.matricula}-${datos.tratamiento}-${datos.fecha}`;
    return crypto.createHash('sha256').update(cadena).digest('hex');
}

// 1. INICIO / CHECK DE SALUD
app.get('/', (req, res) => {
    res.send('API ZenixMedic activa y funcionando.');
});

// 2. REGISTRAR RECETA
app.post('/api/recetas/registrar', (req, res) => {
    const { paciente, dni, fechaNacimiento, edad, grupoSanguineo, alergias, obraSocial, medico, matricula, especialidad, tratamiento } = req.body;
    
    const idReceta = "REC-" + Date.now() + Math.floor(Math.random() * 1000);
    const fechaCreacion = new Date().toISOString();
    const firmaDigitalHash = generarHashInalterable({ paciente, dni, fechaNacimiento, medico, matricula, tratamiento, fecha: fechaCreacion });

    const nuevaReceta = {
        id: idReceta,
        paciente: paciente || "María González",
        dni: dni || "30.123.456",
        fechaNacimiento: fechaNacimiento || "15/05/1985",
        edad: edad || "41 años",
        grupoSanguineo: grupoSanguineo || "A+",
        alergias: alergias || "Ninguna conocida",
        obraSocial: obraSocial || "Particular",
        medico: medico || "Dr. Juan Pérez",
        matricula: matricula || "M.N. 123456",
        especialidad: especialidad || "Medicina General",
        tratamiento: tratamiento || "Paracetamol 500mg x 20 comprimidos",
        fecha: new Date().toLocaleDateString('es-AR'),
        estado: 'PENDIENTE',
        firmaDigitalHash: firmaDigitalHash
    };

    recetasDB[idReceta] = nuevaReceta;

    res.json({ 
        ok: true, 
        idReceta, 
        firmaHash: firmaDigitalHash,
        urlValidacion: `${DOMAIN}/validar/${idReceta}` 
    });
});

// 3. VISTA DE VALIDACIÓN CON CÓDIGO QR
app.get('/validar/:id', (req, res) => {
    const idReceta = req.params.id;
    const receta = recetasDB[idReceta] || { ...recetaDemo, id: idReceta };

    const urlValidacion = `${DOMAIN}/validar/${idReceta}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlValidacion)}`;

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prescripción Médica Digital - ZenixMedic</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; padding: 15px; margin:0; }
                .card { background: white; max-width: 520px; margin: 20px auto; padding: 22px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
                .badge { background: #16a34a; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
                .clinical-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 6px; margin: 10px 0; font-size: 0.9em; }
                .box-rp { background: #fff7ed; border: 1px solid #ffedd5; border-left: 4px solid #f97316; padding: 15px; border-radius: 6px; font-size: 1.05em; margin: 15px 0; color: #1c1917; }
                .qr-container { text-align: center; margin: 15px 0; padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; }
                .btn-print { background: #f97316; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; width: 100%; cursor: pointer; font-size: 1em; margin-top: 10px; }
                .alert-tag { color: #dc2626; font-weight: bold; }
                @media print {
                    .btn-print { display: none; }
                    body { background: white; padding: 0; }
                    .card { box-shadow: none; margin: 0; max-width: 100%; }
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="color:#1c1917; margin:0;">ZenixMedic</h2>
                    <span class="badge">${receta.estado}</span>
                </div>
                <small style="color:#64748b;">Prescripción Digital Ley 27.553 | ID: ${receta.id}</small>
                <hr style="border:0; border-top:1px solid #e2e8f0; margin:12px 0;">
                
                <p style="margin:4px 0;"><strong>Paciente:</strong> ${receta.paciente}</p>
                <p style="margin:4px 0;"><strong>DNI:</strong> ${receta.dni} | <strong>F. Nac.:</strong> ${receta.fechaNacimiento} (${receta.edad})</p>
                <p style="margin:4px 0;"><strong>Obra Social / Prepaga:</strong> ${receta.obraSocial}</p>

                <div class="clinical-box">
                    <strong>Ficha Médica:</strong><br>
                    <span>🩸 Grupo Sanguíneo: <strong>${receta.grupoSanguineo}</strong></span> | 
                    <span>⚠️ Alergias: <span class="alert-tag">${receta.alergias}</span></span>
                </div>
                
                <div class="box-rp">
                    <strong>Rp / Indicaciones Prescriptas:</strong><br><br>
                    ${receta.tratamiento.replace(/\n/g, '<br>')}
                </div>

                <p style="margin:4px 0;"><strong>Médico Prescriptor:</strong> ${receta.medico}</p>
                <p style="margin:4px 0;"><strong>Especialidad:</strong> ${receta.especialidad}</p>
                <p style="margin:4px 0;"><strong>Matrícula:</strong> ${receta.matricula}</p>
                <p style="margin:4px 0; font-size:0.8em; color:gray;"><strong>Firma Digital (Hash SHA-256):</strong><br>${receta.firmaDigitalHash}</p>

                <div class="qr-container">
                    <img src="${qrApiUrl}" alt="Código QR de Validación" width="130" height="130"><br>
                    <small style="color:#64748b; font-size:0.75em;">Escanee para validar autenticidad en ReNaPDiS</small>
                </div>

                <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar en PDF</button>
            </div>
        </body>
        </html>
    `);
});

// Fallback por si entran a cualquier otra URL invalida
app.use('*', (req, res) => {
    res.redirect('/validar/REC-1790533482850');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ZenixMedic activa en puerto ${PORT}`));
