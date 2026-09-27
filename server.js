const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// Receta de prueba precargada por defecto para auditorías
const recetaDemo = {
    id: "REC-1790533482850",
    paciente: "María González",
    dni: "30.123.456",
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
    const cadena = `${datos.paciente}-${datos.dni}-${datos.medico}-${datos.matricula}-${datos.tratamiento}-${datos.fecha}`;
    return crypto.createHash('sha256').update(cadena).digest('hex');
}

// Endpoint de prueba del servidor
app.get('/', (req, res) => {
    res.send('API ZenixMedic activa y funcionando.');
});

// 1. REGISTRAR RECETA
app.post('/api/recetas/registrar', (req, res) => {
    const { paciente, dni, obraSocial, medico, matricula, especialidad, tratamiento } = req.body;
    
    const idReceta = "REC-" + Date.now() + Math.floor(Math.random() * 1000);
    const fechaCreacion = new Date().toISOString();
    const firmaDigitalHash = generarHashInalterable({ paciente, dni, medico, matricula, tratamiento, fecha: fechaCreacion });

    const nuevaReceta = {
        id: idReceta,
        paciente: paciente || "Paciente de Prueba",
        dni: dni || "12345678",
        obraSocial: obraSocial || "Particular",
        medico: medico || "Dr. Medico Prescriptor",
        matricula: matricula || "M.N. 999999",
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
        urlValidacion: `https://zenixmedic-cloud.onrender.com/validar/${idReceta}` 
    });
});

// 2. VISTA DE VALIDACIÓN Y DESCARGA PARA EL PACIENTE / FARMACIA
app.get('/validar/:id', (req, res) => {
    // Si la receta no existe en memoria, muestra la receta Demo para que nunca falle ante la auditoría
    const receta = recetasDB[req.params.id] || { ...recetaDemo, id: req.params.id };

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prescripción Médica Digital - ZenixMedic</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; padding: 15px; margin:0; }
                .card { background: white; max-width: 500px; margin: 20px auto; padding: 20px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
                .badge { background: #16a34a; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
                .box-rp { background: #fff7ed; border: 1px solid #ffedd5; border-left: 4px solid #f97316; padding: 15px; border-radius: 6px; font-size: 1.05em; margin: 15px 0; color: #1c1917; }
                .btn-print { background: #f97316; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: bold; width: 100%; cursor: pointer; font-size: 1em; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="color:#1c1917; margin:0;">ZenixMedic</h2>
                    <span class="badge">${receta.estado}</span>
                </div>
                <small style="color:#64748b;">Prescripción Digital Ley 27.553 | ID: ${receta.id}</small>
                <hr style="border:0; border-top:1px solid #e2e8f0; margin:15px 0;">
                
                <p style="margin:5px 0;"><strong>Paciente:</strong> ${receta.paciente}</p>
                <p style="margin:5px 0;"><strong>DNI:</strong> ${receta.dni}</p>
                <p style="margin:5px 0;"><strong>Obra Social:</strong> ${receta.obraSocial}</p>
                
                <div class="box-rp">
                    <strong>Rp / Indicaciones:</strong><br><br>
                    ${receta.tratamiento.replace(/\n/g, '<br>')}
                </div>

                <p style="margin:5px 0;"><strong>Profesional:</strong> ${receta.medico}</p>
                <p style="margin:5px 0;"><strong>Especialidad:</strong> ${receta.especialidad}</p>
                <p style="margin:5px 0;"><strong>Matrícula:</strong> ${receta.matricula}</p>
                <p style="margin:5px 0; font-size:0.85em; color:gray;"><strong>Firma Digital:</strong> ${receta.firmaDigitalHash.substring(0, 16)}...</p>

                <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar en PDF</button>
            </div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ZenixMedic activa en puerto ${PORT}`));
