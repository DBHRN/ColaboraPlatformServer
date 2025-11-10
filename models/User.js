const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es requerido'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'El email es requerido'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email inválido']
  },
  password: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
    select: false
  },
  avatar: {
    type: String,
    default: ''
  },
  rol: {
    type: String,
    enum: ['admin', 'miembro', 'invitado'],
    default: 'miembro'
  },
  organizacion: {
    type: String,
    default: 'Organización'
  },
  proyectos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
  tareasAsignadas: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  ultimaActividad: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash de contraseña antes de guardar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

