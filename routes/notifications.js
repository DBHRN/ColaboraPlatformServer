const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// @route   GET /api/notifications
// @desc    Obtener notificaciones del usuario
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { leida, limit = 50 } = req.query;
    let query = { usuario: req.user.id };

    if (leida !== undefined) {
      query.leida = leida === 'true';
    }

    const notifications = await Notification.find(query)
      .populate('remitente', 'nombre email avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({
      usuario: req.user.id,
      leida: false
    });

    res.json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener notificaciones.',
      error: error.message
    });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Marcar notificación como leída
// @access  Private
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada.'
      });
    }

    if (notification.usuario.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para esta notificación.'
      });
    }

    notification.leida = true;
    notification.fechaLectura = new Date();
    await notification.save();

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al marcar notificación.',
      error: error.message
    });
  }
});

// @route   PUT /api/notifications/read-all
// @desc    Marcar todas las notificaciones como leídas
// @access  Private
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { usuario: req.user.id, leida: false },
      { leida: true, fechaLectura: new Date() }
    );

    res.json({
      success: true,
      message: 'Todas las notificaciones marcadas como leídas.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al marcar notificaciones.',
      error: error.message
    });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Eliminar notificación
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada.'
      });
    }

    if (notification.usuario.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar esta notificación.'
      });
    }

    await Notification.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Notificación eliminada.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar notificación.',
      error: error.message
    });
  }
});

// Función helper para crear notificaciones
const createNotification = async (usuarioId, tipo, titulo, mensaje, relacionadoCon = null, remitente = null) => {
  try {
    const notification = await Notification.create({
      usuario: usuarioId,
      tipo,
      titulo,
      mensaje,
      relacionadoCon: relacionadoCon ? {
        tipo: relacionadoCon.tipo,
        id: relacionadoCon.id
      } : null,
      remitente
    });
    return notification;
  } catch (error) {
    console.error('Error al crear notificación:', error);
    return null;
  }
};

module.exports = { router, createNotification };

