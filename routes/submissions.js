const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Class = require('../models/Class');
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

// Multer Config for Images (if image submission enabled)
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function (req, file, cb) {
        cb(null, 'SUB-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5000000 }, // 5MB
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
}).single('image');

function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb('Error: Images Only!');
}

// @route   POST api/submissions
// @desc    Submit an assignment
// @access  Private (Student)
router.post('/', auth, (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ msg: err });

        const { assignmentId, codeContent, outputContent } = req.body;
        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

        try {
            const assignment = await Assignment.findById(assignmentId);
            if (!assignment) return res.status(404).json({ msg: 'Assignment not found' });

            // Check if already submitted? (Optional, maybe allow resubmit)
            // For now, let's create a new submission or update existing? 
            // Let's allow one submission per student for now, or multiple?
            // User flow: "submit to teacher". Usually implies one active submission. 
            // Let's check update first.

            let submission = await Submission.findOne({ assignment: assignmentId, student: req.user.id });

            if (submission) {
                // Update
                submission.codeContent = codeContent || submission.codeContent;
                submission.outputContent = outputContent || submission.outputContent;
                if (imagePath) submission.imagePath = imagePath;
                submission.status = 'submitted'; // Reset if it was graded? Or just keep submitted.
                submission.submittedAt = Date.now();
                await submission.save();
                return res.json(submission);
            }

            // Create new
            const newSubmission = new Submission({
                assignment: assignmentId,
                student: req.user.id,
                codeContent,
                outputContent,
                imagePath
            });

            const savedSubmission = await newSubmission.save();
            res.json(savedSubmission);

        } catch (serverErr) {
            console.error(serverErr.message);
            res.status(500).send('Server Error');
        }
    });
});

// @route   GET api/submissions/assignment/:assignmentId
// @desc    Get all submissions for an assignment (Teacher view)
// @access  Private (Teacher)
router.get('/assignment/:assignmentId', auth, async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.assignmentId);
        if (!assignment) return res.status(404).json({ msg: 'Assignment not found' });

        // Verify teacher
        const relatedClass = await Class.findById(assignment.class);
        const isTeacher = relatedClass.owner.toString() === req.user.id || relatedClass.teachers.includes(req.user.id);

        if (!isTeacher) return res.status(403).json({ msg: 'Not authorized' });

        const submissions = await Submission.find({ assignment: req.params.assignmentId })
            .populate('student', 'name email');

        res.json(submissions);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/submissions/my/:assignmentId
// @desc    Get my submission for an assignment (Student view)
// @access  Private
router.get('/my/:assignmentId', auth, async (req, res) => {
    try {
        const submission = await Submission.findOne({ assignment: req.params.assignmentId, student: req.user.id });
        if (!submission) return res.json(null); // No submission yet
        res.json(submission);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/submissions/:id
// @desc    Get single submission (Teacher view detail)
// @access  Private 
router.get('/:id', auth, async (req, res) => {
    try {
        const submission = await Submission.findById(req.params.id)
            .populate('student', 'name email')
            .populate('assignment');

        if (!submission) return res.status(404).json({ msg: 'Submission not found' });

        // Authorization check could be added here (ensure user is teacher of the class)

        res.json(submission);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/submissions/:id/grade
// @desc    Grade a submission
// @access  Private (Teacher)
router.post('/:id/grade', auth, async (req, res) => {
    const { marks, feedback } = req.body;
    try {
        const submission = await Submission.findById(req.params.id).populate('assignment');
        if (!submission) return res.status(404).json({ msg: 'Submission not found' });

        // Verify teacher
        const relatedClass = await Class.findById(submission.assignment.class);
        const isTeacher = relatedClass.owner.toString() === req.user.id || relatedClass.teachers.includes(req.user.id);
        if (!isTeacher) return res.status(403).json({ msg: 'Not authorized' });

        submission.obtainedMarks = marks;
        submission.teacherFeedback = feedback;
        submission.status = 'graded';

        await submission.save();
        res.json(submission);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/submissions/teacher/pending
// @desc    Get all ungraded submissions for a teacher's classes
// @access  Private (Teacher)
router.get('/teacher/pending', auth, async (req, res) => {
    try {
        // Find all classes taught by this user
        const classes = await Class.find({ $or: [{ owner: req.user.id }, { teachers: req.user.id }] });
        const classIds = classes.map(c => c._id);

        // Find assignments in those classes
        const assignments = await Assignment.find({ class: { $in: classIds } });
        const assignmentIds = assignments.map(a => a._id);

        // Get submissions that are 'submitted' but not 'graded'
        const pendingSubmissions = await Submission.find({
            assignment: { $in: assignmentIds },
            status: { $ne: 'graded' }
        })
            .populate('student', 'name email')
            .populate('assignment', 'title deadline class')
            .sort({ submittedAt: 1 }); // Oldest first

        res.json(pendingSubmissions);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/submissions/student/pending
// @desc    Get all active assignments without a submission for the student
// @access  Private (Student)
router.get('/student/pending', auth, async (req, res) => {
    try {
        // Get all classes student is enrolled in
        const classes = await Class.find({ students: req.user.id });
        const classIds = classes.map(c => c._id);

        // Get ALL assignments for these classes
        const assignments = await Assignment.find({ class: { $in: classIds } });
        const assignmentIds = assignments.map(a => a._id);

        // Get all my submissions for these assignments
        const mySubmissions = await Submission.find({
            assignment: { $in: assignmentIds },
            student: req.user.id
        });

        const submittedAssignmentIds = mySubmissions.map(sub => sub.assignment.toString());

        // Filter assignments that have NO submission and deadline is in the future
        const now = new Date();
        const pendingAssignments = assignments.filter(a => {
            return !submittedAssignmentIds.includes(a._id.toString()) && new Date(a.deadline) > now;
        });

        res.json(pendingAssignments);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
