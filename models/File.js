const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del archivo es requerido']
  },
  nombreOriginal: {
    type: String,
    required: true
  },
  ruta: {
    type: String,
    required: true
  },
  tipo: {
    type: String,
    required: true
  },
  tamaño: {
    type: Number,
    required: true
  },
  subidoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  proyecto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  carpeta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  esCarpeta: {
    type: Boolean,
    default: false
  },
  compartidoCon: [{
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permisos: {
      type: String,
      enum: ['lectura', 'escritura', 'administrador'],
      default: 'lectura'
    }
  }],
  versiones: [{
    numero: Number,
    ruta: String,
    subidoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    fecha: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('File', fileSchema);

