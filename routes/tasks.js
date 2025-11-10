const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Project = require('../models/Project');
const { protect } = require('../middleware/auth');
const { createNotification } = require('./notifications');

// @route   GET /api/tasks
// @desc    Obtener tareas del usuario
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { proyecto, estado } = req.query;
    let query = {};

    if (proyecto) {
      query.proyecto = proyecto;
    }

    if (estado) {
      query.estado = estado;
    }

    // Obtener tareas asignadas al usuario o creadas por él
    query.$or = [
      { asignadoA: req.user.id },
      { creadoPor: req.user.id }
    ];

    const tasks = await Task.find(query)
      .populate('proyecto', 'nombre')
      .populate('asignadoA', 'nombre email avatar')
      .populate('creadoPor', 'nombre email avatar')
      .sort({ orden: 1, createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener tareas.',
      error: error.message
    });
  }
});

// @route   GET /api/tasks/:id
// @desc    Obtener tarea por ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('proyecto', 'nombre descripcion')
      .populate('asignadoA', 'nombre email avatar')
      .populate('creadoPor', 'nombre email avatar')
      .populate('archivosAdjuntos');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Tarea no encontrada.'
      });
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener tarea.',
      error: error.message
    });
  }
});

// @route   POST /api/tasks
// @desc    Crear nueva tarea
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { titulo, descripcion, proyecto, asignadoA, prioridad, fechaVencimiento, etiquetas } = req.body;

    if (!titulo || !proyecto) {
      return res.status(400).json({
        success: false,
        message: 'El título y el proyecto son requeridos.'
      });
    }

    // Verificar que el proyecto existe y el usuario tiene acceso
    const project = await Project.findById(proyecto);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado.'
      });
    }

    const tieneAcceso = project.propietario.toString() === req.user.id ||
      project.miembros.some(m => m.usuario.toString() === req.user.id);

    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a este proyecto.'
      });
    }

    const task = await Task.create({
      titulo,
      descripcion,
      proyecto,
      asignadoA: asignadoA || [],
      creadoPor: req.user.id,
      prioridad: prioridad || 'media',
      fechaVencimiento,
      etiquetas: etiquetas || []
    });

    // Agregar tarea al proyecto
    project.tareas.push(task._id);
    await project.save();

    // Actualizar progreso del proyecto
    await project.calcularProgreso();

    // Si hay usuarios asignados, agregar la tarea a sus tareas asignadas
    if (asignadoA && asignadoA.length > 0) {
      const User = require('../models/User');
      await User.updateMany(
        { _id: { $in: asignadoA } },
        { $push: { tareasAsignadas: task._id } }
      );

      // Crear notificaciones para usuarios asignados
      const project = await Project.findById(proyecto);
      for (const userId of asignadoA) {
        if (userId.toString() !== req.user.id.toString()) {
          await createNotification(
            userId,
            'tarea_asignada',
            'Nueva tarea asignada',
            `${req.user.nombre} te asignó la tarea "${titulo}" en el proyecto "${project.nombre}"`,
            { tipo: 'tarea', id: task._id },
            req.user.id
          );
        }
      }
    }

    const taskPopulated = await Task.findById(task._id)
      .populate('proyecto', 'nombre')
      .populate('asignadoA', 'nombre email avatar')
      .populate('creadoPor', 'nombre email avatar');

    res.status(201).json({
      success: true,
      task: taskPopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al crear tarea.',
      error: error.message
    });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Actualizar tarea
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Tarea no encontrada.'
      });
    }

    const { titulo, descripcion, estado, asignadoA, prioridad, fechaVencimiento, etiquetas, orden } = req.body;

    if (titulo) task.titulo = titulo;
    if (descripcion !== undefined) task.descripcion = descripcion;
    if (estado) {
      const oldEstado = task.estado;
      task.estado = estado;
      
      // Notificar cuando se completa una tarea
      if (estado === 'finalizado' && oldEstado !== 'finalizado') {
        const project = await Project.findById(task.proyecto);
        await createNotification(
          task.creadoPor,
          'tarea_completada',
          'Tarea completada',
          `La tarea "${task.titulo}" ha sido completada en el proyecto "${project.nombre}"`,
          { tipo: 'tarea', id: task._id },
          req.user.id
        );
      }
    }
    if (asignadoA) {
      // Notificar a nuevos usuarios asignados
      const nuevosAsignados = asignadoA.filter(id => 
        !task.asignadoA.some(oldId => oldId.toString() === id.toString())
      );
      task.asignadoA = asignadoA;
      
      if (nuevosAsignados.length > 0) {
        const project = await Project.findById(task.proyecto);
        for (const userId of nuevosAsignados) {
          if (userId.toString() !== req.user.id.toString()) {
            await createNotification(
              userId,
              'tarea_asignada',
              'Tarea asignada',
              `${req.user.nombre} te asignó la tarea "${task.titulo}" en el proyecto "${project.nombre}"`,
              { tipo: 'tarea', id: task._id },
              req.user.id
            );
          }
        }
      }
    }
    if (prioridad) task.prioridad = prioridad;
    if (fechaVencimiento !== undefined) task.fechaVencimiento = fechaVencimiento;
    if (etiquetas) task.etiquetas = etiquetas;
    if (orden !== undefined) task.orden = orden;

    await task.save();

    // Actualizar progreso del proyecto
    const project = await Project.findById(task.proyecto);
    if (project) {
      await project.calcularProgreso();
    }

    const taskPopulated = await Task.findById(task._id)
      .populate('proyecto', 'nombre')
      .populate('asignadoA', 'nombre email avatar')
      .populate('creadoPor', 'nombre email avatar');

    res.json({
      success: true,
      task: taskPopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar tarea.',
      error: error.message
    });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Eliminar tarea
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Tarea no encontrada.'
      });
    }

    // Solo el creador o admin del proyecto puede eliminar
    const project = await Project.findById(task.proyecto);
    const puedeEliminar = task.creadoPor.toString() === req.user.id ||
      project.propietario.toString() === req.user.id ||
      project.miembros.find(m => m.usuario.toString() === req.user.id && m.rol === 'admin');

    if (!puedeEliminar) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar esta tarea.'
      });
    }

    // Remover tarea del proyecto
    project.tareas = project.tareas.filter(t => t.toString() !== task._id.toString());
    await project.save();

    // Remover tarea de usuarios asignados
    const User = require('../models/User');
    await User.updateMany(
      { tareasAsignadas: task._id },
      { $pull: { tareasAsignadas: task._id } }
    );

    await Task.findByIdAndDelete(req.params.id);

    // Actualizar progreso del proyecto
    await project.calcularProgreso();

    res.json({
      success: true,
      message: 'Tarea eliminada correctamente.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar tarea.',
      error: error.message
    });
  }
});

module.exports = router;

