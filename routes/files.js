const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const Project = require('../models/Project');
const { protect } = require('../middleware/auth');

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
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
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// @route   GET /api/files
// @desc    Obtener archivos
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { proyecto, carpeta } = req.query;
    let query = {};

    if (proyecto) {
      // Si es un proyecto, obtener todos los archivos del proyecto
      query.proyecto = proyecto;
    } else {
      // Si no es proyecto, solo archivos del usuario
      query.subidoPor = req.user.id;
    }

    if (carpeta) {
      query.carpeta = carpeta;
    } else if (!proyecto) {
      query.carpeta = null;
    }

    const files = await File.find(query)
      .populate('subidoPor', 'nombre email avatar')
      .populate('proyecto', 'nombre')
      .sort({ esCarpeta: -1, nombre: 1 });

    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener archivos.',
      error: error.message
    });
  }
});

// @route   POST /api/files
// @desc    Subir archivo
// @access  Private
router.post('/', protect, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ningún archivo.'
      });
    }

    const { proyecto, carpeta, nombre } = req.body;

    // Verificar acceso al proyecto si se especifica
    if (proyecto) {
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
        // Eliminar archivo subido
        fs.unlinkSync(req.file.path);
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este proyecto.'
        });
      }
    }

    // Guardar solo el nombre del archivo (sin la ruta completa)
    const fileName = path.basename(req.file.path);
    
    const file = await File.create({
      nombre: nombre || req.file.originalname,
      nombreOriginal: req.file.originalname,
      ruta: fileName, // Solo el nombre del archivo
      tipo: req.file.mimetype,
      tamaño: req.file.size,
      subidoPor: req.user.id,
      proyecto: proyecto || null,
      carpeta: carpeta || null
    });

    // Agregar archivo al proyecto si aplica
    if (proyecto) {
      const project = await Project.findById(proyecto);
      if (project) {
        project.archivos.push(file._id);
        await project.save();
      }
    }

    const filePopulated = await File.findById(file._id)
      .populate('subidoPor', 'nombre email avatar')
      .populate('proyecto', 'nombre');

    res.status(201).json({
      success: true,
      file: filePopulated
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Error al subir archivo.',
      error: error.message
    });
  }
});

// @route   POST /api/files/folder
// @desc    Crear carpeta
// @access  Private
router.post('/folder', protect, async (req, res) => {
  try {
    const { nombre, proyecto, carpetaPadre } = req.body;

    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la carpeta es requerido.'
      });
    }

    // Verificar acceso al proyecto si se especifica
    if (proyecto) {
      const project = await Project.findById(proyecto);
      if (project) {
        const tieneAcceso = project.propietario.toString() === req.user.id ||
          project.miembros.some(m => m.usuario.toString() === req.user.id);

        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes acceso a este proyecto.'
          });
        }
      }
    }

    const folder = await File.create({
      nombre,
      nombreOriginal: nombre,
      ruta: '',
      tipo: 'folder',
      tamaño: 0,
      subidoPor: req.user.id,
      proyecto: proyecto || null,
      carpeta: carpetaPadre || null,
      esCarpeta: true
    });

    const folderPopulated = await File.findById(folder._id)
      .populate('subidoPor', 'nombre email avatar')
      .populate('proyecto', 'nombre');

    res.status(201).json({
      success: true,
      file: folderPopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al crear carpeta.',
      error: error.message
    });
  }
});

// @route   GET /api/files/:id
// @desc    Obtener archivo por ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const file = await File.findById(req.params.id)
      .populate('subidoPor', 'nombre email avatar')
      .populate('proyecto', 'nombre');

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Archivo no encontrado.'
      });
    }

    // Verificar acceso
    if (file.proyecto) {
      const Project = require('../models/Project');
      const project = await Project.findById(file.proyecto);
      if (project) {
        const tieneAcceso = project.propietario.toString() === req.user.id ||
          project.miembros.some(m => m.usuario.toString() === req.user.id);
        
        if (!tieneAcceso && file.subidoPor._id.toString() !== req.user.id) {
          return res.status(403).json({
            success: false,
            message: 'No tienes acceso a este archivo.'
          });
        }
      }
    } else if (file.subidoPor._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a este archivo.'
      });
    }

    res.json({
      success: true,
      file
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener archivo.',
      error: error.message
    });
  }
});

// @route   PUT /api/files/:id
// @desc    Actualizar archivo (renombrar)
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { nombre } = req.body;
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Archivo no encontrado.'
      });
    }

    // Solo el propietario puede editar
    if (file.subidoPor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Solo puedes editar tus propios archivos.'
      });
    }

    if (nombre) {
      file.nombre = nombre;
      if (!file.esCarpeta) {
        file.nombreOriginal = nombre;
      }
    }

    await file.save();

    const filePopulated = await File.findById(file._id)
      .populate('subidoPor', 'nombre email avatar')
      .populate('proyecto', 'nombre');

    res.json({
      success: true,
      file: filePopulated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar archivo.',
      error: error.message
    });
  }
});

// @route   DELETE /api/files/:id
// @desc    Eliminar archivo
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'Archivo no encontrado.'
      });
    }

    // Solo el propietario puede eliminar
    if (file.subidoPor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Solo puedes eliminar tus propios archivos.'
      });
    }

    // Eliminar archivo físico si existe
    const filePath = path.join(__dirname, '../uploads', file.ruta);
    if (file.ruta && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remover archivo del proyecto si aplica
    if (file.proyecto) {
      const project = await Project.findById(file.proyecto);
      if (project) {
        project.archivos = project.archivos.filter(a => a.toString() !== file._id.toString());
        await project.save();
      }
    }

    await File.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Archivo eliminado correctamente.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar archivo.',
      error: error.message
    });
  }
});

module.exports = router;

