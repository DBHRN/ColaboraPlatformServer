const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del proyecto es requerido'],
    trim: true
  },
  descripcion: {
    type: String,
    default: ''
  },
  organizacion: {
    type: String,
    default: 'Organización'
  },
  propietario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  miembros: [{
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rol: {
      type: String,
      enum: ['admin', 'miembro', 'observador'],
      default: 'miembro'
    },
    fechaUnion: {
      type: Date,
      default: Date.now
    }
  }],
  estado: {
    type: String,
    enum: ['activo', 'pausado', 'completado', 'archivado'],
    default: 'activo'
  },
  progreso: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  fechaInicio: {
    type: Date,
    default: Date.now
  },
  fechaFin: {
    type: Date
  },
  etiquetas: [{
    type: String
  }],
  tareas: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  archivos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  }],
  canalesChat: [{
    nombre: String,
    tipo: {
      type: String,
      enum: ['publico', 'privado'],
      default: 'publico'
    },
    mensajes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    }]
  }]
}, {
  timestamps: true
});

// Calcular progreso automáticamente
projectSchema.methods.calcularProgreso = async function() {
  const Task = mongoose.model('Task');
  const totalTareas = await Task.countDocuments({ proyecto: this._id });
  const tareasCompletadas = await Task.countDocuments({ 
    proyecto: this._id, 
    estado: 'finalizado' 
  });
  
  if (totalTareas > 0) {
    this.progreso = Math.round((tareasCompletadas / totalTareas) * 100);
  } else {
    this.progreso = 0;
  }
  
  await this.save();
  return this.progreso;
};

module.exports = mongoose.model('Project', projectSchema);

