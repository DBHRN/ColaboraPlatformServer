const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tipo: {
    type: String,
    enum: [
      'tarea_asignada',
      'tarea_completada',
      'proyecto_invitacion',
      'mensaje_nuevo',
      'archivo_compartido',
      'comentario_tarea',
      'proyecto_actualizado'
    ],
    required: true
  },
  titulo: {
    type: String,
    required: true
  },
  mensaje: {
    type: String,
    required: true
  },
  relacionadoCon: {
    tipo: {
      type: String,
      enum: ['proyecto', 'tarea', 'mensaje', 'archivo', null],
      default: null
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },
  leida: {
    type: Boolean,
    default: false
  },
  fechaLectura: {
    type: Date
  },
  remitente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Índice para búsquedas rápidas
notificationSchema.index({ usuario: 1, leida: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

