const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  contenido: {
    type: String,
    required: [true, 'El contenido del mensaje es requerido']
  },
  remitente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  proyecto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  destinatario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  esPrivado: {
    type: Boolean,
    default: false
  },
  canal: {
    type: String,
    default: 'general'
  },
  tipo: {
    type: String,
    enum: ['texto', 'archivo', 'sistema'],
    default: 'texto'
  },
  archivosAdjuntos: [{
    nombre: String,
    url: String,
    tipo: String,
    tamaño: Number
  }],
  leidoPor: [{
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    fechaLectura: {
      type: Date,
      default: Date.now
    }
  }],
  editado: {
    type: Boolean,
    default: false
  },
  fechaEdicion: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);

