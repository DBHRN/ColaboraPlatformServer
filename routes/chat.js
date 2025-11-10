const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Message = require('../models/Message');
const Project = require('../models/Project');
const { protect } = require('../middleware/auth');

// Configurar multer para adjuntos en chat
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/chat');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// @route   GET /api/chat/:proyectoId/:canal
// @desc    Obtener mensajes de un canal
// @access  Private
router.get('/:proyectoId/:canal', protect, async (req, res) => {
  try {
    const { proyectoId, canal } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    // Verificar acceso al proyecto
    const project = await Project.findById(proyectoId);
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

    const messages = await Message.find({
      proyecto: proyectoId,
      canal: canal || 'general'
    })
    .populate('remitente', 'nombre email avatar')
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
      message: 'Error al obtener mensajes.',
      error: error.message
    });
  }
});

// @route   POST /api/chat
// @desc    Enviar mensaje
// @access  Private
router.post('/', protect, upload.array('archivos', 5), async (req, res) => {
  try {
    const { contenido, proyecto, canal, archivosAdjuntos } = req.body;

    if (!contenido && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'El contenido o un archivo es requerido.'
      });
    }

    if (!proyecto) {
      return res.status(400).json({
        success: false,
        message: 'El proyecto es requerido.'
      });
    }

    // Verificar acceso al proyecto
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
      // Eliminar archivos subidos si no hay acceso
      if (req.files) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a este proyecto.'
      });
    }

    // Procesar archivos adjuntos
    let archivos = [];
    if (req.files && req.files.length > 0) {
      archivos = req.files.map(file => ({
        nombre: file.originalname,
        url: `/uploads/chat/${path.basename(file.path)}`,
        tipo: file.mimetype,
        tamaño: file.size
      }));
    } else if (archivosAdjuntos) {
      archivos = JSON.parse(archivosAdjuntos);
    }

    const message = await Message.create({
      contenido: contenido || '',
      remitente: req.user.id,
      proyecto,
      canal: canal || 'general',
      archivosAdjuntos: archivos,
      tipo: archivos.length > 0 ? 'archivo' : 'texto'
    });

    // Crear notificaciones para otros miembros del proyecto
    const { createNotification } = require('./notifications');
    
    if (project) {
      const otrosMiembros = project.miembros
        .filter(m => m.usuario.toString() !== req.user.id.toString())
        .map(m => m.usuario.toString());
      
      for (const memberId of otrosMiembros) {
        await createNotification(
          memberId,
          'mensaje_nuevo',
          'Nuevo mensaje',
          `${req.user.nombre} envió un mensaje en "${project.nombre}"`,
          { tipo: 'mensaje', id: message._id },
          req.user.id
        );
      }
    }

    const messagePopulated = await Message.findById(message._id)
      .populate('remitente', 'nombre email avatar');

    res.status(201).json({
      success: true,
      message: messagePopulated
    });
  } catch (error) {
    // Eliminar archivos en caso de error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error al enviar mensaje.',
      error: error.message
    });
  }
});

// @route   PUT /api/chat/:id
// @desc    Editar mensaje
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
      .populate('remitente', 'nombre email avatar');

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

// @route   DELETE /api/chat/:id
// @desc    Eliminar mensaje
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

    // Eliminar archivos adjuntos
    if (message.archivosAdjuntos && message.archivosAdjuntos.length > 0) {
      message.archivosAdjuntos.forEach(archivo => {
        const fileName = path.basename(archivo.url);
        const filePath = path.join(__dirname, '../uploads/chat', fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
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
