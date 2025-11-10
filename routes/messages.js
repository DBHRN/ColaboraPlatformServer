const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');
const { createNotification } = require('./notifications');

// @route   GET /api/messages/private/:userId
// @desc    Obtener mensajes privados con un usuario
// @access  Private
router.get('/private/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    // Obtener mensajes donde el usuario actual es remitente o destinatario
    const messages = await Message.find({
      esPrivado: true,
      $or: [
        { remitente: req.user.id, destinatario: userId },
        { remitente: userId, destinatario: req.user.id }
      ]
    })
    .populate('remitente', 'nombre email avatar')
    .populate('destinatario', 'nombre email avatar')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(skip));

    res.json({
      success: true,
      count: messages.length,
      messages: messages.reverse()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener mensajes privados.',
      error: error.message
    });
  }
});

// @route   POST /api/messages/private
// @desc    Enviar mensaje privado
// @access  Private
router.post('/private', protect, async (req, res) => {
  try {
    const { contenido, destinatario, archivosAdjuntos } = req.body;

    if (!contenido || !destinatario) {
      return res.status(400).json({
        success: false,
        message: 'El contenido y el destinatario son requeridos.'
      });
    }

    if (destinatario === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'No puedes enviarte mensajes a ti mismo.'
      });
    }

    const message = await Message.create({
      contenido,
      remitente: req.user.id,
      destinatario,
      esPrivado: true,
      archivosAdjuntos: archivosAdjuntos || []
    });

    // Crear notificación para el destinatario
    await createNotification(
      destinatario,
      'mensaje_nuevo',
      'Nuevo mensaje privado',
      `${req.user.nombre} te envió un mensaje privado`,
      { tipo: 'mensaje', id: message._id },
      req.user.id
    );

    const messagePopulated = await Message.findById(message._id)
      .populate('remitente', 'nombre email avatar')
      .populate('destinatario', 'nombre email avatar');

    res.status(201).json({
      success: true,
      message: messagePopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al enviar mensaje privado.',
      error: error.message
    });
  }
});

// @route   GET /api/messages/conversations
// @desc    Obtener lista de conversaciones privadas
// @access  Private
router.get('/conversations', protect, async (req, res) => {
  try {
    // Obtener los últimos mensajes de cada conversación
    const conversations = await Message.aggregate([
      {
        $match: {
          esPrivado: true,
          $or: [
            { remitente: req.user._id },
            { destinatario: req.user._id }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$remitente', req.user._id] },
              '$destinatario',
              '$remitente'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$remitente', req.user._id] },
                    { $not: { $in: [req.user._id, '$leidoPor.usuario'] } }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Populate usuarios
    const User = require('../models/User');
    const populatedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const otherUser = await User.findById(conv._id).select('nombre email avatar');
        const lastMsg = await Message.findById(conv.lastMessage._id)
          .populate('remitente', 'nombre email avatar')
          .populate('destinatario', 'nombre email avatar');
        
        return {
          usuario: otherUser,
          ultimoMensaje: lastMsg,
          noLeidos: conv.unreadCount
        };
      })
    );

    res.json({
      success: true,
      conversations: populatedConversations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener conversaciones.',
      error: error.message
    });
  }
});

// @route   PUT /api/messages/:id
// @desc    Editar mensaje privado
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { contenido } = req.body;
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Mensaje no encontrado.'
      });
    }

    // Solo el remitente puede editar
    if (message.remitente.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Solo puedes editar tus propios mensajes.'
      });
    }

    message.contenido = contenido;
    message.editado = true;
    message.fechaEdicion = new Date();

    await message.save();

    const messagePopulated = await Message.findById(message._id)
      .populate('remitente', 'nombre email avatar')
      .populate('destinatario', 'nombre email avatar');

    res.json({
      success: true,
      message: messagePopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al editar mensaje.',
      error: error.message
    });
  }
});

// @route   DELETE /api/messages/:id
// @desc    Eliminar mensaje privado
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Mensaje no encontrado.'
      });
    }

    // Solo el remitente puede eliminar
    if (message.remitente.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Solo puedes eliminar tus propios mensajes.'
      });
    }

    await Message.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Mensaje eliminado correctamente.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar mensaje.',
      error: error.message
    });
  }
});

module.exports = router;

