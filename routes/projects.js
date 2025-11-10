const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');
const { createNotification } = require('./notifications');

// @route   GET /api/projects
// @desc    Obtener todos los proyectos del usuario
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { propietario: req.user.id },
        { 'miembros.usuario': req.user.id }
      ]
    })
    .populate('propietario', 'nombre email avatar')
    .populate('miembros.usuario', 'nombre email avatar')
    .sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: projects.length,
      projects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener proyectos.',
      error: error.message
    });
  }
});

// @route   GET /api/projects/:id
// @desc    Obtener proyecto por ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('propietario', 'nombre email avatar')
      .populate('miembros.usuario', 'nombre email avatar')
      .populate('tareas')
      .populate('archivos');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado.'
      });
    }

    // Verificar que el usuario tenga acceso
    const tieneAcceso = project.propietario._id.toString() === req.user.id ||
      project.miembros.some(m => m.usuario._id.toString() === req.user.id);

    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a este proyecto.'
      });
    }

    res.json({
      success: true,
      project
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener proyecto.',
      error: error.message
    });
  }
});

// @route   POST /api/projects
// @desc    Crear nuevo proyecto
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { nombre, descripcion, organizacion, etiquetas } = req.body;

    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del proyecto es requerido.'
      });
    }

    const project = await Project.create({
      nombre,
      descripcion,
      organizacion: organizacion || req.user.organizacion,
      propietario: req.user.id,
      miembros: [{
        usuario: req.user.id,
        rol: 'admin',
        fechaUnion: new Date()
      }],
      etiquetas: etiquetas || []
    });

    // Agregar proyecto al usuario
    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user.id, {
      $push: { proyectos: project._id }
    });

    const projectPopulated = await Project.findById(project._id)
      .populate('propietario', 'nombre email avatar')
      .populate('miembros.usuario', 'nombre email avatar');

    res.status(201).json({
      success: true,
      project: projectPopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al crear proyecto.',
      error: error.message
    });
  }
});

// @route   PUT /api/projects/:id
// @desc    Actualizar proyecto
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado.'
      });
    }

    // Verificar permisos
    const esPropietario = project.propietario.toString() === req.user.id;
    const esAdmin = project.miembros.find(
      m => m.usuario.toString() === req.user.id && m.rol === 'admin'
    );

    if (!esPropietario && !esAdmin) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para actualizar este proyecto.'
      });
    }

    const { nombre, descripcion, estado, etiquetas, fechaFin } = req.body;

    if (nombre) project.nombre = nombre;
    if (descripcion !== undefined) project.descripcion = descripcion;
    if (estado) project.estado = estado;
    if (etiquetas) project.etiquetas = etiquetas;
    if (fechaFin) project.fechaFin = fechaFin;

    await project.save();

    const projectPopulated = await Project.findById(project._id)
      .populate('propietario', 'nombre email avatar')
      .populate('miembros.usuario', 'nombre email avatar');

    res.json({
      success: true,
      project: projectPopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar proyecto.',
      error: error.message
    });
  }
});

// @route   POST /api/projects/:id/members
// @desc    Agregar miembro a proyecto
// @access  Private
router.post('/:id/members', protect, async (req, res) => {
  try {
    const { usuarioId, rol } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado.'
      });
    }

    // Verificar permisos
    const esPropietario = project.propietario.toString() === req.user.id;
    const esAdmin = project.miembros.find(
      m => m.usuario.toString() === req.user.id && m.rol === 'admin'
    );

    if (!esPropietario && !esAdmin) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para agregar miembros.'
      });
    }

    // Verificar si ya es miembro
    const yaEsMiembro = project.miembros.some(
      m => m.usuario.toString() === usuarioId
    );

    if (yaEsMiembro) {
      return res.status(400).json({
        success: false,
        message: 'El usuario ya es miembro del proyecto.'
      });
    }

    project.miembros.push({
      usuario: usuarioId,
      rol: rol || 'miembro',
      fechaUnion: new Date()
    });

    await project.save();

    // Agregar proyecto al usuario
    const User = require('../models/User');
    await User.findByIdAndUpdate(usuarioId, {
      $push: { proyectos: project._id }
    });

    // Crear notificación para el nuevo miembro
    await createNotification(
      usuarioId,
      'proyecto_invitacion',
      'Invitación a proyecto',
      `${req.user.nombre} te agregó al proyecto "${project.nombre}"`,
      { tipo: 'proyecto', id: project._id },
      req.user.id
    );

    const projectPopulated = await Project.findById(project._id)
      .populate('propietario', 'nombre email avatar')
      .populate('miembros.usuario', 'nombre email avatar');

    res.json({
      success: true,
      project: projectPopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al agregar miembro.',
      error: error.message
    });
  }
});

// @route   DELETE /api/projects/:id
// @desc    Eliminar proyecto
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado.'
      });
    }

    // Solo el propietario puede eliminar
    if (project.propietario.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Solo el propietario puede eliminar el proyecto.'
      });
    }

    // Eliminar tareas asociadas
    await Task.deleteMany({ proyecto: project._id });

    await Project.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Proyecto eliminado correctamente.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar proyecto.',
      error: error.message
    });
  }
});

module.exports = router;

