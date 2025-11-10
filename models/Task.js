const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título de la tarea es requerido'],
    trim: true
  },
  descripcion: {
    type: String,
    default: ''
  },
  proyecto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  asignadoA: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  estado: {
    type: String,
    enum: ['por-hacer', 'en-progreso', 'finalizado'],
    default: 'por-hacer'
  },
  prioridad: {
    type: String,
    enum: ['baja', 'media', 'alta', 'urgente'],
    default: 'media'
  },
  fechaVencimiento: {
    type: Date
  },
  fechaCompletado: {
    type: Date
  },
  etiquetas: [{
    type: String
  }],
  comentarios: [{
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    contenido: String,
    fecha: {
      type: Date,
      default: Date.now
    }
  }],
  archivosAdjuntos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  }],
  orden: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Actualizar fecha de completado cuando cambia el estado
taskSchema.pre('save', function(next) {
  if (this.isModified('estado') && this.estado === 'finalizado' && !this.fechaCompletado) {
    this.fechaCompletado = new Date();
  }
  if (this.isModified('estado') && this.estado !== 'finalizado' && this.fechaCompletado) {
    this.fechaCompletado = null;
  }
  next();
});

module.exports = mongoose.model('Task', taskSchema);

