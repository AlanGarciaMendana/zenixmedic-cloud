const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Simulamos la base de datos central en memoria (o conectada a Supabase gratis)
const recetasDB = {};

// 1. Endpoint que llama tu Electron local para registrar la receta
app.post('/api/recetas/registrar', (req, res) => {
    const { paciente, dni, obraSocial, medico, matricula, especialidad, tratamiento } = req.body;
    
    const idReceta = "REC-" + Date.now();
    
    recetasDB[idReceta] = {
        id: idReceta,
        paciente, dni, obraSocial,
        medico, matricula, especialidad,
        tratamiento,
        fecha: new Date().toLocaleDateString('es-AR'),
        estado: 'PENDIENTE' // PENDIENTE -> DISPENSADA
    };

    // Devuelve el ID y la URL oficial para el QR
    res.json({ 
        ok: true, 
        idReceta, 
        urlValidacion: `https://zenixmedic-api.onrender.com/validar/${idReceta}` 
    });
});

// 2. Pantalla pública que ve la farmacia al escanear el QR
app.get('/validar/:id', (req, res) => {
    const receta = recetasDB[req.params.id];

    if (!receta) {
        return res.send(`
            <body style="font-family:sans-serif; text-align:center; padding:40px; background:#f8d7da;">
                <h1 style="color:#721c24;">❌ Receta No Encontrada</h1>
                <p>El código de receta no existe en el sistema oficial ZenixMedic.</p>
            </body>
        `);
    }

    const colorEstado = receta.estado === 'PENDIENTE' ? '#28a745' : '#dc3545';

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Validación de Receta - ZenixMedic</title>
            <style>
                body { font-family: sans-serif; background: #f4f6f9; padding: 20px; }
                .card { background: white; max-width: 500px; margin: 0 auto; padding: 25px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                .badge { background: ${colorEstado}; color: white; padding: 5px 10px; border-radius: 4px; font-weight: bold; display: inline-block; }
                hr { border: 0; border-top: 1px solid #eee; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2 style="color:#2c3e50; margin-bottom:5px;">ZenixMedic Validaciones</h2>
                <small style="color:gray;">Conforme Ley 27.553 de Receta Digital</small>
                <hr>
                <p><strong>Estado:</strong> <span class="badge">${receta.estado}</span></p>
                <p><strong>Nro Receta:</strong> ${receta.id}</p>
                <p><strong>Fecha:</strong> ${receta.fecha}</p>
                <hr>
                <p><strong>Paciente:</strong> ${receta.paciente} (DNI: ${receta.dni})</p>
                <p><strong>Obra Social:</strong> ${receta.obraSocial}</p>
                <hr>
                <p><strong>Prescriptor:</strong> ${receta.medico}</p>
                <p><strong>Matrícula:</strong> ${receta.matricula} (${receta.especialidad})</p>
                <hr>
                <h3>Prescripción / Rp:</h3>
                <div style="background:#eef2f5; padding:15px; border-radius:6px; font-size:1.1em;">
                    ${receta.tratamiento.replace(/\n/g, '<br>')}
                </div>
            </div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de validación corriendo en puerto ${PORT}`));