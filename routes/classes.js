const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const User = require('../models/User');
const Assignment = require('../models/Assignment');
const LabTask = require('../models/LabTask');
const Quiz = require('../models/Quiz');
const Submission = require('../models/Submission');
const LabSubmission = require('../models/LabSubmission');
const QuizAttempt = require('../models/QuizAttempt');
const jwt = require('jsonwebtoken');

// Middleware to verify token
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

// @route   POST api/classes
// @desc    Create a class
// @access  Private
router.post('/', auth, async (req, res) => {
    const { title, section, subject, room, theme } = req.body;

    try {
        // Generate a random 6-character class code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();

        const newClass = new Class({
            title,
            section,
            subject,
            room,
            code,
            theme: theme || 'bg-gradient-to-r from-blue-600 to-indigo-600',
            owner: req.user.id,
            teachers: [req.user.id] // Owner is also a teacher
        });

        const savedClass = await newClass.save();
        res.json(savedClass);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/classes
// @desc    Get all classes for a user (as teacher or student)
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        // Find classes where user is owner, teacher, or student
        const classes = await Class.find({
            $or: [
                { owner: req.user.id },
                { teachers: req.user.id },
                { students: req.user.id }
            ],
            isArchived: { $ne: true }
        }).populate('owner', 'name email'); // Populate owner details if needed

        res.json(classes);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/classes/archived
// @desc    Get archived classes for the current user
// @access  Private
router.get('/archived', auth, async (req, res) => {
    try {
        const classes = await Class.find({
            $or: [
                { owner: req.user.id },
                { teachers: req.user.id },
                { students: req.user.id }
            ],
            isArchived: true
        }).populate('owner', 'name email');
        res.json(classes);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/classes/:id
// @desc    Get single class by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const classItem = await Class.findById(req.params.id)
            .populate('students', 'name email');
        if (!classItem) {
            return res.status(404).json({ msg: 'Class not found' });
        }
        res.json(classItem);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Class not found' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   GET api/classes/:id/analytics
// @desc    Get analytics for a specific class
// @access  Private
router.get('/:id/analytics', auth, async (req, res) => {
    try {
        const classId = req.params.id;

        // Ensure class exists and user has access
        const classItem = await Class.findById(classId).populate('students', 'name email');
        if (!classItem) {
            return res.status(404).json({ msg: 'Class not found' });
        }

        const assignments = await Assignment.find({ class: classId });
        const quizzes = await Quiz.find({ class: classId });
        const labTasks = await LabTask.find({ class: classId });

        const assignmentIds = assignments.map(a => a._id);
        const quizIds = quizzes.map(q => q._id);
        const labTaskIds = labTasks.map(l => l._id);

        const assignmentsCount = assignments.length;
        const quizzesCount = quizzes.length;
        const labTasksCount = labTasks.length;

        // Get all relevant submissions for this class
        const allSubmissions = await Submission.find({ assignment: { $in: assignmentIds } });
        const allQuizAttempts = await QuizAttempt.find({ quiz: { $in: quizIds } });
        const allLabSubmissions = await LabSubmission.find({ labTask: { $in: labTaskIds } });

        // Calculate per-student stats
        const studentStats = classItem.students.map(student => {
            const studentId = student._id.toString();

            // Submissions by this student
            const studentAssignments = allSubmissions.filter(s => s.student.toString() === studentId);
            const studentQuizzes = allQuizAttempts.filter(q => q.student.toString() === studentId);
            const studentLabs = allLabSubmissions.filter(l => l.student.toString() === studentId);

            // Calculate total marks achieved vs possible (if we wanted to go deep, but let's just do completed counts and simple averages)
            let totalAssigMarks = 0;
            let earnedAssigMarks = 0;
            studentAssignments.forEach(sub => {
                if (sub.status === 'graded' && sub.marks !== undefined) {
                    earnedAssigMarks += sub.marks;
                }
            });

            let earnedQuizMarks = 0;
            studentQuizzes.forEach(att => {
                if (att.score !== undefined) {
                    earnedQuizMarks += att.score;
                }
            });

            let earnedLabMarks = 0;
            studentLabs.forEach(lab => {
                if (lab.totalMarks !== undefined) {
                    earnedLabMarks += lab.totalMarks;
                }
            });

            return {
                id: student._id,
                name: student.name,
                email: student.email,
                completedAssignments: studentAssignments.length,
                completedQuizzes: studentQuizzes.length,
                completedLabs: studentLabs.length,
                earnedAssigMarks,
                earnedQuizMarks,
                earnedLabMarks
            };
        });

        res.json({
            assignments: assignmentsCount,
            quizzes: quizzesCount,
            labTasks: labTasksCount,
            totalStudents: classItem.students.length,
            studentStats
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/classes/join
// @desc    Join a class by code
// @access  Private
router.post('/join', auth, async (req, res) => {
    const { code } = req.body;

    try {
        const classToJoin = await Class.findOne({ code });

        if (!classToJoin) {
            return res.status(404).json({ msg: 'Class not found' });
        }

        // Check if user is already a member (student or teacher)
        if (classToJoin.students.includes(req.user.id) || classToJoin.teachers.includes(req.user.id)) {
            return res.status(400).json({ msg: 'You are already a member of this class' });
        }

        // Add user to students array
        classToJoin.students.push(req.user.id);
        await classToJoin.save();

        res.json(classToJoin);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   PUT api/classes/:id
// @desc    Update a class
// @access  Private
router.put('/:id', auth, async (req, res) => {
    const { title, section, subject, room, theme } = req.body;

    // Build object to update
    const classFields = {};
    if (title) classFields.title = title;
    if (section) classFields.section = section;
    if (subject) classFields.subject = subject;
    if (room) classFields.room = room;
    if (theme) classFields.theme = theme;

    try {
        let classItem = await Class.findById(req.params.id);

        if (!classItem) return res.status(404).json({ msg: 'Class not found' });

        // Make sure user owns class
        if (classItem.owner.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        classItem = await Class.findByIdAndUpdate(
            req.params.id,
            { $set: classFields },
            { new: true }
        );

        res.json(classItem);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/classes/:id
// @desc    Delete a class
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const classItem = await Class.findById(req.params.id);

        if (!classItem) return res.status(404).json({ msg: 'Class not found' });

        // Make sure user owns class
        if (classItem.owner.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        await Class.findByIdAndDelete(req.params.id);

        res.json({ msg: 'Class removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/classes/archived
// @desc    Get all archived classes for a user
// @access  Private
router.get('/archived', auth, async (req, res) => {
    try {
        const classes = await Class.find({
            $or: [
                { owner: req.user.id },
                { teachers: req.user.id }
            ],
            isArchived: true
        }).populate('owner', 'name email');

        res.json(classes);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/classes/:id/archive
// @desc    Toggle archive status of a class
// @access  Private
router.put('/:id/archive', auth, async (req, res) => {
    try {
        let classItem = await Class.findById(req.params.id);

        if (!classItem) return res.status(404).json({ msg: 'Class not found' });

        // Make sure user owns or teaches class
        if (classItem.owner.toString() !== req.user.id && !classItem.teachers.includes(req.user.id)) {
            return res.status(401).json({ msg: 'Not authorized to archive this class' });
        }

        classItem.isArchived = !classItem.isArchived;
        await classItem.save();

        res.json(classItem);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
