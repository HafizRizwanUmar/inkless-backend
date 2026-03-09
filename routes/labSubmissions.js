const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const LabSubmission = require('../models/LabSubmission');
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

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function (req, file, cb) {
        cb(null, 'LABSUB-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage }).any(); // Allow multiple files

// @route   POST api/lab-submissions
// @desc    Submit Lab Task
// @access  Private (Student)
router.post('/', auth, (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ msg: err });

        const { labTaskId, answers } = req.body;
        // answers will be a JSON string if sent via FormData with files
        // OR separate fields if complexity requires. 
        // Simplest strategy: Each question has an answer. Client sends `answers` as JSON string.
        // Files are referenced by index or ID?
        // Let's assume simpler approach: 
        // Client sends `answers` as a JSON string: [{questionId, content}]
        // Images are sent as files with fieldname `image_${questionId}`.

        let parsedAnswers = [];
        try {
            if (answers) {
                parsedAnswers = JSON.parse(answers);
            }
        } catch (e) {
            return res.status(400).json({ msg: 'Invalid answers format' });
        }

        let submittedDocPath = null;

        // Map files to answers
        if (req.files) {
            req.files.forEach(file => {
                if (file.fieldname === 'submittedDocument') {
                    submittedDocPath = `/uploads/${file.filename}`;
                } else if (file.fieldname.startsWith('image_')) {
                    // fieldname format: image_QUESTIONID
                    const questionId = file.fieldname.split('_')[1];
                    const ansIndex = parsedAnswers.findIndex(a => a.questionId === questionId);
                    if (ansIndex !== -1) {
                        if (!parsedAnswers[ansIndex].images) {
                            parsedAnswers[ansIndex].images = [];
                        }
                        parsedAnswers[ansIndex].images.push(`/uploads/${file.filename}`);
                    }
                }
            });
        }

        try {
            let submission = await LabSubmission.findOne({ labTask: labTaskId, student: req.user.id });

            if (submission) {
                if (parsedAnswers.length > 0) submission.answers = parsedAnswers;
                if (submittedDocPath) submission.submittedDocument = submittedDocPath;
                submission.submittedAt = Date.now();
                submission.status = 'submitted';
                await submission.save();
                return res.json(submission);
            }

            const newSubmission = new LabSubmission({
                labTask: labTaskId,
                student: req.user.id,
                answers: parsedAnswers
            });
            if (submittedDocPath) newSubmission.submittedDocument = submittedDocPath;
            await newSubmission.save();
            res.json(newSubmission);

        } catch (serverErr) {
            console.error(serverErr.message);
            res.status(500).send('Server Error');
        }
    });
});

// @route   GET api/lab-submissions/my/:labId
// @desc    Get my submission
router.get('/my/:labId', auth, async (req, res) => {
    try {
        const sub = await LabSubmission.findOne({ labTask: req.params.labId, student: req.user.id });
        res.json(sub);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET api/lab-submissions/task/:labId
// @desc    Get all submissions for lab (Teacher)
router.get('/task/:labId', auth, async (req, res) => {
    try {
        const lab = await LabTask.findById(req.params.labId);
        if (!lab) return res.status(404).json({ msg: 'Lab not found' });

        const relatedClass = await Class.findById(lab.class);
        if (relatedClass.owner.toString() !== req.user.id && !relatedClass.teachers.includes(req.user.id)) {
            return res.status(403).json({ msg: 'Not authorized' });
        }

        const subs = await LabSubmission.find({ labTask: req.params.labId }).populate('student', 'name email');
        res.json(subs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET api/lab-submissions/:id
// @desc    Get single submission detailed
router.get('/:id', auth, async (req, res) => {
    try {
        const sub = await LabSubmission.findById(req.params.id)
            .populate('student', 'name email')
            .populate('labTask');
        res.json(sub);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST api/lab-submissions/:id/grade
// @desc    Grade submission
router.post('/:id/grade', auth, async (req, res) => {
    const { marks, feedback } = req.body;
    try {
        const sub = await LabSubmission.findById(req.params.id);
        if (!sub) return res.status(404).json({ msg: 'Submission not found' });

        sub.obtainedMarks = marks;
        sub.teacherFeedback = feedback;
        sub.status = 'graded';
        await sub.save();
        res.json(sub);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;
