const express = require('express');
const router = express.Router();
const LabTask = require('../models/LabTask');
const Class = require('../models/Class');
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded.user;
        next();
    } catch (e) {
        res.status(400).json({ msg: 'Token is not valid' });
    }
};

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function (req, file, cb) {
        cb(null, 'LABTASK-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage }).single('taskDocument');

// @route   POST api/lab-tasks
// @desc    Create a new Lab Task
// @access  Private (Teacher)
router.post('/', auth, (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ msg: err });

        let data = req.body;
        const { title, description, classId, deadline, totalMarks } = data;
        let questions = [];
        try {
            if (data.questions) {
                questions = typeof data.questions === 'string' ? JSON.parse(data.questions) : data.questions;
            }
        } catch (e) {
            return res.status(400).json({ msg: 'Invalid questions format' });
        }

        try {
            const relatedClass = await Class.findById(classId);
            if (!relatedClass) return res.status(404).json({ msg: 'Class not found' });

            if (relatedClass.owner.toString() !== req.user.id && !relatedClass.teachers.includes(req.user.id)) {
                return res.status(403).json({ msg: 'Not authorized' });
            }

            const newLab = new LabTask({
                title,
                description,
                class: classId,
                deadline,
                totalMarks,
                questions, // Array of { questionText, subMarks, submissionType }
                createdBy: req.user.id
            });

            if (req.file) {
                newLab.taskDocument = `/uploads/${req.file.filename}`;
            }

            const savedLab = await newLab.save();
            res.json(savedLab);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    });
});

// @route   GET api/lab-tasks/class/:classId
// @desc    Get all Lab Tasks for a class
// @access  Private
router.get('/class/:classId', auth, async (req, res) => {
    try {
        const labs = await LabTask.find({ class: req.params.classId }).sort({ createdAt: -1 });
        res.json(labs);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/lab-tasks/:id
// @desc    Get single Lab Task
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const lab = await LabTask.findById(req.params.id);
        if (!lab) return res.status(404).json({ msg: 'Lab Task not found' });
        res.json(lab);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
