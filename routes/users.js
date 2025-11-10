const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// @route   GET /api/users
// @desc    Obtener todos los usuarios (con búsqueda)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ nombre: 1 })
      .limit(50);

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios.',
      error: error.message
    });
  }
});

// @route   GET /api/users/:id
// @desc    Obtener usuario por ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('proyectos', 'nombre descripcion estado')
      .populate('tareasAsignadas', 'titulo estado prioridad');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuario.',
      error: error.message
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Actualizar usuario
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    // Solo el mismo usuario o admin puede actualizar
    if (req.user.id !== req.params.id && req.user.rol !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para actualizar este usuario.'
      });
    }

    const { nombre, organizacion, avatar, password, nuevaPassword } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.'
      });
    }

    // Actualizar campos básicos
    if (nombre) user.nombre = nombre;
    if (organizacion !== undefined) user.organizacion = organizacion;
    if (avatar !== undefined) user.avatar = avatar;

    // Cambiar contraseña si se proporciona
    if (password && nuevaPassword) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Contraseña actual incorrecta.'
        });
      }
      user.password = nuevaPassword;
    }

    await user.save();

    const userUpdated = await User.findById(user._id).select('-password');

    res.json({
      success: true,
      user: userUpdated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar usuario.',
      error: error.message
    });
  }
});

module.exports = router;

